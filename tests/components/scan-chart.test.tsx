import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScanChart } from "@/components/scan-chart";
import type { TickerHistory } from "@/lib/schemas/scan";

const sampleHistory: TickerHistory[] = [
  {
    ticker: "RHM.DE",
    points: [
      { date: "2021-05-01", close: 100 },
      { date: "2021-06-01", close: 110 },
      { date: "2021-07-01", close: 120 },
    ],
  },
  {
    ticker: "BA.L",
    points: [
      { date: "2021-05-01", close: 50 },
      { date: "2021-06-01", close: 52 },
      { date: "2021-07-01", close: 55 },
    ],
  },
];

describe("<ScanChart>", () => {
  it("renders without crashing on a canonical history", () => {
    // jsdom can't measure ResponsiveContainer so the inner SVG is suppressed;
    // assert the chart's outer wrapper div exists and the empty-state copy
    // does NOT render.
    const { container } = render(<ScanChart history={sampleHistory} />);
    const wrapper = container.querySelector("div.h-64");
    expect(wrapper).toBeInTheDocument();
    expect(screen.queryByText(/no history/i)).toBeNull();
  });

  it("renders an empty-state message when history is empty", () => {
    render(<ScanChart history={[]} />);
    expect(screen.getByText(/no history/i)).toBeInTheDocument();
  });
});
