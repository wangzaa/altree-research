import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  PerTickerTable,
  closestCloseTo,
  computePe,
  computeRows,
  fmtEbitda,
  ttmEpsLatest,
} from "@/components/per-ticker-table";
import type {
  TickerHistory,
  TickerSnapshot,
  QuarterlyEps,
} from "@/lib/schemas/scan";

describe("ttmEpsLatest", () => {
  const eps: QuarterlyEps[] = [
    { period_end_iso: "2025-03-31", eps: 0.5 },
    { period_end_iso: "2025-06-30", eps: 0.6 },
    { period_end_iso: "2025-09-30", eps: 0.7 },
    { period_end_iso: "2025-12-31", eps: 0.8 },
    { period_end_iso: "2024-12-31", eps: 0.4 },
  ];

  it("sums the 4 most recent quarterly EPS actuals", () => {
    // Mar+Jun+Sep+Dec 2025 = 0.5+0.6+0.7+0.8 = 2.6
    expect(ttmEpsLatest(eps)).toBeCloseTo(2.6, 5);
  });

  it("returns null when fewer than 4 quarters of EPS are present", () => {
    expect(ttmEpsLatest(eps.slice(0, 3))).toBeNull();
  });

  it("returns null when the TTM sum is non-positive (loss-maker)", () => {
    const lossEps: QuarterlyEps[] = [
      { period_end_iso: "2025-03-31", eps: -0.5 },
      { period_end_iso: "2025-06-30", eps: -0.6 },
      { period_end_iso: "2025-09-30", eps: -0.7 },
      { period_end_iso: "2025-12-31", eps: -0.8 },
    ];
    expect(ttmEpsLatest(lossEps)).toBeNull();
  });
});

describe("closestCloseTo", () => {
  const history: TickerHistory = {
    ticker: "FOO",
    points: [
      { date: "2025-11-30", close: 100 },
      { date: "2025-12-31", close: 110 },
      { date: "2026-01-31", close: 120 },
    ],
  };

  it("returns the close from the date nearest to the target", () => {
    expect(closestCloseTo(history, "2026-01-25")).toBe(120);
    expect(closestCloseTo(history, "2025-12-20")).toBe(110);
  });

  it("returns null when no point is within the tolerance window", () => {
    expect(closestCloseTo(history, "2024-01-01", 60)).toBeNull();
  });

  it("ignores non-finite or non-positive closes", () => {
    const dirtyHistory: TickerHistory = {
      ticker: "BAD",
      points: [
        { date: "2025-12-31", close: 0 },
        { date: "2025-12-31", close: 100 },
      ],
    };
    expect(closestCloseTo(dirtyHistory, "2025-12-31")).toBe(100);
  });
});

describe("computePe", () => {
  const eps: QuarterlyEps[] = [
    { period_end_iso: "2025-03-31", eps: 0.5 },
    { period_end_iso: "2025-06-30", eps: 0.5 },
    { period_end_iso: "2025-09-30", eps: 0.5 },
    { period_end_iso: "2025-12-31", eps: 0.5 },
  ];

  it("returns price-at-latest-EPS / TTM EPS", () => {
    const snapshot: TickerSnapshot = {
      ticker: "FOO",
      name: "Foo Co",
      ebitda: 1e9,
      ebitda_margin: 0.15,
      revenue_growth_yoy: 0.18,
      currency: "USD",
      quarterly_eps: eps,
    };
    const history: TickerHistory = {
      ticker: "FOO",
      points: [
        { date: "2025-09-30", close: 100 },
        { date: "2025-12-31", close: 120 }, // latest EPS lands here
        { date: "2026-03-31", close: 140 },
      ],
    };
    // TTM = 4 * 0.5 = 2.0; price at 2025-12-31 = 120 → 60×
    expect(computePe(snapshot, history)).toBeCloseTo(60.0, 2);
  });

  it("returns null when fewer than 4 quarters of EPS exist", () => {
    const snapshot: TickerSnapshot = {
      ticker: "NEW",
      name: "Newco",
      ebitda: null,
      ebitda_margin: null,
      revenue_growth_yoy: null,
      currency: "USD",
      quarterly_eps: eps.slice(0, 2),
    };
    const history: TickerHistory = {
      ticker: "NEW",
      points: [{ date: "2025-12-31", close: 100 }],
    };
    expect(computePe(snapshot, history)).toBeNull();
  });

  it("returns null when no closing price is within 60 days of the latest EPS date", () => {
    const snapshot: TickerSnapshot = {
      ticker: "STALE",
      name: "Stale Co",
      ebitda: null,
      ebitda_margin: null,
      revenue_growth_yoy: null,
      currency: "USD",
      quarterly_eps: eps, // latest EPS = 2025-12-31
    };
    const history: TickerHistory = {
      ticker: "STALE",
      points: [
        // closest is ~5 months from latest EPS date — outside tolerance.
        { date: "2025-05-31", close: 80 },
      ],
    };
    expect(computePe(snapshot, history)).toBeNull();
  });

  it("returns null when history is missing entirely", () => {
    const snapshot: TickerSnapshot = {
      ticker: "FOO",
      name: "Foo Co",
      ebitda: null,
      ebitda_margin: null,
      revenue_growth_yoy: null,
      currency: "USD",
      quarterly_eps: eps,
    };
    expect(computePe(snapshot, undefined)).toBeNull();
  });
});

