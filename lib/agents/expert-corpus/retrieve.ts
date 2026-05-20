import { createClient } from "@supabase/supabase-js";

export type ExpertPostRow = {
  id: string;
  expert_slug: string;
  expert_name: string;
  author: string;
  title: string;
  link: string;
  published: string;
  content: string;
  is_paywalled: boolean;
  tickers: string[];
  sectors: string[];
};

export type RetrieveOpts = {
  thesis_sectors: string[];
  tickers?: string[];
  keywords?: string[];
  since?: string;
  limit: number;
};

/** Pure: in-app keyword filter + sort + slice. Sector / ticker / date
 *  filters happen in the SQL query; this only handles what can't be
 *  expressed cleanly in the Postgres client builder. */
export function applyClientFilters(
  rows: ExpertPostRow[],
  opts: Pick<RetrieveOpts, "keywords" | "limit">,
): ExpertPostRow[] {
  let out = rows;
  if (opts.keywords && opts.keywords.length) {
    const low = opts.keywords.map((k) => k.toLowerCase());
    out = out.filter((p) => {
      const blob = (p.title + " " + p.content).toLowerCase();
      return low.some((k) => blob.includes(k));
    });
  }
  out = [...out].sort((a, b) => b.published.localeCompare(a.published));
  return out.slice(0, opts.limit);
}

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

export async function retrieve(opts: RetrieveOpts): Promise<ExpertPostRow[]> {
  const supabase = getClient();
  let q = supabase.from("expert_posts").select("*");
  q = q.overlaps("sectors", opts.thesis_sectors);
  if (opts.tickers && opts.tickers.length) {
    q = q.overlaps("tickers", opts.tickers);
  }
  if (opts.since) {
    q = q.gte("published", opts.since);
  }
  // Pull a generous candidate set; final filter+sort+slice in app.
  const { data, error } = await q
    .order("published", { ascending: false })
    .limit(Math.max(opts.limit * 4, 50));
  if (error) throw new Error(`retrieve failed: ${error.message}`);

  return applyClientFilters((data ?? []) as ExpertPostRow[], opts);
}
