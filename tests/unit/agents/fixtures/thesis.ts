import type { Thesis } from "@/lib/schemas/thesis";

export function makeThesis(): Thesis {
  return {
    id: "test_26_05_01",
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: "u1",
    source_snippet: "test prose",
    claim: "AI accelerator demand sustains through 2026.",
    macro_premise: "Hyperscaler capex remains elevated.",
    horizon_years: 3,
    scope: {
      type: "thematic",
      sectors: ["45301010"],
      regions: ["US"],
      market_cap_min_usd: 0,
      tickers_seed: ["NVDA", "TSM"],
      tickers_exclude: [],
    },
    drivers: {
      industry: [
        {
          id: "M1",
          claim: "TSMC capacity catches up to demand",
          central_estimate: { value: 3, unit: "years" },
          thesis_breaks_below: 2,
          evidence: [],
          tickers: ["TSM"],
          verdict: null,
          classification: "industry",
        },
      ],
    },
    falsification: { primary: "Capex collapses by >40%" },
    universe_id: "test_global",
    validation: {
      status: "draft",
      verdict: null,
      last_validated_at: null,
      open_tensions: [],
    },
  };
}
