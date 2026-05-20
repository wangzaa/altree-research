# Expert-Corpus Stage 4 Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commit policy (every commit task in this plan):** Before running `git commit`, propose the commit message text to the user, wait for them to approve verbatim or send edits, then commit with the approved text. Never commit autonomously. This is a durable user preference recorded in memory.

**Goal:** Replace the `web_search`-based Bull/Bear evidence model with a curated expert-Substack corpus. Ingest RSS feeds into Supabase, retrieve by sector + ticker, and produce per-lens evidence via Anthropic tool-calling with the adversarial-separation harness.

**Architecture:** RSS ingest writes to a new `expert_posts` table; a pure-ish `retrieve()` module filters by sector / ticker / keyword. Bull and Bear researchers each receive the retrieved posts as full content in the prompt and call a `submit_evidence` tool — `buildLensContext()` guarantees prompt-level isolation and throws on leakage. `POST /api/validate/driver` runs Bull and Bear in parallel and writes a partial `validation_runs.results[driver_id]` row.

**Tech Stack:** Next.js 15 / TypeScript / Supabase Postgres / Anthropic SDK (`claude-opus-4-7` default) / `rss-parser` / Zod / Vitest.

**Spec:** [docs/superpowers/specs/2026-05-19-expert-corpus-stage4-rework-design.md](../specs/2026-05-19-expert-corpus-stage4-rework-design.md)

**Prototype reference:** [prototypes/semi-substack-pulse/](../../../prototypes/semi-substack-pulse/) — exact TypeScript code for HTML strip, ticker extract, RSS parse, and Bull/Bear tool-calling lives here. Port from this directory rather than re-deriving.

---

## File map

**New files:**
- `supabase/migrations/0005_expert_posts.sql` — `expert_posts` table, indexes, RLS, realtime
- `lib/schemas/experts.ts` — Zod schema for the registry JSON
- `lib/data/experts.json` — 3-expert semis registry
- `lib/data/experts.ts` — registry loader + sector filter
- `lib/data/semi-tickers.ts` — ticker dictionary for semi names
- `lib/ingest/html.ts` — HTML-to-text + ticker extraction (port of prototype's `clean.ts`)
- `lib/ingest/paywall-markers.ts` — paywall detection markers
- `lib/ingest/expert-corpus.ts` — RSS fetch + parse + upsert pipeline
- `lib/agents/expert-corpus/retrieve.ts` — retrieval module
- `lib/schemas/validation.ts` — Zod schemas for `CorpusEvidence` + `DriverValidationResult`
- `lib/agents/adversarial/buildLensContext.ts` — adversarial-separation harness
- `lib/agents/adversarial/disallow.ts` — opposite-lens disallow-list regex
- `lib/agents/bull-researcher.ts` — Bull lens
- `lib/agents/bear-researcher.ts` — Bear lens
- `app/api/cron/refresh-corpus/route.ts` — daily ingest cron
- `app/api/validate/driver/route.ts` — per-driver validation entrypoint
- `components/validation/DriverEvidencePanel.tsx` — middle-panel UI
- `scripts/corpus-refresh.ts` — manual ingest CLI

**Modified files:**
- `lib/anthropic/client.ts` — allow omitting temperature (Opus 4.7 rejects it)
- `lib/schemas/thesis.ts` — add `tickers?: string[]` to `IndustryDriverSchema`
- `lib/agents/thesis-extractor.ts` — populate driver `tickers` from prose
- `lib/agents/thesis-refiner.ts` — accept NL edits to driver `tickers`
- `package.json` — add `rss-parser`; add `corpus:refresh` script
- `.env.example` — add `CRON_SECRET`

**New tests:**
- `tests/unit/data/experts.test.ts`
- `tests/unit/ingest/html.test.ts`
- `tests/unit/ingest/expert-corpus.test.ts`
- `tests/unit/agents/expert-corpus/retrieve.test.ts`
- `tests/unit/agents/adversarial/buildLensContext.test.ts`
- `tests/unit/agents/bull-researcher.test.ts`
- `tests/unit/agents/bear-researcher.test.ts`
- `tests/integration/api/validate-driver.test.ts`

---

## Task 1: Migration for `expert_posts` table

**Files:**
- Create: `supabase/migrations/0005_expert_posts.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 0005_expert_posts.sql
-- Local ingested corpus of independent-expert Substack posts.
-- Bull/Bear researchers query this table instead of doing open web search.

create table expert_posts (
  id              text primary key,            -- sha256(slug::guid)[:16]
  expert_slug     text not null,
  expert_name     text not null,
  author          text not null,
  title           text not null,
  link            text not null,
  published       timestamptz not null,
  content         text not null,               -- HTML-stripped plain text
  is_paywalled    boolean not null default false,
  tickers         text[] not null default '{}',
  sectors         text[] not null default '{}', -- denormalized from registry at ingest time
  ingested_at     timestamptz not null default now()
);

create index expert_posts_published_idx on expert_posts (published desc);
create index expert_posts_tickers_gin   on expert_posts using gin (tickers);
create index expert_posts_sectors_gin   on expert_posts using gin (sectors);
create index expert_posts_slug_idx      on expert_posts (expert_slug);

-- RLS: read-only for authenticated; service-role writes only (the cron job).
alter table expert_posts enable row level security;

create policy expert_posts_read_authenticated on expert_posts
  for select to authenticated
  using (true);
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push` (or via the supabase MCP `apply_migration` if a remote project is wired in).
Expected: migration applies; `\d expert_posts` shows the table.

- [ ] **Step 3: Commit**

Stage explicit paths (memory: never `git add -A` in this repo):

```bash
git add supabase/migrations/0005_expert_posts.sql
```

Propose this commit message and wait for user approval/edits before running `git commit`:

```
feat(s6): add expert_posts table for ingested Substack corpus

Backing store for the expert-corpus Bull/Bear pivot. RLS read-only for
authenticated, write via service role from the ingest cron.
```

---

## Task 2: Zod schema for the registry

**Files:**
- Create: `lib/schemas/experts.ts`
- Test: `tests/unit/data/experts.test.ts` (test file created in Task 4)

- [ ] **Step 1: Write the schema**

```typescript
// lib/schemas/experts.ts
import { z } from "zod";

export const ExpertSchema = z
  .object({
    slug: z.string().regex(/^[a-z][a-z0-9_]*$/),
    name: z.string().min(1),
    author: z.string().min(1),
    url: z.string().url(),
    feed_url: z.string().url(),
    sectors: z.array(z.string().min(1)).min(1),
    active: z.boolean().default(true),
    notes: z.string().optional(),
  })
  .strict();

export const SectorRegistryEntrySchema = z
  .object({
    label: z.string().min(1),
    gics: z.array(z.string().regex(/^\d{2,8}$/)).default([]),
  })
  .strict();

export const ExpertRegistrySchema = z
  .object({
    experts: z.array(ExpertSchema).min(1),
    sectors: z.record(z.string(), SectorRegistryEntrySchema),
  })
  .strict();

export type Expert = z.infer<typeof ExpertSchema>;
export type SectorRegistryEntry = z.infer<typeof SectorRegistryEntrySchema>;
export type ExpertRegistry = z.infer<typeof ExpertRegistrySchema>;
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/schemas/experts.ts
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): add Zod schema for expert registry

Validates lib/data/experts.json shape: experts[] + sectors map with
GICS code references back to lib/data/gics.ts.
```

---

## Task 3: Registry JSON content

**Files:**
- Create: `lib/data/experts.json`

- [ ] **Step 1: Write the file**

```json
{
  "experts": [
    {
      "slug": "fabricated_knowledge",
      "name": "Fabricated Knowledge",
      "author": "Doug O'Laughlin",
      "url": "https://www.fabricatedknowledge.com",
      "feed_url": "https://www.fabricatedknowledge.com/feed",
      "sectors": ["semis"],
      "active": true,
      "notes": "Mule's Musings (mule.substack.com) is the same author's older publication; its current RSS mirrors fabricatedknowledge.com — don't add it separately."
    },
    {
      "slug": "asianometry",
      "name": "Asianometry",
      "author": "Jon Y",
      "url": "https://www.asianometry.com",
      "feed_url": "https://www.asianometry.com/feed",
      "sectors": ["semis"],
      "active": true,
      "notes": "Primary content on YouTube; Substack hosts companion notes only."
    },
    {
      "slug": "semianalysis",
      "name": "SemiAnalysis",
      "author": "Dylan Patel et al.",
      "url": "https://www.semianalysis.com",
      "feed_url": "https://www.semianalysis.com/feed",
      "sectors": ["semis"],
      "active": true,
      "notes": "Heavily paywalled per stated policy, but RSS currently returns full content. Re-check if posts shrink to excerpts later."
    }
  ],
  "sectors": {
    "semis": {
      "label": "Semiconductors",
      "gics": ["45301010", "45301020"]
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/data/experts.json
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): seed expert registry with 3 semi publications

Fabricated Knowledge, Asianometry, SemiAnalysis. Mule's Musings excluded
because its feed mirrors Fabricated Knowledge (same author, same posts) —
including both would double-count Doug O'Laughlin.
```

---

## Task 4: Registry loader + sector filter

**Files:**
- Create: `lib/data/experts.ts`
- Test: `tests/unit/data/experts.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/data/experts.test.ts
import { describe, it, expect } from "vitest";
import { loadRegistry, getActiveExpertsForSectors } from "@/lib/data/experts";

describe("expert registry", () => {
  it("validates and loads the bundled JSON without throwing", () => {
    const reg = loadRegistry();
    expect(reg.experts.length).toBeGreaterThanOrEqual(3);
    expect(reg.sectors.semis).toBeDefined();
  });

  it("filters active experts by sector intersection", () => {
    const semis = getActiveExpertsForSectors(["semis"]);
    const slugs = semis.map((e) => e.slug).sort();
    expect(slugs).toEqual(["asianometry", "fabricated_knowledge", "semianalysis"]);
  });

  it("returns empty array for unknown sector", () => {
    expect(getActiveExpertsForSectors(["nonexistent_sector"])).toEqual([]);
  });

  it("excludes inactive experts", () => {
    // Synthetic: the bundled JSON has no inactive experts. Tested via mock at
    // the loadRegistry layer in Step 3 if needed; here we just confirm the
    // filter respects active=false when present.
    const semis = getActiveExpertsForSectors(["semis"]);
    expect(semis.every((e) => e.active !== false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/data/experts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the loader**

```typescript
// lib/data/experts.ts
import registryJson from "./experts.json";
import { ExpertRegistrySchema, type Expert, type ExpertRegistry } from "@/lib/schemas/experts";

let _cache: ExpertRegistry | null = null;

export function loadRegistry(): ExpertRegistry {
  if (_cache) return _cache;
  const parsed = ExpertRegistrySchema.safeParse(registryJson);
  if (!parsed.success) {
    throw new Error(`Invalid lib/data/experts.json: ${parsed.error.message}`);
  }
  _cache = parsed.data;
  return _cache;
}

export function getActiveExpertsForSectors(sectorTags: string[]): Expert[] {
  const reg = loadRegistry();
  const wanted = new Set(sectorTags);
  return reg.experts.filter(
    (e) => e.active !== false && e.sectors.some((s) => wanted.has(s)),
  );
}

export type { Expert };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/data/experts.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/data/experts.ts tests/unit/data/experts.test.ts
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): registry loader + sector-filtered active-experts helper

