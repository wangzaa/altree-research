# Cycle 3 — Phase 1: Open-Question Classifier + Derivable Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the memo's `open_questions[]` into resolvable answers in the same chat thread. Phase 1 adds a Haiku classifier that tags each question with `{ category, hint, confidence }` and a deterministic `derivable` resolver that computes answers from existing scan + universe data with zero LLM calls. The `corpus`, `web`, and `fundamentals_extra` paths return a stub "not implemented" response so the UI chips and routing pattern are validated end-to-end before Phase 2/3 fill them in.

**Architecture:**
- New Haiku tool-calling agent in `lib/agents/question-classifier.ts` mirrors the `memo-writer.ts` pattern: tool spec, system prompt, `classifyQuestions(opts)` returning `{ ok, classifications } | { ok: false, error }`. The tool emits a discriminated union per question so derivable hints carry a structured plan (`op`, `metric`, `filter`) the resolver can execute deterministically.
- New `lib/resolvers/derivable.ts` is a pure module — no LLM, no I/O — that takes `(hint, scan, universe)` and runs one of three ops: `rank_by_metric`, `aggregate_by_group`, `filter_count`. It cites the tickers used and the scan column it pulled from.
- Two new POST routes: `/api/question/classify` (bulk classify per thesis) and `/api/question/resolve` (single-question resolve). Both follow the established memo-route pattern: Zod body parse, `getCurrentUser()` auth, thesis ownership check, `pipeline_events` rows for start/complete/error, descriptive HTTP errors.
- One new client component, `components/open-questions-resolver.tsx`, replaces the current bare `<ul>` of open questions inside `app/thesis/[id]/thesis-detail.client.tsx`. It calls `/api/question/classify` once on mount, renders a category chip + Resolve button per question, and appends an answer chat-bubble below each resolved question with a "Show sources (N)" toggle. State lives in the component — nothing is persisted server-side beyond `pipeline_events`, mirroring how memos themselves are stateless today.

**Tech Stack:** Next.js 15.5 (App Router) + React 19, Tailwind v4 (Pear tokens already in `app/globals.css`), Vitest 3 + React Testing Library + jsdom, Zod 3 for schemas, OpenRouter LLM client (`lib/llm/client.ts`), Supabase JS with service-role key for backend, existing `<ChatBubble>` from `components/chat-bubble.tsx`.

**Baseline before any change:** Run `npm test` and record pass/fail. Plan assumes a clean baseline; if anything is already broken, fix or skip it before starting Task 1.

---

## File Structure

**New files:**
- `lib/schemas/question.ts` — `QuestionCategory`, `ScanMetric`, `GroupFilter`, `DerivableHint`, `ClassifiedQuestion`, `DerivableAnswer`, `ResolveResponse` schemas + inferred types.
- `lib/agents/question-classifier.ts` — `classifyQuestions(opts)` Haiku agent.
- `lib/resolvers/derivable.ts` — pure `resolveDerivable(hint, scan, universe)`.
- `app/api/question/classify/route.ts` — POST handler.
- `app/api/question/resolve/route.ts` — POST handler.
- `components/open-questions-resolver.tsx` — client component, replaces the `<ul>` in thesis-detail.
- `components/category-chip.tsx` — small presentational chip for category tags.
- `tests/lib/schemas/question.test.ts`
- `tests/agents/question-classifier.test.ts`
- `tests/resolvers/derivable.test.ts`
- `tests/api/question-classify.test.ts`
- `tests/api/question-resolve.test.ts`
- `tests/components/open-questions-resolver.test.tsx`
- `tests/components/category-chip.test.tsx`

**Modified files:**
- `lib/data/agent-models.json` — add `"question_classifier": "anthropic/claude-haiku-4-5"`.
- `lib/schemas/agent-models.ts` — extend `AGENT_NAMES` with `"question_classifier"`.
- `app/thesis/[id]/thesis-detail.client.tsx` — swap the inline `<ul>` block for `<OpenQuestionsResolver thesisId={...} questions={memo.open_questions} />`.

**Out of scope for this plan:**
- Real `corpus` resolver (Phase 2 — separate plan).
- Real `web` resolver + credible-source allowlist + Haiku judge (Phase 3 — separate plan).
- `fundamentals_extra` resolver — explicitly out of cycle 3 per spec.
- Persisting classifications or resolutions to Supabase. `pipeline_events` rows are written for audit; the resolved-answer UI state is client-local, consistent with how memos themselves are not persisted today.
- Manual category-override dropdown — the spec calls it out but it's a power-user nicety; deferred to a follow-up so Phase 1 stays tight.
- Allowlist editing UI — Phase 3 concern.

---

## Task 1: Question + resolver schemas

Create the Zod schemas + inferred types that every other task imports. Doing this first locks the contracts; Tasks 2–6 are then mechanical fills.

**Files:**
- Create: `lib/schemas/question.ts`
- Create: `tests/lib/schemas/question.test.ts`

- [ ] **Step 1: Write the failing schema test**

Create `tests/lib/schemas/question.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test, verify it fails with module not found**

Run: `npm test -- tests/lib/schemas/question.test.ts`
Expected: FAIL with `Cannot find module '@/lib/schemas/question'`.

- [ ] **Step 3: Create the schema module**

Create `lib/schemas/question.ts`:

```typescript
import { z } from "zod";
import { ExposureTierSchema, RegionSchema } from "@/lib/schemas/universe";

export const QuestionCategorySchema = z.enum([
  "derivable",
  "fundamentals_extra",
  "corpus",
  "web",
  "needs_analyst",
]);
export type QuestionCategory = z.infer<typeof QuestionCategorySchema>;

export const ScanMetricSchema = z.enum([
  "revenue_growth_yoy",
  "ebitda_margin",
  "market_cap_usd_b",
]);
export type ScanMetric = z.infer<typeof ScanMetricSchema>;

export const DerivableOpSchema = z.enum([
  "rank_by_metric",
  "aggregate_by_group",
  "filter_count",
]);
export type DerivableOp = z.infer<typeof DerivableOpSchema>;

export const GroupFilterSchema = z
  .object({
    region: RegionSchema.optional(),
    exposure_tier: ExposureTierSchema.optional(),
  })
  .strict();
export type GroupFilter = z.infer<typeof GroupFilterSchema>;

export const DerivableHintSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("rank_by_metric"),
      metric: ScanMetricSchema,
      direction: z.enum(["asc", "desc"]),
      limit: z.number().int().positive().max(20),
      filter: GroupFilterSchema.optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("aggregate_by_group"),
      metric: ScanMetricSchema,
      aggregator: z.enum(["median", "mean", "max", "min"]),
      filter: GroupFilterSchema.optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("filter_count"),
      filter: GroupFilterSchema,
    })
    .strict(),
]);
export type DerivableHint = z.infer<typeof DerivableHintSchema>;

const ConfidenceSchema = z.number().min(0).max(1);

export const ClassifiedQuestionSchema = z.discriminatedUnion("category", [
  z
    .object({
      question: z.string().min(1),
      category: z.literal("derivable"),
      hint: DerivableHintSchema,
      confidence: ConfidenceSchema,
    })
    .strict(),
  z
    .object({
      question: z.string().min(1),
      category: z.literal("corpus"),
      hint: z.string().min(1).nullable(),
      confidence: ConfidenceSchema,
    })
    .strict(),
  z
    .object({
      question: z.string().min(1),
      category: z.literal("web"),
      hint: z.string().min(1).nullable(),
      confidence: ConfidenceSchema,
    })
    .strict(),
  z
    .object({
      question: z.string().min(1),
      category: z.literal("fundamentals_extra"),
      hint: z.string().min(1).nullable(),
      confidence: ConfidenceSchema,
    })
    .strict(),
  z
    .object({
      question: z.string().min(1),
      category: z.literal("needs_analyst"),
      hint: z.null(),
      confidence: ConfidenceSchema,
    })
    .strict(),
]);
export type ClassifiedQuestion = z.infer<typeof ClassifiedQuestionSchema>;

export const DerivableSourcesSchema = z
  .object({
    tickers: z.array(z.string().min(1)),
    scan_column: z.union([ScanMetricSchema, z.literal("n/a")]),
    op: DerivableOpSchema,
  })
  .strict();
export type DerivableSources = z.infer<typeof DerivableSourcesSchema>;

export const DerivableAnswerSchema = z
  .object({
    text: z.string().min(1),
    sources: DerivableSourcesSchema,
  })
  .strict();
export type DerivableAnswer = z.infer<typeof DerivableAnswerSchema>;

