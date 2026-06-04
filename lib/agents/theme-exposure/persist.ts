import type { OpportunitySet } from "@/lib/schemas/theme-exposure";

/** A jp_theme_exposure row (one exposed company in a topic's opportunity set). */
export type ExposureRow = {
  theme_id: string;
  ticker: string;
  yahoo_ticker: string;
  name_en: string;
  rationale: string;
  as_of: string;
  derived_at: string;
};

/** Flatten an opportunity set into per-company DB rows, stamping each with the
 *  theme id and the set's derived_at. Pure. */
export function toExposureRows(set: OpportunitySet): ExposureRow[] {
  return set.companies.map((c) => ({
    theme_id: set.theme_id,
    ticker: c.ticker,
    yahoo_ticker: c.yahoo_ticker,
    name_en: c.name_en,
    rationale: c.rationale,
    as_of: c.as_of,
    derived_at: set.derived_at,
  }));
}

/** Reassemble persisted rows into an opportunity set for one theme. derived_at
 *  comes from the rows (they share one sync's stamp); empty when none. Pure. */
export function fromExposureRows(
  themeId: string,
  rows: ExposureRow[],
): OpportunitySet {
  return {
    theme_id: themeId,
    derived_at: rows[0]?.derived_at ?? "",
    companies: rows.map((r) => ({
      ticker: r.ticker,
      yahoo_ticker: r.yahoo_ticker,
      name_en: r.name_en,
      rationale: r.rationale,
      as_of: r.as_of,
    })),
  };
}

/** Replace a theme's persisted opportunity set (re-derivable on sync):
 *  delete the theme's existing rows, then insert the freshly-derived set. */
export async function persistOpportunitySet(set: OpportunitySet): Promise<void> {
  const { getSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = getSupabaseServerClient();

  const del = await supabase
    .from("jp_theme_exposure")
    .delete()
    .eq("theme_id", set.theme_id);
  if (del.error) {
    throw new Error(`jp_theme_exposure delete failed: ${del.error.message}`);
  }

  const rows = toExposureRows(set);
  if (rows.length === 0) return;

  const ins = await supabase.from("jp_theme_exposure").insert(rows);
  if (ins.error) {
    throw new Error(`jp_theme_exposure insert failed: ${ins.error.message}`);
  }
}

/** Read a theme's persisted opportunity set. The verifiable read path: given a
 *  topic id, returns the exposed companies with dated rationales. */
export async function getOpportunitySet(
  themeId: string,
): Promise<OpportunitySet> {
  const { getSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("jp_theme_exposure")
    .select("theme_id, ticker, yahoo_ticker, name_en, rationale, as_of, derived_at")
    .eq("theme_id", themeId)
    .order("as_of", { ascending: false });
  if (error) {
    throw new Error(`jp_theme_exposure fetch failed: ${error.message}`);
  }
  return fromExposureRows(themeId, (data ?? []) as ExposureRow[]);
}
