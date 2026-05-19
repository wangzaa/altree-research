"use client";

import React from "react";
import { monthBucket } from "@/components/scan-chart";
import type {
  TickerHistory,
  TickerSnapshot,
  QuarterlyEps,
} from "@/lib/schemas/scan";

interface PerTickerTableProps {
  snapshots: TickerSnapshot[];
  history: TickerHistory[];
  windowMonths: number;
}

// Sum of the EPS from the 4 most recent quarters ending on or before `asOfMs`.
// Returns null when fewer than 4 quarters are available before that date or
// when the sum is non-positive (loss-makers — P/E ratio is meaningless).
export function ttmEpsAt(
  quarterlyEps: QuarterlyEps[],
  asOfIso: string,
): number | null {
  const asOfMs = new Date(asOfIso).getTime();
  if (!Number.isFinite(asOfMs)) return null;
  const eligible = quarterlyEps
    .filter((q) => {
      const ms = new Date(q.period_end_iso).getTime();
      return Number.isFinite(ms) && ms <= asOfMs;
    })
    .sort((a, b) =>
      b.period_end_iso.localeCompare(a.period_end_iso),
    );
  if (eligible.length < 4) return null;
  const ttm = eligible.slice(0, 4).reduce((s, q) => s + q.eps, 0);
  if (!Number.isFinite(ttm) || ttm <= 0) return null;
  return ttm;
}

// Find the earliest in-window close for a ticker (the value indexed to 100
// in the chart). Buckets are compared as YYYY-MM strings.
function priceAtWindowStart(
  history: TickerHistory,
  windowStartBucket: string,
): { close: number; period_end_iso: string } | null {
  for (const p of history.points) {
    const bucket = monthBucket(p.date);
    if (bucket && bucket >= windowStartBucket) {
      return { close: p.close, period_end_iso: p.date };
    }
  }
  return null;
}

interface ComputedRow {
  ticker: string;
  name: string;
  pe_start: number | null;
  pe_end: number | null;
  revenue_growth_yoy: number | null;
  ebitda: number | null;
  ebitda_margin: number | null;
  currency: string | null;
}

export function computeRows(
  snapshots: TickerSnapshot[],
  history: TickerHistory[],
  windowMonths: number,
): ComputedRow[] {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - windowMonths);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const cutoffBucket = monthBucket(cutoffIso);

  const historyByTicker = new Map(history.map((h) => [h.ticker, h]));

  return snapshots.map((s) => {
    let pe_start: number | null = null;
    if (cutoffBucket) {
      const h = historyByTicker.get(s.ticker);
      if (h) {
        const start = priceAtWindowStart(h, cutoffBucket);
        if (start) {
          const ttm = ttmEpsAt(s.quarterly_eps, start.period_end_iso);
          if (ttm !== null && start.close > 0) {
            pe_start = start.close / ttm;
          }
        }
      }
    }
    return {
      ticker: s.ticker,
      name: s.name,
      pe_start,
      pe_end: s.trailing_pe,
      revenue_growth_yoy: s.revenue_growth_yoy,
      ebitda: s.ebitda,
      ebitda_margin: s.ebitda_margin,
      currency: s.currency,
    };
  });
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

export function PerTickerTable({
  snapshots,
  history,
  windowMonths,
}: PerTickerTableProps) {
  const rows = React.useMemo(
    () => computeRows(snapshots, history, windowMonths),
    [snapshots, history, windowMonths],
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
            <th className="px-3 py-2 text-right font-medium">
              P/E <span className="text-neutral-400">(start)</span>
            </th>
            <th className="px-3 py-2 text-right font-medium">
              P/E <span className="text-neutral-400">(now)</span>
            </th>
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
                {fmtRatio(r.pe_start)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmtRatio(r.pe_end)}
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
