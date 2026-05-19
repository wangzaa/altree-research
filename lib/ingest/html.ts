// Port of prototypes/semi-substack-pulse/clean.ts. Regex-based to avoid
// pulling in cheerio for one job.

import { SEMI_TICKER_MAP, SEMI_SORTED_KEYS } from "@/lib/data/semi-tickers";

export function htmlToText(html: string): string {
  if (!html) return "";
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<figcaption[\s\S]*?<\/figcaption>/gi, "");
  s = s.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
  return s.trim();
}

export function extractTickers(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) {
    found.add(m[1]);
  }
  const lower = text.toLowerCase();
  for (const name of SEMI_SORTED_KEYS) {
    if (name.includes(" ")) {
      if (lower.includes(name)) found.add(SEMI_TICKER_MAP[name]);
    } else {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${escaped}\\b`);
      if (re.test(lower)) found.add(SEMI_TICKER_MAP[name]);
    }
  }
  return Array.from(found).sort();
}