export const ResolveResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("resolved"),
      category: z.literal("derivable"),
      answer: DerivableAnswerSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("not_implemented"),
      category: z.enum(["corpus", "web", "fundamentals_extra"]),
      message: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("unresolvable"),
      category: QuestionCategorySchema,
      message: z.string().min(1),
    })
    .strict(),
]);
export type ResolveResponse = z.infer<typeof ResolveResponseSchema>;
```

- [ ] **Step 4: Run test, verify all pass**

Run: `npm test -- tests/lib/schemas/question.test.ts`
Expected: PASS, all assertions green.

- [ ] **Step 5: Register the new agent in the model map**

Modify `lib/data/agent-models.json` — add a new line **before** `"memo_writer"` so the JSON stays sorted-by-stage:

```json
{
  "thesis_extractor":    "anthropic/claude-sonnet-4-6",
  "thesis_refiner":      "anthropic/claude-sonnet-4-6",
  "diff_narrator":       "anthropic/claude-haiku-4-5",
  "universe_discoverer": "anthropic/claude-sonnet-4-6",
  "scan_runner":         "anthropic/claude-sonnet-4-6",
  "bull_researcher":     "anthropic/claude-opus-4-7",
  "bear_researcher":     "anthropic/claude-opus-4-7",
  "bull_synthesiser":    "anthropic/claude-haiku-4-5",
  "bear_synthesiser":    "anthropic/claude-haiku-4-5",
  "memo_writer":         "anthropic/claude-sonnet-4-6",
  "question_classifier": "anthropic/claude-haiku-4-5"
}
```

Modify `lib/schemas/agent-models.ts` — extend `AGENT_NAMES`. Find the existing tuple and append `"question_classifier"`. If the file looks like:

```typescript
export const AGENT_NAMES = [
  "thesis_extractor",
  "thesis_refiner",
  "diff_narrator",
  "universe_discoverer",
  "scan_runner",
  "bull_researcher",
  "bear_researcher",
  "bull_synthesiser",
  "bear_synthesiser",
  "memo_writer",
] as const;
```

Change to:

```typescript
export const AGENT_NAMES = [
  "thesis_extractor",
  "thesis_refiner",
  "diff_narrator",
  "universe_discoverer",
  "scan_runner",
  "bull_researcher",
  "bear_researcher",
  "bull_synthesiser",
  "bear_synthesiser",
  "memo_writer",
  "question_classifier",
] as const;
```

- [ ] **Step 6: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS. If the existing `agent-models.test.ts` (if any) checks the JSON-vs-tuple invariant, it should now pass with the new key present in both.

- [ ] **Step 7: Commit**

```bash
git add lib/schemas/question.ts tests/lib/schemas/question.test.ts lib/data/agent-models.json lib/schemas/agent-models.ts
git commit -m "feat(s12): cycle 3 phase 1 — question + resolver schemas + classifier agent slot"
```

---

## Task 2: Derivable resolver (pure module)

Write the resolver as a pure function over `(hint, scan, universe)` so it's trivially testable. No Supabase, no LLM. The API route in Task 5 fetches data and passes it in.

**Files:**
- Create: `lib/resolvers/derivable.ts`
- Create: `tests/resolvers/derivable.test.ts`

- [ ] **Step 1: Write the failing tests with realistic fixtures**

Create `tests/resolvers/derivable.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveDerivable } from "@/lib/resolvers/derivable";
import type { ScanResults } from "@/lib/schemas/scan";
import type { Universe } from "@/lib/schemas/universe";
import type { DerivableHint } from "@/lib/schemas/question";

const universe: Universe = {
  id: "u1",
  gics_codes: ["452030"],
  regions: ["KOREA", "US"],
  market_cap_min_usd: 1_000_000_000,
  tickers: [
    { ticker: "000660.KS", name: "SK Hynix", region: "KOREA", market_cap_usd_b: 90, exposure_tier: "pure_play", exposure_rationale: "x", transcript_source: null, notes: null },
    { ticker: "005930.KS", name: "Samsung",  region: "KOREA", market_cap_usd_b: 350, exposure_tier: "pure_play", exposure_rationale: "x", transcript_source: null, notes: null },
    { ticker: "MU",        name: "Micron",   region: "US", market_cap_usd_b: 120, exposure_tier: "diversified", exposure_rationale: "x", transcript_source: null, notes: null },
    { ticker: "WDC",       name: "WD",       region: "US", market_cap_usd_b: 20,  exposure_tier: "etf_proxy", exposure_rationale: "x", transcript_source: null, notes: null },
  ],
};

const scan: ScanResults = {
  run_at: "2026-05-22T00:00:00Z",
  fundamentals: {
    as_of: "2026-05-22",
    mean_gross_margin: 0.42,
    median_gross_margin: 0.41,
    mean_ebit_margin: 0.18,
    median_ebit_margin: 0.17,
    per_ticker_used: ["000660.KS", "005930.KS", "MU", "WDC"],
  },
  tickers_snapshot: [
    { ticker: "000660.KS", name: "SK Hynix", ebitda: 8000, ebitda_margin: 0.40, revenue_growth_yoy: 0.42, currency: "KRW", quarterly_eps: [] },
    { ticker: "005930.KS", name: "Samsung",  ebitda: 50000, ebitda_margin: 0.22, revenue_growth_yoy: 0.28, currency: "KRW", quarterly_eps: [] },
    { ticker: "MU",        name: "Micron",   ebitda: 6000, ebitda_margin: 0.30, revenue_growth_yoy: 0.15, currency: "USD", quarterly_eps: [] },
    { ticker: "WDC",       name: "WD",       ebitda: 1500, ebitda_margin: 0.18, revenue_growth_yoy: 0.05, currency: "USD", quarterly_eps: [] },
  ],
};

describe("resolveDerivable — rank_by_metric", () => {
  it("ranks all tickers by revenue_growth_yoy descending, top 3", () => {
    const hint: DerivableHint = {
      op: "rank_by_metric",
      metric: "revenue_growth_yoy",
      direction: "desc",
      limit: 3,
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.sources.tickers).toEqual(["000660.KS", "005930.KS", "MU"]);
    expect(result.answer.sources.scan_column).toBe("revenue_growth_yoy");
    expect(result.answer.text).toMatch(/SK Hynix/);
    expect(result.answer.text).toMatch(/42/);
  });

  it("applies exposure_tier filter before ranking", () => {
    const hint: DerivableHint = {
      op: "rank_by_metric",
      metric: "ebitda_margin",
      direction: "desc",
      limit: 5,
      filter: { exposure_tier: "pure_play" },
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.sources.tickers).toEqual(["000660.KS", "005930.KS"]);
  });

  it("ranks ascending when direction=asc", () => {
    const hint: DerivableHint = {
      op: "rank_by_metric",
      metric: "ebitda_margin",
      direction: "asc",
      limit: 2,
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.sources.tickers).toEqual(["WDC", "005930.KS"]);
  });

  it("uses market_cap_usd_b from the universe, not scan", () => {
    const hint: DerivableHint = {
      op: "rank_by_metric",
      metric: "market_cap_usd_b",
      direction: "desc",
      limit: 2,
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.sources.tickers).toEqual(["005930.KS", "MU"]);
  });
});

describe("resolveDerivable — aggregate_by_group", () => {
  it("computes median revenue_growth_yoy across all tickers", () => {
    const hint: DerivableHint = {
      op: "aggregate_by_group",
      metric: "revenue_growth_yoy",
      aggregator: "median",
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Sorted: 0.05, 0.15, 0.28, 0.42 → median = (0.15 + 0.28) / 2 = 0.215
    expect(result.answer.text).toMatch(/21\.5/);
    expect(result.answer.sources.tickers).toHaveLength(4);
  });

  it("computes mean ebitda_margin for KR-only", () => {
    const hint: DerivableHint = {
      op: "aggregate_by_group",
      metric: "ebitda_margin",
      aggregator: "mean",
      filter: { region: "KOREA" },
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.sources.tickers).toEqual(["000660.KS", "005930.KS"]);
    // (0.40 + 0.22) / 2 = 0.31
    expect(result.answer.text).toMatch(/31/);
  });

  it("computes max market_cap_usd_b", () => {
    const hint: DerivableHint = {
      op: "aggregate_by_group",
      metric: "market_cap_usd_b",
      aggregator: "max",
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.text).toMatch(/350/);
  });
});

describe("resolveDerivable — filter_count", () => {
  it("counts KR tickers in the universe", () => {
    const hint: DerivableHint = {
      op: "filter_count",
      filter: { region: "KOREA" },
    };
    const result = resolveDerivable(hint, scan, universe);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.text).toMatch(/\b2\b/);
    expect(result.answer.sources.tickers).toEqual(["000660.KS", "005930.KS"]);
  });

  it("counts pure-play tickers", () => {
    const result = resolveDerivable(
      { op: "filter_count", filter: { exposure_tier: "pure_play" } },
      scan,
      universe,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.text).toMatch(/\b2\b/);
  });
});

