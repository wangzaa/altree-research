import { describe, it, expect } from "vitest";
import {
  buildReportsByTicker,
  deriveOpportunitySet,
  type CatalystRow,
  type OpportunitySetDeps,
} from "@/lib/agents/theme-exposure/opportunity-set";
import type { JpCompany } from "@/lib/schemas/jp-company";
import type { Theme } from "@/lib/schemas/themes";
import type { TagResult } from "@/lib/agents/theme-exposure/theme-tagger";

function company(over: Partial<JpCompany> & { ticker: string }): JpCompany {
  return {
    ticker: over.ticker,
    yahoo_ticker: over.yahoo_ticker ?? `${over.ticker}.T`,
    yahoo_verified: true,
    name_en: over.name_en ?? `Co ${over.ticker}`,
    sector: null,
    listed_at: null,
    financials: {
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

function catalyst(over: Partial<CatalystRow> & { id: string; ticker: string }): CatalystRow {
  return {
    id: over.id,
    ticker: over.ticker,
    yahoo_ticker: over.yahoo_ticker ?? `${over.ticker}.T`,
    published_at: over.published_at ?? "2026-05-01T00:00:00Z",
    title: over.title ?? "",
    excerpt: over.excerpt ?? "",
    type: over.type ?? "NEWS_UPDATE",
  };
}

const theme: Theme = {
  id: "memory_cycle",
  label: "Memory chip up-cycle",
  description: "DRAM/HBM/NAND recovery.",
  keywords: ["hbm", "dram", "memory"],
};

describe("buildReportsByTicker", () => {
  it("groups catalysts and appends the latest post-interview per ticker", () => {
    const companies = [
      company({
        ticker: "6146",
        latest_post_interview: {
          published_at: "2026-03-01T00:00:00Z",
          excerpt: "Discussed HBM strategy.",
        },
      }),
    ];
    const catalysts = [
      catalyst({ id: "c1", ticker: "6146", title: "HBM line", excerpt: "new capacity" }),
    ];
    const map = buildReportsByTicker(catalysts, companies);
    const reports = map.get("6146")!;
    expect(reports.map((r) => r.type)).toEqual(["NEWS_UPDATE", "POST_INTERVIEW"]);
    expect(reports[0].id).toBe("c1");
    expect(reports[1].text).toBe("Discussed HBM strategy.");
  });

  it("omits a ticker with neither catalysts nor a post-interview", () => {
    const companies = [company({ ticker: "9999" })];
    const map = buildReportsByTicker([], companies);
    expect(map.has("9999")).toBe(false);
  });
});

describe("deriveOpportunitySet", () => {
  const baseDeps = (over: Partial<OpportunitySetDeps>): OpportunitySetDeps => ({
    getTheme: over.getTheme ?? (() => theme),
    getCompanies:
      over.getCompanies ??
      (() => [
        company({ ticker: "6146", name_en: "Disco" }),
        company({ ticker: "2802", name_en: "Ajinomoto" }),
      ]),
    fetchCatalysts:
      over.fetchCatalysts ??
      (async () => [
        catalyst({ id: "c1", ticker: "6146", title: "HBM dicing line", excerpt: "expand" }),
        catalyst({ id: "c2", ticker: "2802", title: "Coffee", excerpt: "no match" }),
      ]),
    tag: over.tag ?? (async () => ({ ok: true, exposed: false }) as TagResult),
    now: over.now ?? (() => "2026-06-04T00:00:00Z"),
  });

  it("returns only LLM-confirmed companies with dated rationales", async () => {
    const tag: OpportunitySetDeps["tag"] = async (_t, cand) => {
      if (cand.company.ticker === "6146") {
        return {
          ok: true,
          exposed: true,
          company: {
            ticker: "6146",
            yahoo_ticker: "6146.T",
            name_en: "Disco",
            rationale: "Expanded HBM dicing capacity (Apr 2026).",
            as_of: "2026-04-12",
          },
          model: "m",
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      }
      return { ok: true, exposed: false, model: "m", usage: { input_tokens: 1, output_tokens: 1 } };
    };
    const set = await deriveOpportunitySet("memory_cycle", baseDeps({ tag }));
    expect(set.theme_id).toBe("memory_cycle");
    expect(set.derived_at).toBe("2026-06-04T00:00:00Z");
    expect(set.companies).toHaveLength(1);
    expect(set.companies[0].ticker).toBe("6146");
    expect(set.companies[0].as_of).toBe("2026-04-12");
  });

  it("never sends a stage-1 non-candidate to the LLM", async () => {
    const tagged: string[] = [];
    const tag: OpportunitySetDeps["tag"] = async (_t, cand) => {
      tagged.push(cand.company.ticker);
      return { ok: true, exposed: false, model: "m", usage: { input_tokens: 1, output_tokens: 1 } };
    };
    await deriveOpportunitySet("memory_cycle", baseDeps({ tag }));
    // 2802 only has a non-matching "Coffee" catalyst → excluded before the LLM.
    expect(tagged).toEqual(["6146"]);
  });

  it("throws on an unknown theme id", async () => {
    await expect(
      deriveOpportunitySet("nope", baseDeps({ getTheme: () => undefined })),
    ).rejects.toThrow(/unknown theme/i);
  });
});
