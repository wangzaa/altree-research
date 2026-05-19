import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScanChart, buildCsv, monthBucket } from "@/components/scan-chart";
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

  it("renders a Download CSV button", () => {
    render(<ScanChart history={sampleHistory} />);
    expect(
      screen.getByRole("button", { name: /download csv/i }),
    ).toBeInTheDocument();
  });
});

describe("monthBucket", () => {
  it("returns YYYY-MM for mid- or end-of-month dates", () => {
    expect(monthBucket("2025-11-30")).toBe("2025-11");
    expect(monthBucket("2025-11-15")).toBe("2025-11");
    expect(monthBucket("2026-04-30")).toBe("2026-04");
  });

  it("snaps day 1-5 dates to the previous month", () => {
    expect(monthBucket("2025-12-01")).toBe("2025-11");
    expect(monthBucket("2026-01-01")).toBe("2025-12");
    expect(monthBucket("2026-02-05")).toBe("2026-01");
  });

  it("wraps year boundary correctly", () => {
    expect(monthBucket("2026-01-03")).toBe("2025-12");
  });

  it("returns null for invalid dates", () => {
    expect(monthBucket("not-a-date")).toBeNull();
  });
});

describe("buildCsv", () => {
  it("emits one header row + one row per (ticker,date) with raw and indexed values plus a month_bucket column", () => {
    const csv = buildCsv(sampleHistory, 60);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("ticker,date,month_bucket,close_raw,close_indexed");
    expect(lines.length).toBe(1 + 3 + 3); // header + 3 RHM + 3 BA
    // First RHM row: 100 raw, 100.0 indexed (rebased to itself).
    const firstRhm = lines.find((l) => l.startsWith("RHM.DE,"));
    expect(firstRhm).toMatch(/RHM\.DE,.*,100\.0000,100\.0000$/);
  });

  it("indexes each ticker independently to its own first in-window observation", () => {
    const hist: TickerHistory[] = [
      {
        ticker: "FOO",
        points: [
          { date: isoMonthsAgo(2), close: 50 },
          { date: isoMonthsAgo(0), close: 75 }, // +50% from base
        ],
      },
      {
        ticker: "BAR",
        points: [
          { date: isoMonthsAgo(2), close: 200 },
          { date: isoMonthsAgo(0), close: 180 }, // -10% from base
        ],
      },
    ];
    const csv = buildCsv(hist, 60);
    const lines = csv.split("\n");
    const fooLast = lines.find(
      (l) => l.startsWith("FOO,") && l.endsWith("150.0000"),
    );
    const barLast = lines.find(
      (l) => l.startsWith("BAR,") && l.endsWith("90.0000"),
    );
    expect(fooLast).toBeDefined();
    expect(barLast).toBeDefined();
  });

  it("skips zero/non-positive closes and tickers with no in-window data", () => {
    const hist: TickerHistory[] = [
      {
        ticker: "BAD",
        points: [
          { date: isoMonthsAgo(2), close: 0 },
          { date: isoMonthsAgo(1), close: 0 },
        ],
      },
      {
        ticker: "GOOD",
        points: [{ date: isoMonthsAgo(1), close: 10 }],
      },
    ];
    const csv = buildCsv(hist, 60);
    expect(csv).not.toContain("BAD,");
    expect(csv).toContain("GOOD,");
  });
});