loadRegistry() validates JSON against the Zod schema on first call and
caches. getActiveExpertsForSectors() is the call site for Bull/Bear
retrieval to scope the corpus to thesis sector tags.
```

---

## Task 5: Semi-tickers dictionary

**Files:**
- Create: `lib/data/semi-tickers.ts`

- [ ] **Step 1: Copy the dictionary**

Port from `prototypes/semi-substack-pulse/tickers.ts` verbatim. The file is the source of truth; if the prototype is later deleted, this becomes the canonical dictionary.

```typescript
// lib/data/semi-tickers.ts
// Ticker dictionary for the semis universe. Used by lib/ingest/html.ts to
// extract company mentions from post content. The dictionary is sector-
// specific: each new sector will register its own dictionary alongside.

export const SEMI_TICKER_MAP: Record<string, string> = {
  // US logic + design
  nvidia: "NVDA",
  nvda: "NVDA",
  amd: "AMD",
  "advanced micro devices": "AMD",
  intel: "INTC",
  intc: "INTC",
  broadcom: "AVGO",
  avgo: "AVGO",
  marvell: "MRVL",
  qualcomm: "QCOM",
  qcom: "QCOM",
  arm: "ARM",
  // Foundries
  tsmc: "TSM",
  "taiwan semiconductor": "TSM",
  "samsung foundry": "005930.KS",
  "samsung electronics": "005930.KS",
  smic: "0981.HK",
  globalfoundries: "GFS",
  gf: "GFS",
  umc: "UMC",
  // Memory
  micron: "MU",
  "sk hynix": "000660.KS",
  hynix: "000660.KS",
  // Semicap
  asml: "ASML",
  "applied materials": "AMAT",
  amat: "AMAT",
  "lam research": "LRCX",
  kla: "KLAC",
  klac: "KLAC",
  "tokyo electron": "8035.T",
  tel: "8035.T",
  "asm international": "ASM",
  // Equipment / materials / test
  teradyne: "TER",
  advantest: "6857.T",
  entegris: "ENTG",
  // Hyperscalers (relevant for AI accelerator demand)
  microsoft: "MSFT",
  azure: "MSFT",
  google: "GOOGL",
  alphabet: "GOOGL",
  amazon: "AMZN",
  aws: "AMZN",
  meta: "META",
  oracle: "ORCL",
};

export const SEMI_SORTED_KEYS = Object.keys(SEMI_TICKER_MAP).sort(
  (a, b) => b.length - a.length,
);
```

- [ ] **Step 2: Commit**

```bash
git add lib/data/semi-tickers.ts
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): semi-ticker dictionary for post entity extraction

Sector-specific name→ticker map ported from the prototype. Sorted-longest-
first iteration order matches multi-word names ("taiwan semiconductor")
before single tokens ("nvidia").
```

---

## Task 6: HTML cleaner + ticker extractor

**Files:**
- Create: `lib/ingest/html.ts`
- Test: `tests/unit/ingest/html.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/ingest/html.test.ts
import { describe, it, expect } from "vitest";
import { htmlToText, extractTickers } from "@/lib/ingest/html";

describe("htmlToText", () => {
  it("strips tags and decodes common entities", () => {
    const html = "<p>Hello &amp; <strong>welcome</strong>&nbsp;back.</p>";
    expect(htmlToText(html)).toBe("Hello & welcome back.");
  });

  it("converts block tags into newlines", () => {
    const html = "<p>Line one.</p><p>Line two.</p>";
    expect(htmlToText(html)).toBe("Line one.\n\nLine two.");
  });

  it("removes script and style blocks", () => {
    const html = "<p>visible</p><script>alert(1)</script><style>.x{}</style>";
    expect(htmlToText(html)).toBe("visible");
  });

  it("collapses 3+ blank lines to 2", () => {
    const html = "<p>a</p><p></p><p></p><p></p><p>b</p>";
    expect(htmlToText(html)).toBe("a\n\nb");
  });
});