describe("fmtEbitda", () => {
  it("formats USD with a dollar sign", () => {
    expect(fmtEbitda(5_400_000_000, "USD")).toBe("$5.4B");
    expect(fmtEbitda(280_000_000, "USD")).toBe("$280.0M");
  });

  it("formats non-USD with the currency code prefix", () => {
    expect(fmtEbitda(12_400_000_000_000, "KRW")).toBe("KRW 12.4T");
    expect(fmtEbitda(280_000_000_000, "TWD")).toBe("TWD 280.0B");
    expect(fmtEbitda(1_800_000_000, "EUR")).toBe("EUR 1.8B");
  });

  it("returns em-dash when value is null", () => {
    expect(fmtEbitda(null, "USD")).toBe("—");
  });
});

describe("computeRows", () => {
  it("joins each snapshot with its history and returns a flat row per ticker", () => {
    const snapshots: TickerSnapshot[] = [
      {
        ticker: "FOO",
        name: "Foo Co",
        ebitda: 1e9,
        ebitda_margin: 0.15,
        revenue_growth_yoy: 0.18,
        currency: "USD",
        quarterly_eps: [
          { period_end_iso: "2025-03-31", eps: 0.5 },
          { period_end_iso: "2025-06-30", eps: 0.5 },
          { period_end_iso: "2025-09-30", eps: 0.5 },
          { period_end_iso: "2025-12-31", eps: 0.5 },
        ],
      },
    ];
    const history: TickerHistory[] = [
      {
        ticker: "FOO",
        points: [{ date: "2025-12-31", close: 80 }],
      },
    ];
    const rows = computeRows(snapshots, history);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      ticker: "FOO",
      name: "Foo Co",
      pe: 40.0, // 80 / 2.0
      revenue_growth_yoy: 0.18,
      ebitda: 1e9,
      ebitda_margin: 0.15,
      currency: "USD",
    });
  });
});

describe("<PerTickerTable>", () => {
  const snapshots: TickerSnapshot[] = [
    {
      ticker: "TEST",
      name: "Test Industries",
      ebitda: 1_500_000_000,
      ebitda_margin: 0.15,
      revenue_growth_yoy: 0.22,
      currency: "USD",
      quarterly_eps: [],
    },
  ];

  it("renders one row per snapshot with the expected columns", () => {
    render(<PerTickerTable snapshots={snapshots} history={[]} />);
    expect(screen.getByText("TEST")).toBeInTheDocument();
    expect(screen.getByText("Test Industries")).toBeInTheDocument();
    expect(screen.getByText("$1.5B")).toBeInTheDocument();
    expect(screen.getByText("22.0%")).toBeInTheDocument();
    // P/E shows em-dash because the snapshot has no quarterly_eps.
    expect(screen.getByRole("columnheader", { name: /^p\/e$/i })).toBeInTheDocument();
  });

  it("renders an empty-state message when no snapshots are present", () => {
    render(<PerTickerTable snapshots={[]} history={[]} />);
    expect(
      screen.getByText(/no per-ticker fundamentals available/i),
    ).toBeInTheDocument();
  });
});
