"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getRegionForTicker } from "@/lib/data/regions";
import { Spinner } from "@/components/spinner";
import type { Universe, UniverseTicker } from "@/lib/schemas/universe";

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
  label: React.ReactNode;
  columnKey: SortKey;
  active: boolean;
  dir: SortDir;
  onToggle: (key: SortKey) => void;
  align?: "left" | "right" | "center";
}) {
  // Inactive arrow is grey so the column visibly advertises sortability.
  const arrowChar = active ? (dir === "asc" ? "↑" : "↓") : "↕";
  const arrowColor = active ? "var(--color-black)" : "#B5B5B5";
  const alignClass =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";
  return (
    <th className={`px-3 py-2 ${alignClass} font-medium`}>
      <button
        type="button"
        onClick={() => onToggle(columnKey)}
        className="inline-flex items-center gap-1 hover:underline"
        style={{ color: active ? "var(--color-black)" : "#585858" }}
        title="Sort"
      >
        {label}
        <span style={{ color: arrowColor, fontSize: 11 }}>{arrowChar}</span>
      </button>
    </th>
  );
}

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
  const router = useRouter();
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
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
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
      // Re-render the server tree so the PipelineHeader re-derives step state
      // and any insights that read from server-fetched data pick up the change.
      router.refresh();
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
              <SortHeader
                label={
                  <span className="inline-block leading-tight">
                    Mcap
                    <br />
                    (USD M)
                  </span>
                }
                columnKey="market_cap_usd_b"
                active={sortKey === "market_cap_usd_b"}
                dir={sortDir}
                onToggle={toggleSort}
                align="center"
              />
              <th className="w-full px-3 py-2 text-left font-medium">Notes</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {displayRows.map(({ t, originalIndex: i }) => {
              const rationale = (t.notes ?? "").trim() ||
                (t.exposure_rationale ?? "").trim();
              // Pure-play is the default for most rows, so showing it as
              // a prefix adds noise. Only surface the tier when it deviates
              // from pure-play (Diversified / ETF proxy).
              const tierLabel =
                t.exposure_tier === "diversified"
                  ? "Diversified"
                  : t.exposure_tier === "etf_proxy"
                    ? "ETF proxy"
                    : "";
              const noteText =
                tierLabel && rationale
                  ? `${tierLabel}; ${rationale}`
                  : tierLabel || rationale;
              const anchorClass = t.is_anchor ? "font-semibold" : "";
              return (
                <tr key={`${t.ticker}-${i}`} className={anchorClass}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-neutral-900">{t.ticker}</td>
                  <td className="px-3 py-2 text-neutral-900">{t.name}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-700">{t.region}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-center tabular-nums text-neutral-900">
                    {Math.round(t.market_cap_usd_b * 1000).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-700" style={{ minWidth: 280 }}>
                    {noteText}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
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
              );
            })}
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
              className="btn btn-secondary inline-flex items-center gap-1.5"
              style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}
            >
              {addingPending ? (
                <>
                  <Spinner size={12} />
                  Looking up…
                </>
              ) : (
                "Add"
              )}
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
          className="btn btn-primary inline-flex items-center gap-2"
        >
          {saving ? (
            <>
              <Spinner size={14} />
              Refreshing…
            </>
          ) : (
            "Refresh"
          )}
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
