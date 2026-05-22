import { describe, it, expect } from "vitest";
import {
  QuestionCategorySchema,
  ScanMetricSchema,
  DerivableHintSchema,
  ClassifiedQuestionSchema,
  DerivableAnswerSchema,
  ResolveResponseSchema,
} from "@/lib/schemas/question";

describe("QuestionCategorySchema", () => {
  it("accepts all five categories", () => {
    for (const cat of ["derivable", "fundamentals_extra", "corpus", "web", "needs_analyst"]) {
      expect(QuestionCategorySchema.parse(cat)).toBe(cat);
    }
  });
  it("rejects unknown categories", () => {
    expect(() => QuestionCategorySchema.parse("foo")).toThrow();
  });
});

describe("ScanMetricSchema", () => {
  it("accepts the three Phase-1 metrics", () => {
    for (const m of ["revenue_growth_yoy", "ebitda_margin", "market_cap_usd_b"]) {
      expect(ScanMetricSchema.parse(m)).toBe(m);
    }
  });
});

describe("DerivableHintSchema", () => {
  it("parses a rank_by_metric hint", () => {
    const parsed = DerivableHintSchema.parse({
      op: "rank_by_metric",
      metric: "revenue_growth_yoy",
      direction: "desc",
      limit: 5,
      filter: { exposure_tier: "pure_play" },
    });
    expect(parsed.op).toBe("rank_by_metric");
  });
  it("parses an aggregate_by_group hint without a filter", () => {
    const parsed = DerivableHintSchema.parse({
      op: "aggregate_by_group",
      metric: "ebitda_margin",
      aggregator: "median",
    });
    expect(parsed.op).toBe("aggregate_by_group");
  });
  it("parses a filter_count hint", () => {
    const parsed = DerivableHintSchema.parse({
      op: "filter_count",
      filter: { region: "KOREA" },
    });
    expect(parsed.op).toBe("filter_count");
  });
  it("rejects exposure_tier as a numeric tier", () => {
    expect(() =>
      DerivableHintSchema.parse({
        op: "filter_count",
        filter: { exposure_tier: 1 },
      }),
    ).toThrow();
  });
  it("rejects a region code outside the canonical enum", () => {
    expect(() =>
      DerivableHintSchema.parse({
        op: "filter_count",
        filter: { region: "KR" },
      }),
    ).toThrow();
  });
  it("rejects an unknown op", () => {
    expect(() =>
      DerivableHintSchema.parse({ op: "rank_universe", metric: "ebitda_margin" }),
    ).toThrow();
  });
  it("rejects limit > 20", () => {
    expect(() =>
      DerivableHintSchema.parse({
        op: "rank_by_metric",
        metric: "ebitda_margin",
        direction: "desc",
        limit: 50,
      }),
    ).toThrow();
  });
});

describe("ClassifiedQuestionSchema", () => {
  it("parses a derivable classification with a structured hint", () => {
    const parsed = ClassifiedQuestionSchema.parse({
      question: "Which universe tickers have the fastest revenue growth?",
      category: "derivable",
      hint: { op: "rank_by_metric", metric: "revenue_growth_yoy", direction: "desc", limit: 5 },
      confidence: 0.92,
    });
    expect(parsed.category).toBe("derivable");
  });
  it("parses a corpus classification with a string hint", () => {
    const parsed = ClassifiedQuestionSchema.parse({
      question: "What does Stratechery say about HBM supply?",
      category: "corpus",
      hint: "HBM supply tightness",
      confidence: 0.7,
    });
    expect(parsed.category).toBe("corpus");
  });
  it("parses a needs_analyst classification with a null hint", () => {
    const parsed = ClassifiedQuestionSchema.parse({
      question: "What's the sell-side mean estimate for SK Hynix FY26 EPS?",
      category: "needs_analyst",
      hint: null,
      confidence: 0.95,
    });
    expect(parsed.category).toBe("needs_analyst");
  });
  it("rejects a derivable classification with a string hint", () => {
    expect(() =>
      ClassifiedQuestionSchema.parse({
        question: "x",
        category: "derivable",
        hint: "free text",
        confidence: 0.5,
      }),
    ).toThrow();
  });
});

describe("DerivableAnswerSchema", () => {
  it("parses a rank answer with sources", () => {
    const parsed = DerivableAnswerSchema.parse({
      text: "Top 3 by revenue_growth_yoy: SK Hynix (42%), Samsung (28%), Micron (15%).",
      sources: {
        tickers: ["000660.KS", "005930.KS", "MU"],
        scan_column: "revenue_growth_yoy",
        op: "rank_by_metric",
      },
    });
    expect(parsed.sources.tickers).toHaveLength(3);
  });
});

describe("ResolveResponseSchema", () => {
  it("parses a derivable success response", () => {
    const parsed = ResolveResponseSchema.parse({
      status: "resolved",
      category: "derivable",
      answer: {
        text: "x",
        sources: { tickers: ["AAA"], scan_column: "ebitda_margin", op: "filter_count" },
      },
    });
    expect(parsed.status).toBe("resolved");
  });
  it("parses a not_implemented response", () => {
    const parsed = ResolveResponseSchema.parse({
      status: "not_implemented",
      category: "corpus",
      message: "Phase 2 — corpus resolver not built yet.",
    });
    expect(parsed.status).toBe("not_implemented");
  });
});