describe("resolveDerivable — edge cases", () => {
  it("returns ok:false when the filter matches no tickers", () => {
    const result = resolveDerivable(
      {
        op: "rank_by_metric",
        metric: "revenue_growth_yoy",
        direction: "desc",
        limit: 3,
        filter: { region: "JAPAN" },
      },
      scan,
      universe,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/no tickers/i);
  });

  it("returns ok:false when a scan metric is missing for every filtered ticker", () => {
    const sparseScan: ScanResults = {
      ...scan,
      tickers_snapshot: scan.tickers_snapshot.map((t) => ({
        ...t,
        revenue_growth_yoy: null as unknown as number,
      })),
    };
    const result = resolveDerivable(
      { op: "rank_by_metric", metric: "revenue_growth_yoy", direction: "desc", limit: 3 },
      sparseScan,
      universe,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/no numeric values/i);
  });

  it("uses only the tickers present in both scan and universe", () => {
    const universeMissingMu: Universe = {
      ...universe,
      tickers: universe.tickers.filter((t) => t.ticker !== "MU"),
    };
    const result = resolveDerivable(
      { op: "rank_by_metric", metric: "revenue_growth_yoy", direction: "desc", limit: 10 },
      scan,
      universeMissingMu,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.sources.tickers).not.toContain("MU");
  });
});
```

- [ ] **Step 2: Run, verify all fail**

Run: `npm test -- tests/resolvers/derivable.test.ts`
Expected: FAIL with `Cannot find module '@/lib/resolvers/derivable'`.

- [ ] **Step 3: Implement the resolver**

Create `lib/resolvers/derivable.ts`:

```typescript
import type { ScanResults, TickerSnapshot } from "@/lib/schemas/scan";
import type { Universe, UniverseTicker } from "@/lib/schemas/universe";
import type {
  DerivableAnswer,
  DerivableHint,
  GroupFilter,
  ScanMetric,
} from "@/lib/schemas/question";

export type DerivableResult =
  | { ok: true; answer: DerivableAnswer }
  | { ok: false; reason: string };

type JoinedRow = {
  ticker: string;
  name: string;
  universe: UniverseTicker;
  scan: TickerSnapshot;
};

function joinScanUniverse(scan: ScanResults, universe: Universe): JoinedRow[] {
  const byTicker = new Map(scan.tickers_snapshot.map((s) => [s.ticker, s]));
  const rows: JoinedRow[] = [];
  for (const u of universe.tickers) {
    const s = byTicker.get(u.ticker);
    if (!s) continue;
    rows.push({ ticker: u.ticker, name: u.name, universe: u, scan: s });
  }
  return rows;
}

function applyFilter(rows: JoinedRow[], filter?: GroupFilter): JoinedRow[] {
  if (!filter) return rows;
  return rows.filter((r) => {
    if (filter.region && r.universe.region !== filter.region) return false;
    if (filter.exposure_tier != null && r.universe.exposure_tier !== filter.exposure_tier) {
      return false;
    }
    return true;
  });
}

