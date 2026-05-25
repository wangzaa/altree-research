"use client";

import React, { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TickerHistory } from "@/lib/schemas/scan";

export type WindowKey = "3mth" | "6mth" | "12mth" | "3y" | "5y";

export const WINDOWS: Array<{ key: WindowKey; label: string; months: number }> = [
  { key: "3mth", label: "3M", months: 3 },
  { key: "6mth", label: "6M", months: 6 },
  { key: "12mth", label: "12M", months: 12 },
  { key: "3y", label: "3Y", months: 36 },
  { key: "5y", label: "5Y", months: 60 },
];

export function monthsFor(key: WindowKey): number {
  return WINDOWS.find((w) => w.key === key)?.months ?? 60;
}

interface ScanChartProps {
  history: TickerHistory[];
  windowKey: WindowKey;
  onWindowChange: (next: WindowKey) => void;
  /** Tickers to draw as individual lines. When omitted, every ticker in
   * `history` is drawn — preserves the test-friendly default but the live
   * scan panel always passes an explicit selection. Order matters: it
   * controls color assignment from the palette. */
  selectedTickers?: string[];
}

/** Indexed (base 100) chart row: one date column plus one numeric column
 * per ticker. Recharts plots a `<Line>` per ticker by reading the ticker
 * key off this object. */
type ChartRow = { date: string } & Record<string, number | string>;

// Stable line color palette. Ordered for high contrast on a white
// background — first 5 cover the default top-4-by-mcap + worst-performer
// case without re-using a color. Keep at least 8 colors so the user can
// add a few more from the per-ticker table without collisions.
export const CHART_PALETTE = [
  "#1f77b4", // blue
  "#ff7f0e", // orange
  "#2ca02c", // green
  "#d62728", // red
  "#9467bd", // purple
  "#8c564b", // brown
  "#e377c2", // pink
  "#17becf", // teal
];

// Asian exchanges (.KS / .TW) report monthly bars on the LAST day of the
// month (2025-11-30); US listings (MU, AAPL...) on the FIRST day of the
// following month (2025-12-01). Same underlying close, different label.
// Snap any day 1-5 of a month to the previous month's bucket so they line up.
export function monthBucket(isoDate: string): string | null {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth();
  if (d.getUTCDate() <= 5) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// Tidy long-format CSV: one row per (ticker, date) in the selected window,
// with raw close, the month_bucket the row is collapsed into, and the
// per-ticker rebased index value. Exported so the operator can verify the
// chart's transformation in Excel / pandas.
export function buildCsv(
  history: TickerHistory[],
  windowMonths: number,
): string {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - windowMonths);
  const cutoffMs = cutoff.getTime();

  const rows: string[] = [
    "ticker,date,month_bucket,close_raw,close_indexed",
  ];
  for (const h of history) {
    const inWindow = h.points.filter((p) => {
      const ms = new Date(p.date).getTime();
      return (
        Number.isFinite(ms) &&
        ms >= cutoffMs &&
        Number.isFinite(p.close) &&
        p.close > 0
      );
    });
    if (inWindow.length === 0) continue;
    const base = inWindow[0].close;
    if (!Number.isFinite(base) || base <= 0) continue;
    for (const p of inWindow) {
      const bucket = monthBucket(p.date) ?? "";
      const indexed = (p.close / base) * 100;
      rows.push(
        `${h.ticker},${p.date},${bucket},${p.close.toFixed(4)},${indexed.toFixed(4)}`,
      );
    }
  }
  return rows.join("\n");
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Build the per-ticker indexed series for the trailing window. Each ticker
 * is rebased to 100 at its earliest in-window bucket. Bucketing by YYYY-MM
 * (with day 1-5 snapped to the prior month) aligns rows that arrive on
 * slightly different days across exchanges — Asian month-end vs US
 * month-start — so every bucket has data from the whole universe. Returns
 * an inner map `bucket -> close-indexed-to-100`. */
function rebasedSeriesByTicker(
  history: TickerHistory[],
  windowMonths: number,
): Map<string, Map<string, number>> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - windowMonths);
  const cutoffMs = cutoff.getTime();

  const perTickerByBucket = new Map<string, Map<string, number>>();
  for (const h of history) {
    const bucketed = new Map<string, number>();
    const orderedDates: { date: string; ms: number; close: number; bucket: string }[] = [];
    for (const p of h.points) {
      const ms = new Date(p.date).getTime();
      if (
        !Number.isFinite(ms) ||
        ms < cutoffMs ||
        !Number.isFinite(p.close) ||
        p.close <= 0
      ) {
        continue;
      }
      const bucket = monthBucket(p.date);
      if (!bucket) continue;
      orderedDates.push({ date: p.date, ms, close: p.close, bucket });
    }
    if (orderedDates.length === 0) continue;
    orderedDates.sort((a, b) => a.ms - b.ms);
    for (const row of orderedDates) {
      bucketed.set(row.bucket, row.close);
    }
    perTickerByBucket.set(h.ticker, bucketed);
  }

  const out = new Map<string, Map<string, number>>();
  for (const [ticker, bucketed] of perTickerByBucket) {
    const buckets = Array.from(bucketed.keys()).sort();
    if (buckets.length === 0) continue;
    const base = bucketed.get(buckets[0]);
    if (typeof base !== "number" || !Number.isFinite(base) || base <= 0) continue;
    const indexed = new Map<string, number>();
    for (const b of buckets) {
      const close = bucketed.get(b);
      if (typeof close !== "number" || !Number.isFinite(close)) continue;
      indexed.set(b, (close / base) * 100);
    }
    out.set(ticker, indexed);
  }
  return out;
}

