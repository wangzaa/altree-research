"use client";

import React, { useMemo, useState } from "react";
import type {
  TickerHistory,
  TickerSnapshot,
  QuarterlyEps,
} from "@/lib/schemas/scan";

interface PerTickerTableProps {
  snapshots: TickerSnapshot[];
  history: TickerHistory[];
  marketCapByTicker?: Record<string, number>;
  bestTicker?: string | null;
  worstTicker?: string | null;
}

// Sum of the 4 most recent quarterly EPS actuals. Returns null when fewer
// than 4 quarters of data exist or when the sum is non-positive (loss-makers
// — P/E ratio is meaningless).
export function ttmEpsLatest(quarterlyEps: QuarterlyEps[]): number | null {
  if (quarterlyEps.length < 4) return null;
  const sorted = [...quarterlyEps].sort((a, b) =>
    b.period_end_iso.localeCompare(a.period_end_iso),
  );
  const ttm = sorted.slice(0, 4).reduce((s, q) => s + q.eps, 0);
  if (!Number.isFinite(ttm) || ttm <= 0) return null;
  return ttm;
}

// Closing price closest in time to `asOfIso`. Returns null when no point is
// within `toleranceDays` of the target date — avoids quoting a P/E built
// from a price weeks away from the EPS report.
export function closestCloseTo(
  history: TickerHistory,
  asOfIso: string,
  toleranceDays = 60,
): number | null {
  const targetMs = new Date(asOfIso).getTime();
  if (!Number.isFinite(targetMs)) return null;
  const toleranceMs = toleranceDays * 24 * 60 * 60 * 1000;

  let best: { ms: number; close: number } | null = null;
  for (const p of history.points) {
    const ms = new Date(p.date).getTime();
    if (!Number.isFinite(ms) || !Number.isFinite(p.close) || p.close <= 0) continue;
    if (best === null || Math.abs(ms - targetMs) < Math.abs(best.ms - targetMs)) {
      best = { ms, close: p.close };
    }
  }
  if (best === null) return null;
  if (Math.abs(best.ms - targetMs) > toleranceMs) return null;
  return best.close;
}

// P/E = closing price near latest EPS date / TTM EPS (sum of last 4
// reported quarters). Anchored to the EPS report date so the ratio reflects
// the valuation at the time the market priced in those earnings.
export function computePe(
  snapshot: TickerSnapshot,
  history: TickerHistory | undefined,
): number | null {
  if (!history || history.points.length === 0) return null;
  const ttm = ttmEpsLatest(snapshot.quarterly_eps);
  if (ttm === null) return null;

  const latestEpsIso = [...snapshot.quarterly_eps]
    .sort((a, b) => b.period_end_iso.localeCompare(a.period_end_iso))[0]
    ?.period_end_iso;
  if (!latestEpsIso) return null;

  const close = closestCloseTo(history, latestEpsIso);
  if (close === null) return null;

  return close / ttm;
}

interface ComputedRow {
  ticker: string;
  name: string;
  market_cap_usd_b: number | null;
  pe: number | null;
  revenue_growth_yoy: number | null;
  ebitda: number | null;
  ebitda_margin: number | null;
  currency: string | null;
}

export function computeRows(
  snapshots: TickerSnapshot[],
  history: TickerHistory[],
  marketCapByTicker?: Record<string, number>,
): ComputedRow[] {
  const historyByTicker = new Map(history.map((h) => [h.ticker, h]));
  return snapshots.map((s) => ({
    ticker: s.ticker,
    name: s.name,
    market_cap_usd_b: marketCapByTicker?.[s.ticker] ?? null,
    pe: computePe(s, historyByTicker.get(s.ticker)),
    revenue_growth_yoy: s.revenue_growth_yoy,
    ebitda: s.ebitda,
    ebitda_margin: s.ebitda_margin,
    currency: s.currency,
  }));
}

