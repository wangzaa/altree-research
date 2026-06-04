import { describe, it, expect } from "vitest";
import { recallCandidates } from "@/lib/agents/theme-exposure/recall";
import type { JpCompany } from "@/lib/schemas/jp-company";
import type { RecentReport } from "@/lib/schemas/theme-exposure";

function company(over: Partial<JpCompany> & { ticker: string }): JpCompany {
  return {
    ticker: over.ticker,
    yahoo_ticker: over.yahoo_ticker ?? `${over.ticker}.T`,
    yahoo_verified: over.yahoo_verified ?? true,
    name_en: over.name_en ?? `Co ${over.ticker}`,
    sector: over.sector ?? null,
    listed_at: over.listed_at ?? null,
    financials: over.financials ?? {
      revenue_jpy_mn: null,
      gross_profit_jpy_mn: null,
      operating_profit_jpy_mn: null,
      operating_margin: null,
      revenue_yoy: null,
    },
    description: over.description ?? null,
    latest_post_interview: over.latest_post_interview ?? null,
  };
}

function report(over: Partial<RecentReport> & { id: string }): RecentReport {
  return {
    id: over.id,
    type: over.type ?? "NEWS_UPDATE",
    published_at: over.published_at ?? "2026-05-01T00:00:00Z",
    title: over.title ?? "",
    text: over.text ?? "",
  };
}

describe("recallCandidates", () => {
  const keywords = ["dram", "hbm", "memory"];

  it("surfaces a company whose recent report text matches a keyword", () => {
    const companies = [company({ ticker: "6146" })];
    const reports = new Map<string, RecentReport[]>([
      [
        "6146",
        [report({ id: "r1", title: "Q1 update", text: "HBM demand surges" })],
      ],
    ]);
    const out = recallCandidates(companies, reports, keywords);
    expect(out).toHaveLength(1);
    expect(out[0].company.ticker).toBe("6146");
    expect(out[0].matched.map((r) => r.id)).toEqual(["r1"]);
  });

  it("excludes a company with no recent reports (empty-activity)", () => {
    const companies = [company({ ticker: "2802", description: "memory leader" })];
    const out = recallCandidates(companies, new Map(), keywords);
    expect(out).toHaveLength(0);
  });

  it("excludes a company whose reports match no keyword", () => {
    const companies = [company({ ticker: "1234" })];
    const reports = new Map<string, RecentReport[]>([
      ["1234", [report({ id: "x", title: "Coffee prices", text: "nothing here" })]],
    ]);
    expect(recallCandidates(companies, reports, keywords)).toHaveLength(0);
  });

  it("keeps only the matching reports as the candidate's matched set", () => {
    const companies = [company({ ticker: "6146" })];
    const reports = new Map<string, RecentReport[]>([
      [
        "6146",
        [
          report({ id: "hit", text: "new DRAM line announced" }),
          report({ id: "miss", text: "annual picnic" }),
        ],
      ],
    ]);
    const [cand] = recallCandidates(companies, reports, keywords);
    expect(cand.matched.map((r) => r.id)).toEqual(["hit"]);
  });

  it("matches case-insensitively across title and text", () => {
    const companies = [company({ ticker: "6146" })];
    const reports = new Map<string, RecentReport[]>([
      ["6146", [report({ id: "t", title: "MEMORY pivot", text: "" })]],
    ]);
    expect(recallCandidates(companies, reports, keywords)).toHaveLength(1);
  });
});
