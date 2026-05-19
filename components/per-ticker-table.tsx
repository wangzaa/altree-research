"use client";

import React from "react";
import type {
  TickerHistory,
  TickerSnapshot,
  QuarterlyEps,
} from "@/lib/schemas/scan";

interface PerTickerTableProps {
  snapshots: TickerSnapshot[];
  history: TickerHistory[];
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
  pe: number | null;
  revenue_growth_yoy: number | null;
  ebitda: number | null;
  ebitda_margin: number | null;
  currency: string | null;
}

export function computeRows(
  snapshots: TickerSnapshot[],
  history: TickerHistory[],
): ComputedRow[] {
  const historyByTicker = new Map(history.map((h) => [h.ticker, h]));
  return snapshots.map((s) => ({
    ticker: s.ticker,
    name: s.name,
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

export function PerTickerTable({ snapshots, history }: PerTickerTableProps) {
  const rows = React.useMemo(
    () => computeRows(snapshots, history),
    [snapshots, history],
  );

  if (rows.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No per-ticker fundamentals available for this scan.
      </p>
    );
  }

  return (
    <section className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
      <table className="min-w-full divide-y divide-neutral-200 text-xs">
        <thead className="bg-neutral-50 text-neutral-600">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Ticker</th>
            <th className="px-3 py-2 text-left font-medium">Name</th>
            <th className="px-3 py-2 text-right font-medium">P/E</th>
            <th className="px-3 py-2 text-right font-medium">Rev YoY</th>
            <th className="px-3 py-2 text-right font-medium">EBITDA</th>
            <th className="px-3 py-2 text-right font-medium">EBITDA %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 text-neutral-900">
          {rows.map((r) => (
            <tr key={r.ticker}>
              <td className="px-3 py-2 font-mono">{r.ticker}</td>
              <td className="px-3 py-2">{r.name}</td>
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
          ))}
        </tbody>
      </table>
    </section>
  );
}