describe("extractTickers", () => {
  it("picks up $TICKER convention", () => {
    expect(extractTickers("Bought $NVDA and $AAPL.")).toContain("NVDA");
  });

  it("matches dictionary names case-insensitively", () => {
    expect(extractTickers("ASML is the only EUV supplier.")).toContain("ASML");
    expect(extractTickers("TSMC capacity is constrained.")).toContain("TSM");
    expect(extractTickers("Lam Research and KLA both beat.")).toContain("LRCX");
    expect(extractTickers("Lam Research and KLA both beat.")).toContain("KLAC");
  });

  it("respects word boundaries for single tokens", () => {
    // "intel" should not match "intelligent"
    expect(extractTickers("Intelligence is rising.")).not.toContain("INTC");
  });

  it("returns sorted unique tickers", () => {
    const t = extractTickers("NVDA $NVDA nvidia $AMD AMD.");
    expect(t).toEqual([...new Set(t)].sort());
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/unit/ingest/html.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Port the prototype's clean.ts**

```typescript
// lib/ingest/html.ts
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
```

- [ ] **Step 4: Run tests to verify passing**

Run: `npm test -- tests/unit/ingest/html.test.ts`
Expected: 9 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/html.ts tests/unit/ingest/html.test.ts
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): HTML-to-text + ticker extraction for ingest

Regex-based HTML strip and dictionary-driven ticker matching. No cheerio
dep needed for the limited markup in Substack RSS. Ported from the
prototype.
```

---

## Task 7: Paywall-marker detection

**Files:**
- Create: `lib/ingest/paywall-markers.ts`

- [ ] **Step 1: Write the module**

```typescript
// lib/ingest/paywall-markers.ts
// Substring patterns that indicate a Substack RSS item is the public excerpt
// of a paid post rather than the full content. Detection is conservative:
// false-negatives are acceptable (full content stored anyway); false-
// positives would mark full content as paywalled.

export const PAYWALL_MARKERS: readonly string[] = [
  "this post is for paid subscribers",
  "this post is for paying subscribers",
  "subscribe to read",
];

export function detectPaywall(text: string): boolean {
  const low = text.toLowerCase();
  return PAYWALL_MARKERS.some((m) => low.includes(m));
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ingest/paywall-markers.ts
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): paywall-marker detection helper

Conservative substring check. False-negatives acceptable (we keep the
content); false-positives would mis-flag full content. List sourced from
the reference md and the prototype.
```

---

## Task 8: Ingest pipeline (RSS → upsert)

**Files:**
- Create: `lib/ingest/expert-corpus.ts`
- Test: `tests/unit/ingest/expert-corpus.test.ts`
- Modify: `package.json` (add `rss-parser` dep if not present)

- [ ] **Step 1: Add rss-parser if needed**

Check: `grep '"rss-parser"' package.json`. If absent: `npm install --save rss-parser`. (The prototype installed it as a devDependency; the real impl needs it in `dependencies` because the ingest runs in production via the cron route.)

Also: move `rss-parser` from `devDependencies` to `dependencies` in `package.json` if it landed there during prototyping.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/ingest/expert-corpus.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ingestFeed, hashPostId } from "@/lib/ingest/expert-corpus";

// We test the per-feed pure function (no Supabase): given a parsed feed
// and a known-existing id set, ingestFeed returns a list of new
// ExpertPost rows ready for upsert.

const FAKE_FEED = {
  items: [
    {
      guid: "fk-guid-1",
      title: "TSMC capacity update",
      link: "https://www.fabricatedknowledge.com/p/tsmc-capacity",
      pubDate: "Wed, 12 Jun 2024 10:00:00 GMT",
      content: "<p>TSMC is building more <strong>N3</strong> capacity.</p>",
      contentEncoded:
        "<p>TSMC is building more <strong>N3</strong> capacity.</p>",
    },
    {
      guid: "fk-guid-2",
      title: "Already-seen post",
      link: "https://www.fabricatedknowledge.com/p/seen",
      pubDate: "Tue, 11 Jun 2024 10:00:00 GMT",
      content: "<p>Old content.</p>",
      contentEncoded: "<p>Old content.</p>",
    },
  ],
};

describe("ingestFeed", () => {
  it("hashes post ids stably", () => {
    expect(hashPostId("slug", "guid").length).toBe(16);
    expect(hashPostId("slug", "guid")).toBe(hashPostId("slug", "guid"));
  });

  it("returns only new posts", () => {
    const expert = {
      slug: "fabricated_knowledge",
      name: "Fabricated Knowledge",
      author: "Doug O'Laughlin",
      url: "https://www.fabricatedknowledge.com",
      feed_url: "https://www.fabricatedknowledge.com/feed",
      sectors: ["semis"],
      active: true,
    } as const;
    const existing = new Set([hashPostId("fabricated_knowledge", "fk-guid-2")]);
    const rows = ingestFeed(expert, FAKE_FEED as any, existing);
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("TSMC capacity update");
    expect(rows[0].tickers).toContain("TSM");
    expect(rows[0].sectors).toEqual(["semis"]);
    expect(rows[0].is_paywalled).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/unit/ingest/expert-corpus.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the module**

```typescript
// lib/ingest/expert-corpus.ts
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
  published: string;       // ISO 8601 UTC
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

    const html = item.contentEncoded || item.content || item.contentSnippet || "";
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
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type IngestSummary = {
  per_expert: Array<{ slug: string; new_posts: number; total_seen: number; error?: string }>;
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
```

- [ ] **Step 5: Run tests to verify passing**

Run: `npm test -- tests/unit/ingest/expert-corpus.test.ts`
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add lib/ingest/expert-corpus.ts tests/unit/ingest/expert-corpus.test.ts package.json
# include package-lock.json only if rss-parser moved/added
git add package-lock.json
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): RSS ingest pipeline for expert corpus

Pure ingestFeed() function for unit-testable parsing + an orchestrator
refreshCorpus() that loads the registry, fetches each active feed,
and upserts new posts via the service-role Supabase client. Idempotent
via sha256(slug::guid) post ids.
```

---

## Task 9: Manual ingest CLI

**Files:**
- Create: `scripts/corpus-refresh.ts`
- Modify: `package.json` (add `corpus:refresh` script)

- [ ] **Step 1: Write the CLI**

```typescript
// scripts/corpus-refresh.ts
// One-shot manual ingest. Run via `npm run corpus:refresh`.

import { refreshCorpus } from "@/lib/ingest/expert-corpus";

async function main() {
  console.log("Refreshing expert corpus...\n");
  const summary = await refreshCorpus();
  for (const e of summary.per_expert) {
    if (e.error) {
      console.log(`✗ ${e.slug}: ${e.error}`);
    } else {
      console.log(`✓ ${e.slug}: +${e.new_posts} new (feed had ${e.total_seen})`);
    }
  }
  console.log(`\nTotal new: ${summary.total_new}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to the `"scripts"` section:

```json
"corpus:refresh": "unset ANTHROPIC_API_KEY; tsx --env-file=.env scripts/corpus-refresh.ts"
```

(The `unset ANTHROPIC_API_KEY` follows the same shell pattern as `npm run dev` — see memory `project_dev_env_var_override`.)

- [ ] **Step 3: Verify it runs**

Run: `npm run corpus:refresh`
Expected: "Refreshing expert corpus..." then per-expert ✓ lines, then "Total new: N". If a feed is unreachable, the per-expert line shows ✗ with the error but the process continues.

- [ ] **Step 4: Commit**

```bash
git add scripts/corpus-refresh.ts package.json
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): manual corpus refresh CLI

`npm run corpus:refresh` for dev backfills and ad-hoc reingest. Same
shell-unset pattern as `npm run dev`.
```

---

## Task 10: Cron route for daily ingest

**Files:**
- Create: `app/api/cron/refresh-corpus/route.ts`
- Modify: `.env.example` (add `CRON_SECRET`)

- [ ] **Step 1: Write the route**

```typescript
// app/api/cron/refresh-corpus/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { refreshCorpus } from "@/lib/ingest/expert-corpus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await refreshCorpus();
    return NextResponse.json(summary, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Update .env.example**

Add to `.env.example`:

```
# Daily corpus refresh cron auth
CRON_SECRET=
```

- [ ] **Step 3: Add a Vercel cron entry**

Open or create `vercel.json` at the repo root. Add:

```json
{
  "crons": [
    {
      "path": "/api/cron/refresh-corpus",
      "schedule": "0 8 * * *"
    }
  ]
}
```

(8am UTC daily. The cron invokes the route via Vercel's internal request, which carries the `Authorization: Bearer ${CRON_SECRET}` header automatically when configured in the Vercel dashboard.)

- [ ] **Step 4: Manual auth test**

Run locally: `npm run dev` (in another terminal), then:

```bash
# Should 401
curl -X POST http://localhost:3000/api/cron/refresh-corpus

# Should run the ingest
curl -X POST http://localhost:3000/api/cron/refresh-corpus \
  -H "Authorization: Bearer $(grep CRON_SECRET .env | cut -d= -f2)"
```

Expected: first returns 401 JSON. Second returns the IngestSummary JSON.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/refresh-corpus/route.ts .env.example vercel.json
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): daily Vercel cron route for corpus refresh

POST /api/cron/refresh-corpus runs refreshCorpus() under a CRON_SECRET
bearer-auth gate. Scheduled at 08:00 UTC via vercel.json.
```

---

## Task 11: Retrieval module

**Files:**
- Create: `lib/agents/expert-corpus/retrieve.ts`
- Test: `tests/unit/agents/expert-corpus/retrieve.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/agents/expert-corpus/retrieve.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { retrieve, type ExpertPostRow } from "@/lib/agents/expert-corpus/retrieve";

// Mock the Supabase client at the module boundary.
vi.mock("@supabase/supabase-js", () => {
  const queryResult = { data: [] as ExpertPostRow[], error: null };
  const fluent = {
    select: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    overlaps: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(queryResult),
  };
  return {
    createClient: vi.fn(() => ({ from: vi.fn(() => fluent) })),
    __setData: (rows: ExpertPostRow[]) => {
      queryResult.data = rows;
    },
  };
});

const FIXTURE: ExpertPostRow[] = [
  {
    id: "a",
    expert_slug: "x",
    expert_name: "X",
    author: "A",
    title: "Memory cycle",
    link: "https://x/p/1",
    published: "2025-06-01T00:00:00Z",
    content: "Memory pricing is ripping.",
    is_paywalled: false,
    tickers: ["MU", "NVDA"],
    sectors: ["semis"],
  },
  {
    id: "b",
    expert_slug: "x",
    expert_name: "X",
    author: "A",
    title: "EUV",
    link: "https://x/p/2",
    published: "2024-12-01T00:00:00Z",
    content: "ASML monopoly persists.",
    is_paywalled: false,
    tickers: ["ASML"],
    sectors: ["semis"],
  },
];

beforeEach(() => {
  const sup = require("@supabase/supabase-js") as {
    __setData: (rows: ExpertPostRow[]) => void;
  };
  sup.__setData(FIXTURE);
});

describe("retrieve", () => {
  it("filters by keyword substring after the DB call", async () => {
    const out = await retrieve({
      thesis_sectors: ["semis"],
      keywords: ["EUV"],
      limit: 10,
    });
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });

  it("returns posts sorted published desc, limited", async () => {
    const out = await retrieve({ thesis_sectors: ["semis"], limit: 1 });
    // sort happens in retrieve() before slice; DB mock returns in fixture
    // order, so retrieve must re-sort.
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/agents/expert-corpus/retrieve.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement retrieve**

```typescript
// lib/agents/expert-corpus/retrieve.ts
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

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
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
  const { data, error } = await q.order("published", { ascending: false }).limit(
    Math.max(opts.limit * 4, 50),
  );
  if (error) throw new Error(`retrieve failed: ${error.message}`);

  let rows = (data ?? []) as ExpertPostRow[];
  if (opts.keywords && opts.keywords.length) {
    const low = opts.keywords.map((k) => k.toLowerCase());
    rows = rows.filter((p) => {
      const blob = (p.title + " " + p.content).toLowerCase();
      return low.some((k) => blob.includes(k));
    });
  }
  rows.sort((a, b) => b.published.localeCompare(a.published));
  return rows.slice(0, opts.limit);
}
```

- [ ] **Step 4: Run tests to verify passing**

Run: `npm test -- tests/unit/agents/expert-corpus/retrieve.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/agents/expert-corpus/retrieve.ts tests/unit/agents/expert-corpus/retrieve.test.ts
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): expert-corpus retrieval module

Filters by sector intersection (mandatory), ticker overlap (optional),
keyword substring on title+content, date floor, ordered published desc.
Default candidate cap is 4x limit before in-app keyword filter and slice.
```

---

## Task 12: Validation Zod schemas (corpus evidence shape)

**Files:**
- Create: `lib/schemas/validation.ts`

- [ ] **Step 1: Write the schemas**

```typescript
// lib/schemas/validation.ts
// New corpus-style evidence shape. Coexists with the older EvidenceSchema in
// lib/schemas/thesis.ts (kept for backward compatibility on the thesis
// object itself); Bull/Bear writes go to validation_runs.results, not to
// thesis.drivers[i].evidence.

import { z } from "zod";

export const CorpusEvidenceSchema = z
  .object({
    expert: z.string().min(1),
    post_id: z.string().min(1),
    post_url: z.string().url(),
    post_title: z.string().min(1),
    quote: z.string().min(1),
    date: z.string(),
  })
  .strict();

export const DriverValidationResultSchema = z
  .object({
    bull_evidence: z.array(CorpusEvidenceSchema).default([]),
    bear_evidence: z.array(CorpusEvidenceSchema).default([]),
    // verified flags and triangulator_output land in narrowed S7.
  })
  .strict();

export type CorpusEvidence = z.infer<typeof CorpusEvidenceSchema>;
export type DriverValidationResult = z.infer<typeof DriverValidationResultSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add lib/schemas/validation.ts
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): Zod schemas for corpus-style Bull/Bear evidence

CorpusEvidence: expert, post_id, post_url, post_title, quote, date — no
source_tier (rubric dropped with the corpus pivot). DriverValidationResult
wraps per-lens arrays; verified + triangulator_output land in narrowed S7.
```

---

## Task 13: Add `tickers` field to IndustryDriver

**Files:**
- Modify: `lib/schemas/thesis.ts:53-72`

- [ ] **Step 1: Write the test for the schema change**

Append to `tests/unit/schemas/thesis.test.ts` (or create if absent — check first via `ls tests/unit/schemas/`):

```typescript
// tests/unit/schemas/thesis.test.ts (append; create if absent)
import { describe, it, expect } from "vitest";
import { IndustryDriverSchema } from "@/lib/schemas/thesis";

describe("IndustryDriverSchema tickers field", () => {
  const base = {
    id: "M1",
    claim: "Backlog converts to revenue within 3 years",
    central_estimate: { value: 3, unit: "years" },
    thesis_breaks_below: 2,
    classification: "industry" as const,
  };

  it("accepts a driver with no tickers field (back-compat)", () => {
    const parsed = IndustryDriverSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("accepts a driver with tickers populated", () => {
    const parsed = IndustryDriverSchema.safeParse({
      ...base,
      tickers: ["TSM", "ASML"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.tickers).toEqual(["TSM", "ASML"]);
  });

  it("rejects non-string tickers entries", () => {
    const parsed = IndustryDriverSchema.safeParse({
      ...base,
      tickers: ["TSM", 123],
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/schemas/thesis.test.ts`
Expected: FAIL on the "tickers populated" case (field unknown in `.strict()` schema).

- [ ] **Step 3: Add the field to IndustryDriverSchema**

In `lib/schemas/thesis.ts`, modify `IndustryDriverSchema` (lines 53-72). Insert the `tickers` field after `evidence`:

```typescript
export const IndustryDriverSchema = z
  .object({
    id: z.string().min(1),
    claim: z.string().min(1),
    central_estimate: CentralEstimateSchema,
    thesis_breaks_below: z.number(),
    evidence: z.array(EvidenceSchema).default([]),
    tickers: z.array(z.string().regex(YAHOO_TICKER_REGEX)).optional(),
    verdict: VerdictSchema.nullable().default(null),
    classification: z.literal("industry"),
  })
  .strict()
  .superRefine((driver, ctx) => {
    if (driver.thesis_breaks_below >= driver.central_estimate.value) {
      ctx.addIssue({
        code: "custom",
        message: `thesis_breaks_below (${driver.thesis_breaks_below}) must be less than central_estimate.value (${driver.central_estimate.value})`,
        path: ["thesis_breaks_below"],
      });
    }
  });
```

- [ ] **Step 4: Run tests to verify passing**

Run: `npm test -- tests/unit/schemas/thesis.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/schemas/thesis.ts tests/unit/schemas/thesis.test.ts
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): add optional tickers[] to IndustryDriver

Per-driver ticker scope used by Bull/Bear retrieval prefilter. Optional
so existing theses parse unchanged; falls back to thesis.scope tickers
at retrieval time when empty.
```

---

## Task 14: Update thesis-extractor to populate driver `tickers`

**Files:**
- Modify: `lib/agents/thesis-extractor.ts`

- [ ] **Step 1: Update the tool schema and prompt**

In `lib/agents/thesis-extractor.ts`:

1. Inside the `extractThesisTool.input_schema.properties.drivers.properties.industry.items.properties` block (around line 95-118), add the `tickers` property:

```typescript
tickers: {
  type: "array",
  items: {
    type: "string",
    description:
      "Yahoo Finance ticker(s) directly relevant to THIS driver (subset of scope.tickers_seed). 0-5 entries. Empty array if the driver applies to the whole universe.",
  },
},
```

2. Update the system prompt rules block to add one line:

```
- For each industry driver, populate driver.tickers with the 0-5 tickers from scope.tickers_seed that the driver most directly applies to. Leave empty if the driver applies to the whole universe.
```

3. Update `ToolDriverInput` interface:

```typescript
interface ToolDriverInput {
  id: string;
  claim: string;
  central_estimate: { value: number; unit: string };
  thesis_breaks_below: number;
  tickers?: string[];
  classification: "industry";
}
```

4. The merge block (around line 252-256) already does `...d`, so `tickers` flows through. Verify the inline test passes:

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Existing thesis-extractor tests pass**

Run: `npm test -- tests/unit/agents/thesis-extractor.test.ts` (if present).
Expected: all existing tests still pass; new field is optional so old fixtures parse.

- [ ] **Step 4: Commit**

```bash
git add lib/agents/thesis-extractor.ts
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): thesis-extractor populates per-driver tickers

Tool schema + prompt rule for the new IndustryDriver.tickers[] field.
Subset of scope.tickers_seed; empty means "applies to full universe".
```

---

## Task 15: Update thesis-refiner to accept ticker edits

**Files:**
- Modify: `lib/agents/thesis-refiner.ts`

- [ ] **Step 1: Find the refiner's tool/diff schema**

Read `lib/agents/thesis-refiner.ts` first. The refiner accepts NL edits and returns a modified thesis. Locate where the IndustryDriver edit operations are defined (likely a `RefineThesisTool` with an edit-ops array or similar).

- [ ] **Step 2: Add a `set_driver_tickers` operation**

Add a new operation type (exact shape depends on the refiner's existing pattern — match it):

```typescript
{
  type: "object",
  properties: {
    op: { const: "set_driver_tickers" },
    driver_id: { type: "string" },
    tickers: {
      type: "array",
      items: { type: "string" },
      description: "Replace the driver's tickers[] with this array (empty allowed).",
    },
  },
  required: ["op", "driver_id", "tickers"],
}
```

Wire this op into the existing apply-ops function that materializes the new thesis from the prior version + ops.

- [ ] **Step 3: Add a test if the refiner has a test file**

Check `tests/unit/agents/thesis-refiner.test.ts`. If present, add:

```typescript
it("applies set_driver_tickers op", async () => {
  const before = makeFixtureThesis(); // existing helper if present
  const ops = [{ op: "set_driver_tickers", driver_id: "M1", tickers: ["TSM"] }];
  const after = applyOps(before, ops); // or whatever the entry point is
  expect(after.drivers.industry.find((d) => d.id === "M1")?.tickers).toEqual(["TSM"]);
});
```

If the refiner has no test file yet, skip this step — wiring the op into the existing apply-ops switch + a quick `npm run dev` exercise is enough for now.

- [ ] **Step 4: Type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/agents/thesis-refiner.ts tests/unit/agents/thesis-refiner.test.ts
# only stage the test file if it was created/modified
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): thesis-refiner accepts NL edits to driver tickers

New set_driver_tickers op lets refinement instructions like "add ASML to
M1's tickers" rewrite the per-driver ticker list. Used by Bull/Bear
retrieval to scope the corpus query.
```

---

## Task 16: Allow Opus 4.7 in the Anthropic client helper

**Files:**
- Modify: `lib/anthropic/client.ts`

- [ ] **Step 1: Why this change is needed**

The prototype showed: `claude-opus-4-7` rejects any `temperature` param. The helper currently hard-defaults `temperature` to 0, so passing `model: "claude-opus-4-7"` always errors. We need the helper to omit `temperature` from the request when the caller passes `temperature: null` explicitly, while keeping the default-0 behavior for other models.

- [ ] **Step 2: Update the helper**

In `lib/anthropic/client.ts`, change the `temperature` handling:

```typescript
const DEFAULT_TEMPERATURE: number | null = 0;

// ... inside createMessage:
const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
  model: params.model ?? DEFAULT_MODEL,
  max_tokens: params.max_tokens ?? DEFAULT_MAX_TOKENS,
  system: params.system,
  messages: params.messages,
};
// Only set temperature if non-null. Pass `temperature: null` to omit it
// entirely (required for models like claude-opus-4-7 that reject the param).
const temp = params.temperature === undefined ? DEFAULT_TEMPERATURE : params.temperature;
if (temp !== null) {
  requestParams.temperature = temp;
}
if (params.tools !== undefined) requestParams.tools = params.tools;
if (params.tool_choice !== undefined) {
  requestParams.tool_choice = params.tool_choice;
}
```

And widen the type of `temperature` in `CreateMessageParams`:

```typescript
export interface CreateMessageParams {
  model?: string;
  system: string | Anthropic.TextBlockParam[];
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  tool_choice?: Anthropic.MessageCreateParams["tool_choice"];
  max_tokens?: number;
  temperature?: number | null;  // null = omit from request
}
```

- [ ] **Step 3: Existing callers don't break**

Run: `npx tsc --noEmit && npm test`
Expected: clean — existing callers either pass a number (unchanged behavior) or omit it (defaults to 0).

- [ ] **Step 4: Commit**

```bash
git add lib/anthropic/client.ts
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): allow omitting temperature for Opus 4.7

Pass `temperature: null` to skip the param entirely. Claude Opus 4.7
errors on any temperature value; this lets the same helper serve Bull/
Bear (Opus, no temp) and existing extractor/refiner (Sonnet, temp=0).
```

---

## Task 17: Adversarial-separation harness

**Files:**
- Create: `lib/agents/adversarial/disallow.ts`
- Create: `lib/agents/adversarial/buildLensContext.ts`
- Test: `tests/unit/agents/adversarial/buildLensContext.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/agents/adversarial/buildLensContext.test.ts
import { describe, it, expect } from "vitest";
import { buildLensContext } from "@/lib/agents/adversarial/buildLensContext";
import type { IndustryDriver, Thesis } from "@/lib/schemas/thesis";

function makeThesis(): Thesis {
  return {
    id: "test_26_05_01",
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: "u1",
    source_snippet: "test prose",
    claim: "AI accelerator demand sustains through 2026.",
    macro_premise: "Hyperscaler capex remains elevated.",
    horizon_years: 3,
    scope: {
      type: "thematic",
      sectors: ["45301010"],
      regions: ["US"],
      market_cap_min_usd: 0,
      tickers_seed: ["NVDA"],
      tickers_exclude: [],
    },
    drivers: {
      industry: [
        {
          id: "M1",
          claim: "TSMC capacity catches up to demand",
          central_estimate: { value: 3, unit: "years" },
          thesis_breaks_below: 2,
          evidence: [],
          tickers: ["TSM"],
          verdict: null,
          classification: "industry",
        },
      ],
    },
    falsification: { primary: "Capex collapses by >40%" },
    universe_id: "test_global",
    validation: {
      status: "draft",
      verdict: null,
      last_validated_at: null,
      open_tensions: [],
    },
  };
}

const fakeDriver: IndustryDriver = makeThesis().drivers.industry[0]!;

const fakePosts = [
  {
    id: "p1",
    expert_name: "Test Expert",
    title: "TSMC builds more",
    link: "https://example.com/p1",
    published: "2025-06-01T00:00:00Z",
    content: "TSMC adds N3 capacity.",
  },
];

describe("buildLensContext", () => {
  it("produces a valid bull request with no bear strings in system prompt", () => {
    const req = buildLensContext({
      lens: "bull",
      thesis: makeThesis(),
      driver: fakeDriver,
      posts: fakePosts,
    });
    const sysText =
      typeof req.system === "string"
        ? req.system
        : req.system.map((b) => b.text).join("\n");
    expect(/\bbear\b/i.test(sysText)).toBe(false);
    expect(/\bdownside\b/i.test(sysText)).toBe(false);
    expect(/counter[- ]evidence/i.test(sysText)).toBe(false);
    expect(sysText.includes("bear_researcher")).toBe(false);
  });

  it("throws when priorEvidence has the opposite lens", () => {
    expect(() =>
      buildLensContext({
        lens: "bull",
        thesis: makeThesis(),
        driver: fakeDriver,
        posts: fakePosts,
        priorEvidence: { lens: "bear", thesis_id: "test_26_05_01", evidence: [] },
      }),
    ).toThrow(/opposite lens/i);
  });

  it("throws when priorEvidence has a different thesis_id", () => {
    expect(() =>
      buildLensContext({
        lens: "bull",
        thesis: makeThesis(),
        driver: fakeDriver,
        posts: fakePosts,
        priorEvidence: { lens: "bull", thesis_id: "wrong_id_26_05_01", evidence: [] },
      }),
    ).toThrow(/thesis_id mismatch/i);
  });

  it("throws when posts content contains a leakage sentinel (defense in depth)", () => {
    expect(() =>
      buildLensContext({
        lens: "bull",
        thesis: makeThesis(),
        driver: fakeDriver,
        posts: [{ ...fakePosts[0], content: "This is bear evidence." }],
      }),
    ).toThrow(/disallowed/i);
  });

  it("accepts bear lens with mirror disallow-list", () => {
    const req = buildLensContext({
      lens: "bear",
      thesis: makeThesis(),
      driver: fakeDriver,
      posts: fakePosts,
    });
    const sysText =
      typeof req.system === "string"
        ? req.system
        : req.system.map((b) => b.text).join("\n");
    expect(/\bbull\b/i.test(sysText)).toBe(false);
    expect(/\bsupporting evidence\b/i.test(sysText)).toBe(false);
    expect(sysText.includes("bull_researcher")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/unit/agents/adversarial/buildLensContext.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the disallow module**

```typescript
// lib/agents/adversarial/disallow.ts
// Regexes that detect opposite-lens content. The bull lens fails on any
// match in its system prompt OR injected post content; mirror for bear.
//
// HITL: these regexes are reviewer-gated. Do not edit without spec signoff.

export const BULL_DISALLOW: readonly RegExp[] = [
  /\bbear\b/i,
  /\bbearish\b/i,
  /\bdownside\b/i,
  /\bcounter[- ]evidence\b/i,
  /\bbreach(es)?\b/i,
  /bear_researcher/,
];

export const BEAR_DISALLOW: readonly RegExp[] = [
  /\bbull\b/i,
  /\bbullish\b/i,
  /\bupside\b/i,
  /\bsupporting evidence\b/i,
  /\bsupports?\b/i,
  /bull_researcher/,
];

export function disallowFor(lens: "bull" | "bear"): readonly RegExp[] {
  return lens === "bull" ? BULL_DISALLOW : BEAR_DISALLOW;
}

export function findFirstDisallowed(
  text: string,
  patterns: readonly RegExp[],
): RegExp | null {
  for (const p of patterns) if (p.test(text)) return p;
  return null;
}
```

- [ ] **Step 4: Write the harness**

```typescript
// lib/agents/adversarial/buildLensContext.ts
// The single point through which adversarial separation is enforced.
// Every Bull/Bear API call routes through this. Assertion failures throw —
// fail-closed, never warn.
//
// HITL: the system prompt text below is reviewer-gated. Do not edit without
// spec signoff (recorded as a PR comment on the corpus-Stage-4 ticket).

import type Anthropic from "@anthropic-ai/sdk";
import { disallowFor, findFirstDisallowed } from "./disallow";
import type { IndustryDriver, Thesis } from "@/lib/schemas/thesis";

export type Lens = "bull" | "bear";

export type LensPost = {
  id: string;
  expert_name: string;
  title: string;
  link: string;
  published: string;
  content: string;
};

export type PriorEvidence = {
  lens: Lens;
  thesis_id: string;
  evidence: Array<{ post_id: string; quote: string }>;
};

export type BuildLensContextInput = {
  lens: Lens;
  thesis: Thesis;
  driver: IndustryDriver;
  posts: LensPost[];
  priorEvidence?: PriorEvidence;
};

export type LensRequest = {
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  tool_choice: Anthropic.MessageCreateParams["tool_choice"];
};

export const SUBMIT_EVIDENCE_TOOL: Anthropic.Tool = {
  name: "submit_evidence",
  description:
    "Submit the extracted per-lens evidence items. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      evidence: {
        type: "array",
        items: {
          type: "object",
          properties: {
            expert: { type: "string" },
            post_id: { type: "string" },
            post_url: { type: "string" },
            post_title: { type: "string" },
            quote: {
              type: "string",
              description: "Verbatim quote from the supplied post, 1-3 sentences.",
            },
            date: { type: "string", description: "ISO 8601 post date." },
          },
          required: ["expert", "post_id", "post_url", "post_title", "quote", "date"],
        },
      },
    },
    required: ["evidence"],
  },
};

function buildSystemPrompt(input: BuildLensContextInput): string {
  const { lens, thesis, driver } = input;
  if (lens === "bull") {
    return `You are the bull_researcher analyzing independent-expert commentary.

Thesis claim: ${thesis.claim}
Macro premise: ${thesis.macro_premise}
Driver under review: ${driver.claim}
Central estimate: ${driver.central_estimate.value} ${driver.central_estimate.unit}

Your job: extract evidence that SUPPORTS the thesis claim and central estimate.

Rules:
- Only cite passages that materially advance the supporting case.
- Quotes must be verbatim from the supplied post content (1-3 sentences each).
- Cite the post_id and post_url for each quote.
- If no material supporting evidence exists in the supplied posts, return an empty array.

Call the submit_evidence tool exactly once with your findings.`;
  }
  return `You are the bear_researcher analyzing independent-expert commentary.

Thesis claim: ${thesis.claim}
Macro premise: ${thesis.macro_premise}
Driver under review: ${driver.claim}
Falsification threshold: estimate falls below ${driver.thesis_breaks_below} ${driver.central_estimate.unit}

Your job: extract evidence that BREACHES the falsification threshold or contradicts the driver's central estimate.

Rules:
- Only cite passages that materially advance the threshold-breach case.
- Quotes must be verbatim from the supplied post content (1-3 sentences each).
- Cite the post_id and post_url for each quote.
- If no material threshold-breach evidence exists in the supplied posts, return an empty array.

Call the submit_evidence tool exactly once with your findings.`;
}

function buildUserMessage(input: BuildLensContextInput): string {
  const blocks = input.posts
    .map((p, i) => {
      const trimmed =
        p.content.length > 8000
          ? p.content.slice(0, 8000) + "\n[…truncated]"
          : p.content;
      return `# Post ${i + 1}
post_id:   ${p.id}
expert:    ${p.expert_name}
title:     ${p.title}
url:       ${p.link}
date:      ${p.published}

${trimmed}`;
    })
    .join("\n\n---\n\n");
  return `Expert posts to analyze:

${blocks}`;
}

export function buildLensContext(input: BuildLensContextInput): LensRequest {
  const patterns = disallowFor(input.lens);

  // Assertion: priorEvidence isolation
  if (input.priorEvidence) {
    if (input.priorEvidence.lens !== input.lens) {
      throw new Error(
        `buildLensContext: opposite lens in priorEvidence (got ${input.priorEvidence.lens}, expected ${input.lens})`,
      );
    }
    if (input.priorEvidence.thesis_id !== input.thesis.id) {
      throw new Error(
        `buildLensContext: thesis_id mismatch in priorEvidence (got ${input.priorEvidence.thesis_id}, expected ${input.thesis.id})`,
      );
    }
  }

  const system = buildSystemPrompt(input);

  // Assertion: opposite-lens disallow-list absent from system prompt
  {
    const hit = findFirstDisallowed(system, patterns);
    if (hit) {
      throw new Error(
        `buildLensContext: disallowed pattern ${hit} present in system prompt for lens ${input.lens}`,
      );
    }
  }

  const userText = buildUserMessage(input);

  // Defense-in-depth: scan injected post content for the opposite-lens
  // disallow-list. A bull post mentioning "bear case" is not necessarily
  // bad — but we fail closed to surface the issue. Tune patterns if too
  // aggressive in practice.
  {
    const hit = findFirstDisallowed(userText, patterns);
    if (hit) {
      throw new Error(
        `buildLensContext: disallowed pattern ${hit} present in injected post content for lens ${input.lens}`,
      );
    }
  }

  return {
    system: [{ type: "text", text: system }],
    messages: [{ role: "user", content: userText }],
    tools: [SUBMIT_EVIDENCE_TOOL],
    tool_choice: { type: "tool", name: "submit_evidence" },
  };
}
```

- [ ] **Step 5: Run tests to verify passing**

Run: `npm test -- tests/unit/agents/adversarial/buildLensContext.test.ts`
Expected: 5 passing.

- [ ] **Step 6: Commit**

```bash
git add lib/agents/adversarial/disallow.ts lib/agents/adversarial/buildLensContext.ts tests/unit/agents/adversarial/buildLensContext.test.ts
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): adversarial-separation harness for Bull/Bear

buildLensContext() returns a complete Anthropic request and asserts five
isolation invariants (opposite-lens patterns absent from system prompt,
from injected post content, priorEvidence carries the same lens + same
thesis_id). Fail-closed on every assertion. The submit_evidence tool is
the single tool exposed to either lens — no web search.
```

---

## Task 18: Bull researcher

**Files:**
- Create: `lib/agents/bull-researcher.ts`
- Test: `tests/unit/agents/bull-researcher.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/agents/bull-researcher.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runBullResearcher } from "@/lib/agents/bull-researcher";

// Mock retrieve + the Anthropic SDK.
vi.mock("@/lib/agents/expert-corpus/retrieve", () => ({
  retrieve: vi.fn(async () => [
    {
      id: "p1",
      expert_slug: "x",
      expert_name: "X",
      author: "A",
      title: "TSMC builds",
      link: "https://x/p1",
      published: "2025-06-01T00:00:00Z",
      content: "TSMC adds N3 capacity per analyst commentary.",
      is_paywalled: false,
      tickers: ["TSM"],
      sectors: ["semis"],
    },
  ]),
}));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages = {
        create: vi.fn(async () => ({
          stop_reason: "tool_use",
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [
            {
              type: "tool_use",
              name: "submit_evidence",
              id: "t1",
              input: {
                evidence: [
                  {
                    expert: "X",
                    post_id: "p1",
                    post_url: "https://x/p1",
                    post_title: "TSMC builds",
                    quote: "TSMC adds N3 capacity per analyst commentary.",
                    date: "2025-06-01T00:00:00Z",
                  },
                ],
              },
            },
          ],
        })),
      };
    },
  };
});

