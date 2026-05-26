import { describe, it, expect } from "vitest";
import { summariseBuildFailure } from "@/lib/universe-build-failure";
import type { Scope } from "@/lib/schemas/thesis";

// Minimal Scope fixture — only the fields the helper reads matter.
function scope(overrides: Partial<Scope> = {}): Scope {
  return {
    type: "thematic",
    sectors: ["452020"],
    regions: ["GREATER_CHINA"],
    market_cap_min_usd: 100_000_000_000,
    tickers_seed: [],
    tickers_exclude: [],
    ...overrides,
  };
}

function drop(reason: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    ticker: `T${i}.HK`,
    reason,
  }));
}

describe("summariseBuildFailure", () => {
  it("names the market-cap floor when it dominates", () => {
    const out = summariseBuildFailure({
      dropped: [
        ...drop("below_market_cap_floor", 11),
        ...drop("unknown_currency", 2),
      ],
      scope: scope({ market_cap_min_usd: 100_000_000_000 }),
      survivors: 4,
      minSurvivors: 5,
    });
    expect(out.diagnosis).toMatch(/minimum market cap of \$100B/);
    expect(out.diagnosis).toMatch(/11 of 16/);
    expect(out.diagnosis).toMatch(/Only 4 survived \(need 5\)/);
    expect(out.fix).toMatch(/Lower the minimum market cap/);
    expect(out.fix).toMatch(/Extract step/);
  });

  it("names yahoo_lookup_failed when it dominates", () => {
    const out = summariseBuildFailure({
      dropped: [
        ...drop("yahoo_lookup_failed", 8),
        ...drop("unknown_currency", 1),
      ],
      scope: scope(),
      survivors: 4,
      minSurvivors: 5,
    });
    expect(out.diagnosis).toMatch(/couldn't be found on Yahoo Finance/);
    expect(out.diagnosis).toMatch(/8 of 12/);
    expect(out.fix).toMatch(/Pick a different anchor/);
  });

  it("names unknown_currency when it dominates", () => {
    const out = summariseBuildFailure({
      dropped: drop("unknown_currency", 7),
      scope: scope(),
      survivors: 3,
      minSurvivors: 5,
    });
    expect(out.diagnosis).toMatch(/currencies we couldn't price in USD/);
    expect(out.fix).toMatch(/different region/);
  });

  it("names unknown_suffix when it dominates", () => {
    const out = summariseBuildFailure({
      dropped: drop("unknown_suffix", 6),
      scope: scope(),
      survivors: 4,
      minSurvivors: 5,
    });
    expect(out.diagnosis).toMatch(/exchanges we don't recognise/);
    expect(out.fix).toMatch(/different anchor/);
  });

  it("falls back to a mixed-causes summary when no reason crosses 60%", () => {
    const out = summariseBuildFailure({
      dropped: [
        ...drop("below_market_cap_floor", 4),
        ...drop("yahoo_lookup_failed", 4),
        ...drop("unknown_currency", 3),
      ],
      scope: scope(),
      survivors: 4,
      minSurvivors: 5,
    });
    expect(out.diagnosis).toMatch(/across several reasons/);
    // Breakdown lists each cause with its count.
    expect(out.diagnosis).toMatch(/4 below the market cap floor/);
    expect(out.diagnosis).toMatch(/4 that Yahoo couldn't find/);
    expect(out.diagnosis).toMatch(/3 with unknown currency/);
    expect(out.fix).toMatch(/different anchor.*relax filters/i);
  });

  it("renders a safe fallback when dropped is empty", () => {
    const out = summariseBuildFailure({
      dropped: [],
      scope: scope(),
      survivors: 1,
      minSurvivors: 5,
    });
    expect(out.diagnosis).toMatch(/didn't propose enough/);
    expect(out.fix).toMatch(/different anchor/);
  });
});
