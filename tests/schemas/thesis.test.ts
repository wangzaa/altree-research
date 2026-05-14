import { describe, it, expect } from "vitest";
import { ThesisSchema } from "@/lib/schemas/thesis";

const canonical = {
  id: "eu_defense_rearmament_26_05_01",
  version: 1,
  createdAt: "2026-05-13",
  createdBy: "user_abc123",
  source_snippet:
    "EU defense rearmament continues; primes have backlog visibility...",
  claim:
    "EU defense capex cycle benefits primes with multi-year backlog visibility",
  macro_premise:
    "EU defense rearmament continues; NATO 3% commitment holds through 2030",
  horizon_years: 5,
  scope: {
    type: "thematic" as const,
    sectors: ["20101010"],
    regions: ["EUROZONE", "UK", "NON_EZ_DM_EU"],
    market_cap_min_usd: 1_000_000_000,
    tickers_seed: ["RHM.DE", "BA.L", "LDO.MI"],
    tickers_exclude: [] as string[],
  },
  drivers: {
    industry: [
      {
        id: "backlog_to_revenue",
        claim: "Sector backlog/revenue >= 2y sustained",
        central_estimate: { value: 3.0, unit: "years" },
        thesis_breaks_below: 1.5,
        evidence: [] as never[],
        verdict: null,
        classification: "industry" as const,
      },
    ],
  },
  falsification: {
    primary:
      "NATO 3% commitment formally rolled back, OR EU procurement budget cut >20% YoY",
    secondary: "Sector backlog/revenue <1.5y for 2 consecutive quarters",
  },
  universe_id: "eu_defense_global",
  validation: {
    status: "draft" as const,
    verdict: null,
    last_validated_at: null,
    open_tensions: [] as string[],
  },
};

describe("ThesisSchema canonical example", () => {
  it("parses the canonical example end-to-end", () => {
    const parsed = ThesisSchema.parse(canonical);
    expect(parsed.id).toBe("eu_defense_rearmament_26_05_01");
    expect(parsed.drivers.industry).toHaveLength(1);
  });

  it("round-trips the canonical example unchanged", () => {
    const parsed = ThesisSchema.parse(canonical);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(
      JSON.parse(JSON.stringify(canonical)),
    );
  });
});

describe("ThesisSchema validation failures", () => {
  it("throws when claim is missing", () => {
    const bad = { ...canonical } as Record<string, unknown>;
    delete bad.claim;
    expect(() => ThesisSchema.parse(bad)).toThrow();
  });

  it("throws on invalid id pattern", () => {
    const bad = { ...canonical, id: "INVALID_ID" };
    expect(() => ThesisSchema.parse(bad)).toThrow();
  });

  it("throws on invalid GICS sector code", () => {
    const bad = {
      ...canonical,
      scope: { ...canonical.scope, sectors: ["999999"] },
    };
    expect(() => ThesisSchema.parse(bad)).toThrow();
  });

  it("throws on unknown region", () => {
    const bad = {
      ...canonical,
      scope: { ...canonical.scope, regions: ["MARS"] },
    };
    expect(() => ThesisSchema.parse(bad)).toThrow();
  });

  it("throws on negative market_cap_min_usd", () => {
    const bad = {
      ...canonical,
      scope: { ...canonical.scope, market_cap_min_usd: -1 },
    };
    expect(() => ThesisSchema.parse(bad)).toThrow();
  });

  it("throws when drivers.industry is empty", () => {
    const bad = { ...canonical, drivers: { industry: [] } };
    expect(() => ThesisSchema.parse(bad)).toThrow();
  });

  it("throws when drivers.industry has more than 2 entries", () => {
    const driver = canonical.drivers.industry[0];
    const bad = {
      ...canonical,
      drivers: {
        industry: [
          driver,
          { ...driver, id: "second" },
          { ...driver, id: "third" },
        ],
      },
    };
    expect(() => ThesisSchema.parse(bad)).toThrow();
  });

  it("throws on invalid driver verdict", () => {
    const driver = canonical.drivers.industry[0];
    const bad = {
      ...canonical,
      drivers: {
        industry: [{ ...driver, verdict: "INVALID" }],
      },
    };
    expect(() => ThesisSchema.parse(bad)).toThrow();
  });
});

describe("ThesisSchema defaults", () => {
  it("defaults validation.status to 'draft' and verdict to null when validation omitted", () => {
    const noValidation = { ...canonical } as Record<string, unknown>;
    delete noValidation.validation;
    const parsed = ThesisSchema.parse(noValidation);
    expect(parsed.validation.status).toBe("draft");
    expect(parsed.validation.verdict).toBeNull();
    expect(parsed.validation.last_validated_at).toBeNull();
    expect(parsed.validation.open_tensions).toEqual([]);
  });
});
