import { createClient } from "@supabase/supabase-js";
import { getTheme } from "@/lib/data/themes";
import { applyClientFilters, type ExpertPostRow } from "./retrieve";

/**
 * Topic momentum (issue #29): substantiate a hot topic with global momentum
 * from the expert corpus. Reuses the expert_posts corpus + the pure keyword
 * filter from ./retrieve. Unlike thesis-scoped retrieval, this is NOT gated on
 * sector — a topic is matched purely by its (wide) keyword set, recency-ordered
 * and de-duplicated. The expert corpus substantiates the chosen topics
 * (ADR-0003); it does not detect them.
 */

export type MomentumItem = {
  expert: string;
  author: string;
  published_at: string;
  title: string;
  excerpt: string;
  url: string;
};

const EXCERPT_CHARS = 240;
const DEFAULT_LIMIT = 12;
const CANDIDATE_POOL = 200;

function excerpt(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_CHARS
    ? `${flat.slice(0, EXCERPT_CHARS).trimEnd()}…`
    : flat;
}

function toItem(p: ExpertPostRow): MomentumItem {
  return {
    expert: p.expert_name,
    author: p.author,
    published_at: p.published,
    title: p.title,
    excerpt: excerpt(p.content),
    url: p.link,
  };
}

/**
 * Pure core: keyword-filter (via applyClientFilters), recency-sort, de-dupe by
 * URL, map, and slice to limit. No Supabase — unit-testable in isolation.
 */
export function buildMomentum(
  rows: ExpertPostRow[],
  keywords: string[],
  limit: number = DEFAULT_LIMIT,
): MomentumItem[] {
  // applyClientFilters does the keyword match + recency sort; pass a large
  // limit so dedupe (below) decides the final cut.
  const filtered = applyClientFilters(rows, { keywords, limit: rows.length });
  const seen = new Set<string>();
  const out: MomentumItem[] = [];
  for (const p of filtered) {
    if (seen.has(p.link)) continue;
    seen.add(p.link);
    out.push(toItem(p));
    if (out.length >= limit) break;
  }
  return out;
}

// Mirrors getClient in ./retrieve (kept local so this slice is self-contained).
function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type TopicMomentumOpts = { limit?: number; since?: string };

/** Fetch the global-momentum posts substantiating a hot topic. */
export async function getTopicMomentum(
  themeId: string,
  opts: TopicMomentumOpts = {},
): Promise<MomentumItem[]> {
  const theme = getTheme(themeId);
  if (!theme) throw new Error(`Unknown theme: ${themeId}`);

  const supabase = getClient();
  let q = supabase
    .from("expert_posts")
    .select("*")
    .order("published", { ascending: false })
    .limit(CANDIDATE_POOL);
  if (opts.since) q = q.gte("published", opts.since);

  const { data, error } = await q;
  if (error) throw new Error(`topic momentum retrieve failed: ${error.message}`);

  return buildMomentum(
    (data ?? []) as ExpertPostRow[],
    theme.keywords,
    opts.limit ?? DEFAULT_LIMIT,
  );
}
