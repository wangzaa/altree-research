"use client";

import React, { useMemo, useState } from "react";
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

interface ScanChartProps {
  history: TickerHistory[];
}

type WindowKey = "3mth" | "6mth" | "12mth" | "3y" | "5y";

const WINDOWS: Array<{ key: WindowKey; label: string; months: number }> = [
  { key: "3mth", label: "3M", months: 3 },
  { key: "6mth", label: "6M", months: 6 },
  { key: "12mth", label: "12M", months: 12 },
  { key: "3y", label: "3Y", months: 36 },
  { key: "5y", label: "5Y", months: 60 },
];

interface ChartRow {
  date: string;
  max: number;
  min: number;
}

// Tidy long-format CSV: one row per (ticker, date) in the selected window,
// with both the raw close and the per-ticker rebased index value. Exported so
// the operator can verify the chart's transformation in Excel / pandas.
export function buildCsv(
  history: TickerHistory[],
  windowMonths: number,
): string {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - windowMonths);
  const cutoffMs = cutoff.getTime();

  const rows: string[] = ["ticker,date,close_raw,close_indexed"];
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
      const indexed = (p.close / base) * 100;
      rows.push(
        `${h.ticker},${p.date},${p.close.toFixed(4)},${indexed.toFixed(4)}`,
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
// then take the max and min across tickers per date. Per-ticker indexing puts
// every series on the same scale; the spread between max and min shows how
// wide the dispersion is between the best- and worst-performing names.
function indexedRebase(
  history: TickerHistory[],
  windowMonths: number,
): ChartRow[] {
  if (history.length === 0) return [];

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - windowMonths);
  const cutoffMs = cutoff.getTime();

  const perTickerIndexed = new Map<string, Map<string, number>>();
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
    const indexed = new Map<string, number>();
    for (const p of inWindow) {
      indexed.set(p.date, (p.close / base) * 100);
    }
    perTickerIndexed.set(h.ticker, indexed);
  }

  const dateSet = new Set<string>();
  for (const inner of perTickerIndexed.values()) {
    for (const d of inner.keys()) dateSet.add(d);
  }
  const dates = Array.from(dateSet).sort();

  const rows: ChartRow[] = [];
  for (const d of dates) {
    const vals: number[] = [];
    for (const inner of perTickerIndexed.values()) {
      const v = inner.get(d);
      if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
    }
    if (vals.length === 0) continue;
    rows.push({
      date: d,
      max: Math.max(...vals),
      min: Math.min(...vals),
    });
  }
  return rows;
}

export function ScanChart({ history }: ScanChartProps) {
  const [windowKey, setWindowKey] = useState<WindowKey>("5y");
  const months = WINDOWS.find((w) => w.key === windowKey)?.months ?? 60;
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
            onClick={() => setWindowKey(w.key)}
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
