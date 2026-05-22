"use client";

import React, { useMemo, useState } from "react";
import { getRegionForTicker } from "@/lib/data/regions";
import type { Universe, UniverseTicker, ExposureTier } from "@/lib/schemas/universe";

interface UniverseTableProps {
  initial: Universe;
  onSaved: (next: Universe) => void;
  onRefresh: () => void;
}

interface YahooQuoteResponse {
  name: string;
  market_cap_usd: number | null;
}

type SortKey = "ticker" | "name" | "region" | "market_cap_usd_b" | "exposure_tier";
type SortDir = "asc" | "desc";

function SortHeader({
  label,
  columnKey,
  active,
  dir,
  onToggle,
  align = "left",
}: {
  label: string;
  columnKey: SortKey;
  active: boolean;
  dir: SortDir;
  onToggle: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const arrow = !active ? "" : dir === "asc" ? " ↑" : " ↓";
  return (
    <th
      className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"} font-medium`}
    >
      <button
        type="button"
        onClick={() => onToggle(columnKey)}
        className="inline-flex items-center gap-1 hover:underline"
        style={{ color: active ? "var(--color-black)" : "#585858" }}
      >
        {label}
        {arrow}
      </button>
    </th>
  );
}

const TIER_OPTIONS: ExposureTier[] = ["pure_play", "diversified", "etf_proxy"];

function ticketsEqual(a: UniverseTicker[], b: UniverseTicker[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.ticker !== y.ticker ||
      x.name !== y.name ||
      x.region !== y.region ||
      x.market_cap_usd_b !== y.market_cap_usd_b ||
      x.exposure_tier !== y.exposure_tier ||
      (x.notes ?? "") !== (y.notes ?? "")
    ) {
      return false;
    }
  }
  return true;
}

