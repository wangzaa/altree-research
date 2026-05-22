import { htmlToText, extractTickers } from "@/lib/ingest/html";
import { detectPaywall } from "@/lib/ingest/paywall-markers";
import type { Expert } from "@/lib/schemas/experts";

export type Flags = {
  ALIVE: boolean;
  RECENT: boolean;
  SUBSTANTIVE: boolean;
  LOW_PAYWALL: boolean;
};

export type Verdict = "reject" | "defer" | "promote_candidate" | "review";

export type AuditRow = {
  slug: string;
  name: string;
  feed_url: string;
  fetch_status: string;
  total_items: number;
  items_last_90d: number;
  items_last_30d: number;
  most_recent: string | null;
  avg_content_chars: number;
  paywall_hit_rate: number;
  ticker_yield: number;
  date_quality: "ok" | "degraded";
  flags: Flags;
  verdict: Verdict;
};

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

const DAY_MS = 24 * 60 * 60 * 1000;

function tryParseDate(raw: string | undefined): { date: Date | null; ok: boolean } {
  if (!raw) return { date: null, ok: false };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { date: null, ok: false };
  return { date: d, ok: true };
}

function round(n: number, places = 3): number {
  const p = Math.pow(10, places);
  return Math.round(n * p) / p;
}

export function deriveFlags(
  metrics: {
    items_last_90d: number;
    most_recent: Date | null;
    avg_content_chars: number;
    paywall_hit_rate: number;
  },
  now: Date,
): Flags {
  const recentBoundary = 30 * DAY_MS;
  return {
    ALIVE: metrics.items_last_90d >= 3,
    RECENT:
      metrics.most_recent !== null &&
      now.getTime() - metrics.most_recent.getTime() <= recentBoundary,
    SUBSTANTIVE: metrics.avg_content_chars >= 2000,
    LOW_PAYWALL: metrics.paywall_hit_rate < 0.5,
  };
}

export function deriveVerdict(
  fetch_status: string,
  total_items: number,
  flags: Flags,
): Verdict {
  if (fetch_status !== "ok") return "reject";
  if (total_items === 0 || !flags.ALIVE) return "defer";
  if (flags.ALIVE && flags.RECENT && flags.SUBSTANTIVE && flags.LOW_PAYWALL) {
    return "promote_candidate";
  }
  return "review";
}

export function auditFeed(
  expert: Expert,
  feed: ParsedFeed,
  now: Date,
): AuditRow {
  const items = feed.items ?? [];
  let dateQuality: "ok" | "degraded" = "ok";
  let last90 = 0;
  let last30 = 0;
  let mostRecent: Date | null = null;
  let totalChars = 0;
  let paywallHits = 0;
  let tickerHits = 0;

  for (const it of items) {
    const html = it.contentEncoded || it.content || it.contentSnippet || "";
    const text = htmlToText(html);
    totalChars += text.length;
    if (detectPaywall(text)) paywallHits += 1;
    if (extractTickers(text).length > 0) tickerHits += 1;

    const { date, ok } = tryParseDate(it.pubDate || it.isoDate);
    if (!ok) {
      dateQuality = "degraded";
      continue;
    }
    if (!mostRecent || date! > mostRecent) mostRecent = date!;
    const ageDays = (now.getTime() - date!.getTime()) / DAY_MS;
    if (ageDays <= 90) last90 += 1;
    if (ageDays <= 30) last30 += 1;
  }

  const total = items.length;
  const avg = total === 0 ? 0 : Math.round(totalChars / total);
  const paywallRate = total === 0 ? 0 : round(paywallHits / total);
  const tickerYield = total === 0 ? 0 : round(tickerHits / total);

  const flags = deriveFlags(
    {
      items_last_90d: last90,
      most_recent: mostRecent,
      avg_content_chars: avg,
      paywall_hit_rate: paywallRate,
    },
    now,
  );
  const verdict = deriveVerdict("ok", total, flags);

  return {
    slug: expert.slug,
    name: expert.name,
    feed_url: expert.feed_url,
    fetch_status: "ok",
    total_items: total,
    items_last_90d: last90,
    items_last_30d: last30,
    most_recent: mostRecent ? mostRecent.toISOString() : null,
    avg_content_chars: avg,
    paywall_hit_rate: paywallRate,
    ticker_yield: tickerYield,
    date_quality: dateQuality,
    flags,
    verdict,
  };
}
