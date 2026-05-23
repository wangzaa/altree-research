import { describe, it, expect } from "vitest";
import { resolveDerivable } from "@/lib/resolvers/derivable";
import type { ScanResults } from "@/lib/schemas/scan";
import type { Universe } from "@/lib/schemas/universe";
import type { DerivableHint } from "@/lib/schemas/question";

const universe: Universe = {
  id: "u1",
  created_at: "2026-05-22T00:00:00.000Z",
  last_refreshed: "2026-05-22T00:00:00.000Z",
  gics_codes: ["452030"],
  regions: ["KOREA", "US"],
  market_cap_min_usd: 1_000_000_000,
  tickers: [
    {
      ticker: "000660.KS",
      name: "SK Hynix",
      region: "KOREA",
      market_cap_usd_b: 90,
      exposure_tier: "pure_play",
      notes: "",
    },
    {
      ticker: "005930.KS",
      name: "Samsung",
      region: "KOREA",
      market_cap_usd_b: 350,
      exposure_tier: "pure_play",
      notes: "",
    },
    {
      ticker: "MU",
      name: "Micron",
      region: "US",
      market_cap_usd_b: 120,
      exposure_tier: "diversified",
      notes: "",
    },
    {
      ticker: "WDC",
      name: "WD",
      region: "US",
      market_cap_usd_b: 20,
      exposure_tier: "etf_proxy",
      notes: "",
    },
  ],
};

const scan: ScanResults = {
  thesis_id: "memory_cycle_26_05_22",
  universe_id: "u1",
  ran_at: "2026-05-22T00:00:00.000Z",
  history_5y: [
    {
      ticker: "000660.KS",
      points: [{ date: "2026-05-01", close: 100 }],
    },
  ],
  fundamentals_snapshot: {
    as_of: "2026-05-22",
    mean: { gross_margin: 0.42, ebit_margin: 0.18 },
    median: { gross_margin: 0.41, ebit_margin: 0.17 },
    per_ticker_used: 4,
  },
  tickers_snapshot: [
    {
      ticker: "000660.KS",
      name: "SK Hynix",
      ebitda: 8000,
      ebitda_margin: 0.40,
      revenue_growth_yoy: 0.42,
      currency: "KRW",
      quarterly_eps: [],
    },
    {
      ticker: "005930.KS",
      name: "Samsung",
      ebitda: 50000,
      ebitda_margin: 0.22,
      revenue_growth_yoy: 0.28,
      currency: "KRW",
      quarterly_eps: [],
    },
    {
      ticker: "MU",
      name: "Micron",
      ebitda: 6000,
      ebitda_margin: 0.30,
      revenue_growth_yoy: 0.15,
      currency: "USD",
      quarterly_eps: [],
    },
    {
      ticker: "WDC",
      name: "WD",
      ebitda: 1500,
      ebitda_margin: 0.18,
      revenue_growth_yoy: 0.05,
      currency: "USD",
      quarterly_eps: [],
    },
  ],
  descriptive_markdown: "Memory cycle scan.",
};

describe("resolveDerivable — rank_by_metric", () => {
  it("ranks all tickers by revenue_growth_yoy descending, top 3", () => {
    const hint: DerivableHint = {
      op: "rank_by_metric",
      metric: "revenue_growth_yoy",
      direction: "desc",
      limit: 3,
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.sources.tickers).toEqual(["000660.KS", "005930.KS", "MU"]);
    expect(result.answer.sources.scan_column).toBe("revenue_growth_yoy");
    expect(result.answer.text).toMatch(/SK Hynix/);
    expect(result.answer.text).toMatch(/42/);
  });

  it("applies exposure_tier filter before ranking", () => {
    const hint: DerivableHint = {
      op: "rank_by_metric",
      metric: "ebitda_margin",
      direction: "desc",
      limit: 5,
      filter: { exposure_tier: "pure_play" },
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.sources.tickers).toEqual(["000660.KS", "005930.KS"]);
  });

  it("ranks ascending when direction=asc", () => {
    const hint: DerivableHint = {
      op: "rank_by_metric",
      metric: "ebitda_margin",
      direction: "asc",
      limit: 2,
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.sources.tickers).toEqual(["WDC", "005930.KS"]);
  });

  it("uses market_cap_usd_b from the universe, not scan", () => {
    const hint: DerivableHint = {
      op: "rank_by_metric",
      metric: "market_cap_usd_b",
      direction: "desc",
      limit: 2,
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.sources.tickers).toEqual(["005930.KS", "MU"]);
  });
});

describe("resolveDerivable — aggregate_by_group", () => {
  it("computes median revenue_growth_yoy across all tickers", () => {
    const hint: DerivableHint = {
      op: "aggregate_by_group",
      metric: "revenue_growth_yoy",
      aggregator: "median",
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.text).toMatch(/21\.5/);
    expect(result.answer.sources.tickers).toHaveLength(4);
  });

  it("computes mean ebitda_margin for KOREA-only", () => {
    const hint: DerivableHint = {
      op: "aggregate_by_group",
      metric: "ebitda_margin",
      aggregator: "mean",
      filter: { region: "KOREA" },
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.sources.tickers).toEqual(["000660.KS", "005930.KS"]);
    expect(result.answer.text).toMatch(/31/);
  });

  it("computes max market_cap_usd_b", () => {
    const hint: DerivableHint = {
      op: "aggregate_by_group",
      metric: "market_cap_usd_b",
      aggregator: "max",
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.text).toMatch(/350/);
  });

  it("computes min revenue_growth_yoy", () => {
    const hint: DerivableHint = {
      op: "aggregate_by_group",
      metric: "revenue_growth_yoy",
      aggregator: "min",
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Minimum is 0.05 → 5.0%
    expect(result.answer.text).toMatch(/5\.0/);
  });
});

describe("resolveDerivable — filter_count", () => {
  it("counts KOREA tickers in the universe", () => {
    const hint: DerivableHint = {
      op: "filter_count",
      filter: { region: "KOREA" },
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.text).toMatch(/\b2\b/);
    expect(result.answer.sources.tickers).toEqual(["000660.KS", "005930.KS"]);
  });

  it("counts pure-play tickers", () => {
    const result = resolveDerivable(
      { op: "filter_count", filter: { exposure_tier: "pure_play" } },
      scan,
      universe,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.text).toMatch(/\b2\b/);
  });
});

describe("resolveDerivable — edge cases", () => {
  it("returns ok:false when the filter matches no tickers", () => {
    const result = resolveDerivable(
      {
        op: "rank_by_metric",
        metric: "revenue_growth_yoy",
        direction: "desc",
        limit: 3,
        filter: { region: "JAPAN" },
      },
      scan,
      universe,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/no tickers/i);
  });

  it("returns ok:false when a scan metric is missing for every filtered ticker", () => {
    const sparseScan: ScanResults = {
      ...scan,
      tickers_snapshot: scan.tickers_snapshot.map((t) => ({
        ...t,
        revenue_growth_yoy: null,
      })),
    };
    const result = resolveDerivable(
      { op: "rank_by_metric", metric: "revenue_growth_yoy", direction: "desc", limit: 3 },
      sparseScan,
      universe,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/no numeric values/i);
  });

  it("uses only the tickers present in both scan and universe", () => {
    const universeMissingMu: Universe = {
      ...universe,
      tickers: universe.tickers.filter((t) => t.ticker !== "MU"),
    };
    const result = resolveDerivable(
      { op: "rank_by_metric", metric: "revenue_growth_yoy", direction: "desc", limit: 10 },
      scan,
      universeMissingMu,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.sources.tickers).not.toContain("MU");
  });
});
