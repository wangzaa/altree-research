import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScanChart } from "@/components/scan-chart";
import type { TickerHistory } from "@/lib/schemas/scan";

// Use dates close to the current month so the default 5Y window keeps them.
function isoMonthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

const sampleHistory: TickerHistory[] = [
  {
    ticker: "RHM.DE",
    points: [
      { date: isoMonthsAgo(2), close: 100 },
      { date: isoMonthsAgo(1), close: 110 },
      { date: isoMonthsAgo(0), close: 120 },
    ],
  },
  {
    ticker: "BA.L",
    points: [
      { date: isoMonthsAgo(2), close: 50 },
      { date: isoMonthsAgo(1), close: 52 },
      { date: isoMonthsAgo(0), close: 55 },
    ],
  },
];

describe("<ScanChart>", () => {
  it("renders the chart wrapper and the timeframe buttons on a canonical history", () => {
    // jsdom can't measure ResponsiveContainer so the inner SVG is suppressed;
    // assert the chart's outer wrapper div exists.
    const { container } = render(<ScanChart history={sampleHistory} />);
    expect(container.querySelector("div.h-64")).toBeInTheDocument();
    expect(screen.queryByText(/no history/i)).toBeNull();
    for (const label of ["3M", "6M", "12M", "3Y", "5Y"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("defaults to the 5Y window (button marked pressed)", () => {
    render(<ScanChart history={sampleHistory} />);
    expect(screen.getByRole("button", { name: "5Y" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clicking a narrower window updates aria-pressed and still renders the chart", async () => {
    const user = userEvent.setup();
    render(<ScanChart history={sampleHistory} />);
    await user.click(screen.getByRole("button", { name: "3M" }));
    expect(screen.getByRole("button", { name: "3M" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "5Y" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders the no-history-in-window message when all points are older than the selected window", async () => {
    const user = userEvent.setup();
    const oldOnly: TickerHistory[] = [
      {
        ticker: "ANCIENT.OL",
        points: [{ date: "2018-01-01", close: 10 }],
      },
    ];
    render(<ScanChart history={oldOnly} />);
    await user.click(screen.getByRole("button", { name: "3M" }));
    expect(
      screen.getByText(/no history in the selected window/i),
    ).toBeInTheDocument();
  });

  it("renders an empty-state message when history is empty", () => {
    render(<ScanChart history={[]} />);
    expect(screen.getByText(/no history to display/i)).toBeInTheDocument();
  });
});
