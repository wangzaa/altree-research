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
      market_cap_usd_b: null,
      pe: 40.0, // 80 / 2.0
      revenue_growth_yoy: 0.18,
      ebitda: 1e9,
      ebitda_margin: 0.15,
      currency: "USD",
      return_pct: null,
    });
  });

  it("falls back to snapshot.trailing_pe when computePe returns null (sparse EPS history)", () => {
    const snapshots: TickerSnapshot[] = [
      {
        ticker: "HK",
        name: "HK Co",
        ebitda: null,
        ebitda_margin: null,
        revenue_growth_yoy: null,
        currency: "HKD",
        // No quarters → computePe returns null.
        quarterly_eps: [],
        trailing_pe: 28.4,
      },
    ];
    const rows = computeRows(snapshots, []);
    expect(rows[0].pe).toBe(28.4);
  });

  it("prefers the EPS-anchored compute over snapshot.trailing_pe when both are available", () => {
    const snapshots: TickerSnapshot[] = [
      {
        ticker: "FOO",
        name: "Foo Co",
        ebitda: null,
        ebitda_margin: null,
        revenue_growth_yoy: null,
        currency: "USD",
        quarterly_eps: [
          { period_end_iso: "2025-03-31", eps: 0.5 },
          { period_end_iso: "2025-06-30", eps: 0.5 },
          { period_end_iso: "2025-09-30", eps: 0.5 },
          { period_end_iso: "2025-12-31", eps: 0.5 },
        ],
        trailing_pe: 999, // would be a bug if this leaked through.
      },
    ];
    const history: TickerHistory[] = [
      { ticker: "FOO", points: [{ date: "2025-12-31", close: 80 }] },
    ];
    const rows = computeRows(snapshots, history);
    expect(rows[0].pe).toBe(40.0); // 80 / TTM(2.0), NOT trailing_pe.
  });

  it("attaches market_cap_usd_b from the supplied lookup map when provided", () => {
    const snapshots: TickerSnapshot[] = [
      {
        ticker: "FOO",
        name: "Foo Co",
        ebitda: null,
        ebitda_margin: null,
        revenue_growth_yoy: null,
        currency: null,
        quarterly_eps: [],
      },
    ];
    const rows = computeRows(snapshots, [], { FOO: 42.3 });
    expect(rows[0].market_cap_usd_b).toBe(42.3);
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
    // EBITDA: 1.5B USD rendered in USD millions = "1,500".
    expect(screen.getByText("1,500")).toBeInTheDocument();
    expect(screen.getByText("22.0%")).toBeInTheDocument();
    // P/E shows em-dash because the snapshot has no quarterly_eps. Header is
    // a sortable button so we match by role+text (the inactive arrow glyph
    // ↕ lives in a child span).
    expect(screen.getByRole("button", { name: /P\/E/ })).toBeInTheDocument();
  });

  it("colours the best-performing row green and the worst red", () => {
    const twoSnapshots: TickerSnapshot[] = [
      {
        ticker: "WIN",
        name: "Winner Co",
        ebitda: null,
        ebitda_margin: null,
        revenue_growth_yoy: null,
        currency: null,
        quarterly_eps: [],
      },
      {
        ticker: "LOSE",
        name: "Loser Co",
        ebitda: null,
        ebitda_margin: null,
        revenue_growth_yoy: null,
        currency: null,
        quarterly_eps: [],
      },
    ];
    render(
      <PerTickerTable
        snapshots={twoSnapshots}
        history={[]}
        bestTicker="WIN"
        worstTicker="LOSE"
      />,
    );
    const winRow = screen.getByText("WIN").closest("tr")!;
    const loseRow = screen.getByText("LOSE").closest("tr")!;
    expect(winRow.style.color).toMatch(/0a7a30|rgb\(10, 122, 48\)/);
    expect(loseRow.style.color).toMatch(/a30000|rgb\(163, 0, 0\)/);
  });

  it("converts EBITDA to USD M using the supplied live rates map", () => {
    const jpyEbitdaSnapshots: TickerSnapshot[] = [
      {
        ticker: "JP",
        name: "JP Co",
        ebitda: 100_000_000_000, // JPY 100B
        ebitda_margin: 0.1,
        revenue_growth_yoy: null,
        currency: "JPY",
        quarterly_eps: [],
      },
    ];
    render(
      <PerTickerTable
        snapshots={jpyEbitdaSnapshots}
        history={[]}
        ratesByCurrency={{ JPY: 0.007 }}
      />,
    );
    // 100B JPY * 0.007 = 700M USD => "700" in the USD M column.
    expect(screen.getByText("700")).toBeInTheDocument();
  });

  it("renders a Mcap (USD M) column from marketCapByTicker", () => {
    render(
      <PerTickerTable
        snapshots={snapshots}
        history={[]}
        marketCapByTicker={{ TEST: 1378 }}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Mcap \(USD M\)/ }),
    ).toBeInTheDocument();
    // 1378 (USD billions) rendered in millions = 1,378,000.
    expect(screen.getByText("1,378,000")).toBeInTheDocument();
  });

  it("renders an empty-state message when no snapshots are present", () => {
    render(<PerTickerTable snapshots={[]} history={[]} />);
    expect(
      screen.getByText(/no per-ticker fundamentals available/i),
    ).toBeInTheDocument();
  });
});
