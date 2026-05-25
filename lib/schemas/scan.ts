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

export const QuarterlyEpsSchema = z
  .object({
    period_end_iso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    eps: z.number(),
  })
  .strict();

// Per-ticker financial snapshot used by the scan-panel per-ticker table.
// Separate from the aggregate fundamentals_snapshot which is mean/median
// across the universe for the agent prompt.
export const TickerSnapshotSchema = z
  .object({
    ticker: z.string().min(1),
    name: z.string().min(1),
    ebitda: z.number().nullable(),
    ebitda_margin: z.number().nullable(),
    revenue_growth_yoy: z.number().nullable(),
    currency: z.string().nullable(),
    quarterly_eps: z.array(QuarterlyEpsSchema),
    // Yahoo's aggregate trailing P/E. Optional so older scan_runs rows
    // that predate this field still parse. UI falls back to it when the
    // compute-from-quarterly_eps path returns null.
    trailing_pe: z.number().positive().nullable().optional(),
  })
  .strict();

export const ScanResultsSchema = z
  .object({
    thesis_id: ThesisIdSchema,
    universe_id: z.string().min(1),
    ran_at: z.string(),
    history_5y: z.array(TickerHistorySchema).min(1),
    fundamentals_snapshot: FundamentalsSnapshotSchema,
    tickers_snapshot: z.array(TickerSnapshotSchema),
    descriptive_markdown: z.string().min(1),
  })
  .strict();

export type HistoryPoint = z.infer<typeof HistoryPointSchema>;
export type TickerHistory = z.infer<typeof TickerHistorySchema>;
export type FundamentalsSnapshot = z.infer<typeof FundamentalsSnapshotSchema>;
export type QuarterlyEps = z.infer<typeof QuarterlyEpsSchema>;
export type TickerSnapshot = z.infer<typeof TickerSnapshotSchema>;
export type ScanResults = z.infer<typeof ScanResultsSchema>;
