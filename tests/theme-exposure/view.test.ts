import { describe, it, expect } from "vitest";
import {
  joinCoveredData,
  fmtJpyMnToUsdM,
  fmtPct,
  fmtAsOf,
} from "@/lib/agents/theme-exposure/view";
import type { JpCompany } from "@/lib/schemas/jp-company";
import type { OpportunitySet } from "@/lib/schemas/theme-exposure";

function company(over: Partial<JpCompany> & { ticker: string }): JpCompany {
  return {
    ticker: over.ticker,
    yahoo_ticker: over.yahoo_ticker ?? `${over.ticker}.T`,
    yahoo_verified: true,
    name_en: over.name_en ?? `Co ${over.ticker}`,
    sector: over.sector ?? null,
    listed_at: null,
    financials: over.financials ?? {
      revenue_jpy_mn: 1_400_000,
      gross_profit_jpy_mn: null,
      operating_profit_jpy_mn: 120_000,
      operating_margin: 0.086,
      revenue_yoy: 0.043,
    },
    description: over.description ?? "Seasonings and amino acids.",
    latest_post_interview: over.latest_post_interview ?? null,
  };
}

const set: OpportunitySet = {
  theme_id: "memory_cycle",
  derived_at: "2026-06-04T00:00:00Z",
  companies: [
    {
      ticker: "6146",
      yahoo_ticker: "6146.T",
      name_en: "Disco",
      rationale: "Expanded HBM dicing capacity (Apr 2026).",
      as_of: "2026-04-12",
    },
  ],
};

describe("joinCoveredData", () => {
  it("enriches each exposed company with covered-set financials + description", () => {
    const covered = new Map([["6146", company({ ticker: "6146", name_en: "Disco" })]]);
    const rows = joinCoveredData(set, (t) => covered.get(t));
    expect(rows).toHaveLength(1);
    expect(rows[0].rationale).toBe("Expanded HBM dicing capacity (Apr 2026).");
    expect(rows[0].as_of).toBe("2026-04-12");
    expect(rows[0].description).toBe("Seasonings and amino acids.");
    expect(rows[0].financials.revenue_jpy_mn).toBe(1_400_000);
  });

  it("keeps the row with null financials when the ticker isn't in the covered set", () => {
    const rows = joinCoveredData(set, () => undefined);
    expect(rows).toHaveLength(1);
    expect(rows[0].name_en).toBe("Disco");
    expect(rows[0].description).toBeNull();
    expect(rows[0].financials.revenue_jpy_mn).toBeNull();
  });
});

describe("fmtJpyMnToUsdM", () => {
  it("converts JPY millions to USD millions via the rate map", () => {
    // 1,400,000 JPYmn = 1.4e12 JPY * 0.0066 = 9.24e9 USD = 9,240 USD M
    expect(fmtJpyMnToUsdM(1_400_000, { JPY: 0.0066 })).toBe("9,240");
  });

  it("falls back to the static table when no live rate supplied", () => {
    expect(fmtJpyMnToUsdM(1_400_000)).toBe("9,240");
  });

  it("renders an em dash for null", () => {
    expect(fmtJpyMnToUsdM(null)).toBe("—");
  });
});

describe("fmtPct", () => {
  it("renders a decimal ratio as a percentage", () => {
    expect(fmtPct(0.126)).toBe("12.6%");
  });
  it("renders a leading + for positive growth when signed", () => {
    expect(fmtPct(0.043, { signed: true })).toBe("+4.3%");
  });
  it("renders an em dash for null", () => {
    expect(fmtPct(null)).toBe("—");
  });
});

describe("fmtAsOf", () => {
  it("formats an ISO date deterministically in UTC", () => {
    expect(fmtAsOf("2026-04-12")).toBe("12 Apr 2026");
  });
  it("handles a full ISO datetime", () => {
    expect(fmtAsOf("2026-04-12T09:30:00Z")).toBe("12 Apr 2026");
  });
});
