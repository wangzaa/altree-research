import { z } from "zod";
import { isValidGicsCode } from "@/lib/data/gics";
import { REGION_VALUES } from "@/lib/data/regions";

const YAHOO_TICKER_REGEX = /^[A-Z0-9\-]+(\.[A-Z]+)?$/i;

export const ExposureTierSchema = z.enum([
  "pure_play",
  "diversified",
  "etf_proxy",
]);

export const TranscriptSourceSchema = z.enum([
  "yahoo_finance2",
  "ir_page",
  "unavailable",
]);

export const RegionSchema = z.enum(REGION_VALUES);

export const UniverseTickerSchema = z
  .object({
    ticker: z.string().regex(YAHOO_TICKER_REGEX),
    name: z.string().min(1),
    region: RegionSchema,
    market_cap_usd_b: z.number().nonnegative(),
    exposure_tier: ExposureTierSchema,
    transcript_source: TranscriptSourceSchema.optional(),
    transcript_url: z.string().url().optional(),
    notes: z.string().default(""),
  })
  .strict();

export const UniverseSchema = z
  .object({
    id: z.string().min(1),
    created_at: z.string(),
    last_refreshed: z.string(),
    gics_codes: z
      .array(z.string().refine(isValidGicsCode, { message: "Invalid GICS code" }))
      .min(1),
    regions: z.array(RegionSchema).min(1),
    market_cap_min_usd: z.number().nonnegative(),
    tickers: z.array(UniverseTickerSchema).min(1).max(30),
  })
  .strict();

export type ExposureTier = z.infer<typeof ExposureTierSchema>;
export type UniverseTicker = z.infer<typeof UniverseTickerSchema>;
export type Universe = z.infer<typeof UniverseSchema>;
