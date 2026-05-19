"use client";

import React, { useMemo, useState } from "react";
import {
  CartesianGrid,
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
  universe: number;
}

// Per-ticker rebase to 100 from each ticker's first in-window observation,
// then average across tickers per date. Averaging raw absolute prices whipsaws
// when tickers report on slightly different month-end dates and have wildly
// different price levels — indexing first puts every series on the same scale.
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
      universe: vals.reduce((a, b) => a + b, 0) / vals.length,
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
              margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="universe"
                stroke="#171717"
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
