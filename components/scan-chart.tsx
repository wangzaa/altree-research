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
}

interface ChartRow {
  date: string;
  max: number;
  min: number;
}

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

// Per-ticker rebase to 100 from each ticker's first in-window observation,
// then take the max and min across tickers per month bucket. Bucketing by
// YYYY-MM (with day 1-5 snapped to the prior month) aligns rows that arrive
// on slightly different days across exchanges — e.g. Asian month-end vs US
// month-start — so every bucket has data from the whole universe.
function indexedRebase(
  history: TickerHistory[],
  windowMonths: number,
): ChartRow[] {
  if (history.length === 0) return [];

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - windowMonths);
  const cutoffMs = cutoff.getTime();

  // ticker -> bucket -> close (last row wins within a bucket)
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

  // Per ticker: rebase its bucketed series to 100 from its earliest bucket.
  const perTickerIndexed = new Map<string, Map<string, number>>();
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
    perTickerIndexed.set(ticker, indexed);
  }

  const bucketSet = new Set<string>();
  for (const inner of perTickerIndexed.values()) {
    for (const b of inner.keys()) bucketSet.add(b);
  }
  const buckets = Array.from(bucketSet).sort();

  const rows: ChartRow[] = [];
  for (const b of buckets) {
    const vals: number[] = [];
    for (const inner of perTickerIndexed.values()) {
      const v = inner.get(b);
      if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
    }
    if (vals.length === 0) continue;
    rows.push({
      date: b,
      max: Math.max(...vals),
      min: Math.min(...vals),
    });
  }
  return rows;
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

export function ScanChart({
  history,
  windowKey,
  onWindowChange,
}: ScanChartProps) {
  const months = monthsFor(windowKey);
  const data = useMemo(
    () => indexedRebase(history, months),
    [history, months],
  );

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
              <Tooltip
                formatter={(value: number) => value.toFixed(1)}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                iconType="plainline"
              />
              <Line
                type="monotone"
                dataKey="max"
                name="Best-performing ticker"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="min"
                name="Worst-performing ticker"
                stroke="#dc2626"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