/** Pivot per-ticker indexed series into Recharts' "one row per date with
 * a numeric column per ticker" shape. Tickers with no in-window data are
 * silently dropped. Buckets where a given ticker is missing simply omit
 * that key (Recharts treats undefined as a gap). */
function buildChartRows(
  history: TickerHistory[],
  windowMonths: number,
  tickers: string[],
): ChartRow[] {
  if (history.length === 0 || tickers.length === 0) return [];

  const series = rebasedSeriesByTicker(history, windowMonths);
  const bucketSet = new Set<string>();
  for (const t of tickers) {
    const inner = series.get(t);
    if (!inner) continue;
    for (const b of inner.keys()) bucketSet.add(b);
  }
  const buckets = Array.from(bucketSet).sort();

  return buckets.map((b) => {
    const row: ChartRow = { date: b };
    for (const t of tickers) {
      const v = series.get(t)?.get(b);
      if (typeof v === "number" && Number.isFinite(v)) row[t] = v;
    }
    return row;
  });
}

/** Returns each ticker's last-bucket indexed value (base 100) within the
 * given trailing window. Used to mark the best- and worst-performing rows
 * in the per-ticker table. Tickers with no in-window data are omitted. */
export function tickerEndValues(
  history: TickerHistory[],
  windowMonths: number,
): Map<string, number> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - windowMonths);
  const cutoffMs = cutoff.getTime();

  const out = new Map<string, number>();
  for (const h of history) {
    const bucketed = new Map<string, number>();
    for (const p of h.points) {
      const ms = new Date(p.date).getTime();
      if (
        !Number.isFinite(ms) ||
        ms < cutoffMs ||
        !Number.isFinite(p.close) ||
        p.close <= 0
      ) {
        continue;
      }
      const bucket = monthBucket(p.date);
      if (!bucket) continue;
      bucketed.set(bucket, p.close);
    }
    if (bucketed.size === 0) continue;
    const buckets = Array.from(bucketed.keys()).sort();
    const base = bucketed.get(buckets[0]);
    const last = bucketed.get(buckets[buckets.length - 1]);
    if (
      typeof base !== "number" ||
      !Number.isFinite(base) ||
      base <= 0 ||
      typeof last !== "number" ||
      !Number.isFinite(last)
    ) {
      continue;
    }
    out.set(h.ticker, (last / base) * 100);
  }
  return out;
}

/** Returns the best- and worst-performing ticker over the trailing window,
 * by ending indexed value. Returns nulls when the universe has fewer than
 * two in-window tickers (can't meaningfully rank). */