function metricValue(row: JoinedRow, metric: ScanMetric): number | null {
  const raw =
    metric === "market_cap_usd_b" ? row.universe.market_cap_usd_b : row.scan[metric];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatMetric(metric: ScanMetric, n: number): string {
  if (metric === "market_cap_usd_b") return `$${n.toFixed(1)}B`;
  return formatPct(n);
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[Math.floor(mid)];
}

function describeFilter(filter?: GroupFilter): string {
  if (!filter) return "the universe";
  const parts: string[] = [];
  if (filter.region) parts.push(`region=${filter.region}`);
  if (filter.exposure_tier != null) parts.push(`tier=${filter.exposure_tier}`);
  return parts.length ? `tickers where ${parts.join(", ")}` : "the universe";
}

export function resolveDerivable(
  hint: DerivableHint,
  scan: ScanResults,
  universe: Universe,
): DerivableResult {
  const joined = applyFilter(joinScanUniverse(scan, universe), "filter" in hint ? hint.filter : undefined);
  if (joined.length === 0) {
    return { ok: false, reason: `No tickers match ${describeFilter("filter" in hint ? hint.filter : undefined)}.` };
  }

  if (hint.op === "filter_count") {
    const tickers = joined.map((r) => r.ticker);
    return {
      ok: true,
      answer: {
        text: `${tickers.length} ticker${tickers.length === 1 ? "" : "s"} match ${describeFilter(hint.filter)}: ${tickers.join(", ")}.`,
        sources: { tickers, scan_column: "n/a", op: "filter_count" },
      },
    };
  }

  const withValues = joined
    .map((r) => ({ row: r, value: metricValue(r, hint.metric) }))
    .filter((x): x is { row: JoinedRow; value: number } => x.value != null);

  if (withValues.length === 0) {
    return {
      ok: false,
      reason: `No numeric values available for ${hint.metric} on the filtered tickers.`,
    };
  }

  if (hint.op === "rank_by_metric") {
    const sorted = [...withValues].sort((a, b) =>
      hint.direction === "desc" ? b.value - a.value : a.value - b.value,
    );
    const top = sorted.slice(0, hint.limit);
    const tickers = top.map((x) => x.row.ticker);
    const lines = top
      .map((x) => `${x.row.name} (${x.row.ticker}) — ${formatMetric(hint.metric, x.value)}`)
      .join("; ");
    const directionWord = hint.direction === "desc" ? "highest" : "lowest";
    return {
      ok: true,
      answer: {
        text: `Top ${top.length} by ${hint.metric} (${directionWord} first) in ${describeFilter(hint.filter)}: ${lines}.`,
        sources: { tickers, scan_column: hint.metric, op: "rank_by_metric" },
      },
    };
  }

  // hint.op === "aggregate_by_group"
  const values = withValues.map((x) => x.value);
  const tickers = withValues.map((x) => x.row.ticker);
  let agg: number;
  switch (hint.aggregator) {
    case "median":
      agg = median(values);
      break;
    case "mean":
      agg = values.reduce((s, v) => s + v, 0) / values.length;
      break;
    case "max":
      agg = Math.max(...values);
      break;
    case "min":
      agg = Math.min(...values);
      break;
  }
  return {
    ok: true,
    answer: {
      text: `${hint.aggregator} ${hint.metric} across ${describeFilter(hint.filter)} (n=${values.length}): ${formatMetric(hint.metric, agg)}.`,
      sources: { tickers, scan_column: hint.metric, op: "aggregate_by_group" },
    },
  };
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npm test -- tests/resolvers/derivable.test.ts`
Expected: PASS for every case. If `revenue_growth_yoy` median formatting differs (e.g. `21.5%` vs `21.50%`), tighten the regex in the test or the formatter — keep one source of truth.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add lib/resolvers/derivable.ts tests/resolvers/derivable.test.ts
git commit -m "feat(s12): cycle 3 phase 1 — derivable resolver (rank/aggregate/count) over scan + universe"
```

---

## Task 3: Question classifier agent

Build the Haiku-backed classifier that takes a thesis + a list of open questions and emits a `ClassifiedQuestion[]`. Mirrors `lib/agents/memo-writer.ts` exactly: a tool spec, a system prompt, a `classifyQuestions(opts)` function that calls `createMessage()` and validates the tool call against the schema.

**Files:**
- Create: `lib/agents/question-classifier.ts`
- Create: `tests/agents/question-classifier.test.ts`

- [ ] **Step 1: Write the failing agent test**

Create `tests/agents/question-classifier.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

const createMessageMock = vi.fn();
vi.mock("@/lib/llm/client", () => ({ createMessage: createMessageMock }));

import { classifyQuestions } from "@/lib/agents/question-classifier";
import type { Thesis } from "@/lib/schemas/thesis";

const thesis: Thesis = {
  id: "t1",
  createdBy: "u1",
  createdAt: "2026-05-22T00:00:00Z",
  narrative: "Korean memory leaders are mispriced vs US peers.",
  sectors: ["semiconductors"],
  regions: ["KOREA", "US"],
  drivers: [],
  // Add other required fields as a minimal mock — extend per the real Thesis shape if needed.
} as unknown as Thesis;

function mockClassifications(items: unknown[]) {
  createMessageMock.mockResolvedValueOnce({
    ok: true,
    tool_calls: [{ name: "classify_questions", input: { classifications: items } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  });
}

describe("classifyQuestions", () => {
  beforeEach(() => {
    createMessageMock.mockReset();
  });

  it("returns ok with parsed classifications for a well-formed tool call", async () => {
    mockClassifications([
      {
        question: "Which universe tickers grew revenue fastest?",
        category: "derivable",
        hint: { op: "rank_by_metric", metric: "revenue_growth_yoy", direction: "desc", limit: 5 },
        confidence: 0.9,
      },
      {
        question: "What does Stratechery say about HBM supply?",
        category: "corpus",
        hint: "HBM supply",
        confidence: 0.7,
      },
      {
        question: "Sell-side mean FY26 EPS for SK Hynix?",
        category: "needs_analyst",
        hint: null,
        confidence: 0.95,
      },
    ]);
    const result = await classifyQuestions({
      thesis,
      questions: ["q1", "q2", "q3"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.classifications).toHaveLength(3);
    expect(result.classifications[0].category).toBe("derivable");
    expect(createMessageMock).toHaveBeenCalledOnce();
    const call = createMessageMock.mock.calls[0][0];
    expect(call.agent).toBe("question_classifier");
  });

  it("returns ok:false when the LLM call fails", async () => {
    createMessageMock.mockResolvedValueOnce({ ok: false, error: "upstream timeout" });
    const result = await classifyQuestions({ thesis, questions: ["q"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/upstream timeout/);
  });

  it("returns ok:false when the tool call payload fails schema validation", async () => {
    mockClassifications([
      {
        question: "x",
        category: "derivable",
        hint: { op: "rank_universe", metric: "ebitda_margin" }, // invalid op
        confidence: 0.5,
      },
    ]);
    const result = await classifyQuestions({ thesis, questions: ["q"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/schema|invalid/i);
  });

  it("returns ok:false when no tool call is returned", async () => {
    createMessageMock.mockResolvedValueOnce({
      ok: true,
      tool_calls: [],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
    });
    const result = await classifyQuestions({ thesis, questions: ["q"] });
    expect(result.ok).toBe(false);
  });

  it("returns ok:false when the classifications array length doesn't match input", async () => {
    mockClassifications([
      {
        question: "q1",
        category: "derivable",
        hint: { op: "rank_by_metric", metric: "ebitda_margin", direction: "desc", limit: 3 },
        confidence: 0.8,
      },
    ]);
    const result = await classifyQuestions({
      thesis,
      questions: ["q1", "q2"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/count|length|mismatch/i);
  });
});
```

> NOTE: If `Thesis` requires extra fields, look at how `tests/agents/memo-writer.test.ts` constructs its mock thesis and copy that exact shape. Don't invent new fields.

- [ ] **Step 2: Run, verify all fail**

Run: `npm test -- tests/agents/question-classifier.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the agent**

Create `lib/agents/question-classifier.ts`:

```typescript
import { createMessage } from "@/lib/llm/client";
import {
  ClassifiedQuestionSchema,
  type ClassifiedQuestion,
} from "@/lib/schemas/question";
import { z } from "zod";
import type { Thesis } from "@/lib/schemas/thesis";

export type ClassifyQuestionsOpts = {
  thesis: Thesis;
  questions: string[];
};

export type ClassifyQuestionsResult =
  | { ok: true; classifications: ClassifiedQuestion[]; usage?: unknown }
  | { ok: false; error: string };

const SYSTEM_PROMPT = `You classify analyst open-questions into one of five resolution categories so a downstream system can route each question to the right resolver.

Categories:
- derivable: answerable purely from scan + universe data already in hand. Use ONLY when the question is about ranking, aggregating, or counting universe tickers on a metric we already have. Supported metrics: revenue_growth_yoy, ebitda_margin, market_cap_usd_b. Supported filters: region (canonical codes: US, KOREA, JAPAN, GREATER_CHINA, EUROZONE, …), exposure_tier (pure_play, diversified, etf_proxy). Supported ops: rank_by_metric (top/bottom N), aggregate_by_group (median/mean/max/min), filter_count. You MUST use these exact enum values for region and exposure_tier — any other string will be rejected by the schema.
- fundamentals_extra: a fundamentals field Yahoo could provide that isn't in the current scan (segment revenue, share count, balance-sheet items). Out of scope for now.
- corpus: answerable from the expert substack corpus (covered analysts, sectors). Anything about analyst commentary, expert outlook, qualitative views from named publications.
- web: external research needed. Industry analyst reports, regulatory developments, forward roadmap claims, anything requiring fresh public sources.
- needs_analyst: proprietary intel (sell-side mean estimates, internal forecasts) the system has no feed for. Use this when no credible automated source could answer.

Output rules:
- Return exactly one classification per input question, in the same order.
- For derivable: hint MUST be a structured object with op + metric/filter. NEVER free text.
- For corpus / web / fundamentals_extra: hint is a short string (≤ 80 chars) summarising the search angle, or null if you can't suggest one.
- For needs_analyst: hint MUST be null.
- confidence is a float 0..1. Use < 0.5 only when you genuinely can't tell.
- Bias toward needs_analyst when in doubt — false positives in derivable / corpus / web waste compute and erode trust.`;

const TOOL = {
  name: "classify_questions",
  description: "Classify each open question into a resolution category with a structured hint.",
  input_schema: {
    type: "object",
    properties: {
      classifications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            category: {
              type: "string",
              enum: ["derivable", "fundamentals_extra", "corpus", "web", "needs_analyst"],
            },
            hint: {},
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["question", "category", "hint", "confidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["classifications"],
    additionalProperties: false,
  },
} as const;

const ToolInputSchema = z.object({
  classifications: z.array(ClassifiedQuestionSchema),
});

function buildUserPrompt(thesis: Thesis, questions: string[]): string {
  const lines = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  return `Thesis narrative:\n${thesis.narrative}\n\nSectors: ${thesis.sectors.join(", ")}\nRegions: ${thesis.regions.join(", ")}\n\nOpen questions to classify (preserve order):\n${lines}`;
}

export async function classifyQuestions(
  opts: ClassifyQuestionsOpts,
): Promise<ClassifyQuestionsResult> {
  if (opts.questions.length === 0) {
    return { ok: true, classifications: [] };
  }

  const res = await createMessage({
    agent: "question_classifier",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(opts.thesis, opts.questions) }],
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    max_tokens: 4096,
  });

  if (!res.ok) return { ok: false, error: res.error };

  const call = res.tool_calls[0];
  if (!call || call.name !== TOOL.name) {
    return { ok: false, error: "classifier did not return a tool call" };
  }

  const parsed = ToolInputSchema.safeParse(call.input);
  if (!parsed.success) {
    return { ok: false, error: `schema validation failed: ${parsed.error.message}` };
  }

  if (parsed.data.classifications.length !== opts.questions.length) {
    return {
      ok: false,
      error: `classifier returned ${parsed.data.classifications.length} classifications for ${opts.questions.length} questions (length mismatch)`,
    };
  }

  return { ok: true, classifications: parsed.data.classifications, usage: res.usage };
}
```

- [ ] **Step 4: Run agent tests, verify pass**

Run: `npm test -- tests/agents/question-classifier.test.ts`
Expected: PASS. If a test fails because of `Thesis` typing, check the existing `memo-writer.test.ts` thesis fixture and copy its exact shape.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/agents/question-classifier.ts tests/agents/question-classifier.test.ts
git commit -m "feat(s12): cycle 3 phase 1 — question_classifier Haiku agent with tool-call schema"
```

---

## Task 4: `/api/question/classify` POST route

Bulk classify: client posts `{ thesis_id, questions }`, server validates auth + ownership, calls `classifyQuestions()`, writes `pipeline_events`, returns `{ classifications }`. Mirrors `/api/memo/generate` step-for-step.

**Files:**
- Create: `app/api/question/classify/route.ts`
- Create: `tests/api/question-classify.test.ts`

- [ ] **Step 1: Write the failing API test**

Create `tests/api/question-classify.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

const getCurrentUserMock = vi.fn();
const classifyQuestionsMock = vi.fn();
const supabaseInsertMock = vi.fn();
const eqMaybeSingleMock = vi.fn();

vi.mock("@/lib/auth", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/agents/question-classifier", () => ({
  classifyQuestions: classifyQuestionsMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      if (table === "theses") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: eqMaybeSingleMock }),
          }),
        };
      }
      if (table === "pipeline_events") {
        return { insert: supabaseInsertMock };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/question/classify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/question/classify", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    classifyQuestionsMock.mockReset();
    supabaseInsertMock.mockReset().mockResolvedValue({ error: null });
    eqMaybeSingleMock.mockReset();
  });

  it("returns 200 with classifications on happy path", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: "t1", user_id: "u1", thesis: { narrative: "x", sectors: [], regions: [], drivers: [] } },
      error: null,
    });
    classifyQuestionsMock.mockResolvedValue({
      ok: true,
      classifications: [
        {
          question: "q1",
          category: "derivable",
          hint: { op: "rank_by_metric", metric: "ebitda_margin", direction: "desc", limit: 3 },
          confidence: 0.9,
        },
      ],
    });

    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(makeRequest({ thesis_id: "t1", questions: ["q1"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.classifications).toHaveLength(1);
    expect(supabaseInsertMock).toHaveBeenCalledTimes(2); // start + complete
  });

  it("returns 400 for invalid body", async () => {
    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(makeRequest({ thesis_id: 123 }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(makeRequest({ thesis_id: "t1", questions: ["q"] }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when thesis not found", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    eqMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(makeRequest({ thesis_id: "t1", questions: ["q"] }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when thesis belongs to another user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: "t1", user_id: "u2", thesis: {} },
      error: null,
    });
    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(makeRequest({ thesis_id: "t1", questions: ["q"] }));
    expect(res.status).toBe(404);
  });

  it("returns 502 when the classifier fails", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: "t1", user_id: "u1", thesis: { narrative: "x", sectors: [], regions: [], drivers: [] } },
      error: null,
    });
    classifyQuestionsMock.mockResolvedValue({ ok: false, error: "upstream timeout" });
    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(makeRequest({ thesis_id: "t1", questions: ["q"] }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.detail).toMatch(/upstream timeout/);
    // Should write an error pipeline_event
    const errorWrite = supabaseInsertMock.mock.calls.find(
      ([row]) => row.event_type === "error",
    );
    expect(errorWrite).toBeDefined();
  });

  it("returns 200 with an empty array when questions is empty", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: "t1", user_id: "u1", thesis: { narrative: "x", sectors: [], regions: [], drivers: [] } },
      error: null,
    });
    classifyQuestionsMock.mockResolvedValue({ ok: true, classifications: [] });
    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(makeRequest({ thesis_id: "t1", questions: [] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.classifications).toEqual([]);
  });
});
```

> NOTE: The mock paths above (`@/lib/auth`, `@/lib/supabase/server`) follow `tests/api/memo-generate.test.ts`. If that test uses different module paths, mirror them — don't invent new ones.

- [ ] **Step 2: Run, verify all fail**

Run: `npm test -- tests/api/question-classify.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Read the memo-generate route to mirror its exact shape**

Open `app/api/memo/generate/route.ts` and confirm: (a) which auth helper it imports, (b) which supabase helper, (c) the pipeline_events insert shape, (d) the error mapping. Match those imports verbatim in the new route.

- [ ] **Step 4: Implement the route**

Create `app/api/question/classify/route.ts`. Adjust imports if the memo route imports them differently — match the existing file precisely.

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { classifyQuestions } from "@/lib/agents/question-classifier";
import { getModelFor } from "@/lib/data/agent-models";

const BodySchema = z.object({
  thesis_id: z.string().min(1),
  questions: z.array(z.string().min(1)).max(20),
});

export async function POST(req: Request) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.message }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = getSupabaseServerClient();

  const { data: thesisRow } = await supabase
    .from("theses")
    .select("*")
    .eq("id", parsed.data.thesis_id)
    .maybeSingle();

  if (!thesisRow || thesisRow.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const model = getModelFor("question_classifier");

  await supabase.from("pipeline_events").insert({
    thesis_id: parsed.data.thesis_id,
    stage: "question",
    agent: "question_classifier",
    event_type: "start",
    payload: { model, question_count: parsed.data.questions.length },
  });

  let result;
  try {
    result = await classifyQuestions({
      thesis: thesisRow.thesis,
      questions: parsed.data.questions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("pipeline_events").insert({
      thesis_id: parsed.data.thesis_id,
      stage: "question",
      agent: "question_classifier",
      event_type: "error",
      payload: { model, message },
    });
    return NextResponse.json({ error: "classify_failed", detail: message }, { status: 502 });
  }

  if (!result.ok) {
    await supabase.from("pipeline_events").insert({
      thesis_id: parsed.data.thesis_id,
      stage: "question",
      agent: "question_classifier",
      event_type: "error",
      payload: { model, message: result.error },
    });
    return NextResponse.json({ error: "classify_failed", detail: result.error }, { status: 502 });
  }

  const counts: Record<string, number> = {};
  for (const c of result.classifications) {
    counts[c.category] = (counts[c.category] ?? 0) + 1;
  }

  await supabase.from("pipeline_events").insert({
    thesis_id: parsed.data.thesis_id,
    stage: "question",
    agent: "question_classifier",
    event_type: "complete",
    payload: { model, counts },
  });

  return NextResponse.json({ classifications: result.classifications }, { status: 200 });
}
```

- [ ] **Step 5: Run, verify pass**

Run: `npm test -- tests/api/question-classify.test.ts`
Expected: PASS. If any fail because the `thesis` field on `theses` row is at a different column name (e.g. `data`), check the memo route's read path and adjust both code and test.

- [ ] **Step 6: Full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/question/classify/route.ts tests/api/question-classify.test.ts
git commit -m "feat(s12): cycle 3 phase 1 — POST /api/question/classify bulk classifier route"
```

---

## Task 5: `/api/question/resolve` POST route

Per-question resolve. Client posts `{ thesis_id, question, category, hint }`. The route validates auth + ownership, then:
- `derivable` → fetch latest `scan_runs` + `universes` rows, run `resolveDerivable`, return answer + sources.
- `corpus`, `web`, `fundamentals_extra` → return `{ status: "not_implemented", message }` with HTTP 200 so the UI can render a placeholder.
- `needs_analyst` → return HTTP 400 — the client should not even call this for those.

**Files:**
- Create: `app/api/question/resolve/route.ts`
- Create: `tests/api/question-resolve.test.ts`

- [ ] **Step 1: Write the failing API test**

Create `tests/api/question-resolve.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

const getCurrentUserMock = vi.fn();
const eqMaybeSingleMock = vi.fn();
const supabaseInsertMock = vi.fn();
const scanLimitMock = vi.fn();
const universeLimitMock = vi.fn();

vi.mock("@/lib/auth", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      if (table === "theses") {
        return { select: () => ({ eq: () => ({ maybeSingle: eqMaybeSingleMock }) }) };
      }
      if (table === "scan_runs") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ limit: scanLimitMock }),
            }),
          }),
        };
      }
      if (table === "universes") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ limit: universeLimitMock }),
            }),
          }),
        };
      }
      if (table === "pipeline_events") {
        return { insert: supabaseInsertMock };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const SCAN_FIXTURE = {
  run_at: "2026-05-22T00:00:00Z",
  fundamentals: {
    as_of: "2026-05-22",
    mean_gross_margin: 0.4,
    median_gross_margin: 0.4,
    mean_ebit_margin: 0.18,
    median_ebit_margin: 0.18,
    per_ticker_used: ["AAA", "BBB"],
  },
  tickers_snapshot: [
    { ticker: "AAA", name: "Alpha", ebitda: 100, ebitda_margin: 0.3, revenue_growth_yoy: 0.2, currency: "USD", quarterly_eps: [] },
    { ticker: "BBB", name: "Beta",  ebitda: 50,  ebitda_margin: 0.2, revenue_growth_yoy: 0.1, currency: "USD", quarterly_eps: [] },
  ],
};

const UNIVERSE_FIXTURE = {
  id: "u1",
  gics_codes: ["452030"],
  regions: ["US"],
  market_cap_min_usd: 1_000_000_000,
  tickers: [
    { ticker: "AAA", name: "Alpha", region: "US", market_cap_usd_b: 50, exposure_tier: "pure_play", exposure_rationale: "x", transcript_source: null, notes: null },
    { ticker: "BBB", name: "Beta",  region: "US", market_cap_usd_b: 30, exposure_tier: "pure_play", exposure_rationale: "x", transcript_source: null, notes: null },
  ],
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/question/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/question/resolve", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    eqMaybeSingleMock.mockReset();
    supabaseInsertMock.mockReset().mockResolvedValue({ error: null });
    scanLimitMock.mockReset();
    universeLimitMock.mockReset();
  });

  it("returns 200 with a derivable answer on happy path", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: "t1", user_id: "u1", thesis: {} },
      error: null,
    });
    scanLimitMock.mockResolvedValue({ data: [{ results: SCAN_FIXTURE }], error: null });
    universeLimitMock.mockResolvedValue({ data: [{ universe: UNIVERSE_FIXTURE }], error: null });

    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: "t1",
        question: "Which ticker has the highest EBITDA margin?",
        category: "derivable",
        hint: { op: "rank_by_metric", metric: "ebitda_margin", direction: "desc", limit: 1 },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("resolved");
    expect(body.answer.sources.tickers).toEqual(["AAA"]);
  });

  it("returns 200 not_implemented for corpus", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: "t1", user_id: "u1", thesis: {} },
      error: null,
    });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: "t1",
        question: "q",
        category: "corpus",
        hint: "x",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("not_implemented");
    expect(body.category).toBe("corpus");
  });

  it("returns 200 not_implemented for web and fundamentals_extra", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: "t1", user_id: "u1", thesis: {} },
      error: null,
    });
    const { POST } = await import("@/app/api/question/resolve/route");
    for (const category of ["web", "fundamentals_extra"]) {
      const res = await POST(
        makeRequest({ thesis_id: "t1", question: "q", category, hint: "x" }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("not_implemented");
      expect(body.category).toBe(category);
    }
  });

  it("returns 400 for needs_analyst", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: "t1", user_id: "u1", thesis: {} },
      error: null,
    });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: "t1",
        question: "q",
        category: "needs_analyst",
        hint: null,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 unresolvable when derivable resolver returns ok:false", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: "t1", user_id: "u1", thesis: {} },
      error: null,
    });
    scanLimitMock.mockResolvedValue({ data: [{ results: SCAN_FIXTURE }], error: null });
    universeLimitMock.mockResolvedValue({ data: [{ universe: UNIVERSE_FIXTURE }], error: null });

    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: "t1",
        question: "q",
        category: "derivable",
        hint: {
          op: "rank_by_metric",
          metric: "ebitda_margin",
          direction: "desc",
          limit: 3,
          filter: { region: "JAPAN" },
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("unresolvable");
  });

  it("returns 409 when derivable hint is sent but no scan/universe is available", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: "t1", user_id: "u1", thesis: {} },
      error: null,
    });
    scanLimitMock.mockResolvedValue({ data: [], error: null });
    universeLimitMock.mockResolvedValue({ data: [], error: null });

    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: "t1",
        question: "q",
        category: "derivable",
        hint: { op: "filter_count", filter: { region: "US" } },
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/scan|universe/i);
  });

  it("returns 401 unauthenticated and 404 wrong owner", async () => {
    const { POST } = await import("@/app/api/question/resolve/route");

    getCurrentUserMock.mockResolvedValueOnce(null);
    const r1 = await POST(
      makeRequest({ thesis_id: "t1", question: "q", category: "corpus", hint: "x" }),
    );
    expect(r1.status).toBe(401);

    getCurrentUserMock.mockResolvedValueOnce({ id: "u1" });
    eqMaybeSingleMock.mockResolvedValueOnce({
      data: { id: "t1", user_id: "u2", thesis: {} },
      error: null,
    });
    const r2 = await POST(
      makeRequest({ thesis_id: "t1", question: "q", category: "corpus", hint: "x" }),
    );
    expect(r2.status).toBe(404);
  });

  it("returns 400 for invalid body (missing hint when derivable)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: "t1", user_id: "u1", thesis: {} },
      error: null,
    });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: "t1",
        question: "q",
        category: "derivable",
        hint: "not a structured hint",
      }),
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run, verify all fail**