export function UniverseTable({ initial, onSaved, onRefresh }: UniverseTableProps) {
  const [tickers, setTickers] = useState<UniverseTicker[]>(initial.tickers);
  const [addingRow, setAddingRow] = useState(false);
  const [newRowTicker, setNewRowTicker] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingPending, setAddingPending] = useState(false);
  const [justSavedAt, setJustSavedAt] = useState<Date | null>(null);

  const dirty = useMemo(
    () => !ticketsEqual(tickers, initial.tickers),
    [tickers, initial.tickers],
  );

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Sort produces a display-only order; edits still go through the original
  // tickers array via `originalIndex` so row identity stays stable.
  const displayRows = useMemo(() => {
    const indexed = tickers.map((t, originalIndex) => ({ t, originalIndex }));
    if (sortKey === null) return indexed;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...indexed].sort((a, b) => {
      const av = a.t[sortKey];
      const bv = b.t[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
  }, [tickers, sortKey, sortDir]);


  function updateRow(index: number, patch: Partial<UniverseTicker>) {
    setJustSavedAt(null);
    setTickers((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  function removeRow(index: number) {
    setJustSavedAt(null);
    setTickers((rows) => rows.filter((_, i) => i !== index));
  }

  async function lookupTickerForRow(t: string): Promise<YahooQuoteResponse | null> {
    const res = await fetch(`/api/universe/quote?ticker=${encodeURIComponent(t)}`, {
      method: "GET",
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as YahooQuoteResponse | null;
  }

  async function handleAddRow() {
    setAddError(null);
    const normalised = newRowTicker.trim().toUpperCase();
    if (normalised.length === 0) return;
    const region = getRegionForTicker(normalised);
    if (region === null) {
      const lastDot = normalised.lastIndexOf(".");
      const suffix = lastDot === -1 ? "(no suffix)" : normalised.slice(lastDot);
      setAddError(`Unknown ticker suffix ${suffix} — not a supported Yahoo market`);
      return;
    }
    if (tickers.some((t) => t.ticker === normalised)) {
      setAddError("Ticker already in the universe");
      return;
    }
    setAddingPending(true);
    const quote = await lookupTickerForRow(normalised);
    setAddingPending(false);
    if (!quote || !quote.name) {
      setAddError("Yahoo did not return data for that ticker");
      return;
    }
    const row: UniverseTicker = {
      ticker: normalised,
      name: quote.name,
      region,
      market_cap_usd_b: (quote.market_cap_usd ?? 0) / 1e9,
      exposure_tier: "diversified",
      notes: "",
    };
    setJustSavedAt(null);
    setTickers((rows) => [...rows, row]);
    setNewRowTicker("");
    setAddingRow(false);
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    setJustSavedAt(null);
    const payload: Universe = { ...initial, tickers };
    try {
      const res = await fetch(`/api/universe/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as
        | { universe?: Universe; error?: string; detail?: string }
        | null;
      if (!res.ok || !body?.universe) {
        setSaveError(body?.detail ?? body?.error ?? `Save failed (${res.status})`);
        setSaving(false);
        return;
      }
      onSaved(body.universe);
      setSaving(false);
      setJustSavedAt(new Date());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unexpected error");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="overflow-x-auto"
        style={{
          background: "white",
          border: "1px solid #E5E5E5",
          borderRadius: 18.75,
        }}
      >
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead style={{ background: "#F5F4F2", color: "#585858" }}>
            <tr>
              <SortHeader label="Ticker" columnKey="ticker" active={sortKey === "ticker"} dir={sortDir} onToggle={toggleSort} />
              <SortHeader label="Name" columnKey="name" active={sortKey === "name"} dir={sortDir} onToggle={toggleSort} />
              <SortHeader label="Region" columnKey="region" active={sortKey === "region"} dir={sortDir} onToggle={toggleSort} />
              <SortHeader label="Mcap (USD B)" columnKey="market_cap_usd_b" active={sortKey === "market_cap_usd_b"} dir={sortDir} onToggle={toggleSort} align="right" />
              <SortHeader label="Exposure" columnKey="exposure_tier" active={sortKey === "exposure_tier"} dir={sortDir} onToggle={toggleSort} />
              <th className="px-3 py-2 text-left font-medium">Notes</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {displayRows.map(({ t, originalIndex: i }) => (
              <tr key={`${t.ticker}-${i}`}>
                <td className="px-3 py-2 font-mono text-xs text-neutral-900">{t.ticker}</td>
                <td className="px-3 py-2 text-neutral-900">{t.name}</td>
                <td className="px-3 py-2 text-xs text-neutral-700">{t.region}</td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-900">
                  {Math.round(t.market_cap_usd_b).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={t.exposure_tier}
                      onChange={(e) =>
                        updateRow(i, {
                          exposure_tier: e.target.value as ExposureTier,
                        })
                      }
                      title={t.exposure_rationale ?? undefined}
                      className="rounded px-2 py-1 text-xs"
                      style={{
                        background: "white",
                        border: "1px solid #E5E5E5",
                        color: "var(--color-black)",
                      }}
                    >
                      {TIER_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    {t.exposure_rationale ? (
                      <span
                        title={t.exposure_rationale}
                        aria-label="Exposure rationale"
                        className="cursor-help text-xs"
                        style={{ color: "#585858" }}
                      >
                        &#9432;
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={t.notes ?? ""}
                    placeholder="Notes"
                    onChange={(e) => updateRow(i, { notes: e.target.value })}
                    className="w-full rounded px-2 py-1 text-xs"
                    style={{
                      background: "white",
                      border: "1px solid #E5E5E5",
                      color: "var(--color-black)",
                    }}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="rounded px-2 py-0.5 text-xs"
                    style={{
                      background: "white",
                      border: "1px solid #E5E5E5",
                      color: "#585858",
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addingRow ? (
        <div
          className="flex flex-col gap-2 rounded-md p-3"
          style={{ background: "#F5F4F2", border: "1px solid #E5E5E5" }}
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newRowTicker}
              onChange={(e) => setNewRowTicker(e.target.value)}
              placeholder="New Yahoo ticker (e.g. DASF.PA)"
              className="flex-1 rounded px-2 py-1 text-sm"
              style={{
                background: "white",
                border: "1px solid #E5E5E5",
                color: "var(--color-black)",
              }}
              disabled={addingPending}
            />
            <button
              type="button"
              onClick={handleAddRow}
              disabled={addingPending}
              className="btn btn-secondary"
              style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}
            >
              {addingPending ? "Looking up..." : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingRow(false);
                setNewRowTicker("");
                setAddError(null);
              }}
              disabled={addingPending}
              className="btn btn-outline"
              style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}
            >
              Cancel
            </button>
          </div>
          {addError ? (
            <p className="text-xs" role="alert" style={{ color: "#a30000" }}>
              {addError}
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setAddingRow(true)}
            className="btn btn-outline"
            style={{ padding: "0.375rem 0.75rem", fontSize: "0.75rem" }}
          >
            + Add row
          </button>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {justSavedAt ? (
          <span
            data-testid="universe-saved-indicator"
            className="text-xs"
            style={{ color: "#0a7a30" }}
          >
            Saved at{" "}
            {justSavedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : null}
        <button type="button" onClick={onRefresh} className="btn btn-outline">
          Refresh from scope
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="btn btn-primary"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {saveError ? (
        <p className="text-sm" role="alert" style={{ color: "#a30000" }}>
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
