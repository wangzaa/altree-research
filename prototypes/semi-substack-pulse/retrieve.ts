// PROTOTYPE — load corpus from JSONL and filter by ticker / keywords / date.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Post } from "./ingest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "data/posts.jsonl");

export type { Post };

export type RetrieveOpts = {
  ticker?: string;
  keywords?: string[];
  since?: string;
  limit?: number;
};

export function loadCorpus(): Post[] {
  if (!existsSync(DATA_PATH)) {
    throw new Error(
      `No corpus at ${DATA_PATH}. Run: npm run pulse -- ingest`,
    );
  }
  return readFileSync(DATA_PATH, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Post);
}

export function retrieve(opts: RetrieveOpts): Post[] {
  let posts = loadCorpus();
  if (opts.ticker) {
    const t = opts.ticker.toUpperCase();
    posts = posts.filter((p) => p.tickers.includes(t));
  }
  if (opts.keywords && opts.keywords.length) {
    const low = opts.keywords.map((k) => k.toLowerCase());
    posts = posts.filter((p) => {
      const blob = (p.title + " " + p.content).toLowerCase();
      return low.some((k) => blob.includes(k));
    });
  }
  if (opts.since) {
    posts = posts.filter((p) => p.published >= opts.since!);
  }
  posts.sort((a, b) => b.published.localeCompare(a.published));
  if (opts.limit) posts = posts.slice(0, opts.limit);
  return posts;
}