Run: `npm test -- tests/api/question-resolve.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route**

Create `app/api/question/resolve/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveDerivable } from "@/lib/resolvers/derivable";
import { ClassifiedQuestionSchema } from "@/lib/schemas/question";
import { ScanResultsSchema } from "@/lib/schemas/scan";
import { UniverseSchema } from "@/lib/schemas/universe";

const BodySchema = ClassifiedQuestionSchema.and(
  z.object({ thesis_id: z.string().min(1) }),
);

export async function POST(req: Request) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.message }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = getSupabaseServerClient();
  const { data: thesisRow } = await supabase
    .from("theses")
    .select("*")
    .eq("id", parsed.data.thesis_id)
    .maybeSingle();

  if (!thesisRow || thesisRow.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { category, hint, question, thesis_id } = parsed.data;

  if (category === "needs_analyst") {
    return NextResponse.json({ error: "needs_analyst", detail: "category requires a human analyst" }, { status: 400 });
  }

  const agentLabel = `question_${category}`;
  await supabase.from("pipeline_events").insert({
    thesis_id,
    stage: "question",
    agent: agentLabel,
    event_type: "start",
    payload: { category, question },
  });

  if (category === "corpus" || category === "web" || category === "fundamentals_extra") {
    const message =
      category === "fundamentals_extra"
        ? "Out of scope for cycle 3."
        : `Phase ${category === "corpus" ? "2" : "3"} — ${category} resolver not built yet.`;
    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "question",
      agent: agentLabel,
      event_type: "complete",
      payload: { category, status: "not_implemented" },
    });
    return NextResponse.json({ status: "not_implemented", category, message }, { status: 200 });
  }

  // category === "derivable"
  const [{ data: scanRows }, { data: universeRows }] = await Promise.all([
    supabase
      .from("scan_runs")
      .select("results")
      .eq("thesis_id", thesis_id)
      .order("run_at", { ascending: false })
      .limit(1),
    supabase
      .from("universes")
      .select("universe")
      .eq("thesis_id", thesis_id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (!scanRows?.length || !universeRows?.length) {
    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "question",
      agent: agentLabel,
      event_type: "error",
      payload: { category, message: "no scan or universe available" },
    });
    return NextResponse.json(
      { error: "missing_data", detail: "no scan or universe available for this thesis" },
      { status: 409 },
    );
  }

  const scanParse = ScanResultsSchema.safeParse(scanRows[0].results);
  const universeParse = UniverseSchema.safeParse(universeRows[0].universe);
  if (!scanParse.success || !universeParse.success) {
    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "question",
      agent: agentLabel,
      event_type: "error",
      payload: { category, message: "stored scan/universe failed schema validation" },
    });
    return NextResponse.json(
      { error: "invalid_state", detail: "stored scan/universe failed validation" },
      { status: 500 },
    );
  }

  const result = resolveDerivable(hint, scanParse.data, universeParse.data);
  if (!result.ok) {
    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "question",
      agent: agentLabel,
      event_type: "complete",
      payload: { category, status: "unresolvable", reason: result.reason },
    });
    return NextResponse.json(
      { status: "unresolvable", category, message: result.reason },
      { status: 200 },
    );
  }

  await supabase.from("pipeline_events").insert({
    thesis_id,
    stage: "question",
    agent: agentLabel,
    event_type: "complete",
    payload: { category, status: "resolved", ticker_count: result.answer.sources.tickers.length },
  });

  return NextResponse.json(
    { status: "resolved", category, answer: result.answer },
    { status: 200 },
  );
}
```

> NOTE: Adjust the universe query (`.eq("thesis_id", ...)` and `.order("created_at", ...)`) to match the actual columns on the `universes` table. From the migration snippet, the universe table has `(id, created_by, created_at, universe)` — there is no `thesis_id`. If that's still the case, use the appropriate column (likely an `id` referencing the thesis, or replicate how `/api/memo/generate` fetches the universe).

- [ ] **Step 4: Verify universe fetch against the real schema**

Open `app/api/memo/generate/route.ts` and `supabase/migrations/0001_init.sql`. Copy the exact universe-fetch pattern the memo route uses. If it uses a different column or join, mirror that in the new route AND adjust the test mock chain (`from("universes").select().eq().order().limit()`) accordingly.

- [ ] **Step 5: Run, verify pass**

Run: `npm test -- tests/api/question-resolve.test.ts`
Expected: PASS. If the universe fetch differs from what's mocked, update both code and test until they align.

- [ ] **Step 6: Full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/question/resolve/route.ts tests/api/question-resolve.test.ts
git commit -m "feat(s12): cycle 3 phase 1 — POST /api/question/resolve with derivable path + not_implemented stubs"
```

