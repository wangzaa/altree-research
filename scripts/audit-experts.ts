import fs from "node:fs";
import path from "node:path";
import Parser from "rss-parser";
import { htmlToText, extractTickers } from "@/lib/ingest/html";
import { detectPaywall } from "@/lib/ingest/paywall-markers";
import { loadRegistry } from "@/lib/data/experts";
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

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function flagsList(f: Flags): string {
  return (Object.entries(f) as [keyof Flags, boolean][])
    .filter(([, on]) => on)
    .map(([k]) => k)
    .join(",");
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function formatAuditTable(rows: AuditRow[], runDate: Date): string {
  const lines: string[] = [];
  lines.push(`# Substack roster audit — ${isoDay(runDate)}`);
  lines.push("");
  lines.push(`**Candidates audited:** ${rows.length}`);
  lines.push("");
  lines.push("**Thresholds:**");
  lines.push("- ALIVE = items_last_90d >= 3");
  lines.push("- RECENT = most_recent within 30 days");
  lines.push("- SUBSTANTIVE = avg_content_chars >= 2000");
  lines.push("- LOW_PAYWALL = paywall_hit_rate < 0.5");
  lines.push("");
  lines.push("**Verdict guidance (auto):**");
  lines.push("- `reject` — fetch failed");
  lines.push("- `defer` — feed empty or ALIVE false");
  lines.push("- `promote_candidate` — all four flags pass");
  lines.push(
    "- `review` — alive but at least one of RECENT / SUBSTANTIVE / LOW_PAYWALL failed",
  );
  lines.push("");
  lines.push(
    "Set `verdict_final` by hand after review. Use `notes` for the one-line reason.",
  );
  lines.push("");

  if (rows.length === 0) {
    lines.push(
      "_No candidates audited (registry has no `active: false` entries)._",
    );
    return lines.join("\n") + "\n";
  }

  lines.push(
    "| slug | name | items_90d | items_30d | most_recent | avg_chars | paywall % | ticker % | flags | verdict_auto | verdict_final | notes |",
  );
  lines.push("|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|");
  for (const r of rows) {
    const recent = r.most_recent ? r.most_recent.slice(0, 10) : "—";
    lines.push(
      `| ${r.slug} | ${r.name} | ${r.items_last_90d} | ${r.items_last_30d} | ${recent} | ${r.avg_content_chars} | ${pct(r.paywall_hit_rate)} | ${pct(r.ticker_yield)} | ${flagsList(r.flags) || "—"} | ${r.verdict} | | |`,
    );
  }
  lines.push("");
  return lines.join("\n") + "\n";
}

const FETCH_TIMEOUT_MS = 15_000;

export function auditResultsPath(now: Date): string {
  return path.join(
    process.cwd(),
    "docs",
    "superpowers",
    "audits",
    `${isoDay(now)}-substack-roster-audit-results.md`,
  );
}

type FetchFeed = (url: string) => Promise<ParsedFeed>;

function makeRealFetcher(): FetchFeed {
  const parser = new Parser({
    customFields: { item: [["content:encoded", "contentEncoded"]] },
    timeout: FETCH_TIMEOUT_MS,
  });
  return async (url) => (await parser.parseURL(url)) as unknown as ParsedFeed;
}

export async function auditCandidates(
  fetchFeed: FetchFeed = makeRealFetcher(),
  now: Date = new Date(),
): Promise<AuditRow[]> {
  const registry = loadRegistry();
  const candidates = registry.experts.filter((e) => e.active === false);
  const out: AuditRow[] = [];
  for (const expert of candidates) {
    try {
      const feed = await fetchFeed(expert.feed_url);
      out.push(auditFeed(expert, feed, now));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const flags: Flags = {
        ALIVE: false,
        RECENT: false,
        SUBSTANTIVE: false,
        LOW_PAYWALL: false,
      };
      out.push({
        slug: expert.slug,
        name: expert.name,
        feed_url: expert.feed_url,
        fetch_status: `error:${msg}`,
        total_items: 0,
        items_last_90d: 0,
        items_last_30d: 0,
        most_recent: null,
        avg_content_chars: 0,
        paywall_hit_rate: 0,
        ticker_yield: 0,
        date_quality: "ok",
        flags,
        verdict: deriveVerdict(`error:${msg}`, 0, flags),
      });
    }
  }
  return out;
}

function writeAuditDoc(filePath: string, markdown: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    fs.appendFileSync(
      filePath,
      `\n\n<!-- additional run @ ${new Date().toISOString()} -->\n\n` +
        markdown,
    );
  } else {
    fs.writeFileSync(filePath, markdown);
  }
}

async function main(): Promise<void> {
  const now = new Date();
  const rows = await auditCandidates(undefined, now);
  const md = formatAuditTable(rows, now);
  process.stdout.write(md);
  const outPath = auditResultsPath(now);
  writeAuditDoc(outPath, md);
  process.stdout.write(
    `\nWrote ${path.relative(process.cwd(), outPath)}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
