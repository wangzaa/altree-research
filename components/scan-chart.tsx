"use client";

import React, { useMemo } from "react";
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

interface ChartRow {
  date: string;
  universe: number;
}

function rebaseToHundred(history: TickerHistory[]): ChartRow[] {
  if (history.length === 0) return [];
  const byDate = new Map<string, number[]>();
  for (const h of history) {
    for (const p of h.points) {
      const arr = byDate.get(p.date) ?? [];
      arr.push(p.close);
      byDate.set(p.date, arr);
    }
  }
  const dates = Array.from(byDate.keys()).sort();
  if (dates.length === 0) return [];
  const meanCloses = dates.map((d) => {
    const vals = byDate.get(d) ?? [];
    return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  const base = meanCloses[0];
  if (base === 0) {
    return dates.map((d, i) => ({ date: d, universe: 100 + meanCloses[i] }));
  }
  return dates.map((d, i) => ({ date: d, universe: (meanCloses[i] / base) * 100 }));
}

export function ScanChart({ history }: ScanChartProps) {
  const data = useMemo(() => rebaseToHundred(history), [history]);
  if (data.length === 0) {
    return (
      <p className="text-sm text-neutral-500">No history to display.</p>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
  );
}
