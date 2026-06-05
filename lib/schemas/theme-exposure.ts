import { z } from "zod";

/**
 * Theme-exposure funnel output (issue #28 / ADR-0003). A hot topic resolves to
 * an *opportunity set* — the movers' subset of the covered 388, each with a
 * dated "why". Exposure is activity-based, not static classification: a company
 * with no recent topic-relevant report activity simply doesn't surface.
 *
 * Two stages produce it:
 *   - Stage 1 (recall): wide keyword match over each company's recent report
 *     text (NEWS_UPDATE window + latest POST_INTERVIEW) → a candidate set.
 *   - Stage 2 (precision): the theme_tagger LLM confirms a genuine recent
 *     announcement/pivot and emits a dated rationale, dropping false positives.
 */

/** A recent report feeding stage-1 recall and the stage-2 LLM read. */
export const RecentReportSchema = z
  .object({
    // Stable id (sr.db reports.project_id for NEWS_UPDATE; synthetic for the
    // post-interview, e.g. "post:<ticker>").
    id: z.string().min(1),
    type: z.enum(["NEWS_UPDATE", "POST_INTERVIEW"]),
    published_at: z.string(),
    title: z.string(),
    // Stripped/truncated report text the keyword net runs over.
    text: z.string(),
  })
  .strict();

/** One exposed company: a mover in a topic's opportunity set, with a dated why. */
export const ExposedCompanySchema = z
  .object({
    ticker: z.string().min(1),
    yahoo_ticker: z.string().min(1),
    name_en: z.string().min(1),
    // Dated one-line rationale from the theme_tagger.
    rationale: z.string().min(1),
    // ISO date of the announcement/pivot the rationale rests on.
    as_of: z.string().min(1),
  })
  .strict();

/** A topic's opportunity set — persisted per theme, re-derivable on sync. */
export const OpportunitySetSchema = z
  .object({
    theme_id: z.string(),
    derived_at: z.string(),
    companies: z.array(ExposedCompanySchema),
  })
  .strict();

/** Stage-2 LLM tool input: the tagger's per-candidate verdict. */
export const ThemeTagSchema = z
  .object({
    // Whether the matched reports show a GENUINE recent announcement/pivot
    // relevant to the topic (not an incidental keyword mention).
    exposed: z.boolean(),
    // Dated one-line rationale. Required when exposed; ignored otherwise.
    rationale: z.string().optional(),
    // ISO date of the announcement/pivot. Required when exposed.
    as_of: z.string().optional(),
  })
  .strict();

export type RecentReport = z.infer<typeof RecentReportSchema>;
export type ExposedCompany = z.infer<typeof ExposedCompanySchema>;
export type OpportunitySet = z.infer<typeof OpportunitySetSchema>;
export type ThemeTag = z.infer<typeof ThemeTagSchema>;
