import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { htmlToText, extractTickers } from "@/lib/ingest/html";
import { detectPaywall } from "@/lib/ingest/paywall-markers";
import { loadRegistry } from "@/lib/data/experts";
import type { Expert } from "@/lib/schemas/experts";

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

export function hashPostId(slug: string, guid: string): string {
  return createHash("sha256")
    .update(`${slug}::${guid}`)
    .digest("hex")
    .slice(0, 16);
}

function parseDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

type ParsedItem = {
  guid?: string;
  link?: string;
  title?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  contentEncoded?: string;
};

type ParsedFeed = { items: ParsedItem[] };

/** Pure function — no I/O. Given a parsed feed and the set of post-ids
 *  already in the DB, returns the new rows to upsert. */
export function ingestFeed(
  expert: Expert,
  feed: ParsedFeed,
  existingIds: Set<string>,
): ExpertPostRow[] {
  const out: ExpertPostRow[] = [];
  for (const item of feed.items) {
    const guid = item.guid || item.link || item.title;
    if (!guid) continue;
    const id = hashPostId(expert.slug, guid);
    if (existingIds.has(id)) continue;

    const html =
      item.contentEncoded || item.content || item.contentSnippet || "";
    const text = htmlToText(html);
    out.push({
      id,
      expert_slug: expert.slug,
      expert_name: expert.name,
      author: expert.author,
      title: item.title ?? "",
      link: item.link ?? "",
      published: parseDate(item.pubDate || item.isoDate),
      content: text,
      is_paywalled: detectPaywall(text),
      tickers: extractTickers(text),
      sectors: [...expert.sectors],
    });
  }
  return out;
}

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type IngestSummary = {
  per_expert: Array<{
    slug: string;
    new_posts: number;
    total_seen: number;
    error?: string;
  }>;
  total_new: number;
};

/** Orchestrator: loads registry, fetches each active expert's feed,
 *  upserts new posts via Supabase service role. */
export async function refreshCorpus(): Promise<IngestSummary> {
  const registry = loadRegistry();
  const parser = new Parser({
    customFields: { item: [["content:encoded", "contentEncoded"]] },
  });
  const supabase = getServiceClient();

  // Load all existing post ids once. expert_posts is small (≤10k for
  // years to come) so a full scan is fine.
  const existing = new Set<string>();
  {
    const { data, error } = await supabase.from("expert_posts").select("id");
    if (error) throw new Error(`Failed to read expert_posts: ${error.message}`);
    for (const row of data ?? []) existing.add(row.id as string);
  }

  const summary: IngestSummary = { per_expert: [], total_new: 0 };
  for (const expert of registry.experts.filter((e) => e.active !== false)) {
    try {
      const feed = (await parser.parseURL(expert.feed_url)) as unknown as ParsedFeed;
      const rows = ingestFeed(expert, feed, existing);
      if (rows.length) {
        const { error } = await supabase.from("expert_posts").insert(rows);
        if (error) throw new Error(error.message);
        for (const r of rows) existing.add(r.id);
      }
      summary.per_expert.push({
        slug: expert.slug,
        new_posts: rows.length,
        total_seen: feed.items.length,
      });
      summary.total_new += rows.length;
    } catch (e) {
      summary.per_expert.push({
        slug: expert.slug,
        new_posts: 0,
        total_seen: 0,
        error: (e as Error).message,
      });
    }
  }
  return summary;
}
