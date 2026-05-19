import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  PerTickerTable,
  computeRows,
  fmtEbitda,
  ttmEpsAt,
} from "@/components/per-ticker-table";
import type {
  TickerHistory,
  TickerSnapshot,
  QuarterlyEps,
} from "@/lib/schemas/scan";

function isoMonthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

describe("ttmEpsAt", () => {
  const eps: QuarterlyEps[] = [
    { period_end_iso: "2025-03-31", eps: 0.5 },
    { period_end_iso: "2025-06-30", eps: 0.6 },
    { period_end_iso: "2025-09-30", eps: 0.7 },
    { period_end_iso: "2025-12-31", eps: 0.8 },
    { period_end_iso: "2024-12-31", eps: 0.4 },
  ];

  it("sums the 4 most recent quarters on or before the asOf date", () => {
    expect(ttmEpsAt(eps, "2025-12-31")).toBeCloseTo(2.6, 5);
  });

  it("returns null when fewer than 4 quarters are available before the asOf date", () => {
    expect(ttmEpsAt(eps, "2025-02-01")).toBeNull();
  });

  it("returns null when the TTM sum is non-positive (loss-maker)", () => {
    const lossEps: QuarterlyEps[] = [
      { period_end_iso: "2025-03-31", eps: -0.5 },
      { period_end_iso: "2025-06-30", eps: -0.6 },
      { period_end_iso: "2025-09-30", eps: -0.7 },
      { period_end_iso: "2025-12-31", eps: -0.8 },
    ];
    expect(ttmEpsAt(lossEps, "2025-12-31")).toBeNull();
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
  it("computes pe_start using the price at window-start bucket and TTM EPS as of that date", () => {
    const snapshots: TickerSnapshot[] = [
      {
        ticker: "FOO",
        name: "Foo Co",
        trailing_pe: 20.0,
        ebitda: 1e9,
        ebitda_margin: 0.15,
        revenue_growth_yoy: 0.18,
        currency: "USD",
        quarterly_eps: [
          // All 4 quarters end at or before window start (~6 months ago) so
          // TTM at window-start is well-defined.
          { period_end_iso: isoMonthsAgo(6), eps: 1.0 },
          { period_end_iso: isoMonthsAgo(9), eps: 1.0 },
          { period_end_iso: isoMonthsAgo(12), eps: 1.0 },
          { period_end_iso: isoMonthsAgo(15), eps: 1.0 },
        ],
      },
    ];
    const history: TickerHistory[] = [
      {
        ticker: "FOO",
        points: [
          { date: isoMonthsAgo(6), close: 40 },
          { date: isoMonthsAgo(3), close: 50 },
          { date: isoMonthsAgo(0), close: 80 },
        ],
      },
    ];
    const rows = computeRows(snapshots, history, 6);
    expect(rows).toHaveLength(1);
    // At window start (~6 months ago) close = 40, TTM EPS = 4 * 1.0 = 4.0 →
    // pe_start = 40 / 4.0 = 10.
    expect(rows[0].pe_start).toBeCloseTo(10.0, 2);
    expect(rows[0].pe_end).toBe(20.0);
  });

  it("returns null pe_start when fewer than 4 quarters of EPS exist before window start", () => {
    const snapshots: TickerSnapshot[] = [
      {
        ticker: "NEW",
        name: "Newco Ltd",
        trailing_pe: 30.0,
        ebitda: 1e9,
        ebitda_margin: 0.15,
        revenue_growth_yoy: 0.5,
        currency: "USD",
        quarterly_eps: [
          { period_end_iso: isoMonthsAgo(3), eps: 0.5 }, // only one quarter
        ],
      },
    ];
    const history: TickerHistory[] = [
      {
        ticker: "NEW",
        points: [{ date: isoMonthsAgo(0), close: 30 }],
      },
    ];
    const rows = computeRows(snapshots, history, 6);
    expect(rows[0].pe_start).toBeNull();
    expect(rows[0].pe_end).toBe(30.0);
  });
});

describe("<PerTickerTable>", () => {
  const snapshots: TickerSnapshot[] = [
    {
      ticker: "TEST",
      name: "Test Industries",
      trailing_pe: 18.5,
      ebitda: 1_500_000_000,
      ebitda_margin: 0.15,
      revenue_growth_yoy: 0.22,
      currency: "USD",
      quarterly_eps: [],
    },
  ];

  it("renders one row per snapshot with the expected columns", () => {
    render(
      <PerTickerTable snapshots={snapshots} history={[]} windowMonths={60} />,
    );
    expect(screen.getByText("TEST")).toBeInTheDocument();
    expect(screen.getByText("Test Industries")).toBeInTheDocument();
    expect(screen.getByText("$1.5B")).toBeInTheDocument();
    expect(screen.getByText("18.5×")).toBeInTheDocument();
    expect(screen.getByText("22.0%")).toBeInTheDocument();
  });

  it("renders an empty-state message when no snapshots are present", () => {
    render(<PerTickerTable snapshots={[]} history={[]} windowMonths={60} />);
    expect(
      screen.getByText(/no per-ticker fundamentals available/i),
    ).toBeInTheDocument();
  });
});
