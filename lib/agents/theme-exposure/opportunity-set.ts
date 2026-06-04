import { getTheme as realGetTheme } from "@/lib/data/themes";
import { getCoveredCompanies } from "@/lib/data/jp-companies";
import type { JpCompany } from "@/lib/schemas/jp-company";
import type { Theme } from "@/lib/schemas/themes";
import type {
  OpportunitySet,
  RecentReport,
} from "@/lib/schemas/theme-exposure";
import { recallCandidates } from "./recall";
import { tagCandidate, type TagResult } from "./theme-tagger";

/** A jp_catalysts row (recent NEWS_UPDATE), as synced by scripts/jp-covered-set.ts. */
export type CatalystRow = {
  id: string;
  ticker: string;
  yahoo_ticker: string;
  published_at: string;
  title: string;
  excerpt: string;
  type: string;
};

export type OpportunitySetDeps = {
  getTheme: (id: string) => Theme | undefined;
  getCompanies: () => JpCompany[];
  fetchCatalysts: (tickers: string[]) => Promise<CatalystRow[]>;
  tag: (theme: Theme, candidate: import("./recall").Candidate) => Promise<TagResult>;
  now: () => string;
};

/** ~6-month recency window for the recent-activity gate (matches the
 *  jp_catalysts sync window in scripts/jp-covered-set.ts). */
const RECENT_MONTHS = 6;

/** Merge the two report corpora into a per-ticker text bundle for stage-1
 *  recall: recent NEWS_UPDATE catalysts (newest first) plus each company's
 *  latest POST_INTERVIEW. A ticker with neither is simply absent — which is how
 *  the empty-activity exclusion falls out of the funnel. Pure. */
export function buildReportsByTicker(
  catalysts: CatalystRow[],
  companies: JpCompany[],
): Map<string, RecentReport[]> {
  const map = new Map<string, RecentReport[]>();

  const sorted = [...catalysts].sort((a, b) =>
    b.published_at.localeCompare(a.published_at),
  );
  for (const c of sorted) {
    const report: RecentReport = {
      id: c.id,
      type: "NEWS_UPDATE",
      published_at: c.published_at,
      title: c.title,
      text: c.excerpt,
    };
    const list = map.get(c.ticker);
    if (list) list.push(report);
    else map.set(c.ticker, [report]);
  }

  for (const co of companies) {
    const post = co.latest_post_interview;
    if (!post) continue;
    const report: RecentReport = {
      id: `post:${co.ticker}`,
      type: "POST_INTERVIEW",
      published_at: post.published_at,
      title: "Post-interview update",
      text: post.excerpt,
    };
    const list = map.get(co.ticker);
    if (list) list.push(report);
    else map.set(co.ticker, [report]);
  }

  return map;
}

function isoMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

/** Default catalyst source: recent NEWS_UPDATE rows from Supabase jp_catalysts. */
async function fetchRecentCatalysts(): Promise<CatalystRow[]> {
  const { getSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("jp_catalysts")
    .select("id, ticker, yahoo_ticker, published_at, title, excerpt, type")
    .gte("published_at", isoMonthsAgo(RECENT_MONTHS))
    .order("published_at", { ascending: false });
  if (error) throw new Error(`jp_catalysts fetch failed: ${error.message}`);
  return (data ?? []) as CatalystRow[];
}

const defaultDeps: OpportunitySetDeps = {
  getTheme: realGetTheme,
  getCompanies: getCoveredCompanies,
  fetchCatalysts: fetchRecentCatalysts,
  tag: tagCandidate,
  now: () => new Date().toISOString(),
};

/**
 * The theme-exposure funnel (ADR-0003 / issue #28): turn a hot topic into an
 * opportunity set of exposed Japanese companies, each with a dated "why".
 *
 *   stage 1 — wide keyword recall over recent report text → candidate set
 *   stage 2 — theme_tagger LLM confirms genuine recent activity, drops the rest
 *
 * Verifiable entry point: given a topic id, returns the exposed companies with
 * dated rationales. Deps are injectable for unit testing; production wiring
 * reads the covered set + jp_catalysts and calls the LLM tagger.
 */
export async function deriveOpportunitySet(
  themeId: string,
  deps: Partial<OpportunitySetDeps> = {},
): Promise<OpportunitySet> {
  const d = { ...defaultDeps, ...deps };

  const theme = d.getTheme(themeId);
  if (!theme) throw new Error(`Unknown theme: ${themeId}`);

  const companies = d.getCompanies();
  const catalysts = await d.fetchCatalysts(companies.map((c) => c.ticker));
  const reportsByTicker = buildReportsByTicker(catalysts, companies);

  const candidates = recallCandidates(companies, reportsByTicker, theme.keywords);

  const exposed: OpportunitySet["companies"] = [];
  for (const candidate of candidates) {
    const result = await d.tag(theme, candidate);
    if (result.ok && result.exposed) exposed.push(result.company);
  }

  return { theme_id: themeId, derived_at: d.now(), companies: exposed };
}

/** Refresh every topic's opportunity set: derive the funnel and replace the
 *  persisted rows, theme by theme. Driven by the covered-set sync
 *  (scripts/jp-covered-set.ts --sync-themes), after jp_catalysts is current. */
export async function syncOpportunitySets(
  deps: Partial<OpportunitySetDeps> = {},
): Promise<Array<{ theme_id: string; count: number }>> {
  const { getThemes } = await import("@/lib/data/themes");
  const { persistOpportunitySet } = await import("./persist");

  const summary: Array<{ theme_id: string; count: number }> = [];
  for (const theme of getThemes()) {
    const set = await deriveOpportunitySet(theme.id, deps);
    await persistOpportunitySet(set);
    summary.push({ theme_id: theme.id, count: set.companies.length });
  }
  return summary;
}
