// PROTOTYPE — fetch RSS for each expert, parse, persist to data/posts.jsonl.
// Idempotent: keyed on a stable post id derived from (slug, guid). Reruns are safe.

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  appendFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";
import { htmlToText, extractTickers } from "./clean";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "data/posts.jsonl");
const REGISTRY_PATH = join(__dirname, "experts.json");

type Expert = {
  slug: string;
  name: string;
  author: string;
  url: string;
  feed_url: string;
  sectors: string[];
  notes?: string;
};

export type Post = {
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
  ingested_at: string;
};

const PAYWALL_MARKERS = [
  "this post is for paid subscribers",
  "this post is for paying subscribers",
  "subscribe to read",
];

function detectPaywall(text: string): boolean {
  const low = text.toLowerCase();
  return PAYWALL_MARKERS.some((m) => low.includes(m));
}

function postId(slug: string, guid: string): string {
  return createHash("sha256")
    .update(`${slug}::${guid}`)
    .digest("hex")
    .slice(0, 16);
}

function loadExistingIds(): Set<string> {
  if (!existsSync(DATA_PATH)) return new Set();
  const ids = new Set<string>();
  const lines = readFileSync(DATA_PATH, "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      ids.add(JSON.parse(line).id);
    } catch {
      // skip malformed lines
    }
  }
  return ids;
}

function parseDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export async function ingest(): Promise<void> {
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  if (!existsSync(DATA_PATH)) writeFileSync(DATA_PATH, "");
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8")) as {
    experts: Expert[];
  };
  const existing = loadExistingIds();
  const parser = new Parser({
    customFields: { item: [["content:encoded", "contentEncoded"]] },
  });

  console.log(`Ingesting from ${registry.experts.length} experts...\n`);
  let totalNew = 0;

  for (const expert of registry.experts) {
    console.log(`▶ ${expert.name}`);
    console.log(`  fetching ${expert.feed_url}`);
    try {
      const feed = await parser.parseURL(expert.feed_url);
      let newCount = 0;
      for (const item of feed.items) {
        const guid = item.guid || item.link || item.title;
        if (!guid) continue;
        const id = postId(expert.slug, guid);
        if (existing.has(id)) continue;

        const html =
          (item as Record<string, unknown>)["contentEncoded"] as string ||
          item.content ||
          item.contentSnippet ||
          "";
        const text = htmlToText(html);
        const tickers = extractTickers(text);
        const paywalled = detectPaywall(text);

        const post: Post = {
          id,
          expert_slug: expert.slug,
          expert_name: expert.name,
          author: expert.author,
          title: item.title || "",
          link: item.link || "",
          published: parseDate(item.pubDate || item.isoDate),
          content: text,
          is_paywalled: paywalled,
          tickers,
          ingested_at: new Date().toISOString(),
        };
        appendFileSync(DATA_PATH, JSON.stringify(post) + "\n");
        existing.add(id);
        newCount++;
      }
      console.log(
        `  → ${newCount} new posts (feed had ${feed.items.length} entries)\n`,
      );
      totalNew += newCount;
    } catch (e) {
      console.log(`  ✗ fetch failed: ${(e as Error).message}\n`);
    }
  }

  const allLines = readFileSync(DATA_PATH, "utf8").split("\n").filter(Boolean);
  const paywalled = allLines.filter((l) => JSON.parse(l).is_paywalled).length;
  console.log(`Corpus: ${allLines.length} total posts (${paywalled} paywalled)`);
  console.log(`This run: ${totalNew} new posts`);
}