export function rankTickersByWindow(
  history: TickerHistory[],
  windowMonths: number,
): { best: string | null; worst: string | null } {
  const ends = tickerEndValues(history, windowMonths);
  if (ends.size < 2) return { best: null, worst: null };
  let best: { ticker: string; value: number } | null = null;
  let worst: { ticker: string; value: number } | null = null;
  for (const [ticker, value] of ends) {
    if (best === null || value > best.value) best = { ticker, value };
    if (worst === null || value < worst.value) worst = { ticker, value };
  }
  return {
    best: best?.ticker ?? null,
    worst: worst?.ticker ?? null,
  };
}

/** Default chart selection = top-N tickers by USD market cap (default 4)
 * plus the worst-performing ticker over the supplied window. Order is
 * preserved (top-by-mcap first, worst appended only if not already in the
 * top-N) so it maps cleanly onto `CHART_PALETTE`. Tickers absent from
 * `marketCapByTicker` fall to the back of the mcap ranking. */
export function defaultChartSelection(
  history: TickerHistory[],
  marketCapByTicker: Record<string, number> | undefined,
  windowMonths: number,
  topN = 4,
): string[] {
  const tickersInHistory = history.map((h) => h.ticker);
  const ranked = [...tickersInHistory].sort((a, b) => {
    const mcapA = marketCapByTicker?.[a] ?? -Infinity;
    const mcapB = marketCapByTicker?.[b] ?? -Infinity;
    return mcapB - mcapA;
  });
  const top = ranked.slice(0, topN);

  const ends = tickerEndValues(history, windowMonths);
  let worst: string | null = null;
  let worstVal = Number.POSITIVE_INFINITY;
  for (const [ticker, value] of ends) {
    if (value < worstVal) {
      worstVal = value;
      worst = ticker;
    }
  }

  const out = [...top];
  if (worst && !out.includes(worst)) out.push(worst);
  return out;
}

export function ScanChart({
  history,
  windowKey,
  onWindowChange,
  selectedTickers,
}: ScanChartProps) {
  const months = monthsFor(windowKey);

  // Fall back to all tickers in history when the caller doesn't pin a
  // selection — keeps the component drop-in usable in tests and any
  // legacy call site. The live scan panel always passes an explicit list.
  const tickers = useMemo(
    () =>
      selectedTickers && selectedTickers.length > 0
        ? selectedTickers
        : history.map((h) => h.ticker),
    [selectedTickers, history],
  );

  const data = useMemo(
    () => buildChartRows(history, months, tickers),
    [history, months, tickers],
  );

  // Stable color assignment: index in `tickers` → palette slot. Cycles
  // through the palette when the selection grows past its length.
  const colorByTicker = useMemo(() => {
    const out: Record<string, string> = {};
    tickers.forEach((t, i) => {
      out[t] = CHART_PALETTE[i % CHART_PALETTE.length];
    });
    return out;
  }, [tickers]);

  if (history.length === 0) {
    return <p className="text-sm text-neutral-500">No history to display.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() =>
            downloadCsv(`scan-${windowKey}.csv`, buildCsv(history, months))
          }
          className="mr-2 rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          title="Download per-ticker raw + indexed prices for the selected window"
        >
          Download CSV
        </button>
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => onWindowChange(w.key)}
            aria-pressed={windowKey === w.key}
            className={
              windowKey === w.key
                ? "rounded border border-neutral-900 bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white"
                : "rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            }
          >
            {w.label}
          </button>
        ))}
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No history in the selected window.
        </p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis
                tick={{ fontSize: 10 }}
                domain={["auto", "auto"]}
                label={{
                  value: "Price Index (100 = window start)",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                  style: { fontSize: 11, fill: "#525252", textAnchor: "middle" },
                }}
              />
              <Tooltip formatter={(value: number) => value.toFixed(1)} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                iconType="plainline"
              />
              {tickers.map((t) => (
                <Line
                  key={t}
                  type="monotone"
                  dataKey={t}
                  name={t}
                  stroke={colorByTicker[t]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
