import { z } from "zod";

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

export const GroupFilterSchema = z
  .object({
    region: z.string().min(1).optional(),
    exposure_tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
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
    scan_column: z.string().min(1),
    op: z.enum(["rank_by_metric", "aggregate_by_group", "filter_count"]),
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
