// Covered-set ingestion generator (issue #25).
//
// Reads the upstream Shared-Research SQLite (sr.db) and produces:
//   1. lib/data/jp-companies.json  — the static, committed 388-company snapshot
//   2. (with --sync-catalysts)     — upserts recent NEWS_UPDATE into Supabase
//                                     jp_catalysts (volatile data; see ADR-0002)
//
// Usage:
//   npm run jp:covered-set                 # regenerate the static JSON
//   npm run jp:covered-set -- --verify     # + live Yahoo resolve (network)
//   npm run jp:covered-set -- --sync-catalysts  # + sync jp_catalysts (Supabase)
//
// sr.db path: $SR_DB_PATH, else the default ingester location below.
// Reads sqlite via the `sqlite3` CLI (-json) so we add no runtime dependency.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  JpCoveredSetSchema,
  type JpCompany,
} from "@/lib/schemas/jp-company";

const DEFAULT_DB =
  "/Users/neo/Desktop/dt_create/sharedresearch_ingester/data/sr.db";
const DB_PATH = process.env.SR_DB_PATH || DEFAULT_DB;
const OUT_PATH = resolve(process.cwd(), "lib/data/jp-companies.json");
const RECENT_MONTHS = 6;
const EXCERPT_CHARS = 400;

const doVerify = process.argv.includes("--verify");
const doSyncCatalysts = process.argv.includes("--sync-catalysts");

function query<T = Record<string, unknown>>(sql: string): T[] {
  const out = execFileSync("sqlite3", [DB_PATH, "-json", sql], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  const trimmed = out.trim();
  return trimmed ? (JSON.parse(trimmed) as T[]) : [];
}

function excerpt(md: string | null | undefined): string {
  if (!md) return "";
  const flat = md.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_CHARS
    ? `${flat.slice(0, EXCERPT_CHARS).trimEnd()}…`
    : flat;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

async function main(): Promise<void> {
  console.log(`Reading covered set from ${DB_PATH}\n`);

  const rows = query<{
    ticker: string;
    name_en: string | null;
    listed_at: string | null;
    summary_en: string | null;
    sector: string | null;
    revenue: number | null;
    gross_profit: number | null;
    operating_profit: number | null;
    operating_margin: number | null;
    revenue_yoy: number | null;
  }>(
    `SELECT c.ticker, c.name_en, c.listed_at, c.summary_en,
            cf.sector, cf.revenue, cf.gross_profit, cf.operating_profit,
            cf.operating_margin, cf.revenue_yoy
       FROM companies c
       LEFT JOIN company_financials cf ON cf.ticker = c.ticker
      ORDER BY c.ticker;`,
  );

  // Latest POST_INTERVIEW_UPDATE per ticker, for the description / seed.
  const postRows = query<{
    ticker: string;
    published_at: string;
    content_md: string | null;
  }>(
    `SELECT r.ticker, r.published_at, r.content_md
       FROM reports r
      WHERE r.type = 'POST_INTERVIEW_UPDATE'
        AND r.published_at = (
              SELECT MAX(published_at) FROM reports
               WHERE ticker = r.ticker AND type = 'POST_INTERVIEW_UPDATE');`,
  );
  const latestPost = new Map<string, { published_at: string; md: string }>();
  for (const p of postRows) {
    if (!latestPost.has(p.ticker)) {
      latestPost.set(p.ticker, {
        published_at: p.published_at,
        md: p.content_md ?? "",
      });
    }
  }

  const [meta] = query<{ value: string }>(
    `SELECT value FROM meta WHERE key = 'last_successful_ingest_at';`,
  );

  const companies: JpCompany[] = rows
    .filter((r) => str(r.name_en))
    .map((r) => {
      const post = latestPost.get(r.ticker) ?? null;
      const postExcerpt = post ? excerpt(post.md) : "";
      const description = str(r.summary_en) ?? (postExcerpt || null);
      return {
        ticker: r.ticker,
        yahoo_ticker: `${r.ticker}.T`,
        yahoo_verified: false,
        name_en: r.name_en as string,
        sector: str(r.sector),
        listed_at: str(r.listed_at),
        financials: {
          revenue_jpy_mn: num(r.revenue),
          gross_profit_jpy_mn: num(r.gross_profit),
          operating_profit_jpy_mn: num(r.operating_profit),
          operating_margin: num(r.operating_margin),
          revenue_yoy: num(r.revenue_yoy),
        },
        description,
        latest_post_interview:
          post && postExcerpt
            ? { published_at: post.published_at, excerpt: postExcerpt }
            : null,
      };
    });

  if (doVerify) {
    const { getQuote } = await import("@/lib/data/yahoo");
    console.log(`Verifying ${companies.length} tickers against Yahoo…`);
    let ok = 0;
    for (const c of companies) {
      try {
        const quote = await getQuote(c.yahoo_ticker);
        c.yahoo_verified = quote !== null;
        if (c.yahoo_verified) ok++;
      } catch {
        c.yahoo_verified = false;
      }
    }
    const misses = companies.filter((c) => !c.yahoo_verified);
    console.log(`  resolved ${ok}/${companies.length} on Yahoo`);
    if (misses.length) {
      console.log(
        `  unresolved: ${misses.map((c) => c.yahoo_ticker).join(", ")}`,
      );
    }
  } else {
    console.log(
      "Skipping Yahoo verify (run with --verify to set yahoo_verified).",
    );
  }

  const payload = {
    generated_at: new Date().toISOString(),
    source_ingested_at: meta?.value ?? null,
    companies,
  };

  const parsed = JpCoveredSetSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Generated payload failed schema: ${parsed.error.message}`);
  }

  writeFileSync(OUT_PATH, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
  console.log(`\n✓ Wrote ${companies.length} companies to ${OUT_PATH}`);

  if (doSyncCatalysts) {
    await syncCatalysts();
  } else {
    console.log("Skipping jp_catalysts sync (run with --sync-catalysts).");
  }
}

async function syncCatalysts(): Promise<void> {
  const { getSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = getSupabaseServerClient();

  const catalysts = query<{
    project_id: string;
    ticker: string;
    published_at: string;
    title_en: string | null;
    title_ja: string | null;
    content_md: string | null;
  }>(
    `SELECT project_id, ticker, published_at, title_en, title_ja, content_md
       FROM reports
      WHERE type = 'NEWS_UPDATE'
        AND published_at >= date('now', '-${RECENT_MONTHS} months')
      ORDER BY published_at DESC;`,
  );

  const records = catalysts.map((r) => ({
    id: r.project_id,
    ticker: r.ticker,
    yahoo_ticker: `${r.ticker}.T`,
    published_at: r.published_at,
    title: str(r.title_en) ?? str(r.title_ja) ?? "(untitled)",
    excerpt: excerpt(r.content_md),
    type: "NEWS_UPDATE",
  }));

  console.log(`\nSyncing ${records.length} recent catalysts to jp_catalysts…`);
  const { error } = await supabase
    .from("jp_catalysts")
    .upsert(records, { onConflict: "id" });
  if (error) throw new Error(`jp_catalysts upsert failed: ${error.message}`);
  console.log(`✓ Synced ${records.length} catalysts`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