---

## Task 6: UI — category chips + Resolve buttons + answer bubbles

Replace the bare `<ul>` of open questions in `thesis-detail.client.tsx` with a new client component that:
1. On mount, posts `open_questions` to `/api/question/classify` and stores the returned `ClassifiedQuestion[]`.
2. Renders each question with a `CategoryChip` (Pear tokens — cyan for derivable, beige for corpus, peach for web, gray for needs_analyst/fundamentals_extra).
3. Shows a "Resolve" button that POSTs to `/api/question/resolve` and appends an answer bubble below the question (or a "not implemented" placeholder, or "needs analyst" tag).
4. Includes a "Show sources (N)" toggle on resolved answers that expands to show the ticker list + scan column.

**Files:**
- Create: `components/category-chip.tsx`
- Create: `components/open-questions-resolver.tsx`
- Create: `tests/components/category-chip.test.tsx`
- Create: `tests/components/open-questions-resolver.test.tsx`
- Modify: `app/thesis/[id]/thesis-detail.client.tsx`

- [ ] **Step 1: Write a tiny test + implementation for the CategoryChip**

Create `tests/components/category-chip.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryChip } from "@/components/category-chip";

describe("CategoryChip", () => {
  it("renders 'from scan data' for derivable", () => {
    render(<CategoryChip category="derivable" />);
    expect(screen.getByText(/from scan/i)).toBeInTheDocument();
  });
  it("renders 'from corpus' for corpus", () => {
    render(<CategoryChip category="corpus" />);
    expect(screen.getByText(/corpus/i)).toBeInTheDocument();
  });
  it("renders 'needs analyst' for needs_analyst", () => {
    render(<CategoryChip category="needs_analyst" />);
    expect(screen.getByText(/needs analyst/i)).toBeInTheDocument();
  });
  it("renders an unknown placeholder when category is undefined", () => {
    render(<CategoryChip category={undefined} />);
    expect(screen.getByText(/classifying/i)).toBeInTheDocument();
  });
});
```