function fmtRatio(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}×`;
}

function fmtPct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

function fmtMcap(v: number | null): string {
  return v === null ? "—" : Math.round(v).toLocaleString();
}

export function fmtEbitda(value: number | null, currency: string | null): string {
  if (value === null) return "—";
  const abs = Math.abs(value);
  let scaled: number;
  let suffix: string;
  if (abs >= 1e12) {
    scaled = value / 1e12;
    suffix = "T";
  } else if (abs >= 1e9) {
    scaled = value / 1e9;
    suffix = "B";
  } else if (abs >= 1e6) {
    scaled = value / 1e6;
    suffix = "M";
  } else {
    scaled = value;
    suffix = "";
  }
  const num = scaled.toFixed(1);
  if (currency === "USD") return `$${num}${suffix}`;
  if (currency) return `${currency} ${num}${suffix}`;
  return `${num}${suffix}`;
}

type SortKey =
  | "ticker"
  | "name"
  | "market_cap_usd_b"
  | "pe"
  | "revenue_growth_yoy"
  | "ebitda"
  | "ebitda_margin";
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
  // Always reserve space for the arrow so the header doesn't reflow on
  // click; the inactive arrow is rendered in a muted grey to advertise that
  // the column is sortable.
  const arrowChar = active ? (dir === "asc" ? "↑" : "↓") : "↕";
  const arrowColor = active ? "var(--color-black)" : "#B5B5B5";
  return (
    <th
      className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"} font-medium`}
    >
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

export function PerTickerTable({
  snapshots,
  history,
  marketCapByTicker,
  bestTicker,
  worstTicker,
}: PerTickerTableProps) {
  const rows = useMemo(
    () => computeRows(snapshots, history, marketCapByTicker),
    [snapshots, history, marketCapByTicker],
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

  const sortedRows = useMemo(() => {
    if (sortKey === null) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // null sorts last regardless of direction so missing values don't
      // crowd the top of an asc sort.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No per-ticker fundamentals available for this scan.
      </p>
    );
  }

  function rowColor(ticker: string): string | undefined {
    if (ticker === bestTicker) return "#0a7a30";
    if (ticker === worstTicker) return "#a30000";
    return undefined;
  }

  return (
    <section
      className="overflow-x-auto bg-white"
      style={{ border: "1px solid #E5E5E5", borderRadius: 18.75 }}
    >
      <table className="min-w-full divide-y divide-neutral-200 text-xs">
        <thead style={{ background: "#F5F4F2", color: "#585858" }}>
          <tr>
            <SortHeader
              label="Ticker"
              columnKey="ticker"
              active={sortKey === "ticker"}
              dir={sortDir}
              onToggle={toggleSort}
            />
            <SortHeader
              label="Name"
              columnKey="name"
              active={sortKey === "name"}
              dir={sortDir}
              onToggle={toggleSort}
            />
            <SortHeader
              label="Mcap (USD B)"
              columnKey="market_cap_usd_b"
              active={sortKey === "market_cap_usd_b"}
              dir={sortDir}
              onToggle={toggleSort}
              align="right"
            />
            <SortHeader
              label="P/E"
              columnKey="pe"
              active={sortKey === "pe"}
              dir={sortDir}
              onToggle={toggleSort}
              align="right"
            />
            <SortHeader
              label="Rev YoY"
              columnKey="revenue_growth_yoy"
              active={sortKey === "revenue_growth_yoy"}
              dir={sortDir}
              onToggle={toggleSort}
              align="right"
            />
            <SortHeader
              label="EBITDA"
              columnKey="ebitda"
              active={sortKey === "ebitda"}
              dir={sortDir}
              onToggle={toggleSort}
              align="right"
            />
            <SortHeader
              label="EBITDA %"
              columnKey="ebitda_margin"
              active={sortKey === "ebitda_margin"}
              dir={sortDir}
              onToggle={toggleSort}
              align="right"
            />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {sortedRows.map((r) => {
            const color = rowColor(r.ticker);
            const weight =
              color !== undefined ? 600 : undefined;
            return (
              <tr key={r.ticker} style={{ color, fontWeight: weight }}>
                <td className="px-3 py-2 font-mono">{r.ticker}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtMcap(r.market_cap_usd_b)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtRatio(r.pe)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtPct(r.revenue_growth_yoy)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtEbitda(r.ebitda, r.currency)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtPct(r.ebitda_margin)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
