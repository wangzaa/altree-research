import { describe, it, expect } from "vitest";
import { JpCoveredSetSchema } from "@/lib/schemas/jp-company";
import {
  loadCoveredSet,
  getCoveredCompanies,
  getCoveredCompany,
} from "@/lib/data/jp-companies";

describe("covered set (jp-companies.json)", () => {
  it("loads and validates against the schema", () => {
    const set = loadCoveredSet();
    expect(JpCoveredSetSchema.safeParse(set).success).toBe(true);
  });

  it("holds the full covered set (~388 companies)", () => {
    expect(getCoveredCompanies().length).toBeGreaterThanOrEqual(380);
  });

  it("derives every yahoo_ticker as the bare code + .T", () => {
    for (const c of getCoveredCompanies()) {
      expect(c.yahoo_ticker).toBe(`${c.ticker}.T`);
      expect(typeof c.yahoo_verified).toBe("boolean");
    }
  });

  it("stores financials (JPYmn) as numbers or null, never undefined", () => {
    for (const c of getCoveredCompanies()) {
      const f = c.financials;
      for (const v of [
        f.revenue_jpy_mn,
        f.gross_profit_jpy_mn,
        f.operating_profit_jpy_mn,
        f.operating_margin,
        f.revenue_yoy,
      ]) {
        expect(v === null || typeof v === "number").toBe(true);
      }
    }
  });

  it("looks up by bare code and by Yahoo symbol", () => {
    const first = getCoveredCompanies()[0];
    expect(getCoveredCompany(first.ticker)?.ticker).toBe(first.ticker);
    expect(getCoveredCompany(first.yahoo_ticker)?.ticker).toBe(first.ticker);
  });
});
