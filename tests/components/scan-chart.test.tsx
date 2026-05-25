import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ScanChart,
  buildCsv,
  defaultChartSelection,
  monthBucket,
} from "@/components/scan-chart";
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
    const { container } = render(
      <ScanChart history={sampleHistory} windowKey="5y" onWindowChange={() => {}} />,
    );
    expect(container.querySelector("div.h-64")).toBeInTheDocument();
    expect(screen.queryByText(/no history/i)).toBeNull();
    for (const label of ["3M", "6M", "12M", "3Y", "5Y"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("reflects the controlled windowKey (5Y button marked pressed)", () => {
    render(
      <ScanChart history={sampleHistory} windowKey="5y" onWindowChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "5Y" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clicking a different window fires onWindowChange with the new key", async () => {
    const user = userEvent.setup();
    const onWindowChange = vi.fn();
    render(
      <ScanChart history={sampleHistory} windowKey="5y" onWindowChange={onWindowChange} />,
    );
    await user.click(screen.getByRole("button", { name: "3M" }));
    expect(onWindowChange).toHaveBeenCalledWith("3mth");
  });

  it("renders the no-history-in-window message when all points are older than the selected window", () => {
    const oldOnly: TickerHistory[] = [
      {
        ticker: "ANCIENT.OL",
        points: [{ date: "2018-01-01", close: 10 }],
      },
    ];
    render(
      <ScanChart history={oldOnly} windowKey="3mth" onWindowChange={() => {}} />,
    );
    expect(
      screen.getByText(/no history in the selected window/i),
    ).toBeInTheDocument();
  });

  it("renders an empty-state message when history is empty", () => {
    render(
      <ScanChart history={[]} windowKey="5y" onWindowChange={() => {}} />,
    );
    expect(screen.getByText(/no history to display/i)).toBeInTheDocument();
  });

  it("renders a Download CSV button", () => {
    render(
      <ScanChart history={sampleHistory} windowKey="5y" onWindowChange={() => {}} />,
    );
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

describe("defaultChartSelection", () => {
  // Use dates close to "now" so they land inside any trailing window.
  const recentMonthsAgo = (n: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d.toISOString().slice(0, 10);
  };

  it("returns top-N by mcap plus the worst-performing ticker for the window", () => {
    const hist: TickerHistory[] = [
      // BIG1 — flat: indexed end = 100.
      {
        ticker: "BIG1",
        points: [
          { date: recentMonthsAgo(3), close: 100 },
          { date: recentMonthsAgo(0), close: 100 },
        ],
      },
      // BIG2 — up: indexed end = 110.
      {
        ticker: "BIG2",
        points: [
          { date: recentMonthsAgo(3), close: 100 },
          { date: recentMonthsAgo(0), close: 110 },
        ],
      },
      // BIG3 — up small: indexed end = 105.
      {
        ticker: "BIG3",
        points: [
          { date: recentMonthsAgo(3), close: 100 },
          { date: recentMonthsAgo(0), close: 105 },
        ],
      },
      // BIG4 — up larger: indexed end = 120.
      {
        ticker: "BIG4",
        points: [
          { date: recentMonthsAgo(3), close: 100 },
          { date: recentMonthsAgo(0), close: 120 },
        ],
      },
      // SMALL — worst performer (indexed end = 50), tiny mcap so not in top-4.
      {
        ticker: "SMALL",
        points: [
          { date: recentMonthsAgo(3), close: 100 },
          { date: recentMonthsAgo(0), close: 50 },
        ],
      },
    ];
    const mcap = { BIG1: 500, BIG2: 400, BIG3: 300, BIG4: 200, SMALL: 1 };
    const result = defaultChartSelection(hist, mcap, 6);
    expect(result).toEqual(["BIG1", "BIG2", "BIG3", "BIG4", "SMALL"]);
  });

  it("does not duplicate the worst-performer when it already sits in the top-N", () => {
    const hist: TickerHistory[] = [
      {
        ticker: "MEGA",
        points: [
          { date: recentMonthsAgo(3), close: 100 },
          { date: recentMonthsAgo(0), close: 50 }, // also the worst
        ],
      },
      {
        ticker: "OK",
        points: [
          { date: recentMonthsAgo(3), close: 100 },
          { date: recentMonthsAgo(0), close: 110 },
        ],
      },
    ];
    const mcap = { MEGA: 1000, OK: 5 };
    const result = defaultChartSelection(hist, mcap, 6, 4);
    expect(result).toEqual(["MEGA", "OK"]);
  });

  it("handles missing mcap entries by sinking them to the back of the ranking", () => {
    const hist: TickerHistory[] = [
      {
        ticker: "WITH_MCAP",
        points: [
          { date: recentMonthsAgo(3), close: 100 },
          { date: recentMonthsAgo(0), close: 110 },
        ],
      },
      {
        ticker: "NO_MCAP",
        points: [
          { date: recentMonthsAgo(3), close: 100 },
          { date: recentMonthsAgo(0), close: 105 },
        ],
      },
    ];
    const result = defaultChartSelection(hist, { WITH_MCAP: 100 }, 6, 4);
    // WITH_MCAP ranked first; NO_MCAP appended after.
    expect(result[0]).toBe("WITH_MCAP");
    expect(result).toContain("NO_MCAP");
  });
});