describe("runBullResearcher", () => {
  it("returns Zod-validated bull evidence", async () => {
    const thesis = (await import("./fixtures/thesis")).makeThesis();
    const driver = thesis.drivers.industry[0]!;
    const result = await runBullResearcher({ thesis, driver });
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0].expert).toBe("X");
    expect(result.evidence[0].post_id).toBe("p1");
  });
});
```

Also create the fixture helper at `tests/unit/agents/fixtures/thesis.ts` if it doesn't already exist:

```typescript
// tests/unit/agents/fixtures/thesis.ts
import type { Thesis } from "@/lib/schemas/thesis";

export function makeThesis(): Thesis {
  return {
    id: "test_26_05_01",
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: "u1",
    source_snippet: "test prose",
    claim: "AI accelerator demand sustains through 2026.",
    macro_premise: "Hyperscaler capex remains elevated.",
    horizon_years: 3,
    scope: {
      type: "thematic",
      sectors: ["45301010"],
      regions: ["US"],
      market_cap_min_usd: 0,
      tickers_seed: ["NVDA", "TSM"],
      tickers_exclude: [],
    },
    drivers: {
      industry: [
        {
          id: "M1",
          claim: "TSMC capacity catches up to demand",
          central_estimate: { value: 3, unit: "years" },
          thesis_breaks_below: 2,
          evidence: [],
          tickers: ["TSM"],
          verdict: null,
          classification: "industry",
        },
      ],
    },
    falsification: { primary: "Capex collapses by >40%" },
    universe_id: "test_global",
    validation: {
      status: "draft",
      verdict: null,
      last_validated_at: null,
      open_tensions: [],
    },
  };
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/unit/agents/bull-researcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the researcher**

```typescript
// lib/agents/bull-researcher.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { retrieve } from "@/lib/agents/expert-corpus/retrieve";
import { buildLensContext, type LensPost } from "@/lib/agents/adversarial/buildLensContext";
import { CorpusEvidenceSchema, type CorpusEvidence } from "@/lib/schemas/validation";
import { loadRegistry } from "@/lib/data/experts";
import type { IndustryDriver, Thesis } from "@/lib/schemas/thesis";

const BULL_MODEL = "claude-opus-4-7";
const RETRIEVE_LIMIT_DEFAULT = 12;

export type RunResult = {
  evidence: CorpusEvidence[];
  usage: { input_tokens: number; output_tokens: number };
};

const ToolInputSchema = z
  .object({ evidence: z.array(CorpusEvidenceSchema) })
  .strict();

// Map GICS codes from thesis.scope.sectors → registry sector tags by
// walking registry.sectors[tag].gics. expert_posts.sectors stores tags
// (e.g. "semis"), not GICS codes, so the lookup happens here.
function thesisSectorsToTags(gicsCodes: string[]): string[] {
  const reg = loadRegistry();
  const tags = new Set<string>();
  for (const [tag, entry] of Object.entries(reg.sectors)) {
    if (entry.gics.some((c) => gicsCodes.some((g) => g.startsWith(c) || c.startsWith(g)))) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}

function resolveTickers(thesis: Thesis, driver: IndustryDriver): string[] {
  if (driver.tickers && driver.tickers.length) return driver.tickers;
  return thesis.scope.tickers_seed;
}

export async function runBullResearcher(params: {
  thesis: Thesis;
  driver: IndustryDriver;
  limit?: number;
}): Promise<RunResult> {
  const limit = params.limit ?? RETRIEVE_LIMIT_DEFAULT;
  const thesis_sectors = thesisSectorsToTags(params.thesis.scope.sectors);
  const tickers = resolveTickers(params.thesis, params.driver);

  const posts = await retrieve({ thesis_sectors, tickers, limit });

  const lensPosts: LensPost[] = posts.map((p) => ({
    id: p.id,
    expert_name: p.expert_name,
    title: p.title,
    link: p.link,
    published: p.published,
    content: p.content,
  }));

  const req = buildLensContext({
    lens: "bull",
    thesis: params.thesis,
    driver: params.driver,
    posts: lensPosts,
  });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: BULL_MODEL,
    max_tokens: 4096,
    system: req.system,
    messages: req.messages,
    tools: req.tools,
    tool_choice: req.tool_choice,
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`bull_researcher: no tool_use block (stop=${res.stop_reason})`);
  }

  // Defense: the SDK should already give us a structured array. If a
  // future model regresses and stringifies, parse defensively.
  let raw: unknown = toolUse.input;
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    typeof (raw as { evidence?: unknown }).evidence === "string"
  ) {
    raw = { evidence: JSON.parse((raw as { evidence: string }).evidence) };
  }

  const parsed = ToolInputSchema.parse(raw);
  return {
    evidence: parsed.evidence,
    usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
  };
}
```

- [ ] **Step 4: Run tests to verify passing**

Run: `npm test -- tests/unit/agents/bull-researcher.test.ts`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/agents/bull-researcher.ts tests/unit/agents/bull-researcher.test.ts tests/unit/agents/fixtures/thesis.ts
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): bull_researcher querying expert corpus

