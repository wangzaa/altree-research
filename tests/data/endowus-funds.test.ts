import { describe, it, expect } from "vitest";
import {
  loadEndowusFunds,
  riskRatingLabel,
} from "@/lib/data/endowus-funds";

describe("loadEndowusFunds", () => {
  it("parses the CSV header row and returns a non-empty list", () => {
    const funds = loadEndowusFunds();
    expect(funds.length).toBeGreaterThan(0);
  });

  it("handles quoted fields with embedded commas (e.g. 'SGD Cash, SRS')", () => {
    const funds = loadEndowusFunds();
    const withMixedFunding = funds.find((f) =>
      f.funding_source.includes(","),
    );
    expect(withMixedFunding).toBeDefined();
    expect(withMixedFunding?.fund_name.length).toBeGreaterThan(0);
    expect(withMixedFunding?.isin.length).toBeGreaterThan(0);
  });

  it("typed numeric fields are numbers or null", () => {
    const funds = loadEndowusFunds();
    const f = funds[0];
    expect(typeof f.risk_rating).toBe("number");
    expect(
      f.return_1y_pct === null || typeof f.return_1y_pct === "number",
    ).toBe(true);
    expect(
      f.return_3y_annualised_pct === null ||
        typeof f.return_3y_annualised_pct === "number",
    ).toBe(true);
  });
});

describe("riskRatingLabel", () => {
  it("maps the 1-7 scale to coarse UI labels", () => {
    expect(riskRatingLabel(1)).toBe("LOW RISK");
    expect(riskRatingLabel(2)).toBe("LOW RISK");
    expect(riskRatingLabel(3)).toBe("MEDIUM RISK");
    expect(riskRatingLabel(4)).toBe("MEDIUM RISK");
    expect(riskRatingLabel(5)).toBe("HIGH RISK");
    expect(riskRatingLabel(6)).toBe("VERY HIGH RISK");
    expect(riskRatingLabel(7)).toBe("VERY HIGH RISK");
  });
});
