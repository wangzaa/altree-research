import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThesisJsonView } from "@/components/thesis-json-view";
import type { Thesis } from "@/lib/schemas/thesis";

const canonicalThesis: Thesis = {
  id: "eu_defense_rearmament_cycle_26_05_01",
  version: 1,
  createdAt: "2026-05-14T12:00:00.000Z",
  createdBy: "user_abc123",
  source_snippet: "EU defense rearmament cycle.",
  claim:
    "EU defense capex cycle benefits primes with multi-year backlog visibility",
  macro_premise:
    "EU defense rearmament continues; NATO 3% commitment holds through 2030",
  horizon_years: 5,
  scope: {
    type: "thematic",
    sectors: ["20101010"],
    regions: ["EUROZONE", "UK"],
    market_cap_min_usd: 1_000_000_000,
    tickers_seed: ["RHM.DE", "BA.L", "LDO.MI"],
    tickers_exclude: [],
  },
  drivers: {
    industry: [
      {
        id: "backlog_to_revenue",
        claim: "Sector backlog/revenue >= 2y sustained",
        central_estimate: { value: 3.0, unit: "years" },
        thesis_breaks_below: 1.5,
        evidence: [],
        verdict: null,
        classification: "industry",
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
    status: "draft",
    verdict: null,
    last_validated_at: null,
    open_tensions: [],
  },
};

describe("ThesisJsonView", () => {
  it("renders the thesis id and claim text", () => {
    render(<ThesisJsonView thesis={canonicalThesis} />);
    expect(
      screen.getByText("eu_defense_rearmament_cycle_26_05_01"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/EU defense capex cycle benefits primes/),
    ).toBeInTheDocument();
  });
});