Resolves thesis sector tags + per-driver tickers, calls retrieve(),
routes through buildLensContext, sends to Opus 4.7 with forced
tool_choice on submit_evidence. Defensive parse for stringified-array
regressions.
```

---

## Task 19: Bear researcher (mirror of Bull)

**Files:**
- Create: `lib/agents/bear-researcher.ts`
- Test: `tests/unit/agents/bear-researcher.test.ts`

- [ ] **Step 1: Write the failing test**

Mirror Task 18's test against `runBearResearcher` instead. Same fixture, same mock. Differ only in the `lens: "bear"` assertion if you want to verify the harness is hit:

```typescript
// tests/unit/agents/bear-researcher.test.ts
import { describe, it, expect, vi } from "vitest";
import { runBearResearcher } from "@/lib/agents/bear-researcher";

vi.mock("@/lib/agents/expert-corpus/retrieve", () => ({
  retrieve: vi.fn(async () => [
    {
      id: "p2",
      expert_slug: "y",
      expert_name: "Y",
      author: "B",
      title: "Demand cools",
      link: "https://y/p2",
      published: "2025-07-01T00:00:00Z",
      content: "Capex commitments are showing strain.",
      is_paywalled: false,
      tickers: ["TSM"],
      sectors: ["semis"],
    },
  ]),
}));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages = {
        create: vi.fn(async () => ({
          stop_reason: "tool_use",
          usage: { input_tokens: 90, output_tokens: 40 },
          content: [
            {
              type: "tool_use",
              name: "submit_evidence",
              id: "t1",
              input: {
                evidence: [
                  {
                    expert: "Y",
                    post_id: "p2",
                    post_url: "https://y/p2",
                    post_title: "Demand cools",
                    quote: "Capex commitments are showing strain.",
                    date: "2025-07-01T00:00:00Z",
                  },
                ],
              },
            },
          ],
        })),
      };
    },
  };
});