Create `components/category-chip.tsx`:

```typescript
import type { QuestionCategory } from "@/lib/schemas/question";

const LABELS: Record<QuestionCategory, string> = {
  derivable: "from scan data",
  corpus: "from corpus",
  web: "needs web",
  fundamentals_extra: "needs fundamentals",
  needs_analyst: "needs analyst",
};

const TONES: Record<QuestionCategory, string> = {
  derivable: "bg-pear-cyan-light text-pear-black",
  corpus: "bg-pear-beige text-pear-black",
  web: "bg-pear-peach text-pear-black",
  fundamentals_extra: "bg-neutral-200 text-neutral-700",
  needs_analyst: "bg-neutral-200 text-neutral-700",
};

export function CategoryChip({ category }: { category: QuestionCategory | undefined }) {
  if (!category) {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
        classifying…
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${TONES[category]}`}
    >
      {LABELS[category]}
    </span>
  );
}
```

- [ ] **Step 2: Verify the chip test passes**

Run: `npm test -- tests/components/category-chip.test.tsx`
Expected: PASS.

- [ ] **Step 3: Write the failing OpenQuestionsResolver test**

Create `tests/components/open-questions-resolver.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpenQuestionsResolver } from "@/components/open-questions-resolver";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function classifyResponse(items: unknown[]) {
  return new Response(JSON.stringify({ classifications: items }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
function resolveResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenQuestionsResolver", () => {
  it("renders each question and classifies on mount", async () => {
    fetchMock.mockResolvedValueOnce(
      classifyResponse([
        {
          question: "q1",
          category: "derivable",
          hint: { op: "rank_by_metric", metric: "ebitda_margin", direction: "desc", limit: 3 },
          confidence: 0.9,
        },
        { question: "q2", category: "corpus", hint: "x", confidence: 0.7 },
      ]),
    );

    render(<OpenQuestionsResolver thesisId="t1" questions={["q1", "q2"]} />);

    expect(screen.getByText("q1")).toBeInTheDocument();
    expect(screen.getByText("q2")).toBeInTheDocument();

    // Initially "classifying…" chips
    expect(screen.getAllByText(/classifying/i)).toHaveLength(2);

    await waitFor(() => {
      expect(screen.getByText(/from scan/i)).toBeInTheDocument();
      expect(screen.getByText(/corpus/i)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/question/classify",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("clicking Resolve calls /api/question/resolve and renders the answer bubble", async () => {
    fetchMock
      .mockResolvedValueOnce(
        classifyResponse([
          {
            question: "q1",
            category: "derivable",
            hint: { op: "rank_by_metric", metric: "ebitda_margin", direction: "desc", limit: 3 },
            confidence: 0.9,
          },
        ]),
      )
      .mockResolvedValueOnce(
        resolveResponse({
          status: "resolved",
          category: "derivable",
          answer: {
            text: "Top 1 by ebitda_margin: Alpha (AAA) — 30.0%.",
            sources: { tickers: ["AAA"], scan_column: "ebitda_margin", op: "rank_by_metric" },
          },
        }),
      );

    render(<OpenQuestionsResolver thesisId="t1" questions={["q1"]} />);

    const resolveBtn = await screen.findByRole("button", { name: /resolve/i });
    await userEvent.click(resolveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Top 1 by ebitda_margin/)).toBeInTheDocument();
    });

    // Sources hidden by default
    expect(screen.queryByText(/AAA/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /show sources/i }));
    expect(screen.getByText(/AAA/)).toBeInTheDocument();
  });

  it("disables the Resolve button for needs_analyst", async () => {
    fetchMock.mockResolvedValueOnce(
      classifyResponse([
        { question: "q1", category: "needs_analyst", hint: null, confidence: 0.95 },
      ]),
    );
    render(<OpenQuestionsResolver thesisId="t1" questions={["q1"]} />);
    const btn = await screen.findByRole("button", { name: /resolve/i });
    expect(btn).toBeDisabled();
  });

  it("renders the not_implemented placeholder for corpus", async () => {
    fetchMock
      .mockResolvedValueOnce(
        classifyResponse([
          { question: "q1", category: "corpus", hint: "HBM", confidence: 0.7 },
        ]),
      )
      .mockResolvedValueOnce(
        resolveResponse({
          status: "not_implemented",
          category: "corpus",
          message: "Phase 2 — corpus resolver not built yet.",
        }),
      );
    render(<OpenQuestionsResolver thesisId="t1" questions={["q1"]} />);
    await userEvent.click(await screen.findByRole("button", { name: /resolve/i }));
    await waitFor(() => {
      expect(screen.getByText(/Phase 2/)).toBeInTheDocument();
    });
  });

  it("shows an error state when classify fails", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "classify_failed" }), { status: 502 }),
    );
    render(<OpenQuestionsResolver thesisId="t1" questions={["q1"]} />);
    await waitFor(() => {
      expect(screen.getByText(/couldn't classify/i)).toBeInTheDocument();
    });
  });
});
```

> NOTE: If `@testing-library/user-event` isn't already a dev dep, check the existing `tests/components/thesis-chat-artifact.test.tsx` — it almost certainly uses it. If it does, the dep is already installed.

- [ ] **Step 4: Run, verify all fail**

Run: `npm test -- tests/components/open-questions-resolver.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 5: Implement OpenQuestionsResolver**

