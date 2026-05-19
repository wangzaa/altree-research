import { z } from "zod";
import { ThesisIdSchema } from "@/lib/schemas/thesis";

export const HistoryPointSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    close: z.number().nonnegative(),
  })
  .strict();

export const TickerHistorySchema = z
  .object({
    ticker: z.string().min(1),
    points: z.array(HistoryPointSchema).min(1),
  })
  .strict();

export const TickerRatiosSchema = z
  .object({
    gross_margin: z.number().nullable(),
    ebit_margin: z.number().nullable(),
    trailing_pe: z.number().nullable(),
  })
  .strict();

export const FundamentalsSnapshotSchema = z
  .object({
    as_of: z.string(),
    mean: TickerRatiosSchema,
    median: TickerRatiosSchema,
    per_ticker_used: z.number().int().nonnegative(),
  })
  .strict();

export const ScanResultsSchema = z
  .object({
    thesis_id: ThesisIdSchema,
    universe_id: z.string().min(1),
    ran_at: z.string(),
    history_5y: z.array(TickerHistorySchema).min(1),
    fundamentals_snapshot: FundamentalsSnapshotSchema,
    descriptive_markdown: z.string().min(1),
  })
  .strict();

export type HistoryPoint = z.infer<typeof HistoryPointSchema>;
export type TickerHistory = z.infer<typeof TickerHistorySchema>;
export type FundamentalsSnapshot = z.infer<typeof FundamentalsSnapshotSchema>;
export type ScanResults = z.infer<typeof ScanResultsSchema>;
