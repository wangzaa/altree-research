import { z } from "zod";

/**
 * The covered set: Japanese companies we hold Shared-Research data for.
 * Generated from sr.db into lib/data/jp-companies.json by
 * scripts/jp-covered-set.ts. Financials are stored in native JPYmn — USD
 * conversion is a render-time concern (live FX), never baked into the file.
 * See ADR-0001 / ADR-0002 and CONTEXT.md ("Covered set").
 */

export const JpFinancialsSchema = z
  .object({
    // All monetary values in JPY millions, as sourced from sr.db (unit=JPYmn).
    revenue_jpy_mn: z.number().nullable(),
    gross_profit_jpy_mn: z.number().nullable(),
    operating_profit_jpy_mn: z.number().nullable(),
    // Ratios as decimals (0.126 == 12.6%).
    operating_margin: z.number().nullable(),
    revenue_yoy: z.number().nullable(),
  })
  .strict();

export const JpPostInterviewSchema = z
  .object({
    published_at: z.string(),
    excerpt: z.string(),
  })
  .strict();

export const JpCompanySchema = z
  .object({
    // Bare TSE code as stored in sr.db, e.g. "2802" or "186A".
    ticker: z.string().min(1),
    // Yahoo Finance symbol: bare code + ".T".
    yahoo_ticker: z.string().min(1),
    // Confirmed resolvable on Yahoo via a live --verify pass. Without that
    // pass the generator leaves this false (unverified, not "broken").
    yahoo_verified: z.boolean(),
    name_en: z.string().min(1),
    sector: z.string().nullable(),
    listed_at: z.string().nullable(),
    financials: JpFinancialsSchema,
    // summary_en, falling back to the latest POST_INTERVIEW excerpt.
    description: z.string().nullable(),
    latest_post_interview: JpPostInterviewSchema.nullable(),
  })
  .strict();

export const JpCoveredSetSchema = z
  .object({
    generated_at: z.string(),
    // Provenance: sr.db meta.last_successful_ingest_at at generation time.
    source_ingested_at: z.string().nullable(),
    companies: z.array(JpCompanySchema).min(1),
  })
  .strict();

export type JpFinancials = z.infer<typeof JpFinancialsSchema>;
export type JpCompany = z.infer<typeof JpCompanySchema>;
export type JpCoveredSet = z.infer<typeof JpCoveredSetSchema>;