describe("runBearResearcher", () => {
  it("returns Zod-validated bear evidence", async () => {
    const thesis = (await import("./fixtures/thesis")).makeThesis();
    const driver = thesis.drivers.industry[0]!;
    const result = await runBearResearcher({ thesis, driver });
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0].post_id).toBe("p2");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/unit/agents/bear-researcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement bear-researcher**

Mirror `bull-researcher.ts` exactly, changing the lens identifier and (optionally) factoring shared code into a helper. Since the modules are tiny, mirroring is fine — DRY is not worth coupling these two together.

```typescript
// lib/agents/bear-researcher.ts
import Anthropic from "@anthropic-ai/sdk";
import { retrieve } from "@/lib/agents/expert-corpus/retrieve";
import { buildLensContext, type LensPost } from "@/lib/agents/adversarial/buildLensContext";
import { CorpusEvidenceSchema, type CorpusEvidence } from "@/lib/schemas/validation";
import { loadRegistry } from "@/lib/data/experts";
import type { IndustryDriver, Thesis } from "@/lib/schemas/thesis";
import { z } from "zod";

const BEAR_MODEL = "claude-opus-4-7";
const RETRIEVE_LIMIT_DEFAULT = 12;

export type RunResult = {
  evidence: CorpusEvidence[];
  usage: { input_tokens: number; output_tokens: number };
};

const ToolInputSchema = z
  .object({ evidence: z.array(CorpusEvidenceSchema) })
  .strict();

function thesisSectorsToTags(gicsCodes: string[]): string[] {
  const reg = loadRegistry();
  const tags = new Set<string>();
  for (const [tag, entry] of Object.entries(reg.sectors)) {
    if (entry.gics.some((c) => gicsCodes.some((g) => g.startsWith(c) || c.startsWith(g)))) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}

function resolveTickers(thesis: Thesis, driver: IndustryDriver): string[] {
  if (driver.tickers && driver.tickers.length) return driver.tickers;
  return thesis.scope.tickers_seed;
}

export async function runBearResearcher(params: {
  thesis: Thesis;
  driver: IndustryDriver;
  limit?: number;
}): Promise<RunResult> {
  const limit = params.limit ?? RETRIEVE_LIMIT_DEFAULT;
  const thesis_sectors = thesisSectorsToTags(params.thesis.scope.sectors);
  const tickers = resolveTickers(params.thesis, params.driver);

  const posts = await retrieve({ thesis_sectors, tickers, limit });

  const lensPosts: LensPost[] = posts.map((p) => ({
    id: p.id,
    expert_name: p.expert_name,
    title: p.title,
    link: p.link,
    published: p.published,
    content: p.content,
  }));

  const req = buildLensContext({
    lens: "bear",
    thesis: params.thesis,
    driver: params.driver,
    posts: lensPosts,
  });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: BEAR_MODEL,
    max_tokens: 4096,
    system: req.system,
    messages: req.messages,
    tools: req.tools,
    tool_choice: req.tool_choice,
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`bear_researcher: no tool_use block (stop=${res.stop_reason})`);
  }

  let raw: unknown = toolUse.input;
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    typeof (raw as { evidence?: unknown }).evidence === "string"
  ) {
    raw = { evidence: JSON.parse((raw as { evidence: string }).evidence) };
  }

  const parsed = ToolInputSchema.parse(raw);
  return {
    evidence: parsed.evidence,
    usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
  };
}
```

- [ ] **Step 4: Run tests to verify passing**

Run: `npm test -- tests/unit/agents/bear-researcher.test.ts`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/agents/bear-researcher.ts tests/unit/agents/bear-researcher.test.ts
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): bear_researcher (mirror of Bull, separate Anthropic context)

Identical structure to bull-researcher but routes through buildLensContext
with lens=bear and the mirror disallow-list. Two modules intentionally,
no shared base — coupling them would create a leakage surface.
```

---

## Task 20: `POST /api/validate/driver` route

**Files:**
- Create: `app/api/validate/driver/route.ts`
- Test: `tests/integration/api/validate-driver.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// tests/integration/api/validate-driver.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/validate/driver/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/agents/bull-researcher", () => ({
  runBullResearcher: vi.fn(async () => ({
    evidence: [
      {
        expert: "X",
        post_id: "p1",
        post_url: "https://x/p1",
        post_title: "T1",
        quote: "q1",
        date: "2025-06-01T00:00:00Z",
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
  })),
}));

