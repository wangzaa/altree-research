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

  const dirty = useMemo(
    () => !ticketsEqual(tickers, initial.tickers),
    [tickers, initial.tickers],
  );

  function updateRow(index: number, patch: Partial<UniverseTicker>) {
    setTickers((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  function removeRow(index: number) {
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
    setTickers((rows) => [...rows, row]);
    setNewRowTicker("");
    setAddingRow(false);
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
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
              <th className="px-3 py-2 text-left font-medium">Ticker</th>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Region</th>
              <th className="px-3 py-2 text-right font-medium">Mcap (USD bn)</th>
              <th className="px-3 py-2 text-left font-medium">Exposure</th>
              <th className="px-3 py-2 text-left font-medium">Notes</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {tickers.map((t, i) => (
              <tr key={`${t.ticker}-${i}`}>
                <td className="px-3 py-2 font-mono text-xs text-neutral-900">{t.ticker}</td>
                <td className="px-3 py-2 text-neutral-900">{t.name}</td>
                <td className="px-3 py-2 text-xs text-neutral-700">{t.region}</td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-900">
                  {t.market_cap_usd_b.toFixed(1)}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={t.exposure_tier}
                    onChange={(e) =>
                      updateRow(i, {
                        exposure_tier: e.target.value as ExposureTier,
                      })
                    }
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

      <div className="flex items-center justify-end gap-2">
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
