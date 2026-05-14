import { z } from "zod";
import { isValidGicsCode } from "@/lib/data/gics";
import { REGION_BY_SUFFIX, type Region } from "@/lib/data/regions";

const REGION_VALUES = Array.from(
  new Set(Object.values(REGION_BY_SUFFIX) as Region[]),
) as [Region, ...Region[]];

const YAHOO_TICKER_REGEX = /^[A-Z0-9\-]+(\.[A-Z]+)?$/i;

export const ThesisIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*_\d{2}_\d{2}_\d{2}$/);

export const VerdictSchema = z.enum(["supports", "breaches", "inconclusive"]);

export const ValidationStatusSchema = z.enum([
  "draft",
  "validated",
  "stale",
  "broken",
]);

export const RegionSchema = z.enum(REGION_VALUES);

export const ScopeSchema = z
  .object({
    type: z.enum(["thematic", "single_name"]),
    sectors: z
      .array(z.string().refine(isValidGicsCode, { message: "Invalid GICS code" }))
      .min(1),
    regions: z.array(RegionSchema).min(1),
    market_cap_min_usd: z.number().nonnegative(),
    tickers_seed: z.array(z.string().regex(YAHOO_TICKER_REGEX)),
    tickers_exclude: z.array(z.string().regex(YAHOO_TICKER_REGEX)),
  })
  .strict();

export const CentralEstimateSchema = z
  .object({
    value: z.number(),
    unit: z.string().describe("Free-form unit string (e.g., 'years', 'pct', 'bps')"),
  })
  .strict();

export const EvidenceSchema = z
  .object({
    url: z.string().url(),
    source_tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    quote: z.string().min(1),
    date: z.string(),
    fetched_at: z.string().datetime().optional(),
    verified: z.boolean().optional(),
  })
  .strict();

export const IndustryDriverSchema = z
  .object({
    id: z.string().min(1),
    claim: z.string().min(1),
    central_estimate: CentralEstimateSchema,
    thesis_breaks_below: z.number(),
    evidence: z.array(EvidenceSchema).default([]),
    verdict: VerdictSchema.nullable().default(null),
    classification: z.literal("industry"),
  })
  .strict();

export const FalsificationSchema = z
  .object({
    primary: z.string().min(1),
    secondary: z.string().min(1).optional(),
  })
  .strict();

export const ThesisValidationSchema = z
  .object({
    status: ValidationStatusSchema.default("draft"),
    verdict: VerdictSchema.nullable().default(null),
    last_validated_at: z.string().datetime().nullable().default(null),
    open_tensions: z.array(z.string()).default([]),
  })
  .strict();

export const DriversSchema = z
  .object({
    industry: z.array(IndustryDriverSchema).min(1).max(2),
  })
  .strict();

export const ThesisSchema = z
  .object({
    id: ThesisIdSchema,
    version: z.number().int().positive(),
    createdAt: z.string(),
    createdBy: z.string().min(1),
    source_snippet: z.string(),
    claim: z.string().min(1),
    macro_premise: z.string().min(1),
    horizon_years: z.number().positive(),
    scope: ScopeSchema,
    drivers: DriversSchema,
    falsification: FalsificationSchema,
    universe_id: z.string().min(1),
    validation: ThesisValidationSchema.default({
      status: "draft",
      verdict: null,
      last_validated_at: null,
      open_tensions: [],
    }),
  })
  .strict();

export type Verdict = z.infer<typeof VerdictSchema>;
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;
export type Scope = z.infer<typeof ScopeSchema>;
export type CentralEstimate = z.infer<typeof CentralEstimateSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type IndustryDriver = z.infer<typeof IndustryDriverSchema>;
export type Falsification = z.infer<typeof FalsificationSchema>;
export type ThesisValidation = z.infer<typeof ThesisValidationSchema>;
export type Drivers = z.infer<typeof DriversSchema>;
export type Thesis = z.infer<typeof ThesisSchema>;