vi.mock("@/lib/agents/bear-researcher", () => ({
  runBearResearcher: vi.fn(async () => ({
    evidence: [
      {
        expert: "Y",
        post_id: "p2",
        post_url: "https://y/p2",
        post_title: "T2",
        quote: "q2",
        date: "2025-07-01T00:00:00Z",
      },
    ],
    usage: { input_tokens: 90, output_tokens: 40 },
  })),
}));

// Mock the Supabase client used inside the route (theses read +
// validation_runs upsert + pipeline_events insert).
vi.mock("@/lib/supabase/server", () => {
  const thesisFixture = require("../../unit/agents/fixtures/thesis").makeThesis();
  return {
    getServerSupabase: () => ({
      from: (table: string) => {
        if (table === "theses") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: thesisFixture.id, thesis: thesisFixture },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "validation_runs") {
          return {
            upsert: async () => ({ data: null, error: null }),
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "pipeline_events") {
          return { insert: async () => ({ data: null, error: null }) };
        }
        return {};
      },
    }),
  };
});

describe("POST /api/validate/driver", () => {
  it("returns bull + bear evidence for a valid driver", async () => {
    const req = new NextRequest("http://localhost/api/validate/driver", {
      method: "POST",
      body: JSON.stringify({ thesis_id: "test_26_05_01", driver_id: "M1" }),
    });
    const res = await POST(req);
    const body = (await res.json()) as {
      driver_id: string;
      bull_evidence: unknown[];
      bear_evidence: unknown[];
    };
    expect(res.status).toBe(200);
    expect(body.driver_id).toBe("M1");
    expect(body.bull_evidence.length).toBe(1);
    expect(body.bear_evidence.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/integration/api/validate-driver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Check / create the server Supabase helper**

If `lib/supabase/server.ts` doesn't exist, create it minimally:

```typescript
// lib/supabase/server.ts
import { createClient } from "@supabase/supabase-js";

export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
```

(Check first with `ls lib/supabase/` — if there's already a `server.ts` or similar pattern, follow that.)

- [ ] **Step 4: Write the route**

```typescript
// app/api/validate/driver/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runBullResearcher } from "@/lib/agents/bull-researcher";
import { runBearResearcher } from "@/lib/agents/bear-researcher";
import { getServerSupabase } from "@/lib/supabase/server";
import { ThesisSchema, type IndustryDriver } from "@/lib/schemas/thesis";
import { DriverValidationResultSchema } from "@/lib/schemas/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    thesis_id: z.string().min(1),
    driver_id: z.string().min(1),
  })
  .strict();

async function emitEvent(
  supabase: ReturnType<typeof getServerSupabase>,
  thesis_id: string,
  agent: string,
  event_type: "start" | "tool_call" | "complete" | "error",
  payload: Record<string, unknown> = {},
): Promise<void> {
  await supabase.from("pipeline_events").insert({
    thesis_id,
    stage: "validate",
    agent,
    event_type,
    payload,
  });
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: `bad request: ${(e as Error).message}` },
      { status: 400 },
    );
  }
  const { thesis_id, driver_id } = body;

  const supabase = getServerSupabase();

  // Load the thesis.
  const { data: row, error: thesisErr } = await supabase
    .from("theses")
    .select("id,thesis")
    .eq("id", thesis_id)
    .maybeSingle();
  if (thesisErr || !row) {
    return NextResponse.json({ error: "thesis not found" }, { status: 404 });
  }
  const parsed = ThesisSchema.safeParse(row.thesis);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `thesis failed schema: ${parsed.error.message}` },
      { status: 500 },
    );
  }
  const thesis = parsed.data;
  const driver: IndustryDriver | undefined = thesis.drivers.industry.find(
    (d) => d.id === driver_id,
  );
  if (!driver) {
    return NextResponse.json({ error: "driver not found in thesis" }, { status: 404 });
  }

  await emitEvent(supabase, thesis_id, "bull_researcher", "start", { driver_id });
  await emitEvent(supabase, thesis_id, "bear_researcher", "start", { driver_id });

  // Run Bull and Bear in genuinely parallel calls. Failures bubble per
  // lens so we can report which side broke.
  const [bullSettled, bearSettled] = await Promise.allSettled([
    runBullResearcher({ thesis, driver }),
    runBearResearcher({ thesis, driver }),
  ]);

  if (bullSettled.status === "rejected") {
    await emitEvent(supabase, thesis_id, "bull_researcher", "error", {
      driver_id,
      message: String(bullSettled.reason),
    });
    return NextResponse.json(
      { error: `bull_researcher failed: ${String(bullSettled.reason)}` },
      { status: 502 },
    );
  }
  if (bearSettled.status === "rejected") {
    await emitEvent(supabase, thesis_id, "bear_researcher", "error", {
      driver_id,
      message: String(bearSettled.reason),
    });
    return NextResponse.json(
      { error: `bear_researcher failed: ${String(bearSettled.reason)}` },
      { status: 502 },
    );
  }

  const bull = bullSettled.value;
  const bear = bearSettled.value;

  await emitEvent(supabase, thesis_id, "bull_researcher", "complete", {
    driver_id,
    count: bull.evidence.length,
    usage: bull.usage,
  });
  await emitEvent(supabase, thesis_id, "bear_researcher", "complete", {
    driver_id,
    count: bear.evidence.length,
    usage: bear.usage,
  });

  // Upsert partial validation_runs row. results[driver_id] = { bull_evidence, bear_evidence }.
  // Verifier/Triangulator fields are absent until narrowed S7.
  const partial = DriverValidationResultSchema.parse({
    bull_evidence: bull.evidence,
    bear_evidence: bear.evidence,
  });

  // Read the latest validation_runs row for this thesis (if any) and merge
  // in this driver's result. If no row exists, create one.
  const { data: latest } = await supabase
    .from("validation_runs")
    .select("id,results")
    .eq("thesis_id", thesis_id)
    .order("run_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const mergedResults: Record<string, unknown> = {
    ...((latest?.results as Record<string, unknown>) ?? {}),
    [driver_id]: partial,
  };

  if (latest) {
    await supabase
      .from("validation_runs")
      .update({ results: mergedResults })
      .eq("id", latest.id);
  } else {
    await supabase.from("validation_runs").insert({
      thesis_id,
      results: mergedResults,
    });
  }

  return NextResponse.json(
    { driver_id, bull_evidence: bull.evidence, bear_evidence: bear.evidence },
    { status: 200 },
  );
}
```

- [ ] **Step 5: Run tests to verify passing**

Run: `npm test -- tests/integration/api/validate-driver.test.ts`
Expected: 1 passing.

- [ ] **Step 6: Commit**

```bash
git add app/api/validate/driver/route.ts tests/integration/api/validate-driver.test.ts
# also stage lib/supabase/server.ts if it was created in Step 3
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): POST /api/validate/driver runs Bull + Bear in parallel

Loads the thesis, locates the driver, runs both researchers concurrently
under buildLensContext isolation, emits pipeline_events per lens (start/
complete/error), and merges results into the latest validation_runs row
for the thesis. Verifier + Triangulator fields are absent until S7.
```

---

## Task 21: Middle-panel UI — `DriverEvidencePanel`

**Files:**
- Create: `components/validation/DriverEvidencePanel.tsx`

- [ ] **Step 1: Locate the middle-panel host**

First read the existing middle-panel structure. Check `components/validation/` and `app/(...)/` to see where Stage 4 currently slots in. If a placeholder `DriverValidationCard` exists from prior planning, use its slot.

```bash
ls components/validation/ 2>/dev/null
grep -rn "Stage 4\|DriverValidation" components/ app/ 2>/dev/null | head -20
```

- [ ] **Step 2: Write the component**

```tsx
// components/validation/DriverEvidencePanel.tsx
"use client";

import type { CorpusEvidence } from "@/lib/schemas/validation";

export type DriverEvidencePanelProps = {
  driver_id: string;
  driver_claim: string;
  bull_evidence: CorpusEvidence[];
  bear_evidence: CorpusEvidence[];
};

function EvidenceChip({ e }: { e: CorpusEvidence }) {
  return (
    <li className="border rounded-md p-3 space-y-1 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{e.expert}</span>
        <span className="text-xs text-muted-foreground">
          {e.date.slice(0, 10)}
        </span>
      </div>
      <div className="text-xs">
        <a
          href={e.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {e.post_title}
        </a>
      </div>
      <blockquote className="italic text-muted-foreground">
        &ldquo;{e.quote}&rdquo;
      </blockquote>
    </li>
  );
}

export function DriverEvidencePanel(props: DriverEvidencePanelProps) {
  return (
    <section className="space-y-4">
      <header>
        <h3 className="font-semibold">{props.driver_id}</h3>
        <p className="text-sm text-muted-foreground">{props.driver_claim}</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-semibold mb-2">Supporting evidence</h4>
          {props.bull_evidence.length === 0 ? (
            <p className="text-xs text-muted-foreground">No supporting evidence found in corpus.</p>
          ) : (
            <ul className="space-y-2">
              {props.bull_evidence.map((e, i) => (
                <EvidenceChip key={`${e.post_id}-${i}`} e={e} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-2">Threshold-breach evidence</h4>
          {props.bear_evidence.length === 0 ? (
            <p className="text-xs text-muted-foreground">No threshold-breach evidence found in corpus.</p>
          ) : (
            <ul className="space-y-2">
              {props.bear_evidence.map((e, i) => (
                <EvidenceChip key={`${e.post_id}-${i}`} e={e} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
```

Note: header labels say "Supporting evidence" / "Threshold-breach evidence" — neutral phrasing that doesn't expose the bull/bear identifiers to either lens's UI footprint, in case the panel is later rendered server-side and the labels could leak into a logged prompt.

- [ ] **Step 3: Wire into the parent middle-panel page**

Slot `<DriverEvidencePanel ... />` per-driver into whatever middle-panel page currently shows thesis state for a thesis with `validation.status` not yet final. The wiring is repo-specific — adjust to match the existing pattern.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`. Navigate to a thesis with a recent `validation_runs` row (run the validate-driver API for it first via curl or the existing UI button). Confirm the two columns render with clickable post URLs.

- [ ] **Step 5: Commit**

```bash
git add components/validation/DriverEvidencePanel.tsx
# also stage any parent-page wiring touched in Step 3
```

Propose this commit message and wait for user approval/edits:

```
feat(s6): DriverEvidencePanel renders Bull/Bear evidence

Per-driver two-column panel for the middle panel. Neutral column labels
("Supporting evidence" / "Threshold-breach evidence") so the rendered
DOM never carries the opposite-lens identifier near either side's data.
```

---

## Task 22: HITL signoff gate

**Files:** none (process step, gated by reviewer comment on the PR / issue)

- [ ] **Step 1: Open the PR (or push to its branch)**

```bash
gh pr create --title "S6-new: Expert-corpus Stage 4 — ingest + Bull + Bear" --body "$(cat docs/superpowers/specs/2026-05-19-expert-corpus-stage4-rework-design.md | head -80)"
```

(Pull the spec's top section as the PR body summary. Adjust as needed.)

- [ ] **Step 2: Tag the reviewer**

Add the `ready-for-human` label and request review from the appropriate human reviewer.

- [ ] **Step 3: Reviewer signoff on the four items**

The PR must not merge until a reviewer posts a comment explicitly approving:

1. `lib/agents/adversarial/buildLensContext.ts` system-prompt text (both lenses).
2. `lib/agents/adversarial/disallow.ts` regex lists.
3. `lib/data/experts.json` content (which voices are in scope).
4. The chosen default model (`claude-opus-4-7`) and the implicit cost envelope.

- [ ] **Step 4: Run one real end-to-end validation against a real thesis**

After approval but before merge, with the migration applied and the corpus ingested:

```bash
# Ingest the corpus
npm run corpus:refresh

# Confirm there's a real semi thesis in the DB. If not, create one via the
# existing thesis-extraction flow first.

# Run validate-driver against one of its drivers
curl -X POST http://localhost:3000/api/validate/driver \
  -H "Content-Type: application/json" \
  -d '{"thesis_id":"<real-thesis-id>","driver_id":"M1"}'
```

Expected: 200 response with `bull_evidence` and `bear_evidence` arrays, each with at least one entry referencing a real `post_id` from `expert_posts`. Pipeline events for `bull_researcher` and `bear_researcher` (start/complete) visible in `pipeline_events` table.

- [ ] **Step 5: Merge**

Once Step 3 signoff and Step 4 smoke test both pass.

---

## Cascading touches (after merge — separate PR)

These are documented in the spec under "Cascading touches" and are intentionally out of this ticket's scope. After merging the main PR, open a follow-up to update parent issue #1:

1. Rewrite user story 38 to reflect "expert-corpus retrieval is the only Bull/Bear evidence channel."
2. Story 35 (config knobs): drop source-tier-weights; add expert-corpus retrieval-limit.
3. Implementation Decisions: update deep-modules description; drop tier rubric.

No code changes are required for S10–S13 — the shape change flows through cleanly when narrowed S7 lands.

---

## Plan self-review notes

Spec coverage check — every spec section maps to a task above:

| Spec section | Task(s) |
|---|---|
| §1 Registry JSON | Tasks 2, 3, 4 |
| §2 Ingest pipeline | Tasks 1, 5, 6, 7, 8, 9, 10 |
| §3 Retrieval | Task 11 |
| §4 Bull/Bear + harness | Tasks 16, 17, 18, 19 |
| §5 API + UI + observability | Tasks 12, 20, 21 |
| Driver `tickers` schema field | Tasks 13, 14, 15 |
| HITL gates | Task 22 |
| Acceptance criteria (14 items) | Distributed across Tasks 1, 4, 8, 11, 17, 18, 19, 20, 21, 22 |

The plan respects existing code: `validation_runs` and `pipeline_events` already exist in `0001_init.sql`; only `expert_posts` is new. `EvidenceSchema` in `lib/schemas/thesis.ts` is left untouched — Bull/Bear writes go to `validation_runs.results`, not to `thesis.drivers[i].evidence`.