Create `components/open-questions-resolver.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import type {
  ClassifiedQuestion,
  DerivableAnswer,
  QuestionCategory,
} from "@/lib/schemas/question";
import { CategoryChip } from "@/components/category-chip";

type ResolveState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "resolved";
      category: "derivable";
      answer: DerivableAnswer;
      showSources: boolean;
    }
  | { status: "not_implemented"; category: QuestionCategory; message: string }
  | { status: "unresolvable"; category: QuestionCategory; message: string }
  | { status: "error"; message: string };

export function OpenQuestionsResolver({
  thesisId,
  questions,
}: {
  thesisId: string;
  questions: string[];
}) {
  const [classifications, setClassifications] = useState<
    (ClassifiedQuestion | undefined)[]
  >(() => questions.map(() => undefined));
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [resolveStates, setResolveStates] = useState<ResolveState[]>(() =>
    questions.map(() => ({ status: "idle" })),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/question/classify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ thesis_id: thesisId, questions }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        const cs: ClassifiedQuestion[] = body.classifications ?? [];
        setClassifications(
          questions.map((_, i) => cs[i] ?? undefined),
        );
      } catch (err) {
        if (cancelled) return;
        setClassifyError(err instanceof Error ? err.message : "classify failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thesisId, questions]);

  async function resolve(i: number) {
    const c = classifications[i];
    if (!c || c.category === "needs_analyst") return;

    setResolveStates((prev) => {
      const next = [...prev];
      next[i] = { status: "loading" };
      return next;
    });

    try {
      const res = await fetch("/api/question/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          thesis_id: thesisId,
          question: c.question,
          category: c.category,
          hint: c.hint,
        }),
      });
      const body = await res.json();
      setResolveStates((prev) => {
        const next = [...prev];
        if (body.status === "resolved") {
          next[i] = {
            status: "resolved",
            category: "derivable",
            answer: body.answer,
            showSources: false,
          };
        } else if (body.status === "not_implemented") {
          next[i] = {
            status: "not_implemented",
            category: body.category,
            message: body.message,
          };
        } else if (body.status === "unresolvable") {
          next[i] = {
            status: "unresolvable",
            category: body.category,
            message: body.message,
          };
        } else {
          next[i] = {
            status: "error",
            message: body.detail ?? body.error ?? `status ${res.status}`,
          };
        }
        return next;
      });
    } catch (err) {
      setResolveStates((prev) => {
        const next = [...prev];
        next[i] = {
          status: "error",
          message: err instanceof Error ? err.message : "resolve failed",
        };
        return next;
      });
    }
  }

  function toggleSources(i: number) {
    setResolveStates((prev) => {
      const next = [...prev];
      const cur = next[i];
      if (cur.status === "resolved") {
        next[i] = { ...cur, showSources: !cur.showSources };
      }
      return next;
    });
  }

  if (classifyError) {
    return (
      <p className="text-sm text-red-600">
        Couldn't classify open questions: {classifyError}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {questions.map((q, i) => {
        const c = classifications[i];
        const state = resolveStates[i];
        const disabled = !c || c.category === "needs_analyst" || state.status === "loading";
        return (
          <li key={i} className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <span className="flex-1">{q}</span>
              <CategoryChip category={c?.category} />
              <button
                type="button"
                className="rounded-md border border-pear-black/15 px-2 py-0.5 text-xs disabled:opacity-40"
                onClick={() => resolve(i)}
                disabled={disabled}
              >
                {state.status === "loading" ? "…" : "Resolve"}
              </button>
            </div>
            {state.status === "resolved" && (
              <div className="ml-4 rounded-md bg-pear-cyan-light/40 p-2 text-sm">
                <p>{state.answer.text}</p>
                <button
                  type="button"
                  className="mt-1 text-xs underline"
                  onClick={() => toggleSources(i)}
                >
                  {state.showSources ? "Hide sources" : `Show sources (${state.answer.sources.tickers.length})`}
                </button>
                {state.showSources && (
                  <p className="mt-1 text-xs text-pear-black/70">
                    Tickers: {state.answer.sources.tickers.join(", ")} · column:{" "}
                    {state.answer.sources.scan_column}
                  </p>
                )}
              </div>
            )}
            {state.status === "not_implemented" && (
              <p className="ml-4 text-xs text-pear-black/60 italic">{state.message}</p>
            )}
            {state.status === "unresolvable" && (
              <p className="ml-4 text-xs text-pear-black/60 italic">{state.message}</p>
            )}
            {state.status === "error" && (
              <p className="ml-4 text-xs text-red-600">{state.message}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 6: Run component tests, verify pass**

Run: `npm test -- tests/components/open-questions-resolver.test.tsx tests/components/category-chip.test.tsx`
Expected: PASS. If `@testing-library/user-event` isn't installed, run `npm install -D @testing-library/user-event` and re-run.

- [ ] **Step 7: Wire OpenQuestionsResolver into thesis-detail.client.tsx**

Read `app/thesis/[id]/thesis-detail.client.tsx` and find the block that currently renders open questions (around the line that does `memo.open_questions.map((q, i) => <li key={i}>{q}</li>)`). Replace the inline `<ul>` with the new component.

Before (the existing block):

```typescript
{memo.open_questions.length > 0 ? (
  <ChatBubble from="app" label="Open questions">
    <ul className="list-disc pl-5">
      {memo.open_questions.map((q, i) => (
        <li key={i}>{q}</li>
      ))}
    </ul>
  </ChatBubble>
) : null}
```

After:

```typescript
{memo.open_questions.length > 0 ? (
  <ChatBubble from="app" label="Open questions">
    <OpenQuestionsResolver thesisId={thesis.id} questions={memo.open_questions} />
  </ChatBubble>
) : null}
```

Add the import at the top of the file:

```typescript
import { OpenQuestionsResolver } from "@/components/open-questions-resolver";
```

Confirm `thesis.id` is in scope at the location where the memo is rendered. If the variable is named differently (e.g. `thesisId` is already a prop), use that instead.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS. The thesis-detail tests (if any) should still pass — the change is additive at the render level.

- [ ] **Step 9: Smoke-test in the dev browser**

```bash
npm run dev
```

In the browser:
1. Open an existing thesis with a generated memo + open questions.
2. The "Open questions" bubble should show each question with a "classifying…" chip, then resolve to a category chip within ~2-4s.
3. Click "Resolve" on a `derivable` question — an answer bubble should appear below.
4. Click "Show sources (N)" — ticker list expands.
5. Click "Resolve" on a `corpus` or `web` question — the "Phase 2/3 not built yet" placeholder appears.
6. A `needs_analyst` question's Resolve button is disabled.

If anything breaks visually (Pear tokens not applied, chip overflow, button hit-target too small), tighten the component's Tailwind classes and re-test. Do not claim done without exercising at least one derivable, one corpus, one needs_analyst, and confirming the source toggle works.

- [ ] **Step 10: Commit**

```bash
git add components/category-chip.tsx components/open-questions-resolver.tsx tests/components/category-chip.test.tsx tests/components/open-questions-resolver.test.tsx app/thesis/[id]/thesis-detail.client.tsx
git commit -m "feat(s12): cycle 3 phase 1 — open-questions UI with category chips, resolve button, answer bubbles"
```

---

## Task 7: Promote the spec + close out

The local spec (`local/cycle-3-open-question-resolver.md`) covered all three phases. With Phase 1 shipped, promote a Phase-1-scoped slice of the spec into `docs/superpowers/specs/` so the implementation has a versioned design doc next to the plan, matching the convention every previous cycle followed.

**Files:**
- Create: `docs/superpowers/specs/2026-05-22-cycle-3-phase-1-question-resolver-design.md`
- Keep: `local/cycle-3-open-question-resolver.md` (it still owns Phases 2 + 3 — leave for the next plan).

- [ ] **Step 1: Promote the Phase 1 slice**

Create `docs/superpowers/specs/2026-05-22-cycle-3-phase-1-question-resolver-design.md`. Copy the relevant sections from `local/cycle-3-open-question-resolver.md` (Why, Routing problem, Architecture, Acceptance criteria — narrowed to Phase 1) and trim phase 2/3 details to a single "Future phases" pointer back to the local doc.

- [ ] **Step 2: Run final full suite + dev smoke**

Run: `npm test`
Expected: PASS, including the new tests in `tests/lib/schemas`, `tests/resolvers`, `tests/agents`, `tests/api`, `tests/components`.

Run: `npm run dev` and re-exercise the UI flow from Task 6 Step 9. Confirm no regressions in memo generation, scan rendering, or universe display.

- [ ] **Step 3: Commit + push branch + open PR**

```bash
git add docs/superpowers/specs/2026-05-22-cycle-3-phase-1-question-resolver-design.md docs/superpowers/plans/2026-05-22-cycle-3-phase-1-question-resolver.md
git commit -m "docs(s12): promote cycle 3 phase 1 spec + add implementation plan"
```

Then verify against `origin/master` before opening the PR:

```bash
git fetch origin
git log --oneline origin/master..HEAD
```

If everything looks right, the user will decide whether to push and open a PR (this plan stops here; PR creation requires user instruction per repo conventions).

---

## Self-review checklist (run before declaring the plan ready)

1. **Spec coverage (Phase 1 only):**
   - [x] `question_classifier` registered in `lib/data/agent-models.json` — Task 1 Step 5.
   - [x] `lib/resolvers/derivable.ts` zero-LLM answers with ticker + scan-column citations — Task 2.
   - [x] `/api/question/resolve` POST with `pipeline_events` writes — Task 5.
   - [x] Memo UI renders category chip + Resolve button per open question — Task 6.
   - [x] Resolved answers render with source chips + "Show sources (N)" toggle — Task 6.
   - [x] Empty corpus/web result surfaced honestly (not_implemented placeholder, not auto-fallback) — Task 5 + Task 6.
   - **Out of Phase 1 scope (deferred):** `lib/agents/question-corpus.ts` (Phase 2), `lib/agents/question-web.ts` + `lib/data/credible-sources.ts` (Phase 3), `fundamentals_extra` resolver (cycle-3 out-of-scope), manual category-override dropdown.

2. **Placeholder scan:** no "TBD", "implement appropriately", "similar to Task N", "handle edge cases" — every step contains the actual code or command.

3. **Type consistency:**
   - `QuestionCategory`, `DerivableHint`, `ClassifiedQuestion`, `DerivableAnswer`, `ResolveResponse` are defined once in Task 1 and referenced unchanged in Tasks 2–6.
   - `resolveDerivable(hint, scan, universe)` signature in Task 2 matches the call site in Task 5.
   - `classifyQuestions({ thesis, questions })` in Task 3 matches the call site in Task 4.
   - `OpenQuestionsResolver({ thesisId, questions })` in Task 6 matches the wire-in step in `thesis-detail.client.tsx`.

4. **Commit hygiene per project conventions:**
   - Every commit step uses explicit `git add <paths>` (never `git add -A`).
   - Every commit step uses inline `git commit -m "…"` (no heredocs, no temp files).
   - User reviews each commit message at the permission prompt.

5. **No file written outside the listed paths** — all new files are in `lib/`, `app/api/question/`, `components/`, `tests/`, or `docs/superpowers/`.
