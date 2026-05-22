# Substack expert-roster expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the expert corpus from 3 semis publications to 17 publications across 9 topical tags, gated by a one-shot audit script that verifies feed health and content yield before any candidate goes live.

**Architecture:** Single PR adds 14 new experts to `lib/data/experts.json` as `active: false`, broadens the sector-registry block to 9 topical tags, and ships `scripts/audit-experts.ts`. The audit's pure core (`auditFeed`, `deriveFlags`, `deriveVerdict`, `formatAuditTable`) is unit-tested; the I/O wrapper around it (`auditCandidates`) follows the same pure/orchestrator split as `lib/ingest/expert-corpus.ts`. A post-merge run of the audit writes the verdict table to `docs/superpowers/audits/<date>-substack-roster-audit-results.md`, and a follow-up commit flips `active: true` for promoted candidates.

**Tech Stack:** TypeScript, Node 20+, `rss-parser`, `tsx`, Vitest. No new dependencies — every module the audit imports already exists in `lib/ingest/`.

**Spec:** `docs/superpowers/specs/2026-05-22-substack-roster-expansion-design.md`

---

## File structure

**New files:**

```
scripts/audit-experts.ts                         # Pure core + I/O wrapper + main
tests/unit/scripts/audit-experts.test.ts         # Unit tests for the pure core
tests/unit/data/experts-registry.test.ts         # Registry-integrity test
```

**Modified files:**

```
lib/data/experts.json                            # +8 sector keys, +14 experts (active:false)
package.json                                     # +audit:experts npm script
```

**Unchanged (verified compatible):**

```
lib/data/experts.ts                              # Loader is registry-shape-agnostic
lib/schemas/experts.ts                           # Schema already permits new shape
lib/ingest/expert-corpus.ts                      # Reads whatever the registry holds
lib/ingest/paywall-markers.ts                    # Existing markers suffice
lib/ingest/html.ts                               # Existing htmlToText / extractTickers reused
lib/agents/expert-corpus/retrieve.ts             # sectors.overlaps() already handles broader tags
```

**Pure / I/O split inside `scripts/audit-experts.ts`:**

```
Pure (testable, no I/O, no clock unless injected):
  auditFeed(expert, parsedFeed, now): AuditRow
  deriveFlags(metrics): Flags
  deriveVerdict(fetch_status, total_items, flags): Verdict
  formatAuditTable(rows, runDate, thresholds): string
  auditResultsPath(now): string

I/O orchestration (not unit-tested, manually verified by running):
  auditCandidates(registry, fetchFeed): Promise<AuditRow[]>
  writeAuditDoc(path, markdown): Promise<void>
  main(): Promise<void>
```

---

## Task 1: Registry-integrity test (safety net before any registry change)

**Files:**
- Create: `tests/unit/data/experts-registry.test.ts`

This test is the only guardrail against silent mis-tagging — an expert whose `sectors[]` references an undeclared sector key is invisible to retrieval. Lands first so the safety net is in place before we expand the registry.

- [ ] **Step 1.1: Write the failing test**

Create `tests/unit/data/experts-registry.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ExpertRegistrySchema } from "@/lib/schemas/experts";
import registryJson from "@/lib/data/experts.json";

describe("experts.json registry integrity", () => {
  it("matches ExpertRegistrySchema", () => {
    const parsed = ExpertRegistrySchema.safeParse(registryJson);
    expect(parsed.success, parsed.success ? "" : parsed.error?.message).toBe(true);
  });

  it("every expert's sectors[] entry references a declared sector key", () => {
    const parsed = ExpertRegistrySchema.parse(registryJson);
    const declared = new Set(Object.keys(parsed.sectors));
    const offenders: { slug: string; bad: string[] }[] = [];
    for (const e of parsed.experts) {
      const bad = e.sectors.filter((s) => !declared.has(s));
      if (bad.length) offenders.push({ slug: e.slug, bad });
    }
    expect(offenders, JSON.stringify(offenders)).toEqual([]);
  });
});
```

- [ ] **Step 1.2: Run the test to confirm it passes against the current registry**

Run: `npm test -- tests/unit/data/experts-registry.test.ts`
Expected: PASS (current registry has 3 experts all tagged `semis`, which is declared).

- [ ] **Step 1.3: Commit**

```bash
git add tests/unit/data/experts-registry.test.ts
git commit -m "test: add experts registry integrity check"
```

---

## Task 2: auditFeed pure core (metrics)

**Files:**
- Create: `scripts/audit-experts.ts`
- Create: `tests/unit/scripts/audit-experts.test.ts`

Implements the metrics computation. Pure function over a parsed feed + injected `now`. Reuses `htmlToText`, `detectPaywall`, `extractTickers` from `lib/ingest/` so the audit's view matches production ingest.

- [ ] **Step 2.1: Write the failing test**

Create `tests/unit/scripts/audit-experts.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { auditFeed } from "@/scripts/audit-experts";
import type { Expert } from "@/lib/schemas/experts";

const EXPERT: Expert = {
  slug: "sample",
  name: "Sample Pub",
  author: "Sample Author",
  url: "https://example.com",
  feed_url: "https://example.com/feed",
  sectors: ["macro"],
  active: false,
};

const NOW = new Date("2026-05-22T00:00:00Z");
const day = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toUTCString();

describe("auditFeed metrics", () => {
  it("counts total/90d/30d items and computes most_recent", () => {
    const feed = {
      items: [
        { guid: "a", title: "fresh", pubDate: day(5),  contentEncoded: "<p>hello world</p>".repeat(200) },
        { guid: "b", title: "midage", pubDate: day(45), contentEncoded: "<p>hello world</p>".repeat(200) },
        { guid: "c", title: "old",    pubDate: day(120), contentEncoded: "<p>hello world</p>".repeat(200) },
      ],
    };
    const row = auditFeed(EXPERT, feed, NOW);
    expect(row.total_items).toBe(3);
    expect(row.items_last_90d).toBe(2);
    expect(row.items_last_30d).toBe(1);
    expect(row.most_recent).toBe(new Date(day(5)).toISOString());
    expect(row.fetch_status).toBe("ok");
  });

  it("computes avg_content_chars over htmlToText", () => {
    const feed = {
      items: [
        { guid: "x", title: "t", pubDate: day(1), contentEncoded: "<p>" + "a".repeat(1000) + "</p>" },
        { guid: "y", title: "t", pubDate: day(2), contentEncoded: "<p>" + "b".repeat(3000) + "</p>" },
      ],
    };
    const row = auditFeed(EXPERT, feed, NOW);
    expect(row.avg_content_chars).toBe(2000);
  });

  it("computes paywall_hit_rate from detectPaywall", () => {
    const feed = {
      items: [
        { guid: "p1", title: "t", pubDate: day(1), contentEncoded: "<p>This post is for paid subscribers.</p>" },
        { guid: "p2", title: "t", pubDate: day(2), contentEncoded: "<p>Free content here.</p>".repeat(50) },
      ],
    };
    const row = auditFeed(EXPERT, feed, NOW);
    expect(row.paywall_hit_rate).toBe(0.5);
  });

  it("returns zero metrics for empty feed", () => {
    const row = auditFeed(EXPERT, { items: [] }, NOW);
    expect(row.total_items).toBe(0);
    expect(row.items_last_90d).toBe(0);
    expect(row.most_recent).toBeNull();
    expect(row.avg_content_chars).toBe(0);
    expect(row.paywall_hit_rate).toBe(0);
  });

  it("flags degraded date_quality when an item has an unparseable pubDate", () => {
    const feed = {
      items: [
        { guid: "g", title: "t", pubDate: "not-a-date", contentEncoded: "<p>x</p>" },
        { guid: "h", title: "t", pubDate: day(5),       contentEncoded: "<p>y</p>" },
      ],
    };
    const row = auditFeed(EXPERT, feed, NOW);
    expect(row.date_quality).toBe("degraded");
  });
});
```

- [ ] **Step 2.2: Run the test to confirm it fails (module not found)**

Run: `npm test -- tests/unit/scripts/audit-experts.test.ts`
Expected: FAIL with "Cannot find module '@/scripts/audit-experts'".

- [ ] **Step 2.3: Implement the module**

Create `scripts/audit-experts.ts`:

```typescript
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

  const metrics = {
    total_items: total,
    items_last_90d: last90,
    items_last_30d: last30,
    most_recent: mostRecent,
    avg_content_chars: avg,
    paywall_hit_rate: paywallRate,
    ticker_yield: tickerYield,
  };
  const flags = deriveFlags(metrics, now);
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

// stubbed until Task 3 — keep this file compilable by re-exporting placeholders
export function deriveFlags(
  metrics: { items_last_90d: number; most_recent: Date | null; avg_content_chars: number; paywall_hit_rate: number },
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
```

Note the file already contains `deriveFlags` and `deriveVerdict` to keep `auditFeed` self-contained. Task 3 adds dedicated tests for them.

- [ ] **Step 2.4: Run the test to confirm it passes**

Run: `npm test -- tests/unit/scripts/audit-experts.test.ts`
Expected: PASS (5 specs).

- [ ] **Step 2.5: Commit**

```bash
git add scripts/audit-experts.ts tests/unit/scripts/audit-experts.test.ts
git commit -m "feat(audit): add auditFeed pure core with metrics over RSS"
```

---

## Task 3: Boundary tests for deriveFlags and deriveVerdict

**Files:**
- Modify: `tests/unit/scripts/audit-experts.test.ts`

`deriveFlags` and `deriveVerdict` are already implemented in Task 2. This task adds dedicated boundary tests because the thresholds (3, 30, 2000, 0.5) are the gate between "this becomes part of the corpus" and "this gets deferred". Wrong off-by-one logic here corrupts every future audit run.

- [ ] **Step 3.1: Write the failing boundary tests**

Append to `tests/unit/scripts/audit-experts.test.ts`:

```typescript
import { deriveFlags, deriveVerdict } from "@/scripts/audit-experts";

describe("deriveFlags boundary behavior", () => {
  const NOW = new Date("2026-05-22T00:00:00Z");
  const ago = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

  it("ALIVE fires at exactly 3 items in last 90d, not 2", () => {
    expect(deriveFlags({ items_last_90d: 3, most_recent: ago(1), avg_content_chars: 9999, paywall_hit_rate: 0 }, NOW).ALIVE).toBe(true);
    expect(deriveFlags({ items_last_90d: 2, most_recent: ago(1), avg_content_chars: 9999, paywall_hit_rate: 0 }, NOW).ALIVE).toBe(false);
  });

  it("RECENT fires at exactly 30 days, not 31", () => {
    expect(deriveFlags({ items_last_90d: 5, most_recent: ago(30), avg_content_chars: 9999, paywall_hit_rate: 0 }, NOW).RECENT).toBe(true);
    expect(deriveFlags({ items_last_90d: 5, most_recent: ago(31), avg_content_chars: 9999, paywall_hit_rate: 0 }, NOW).RECENT).toBe(false);
  });

  it("SUBSTANTIVE fires at exactly 2000 avg chars, not 1999", () => {
    expect(deriveFlags({ items_last_90d: 5, most_recent: ago(1), avg_content_chars: 2000, paywall_hit_rate: 0 }, NOW).SUBSTANTIVE).toBe(true);
    expect(deriveFlags({ items_last_90d: 5, most_recent: ago(1), avg_content_chars: 1999, paywall_hit_rate: 0 }, NOW).SUBSTANTIVE).toBe(false);
  });

  it("LOW_PAYWALL fires when rate is strictly less than 0.5", () => {
    expect(deriveFlags({ items_last_90d: 5, most_recent: ago(1), avg_content_chars: 9999, paywall_hit_rate: 0.49 }, NOW).LOW_PAYWALL).toBe(true);
    expect(deriveFlags({ items_last_90d: 5, most_recent: ago(1), avg_content_chars: 9999, paywall_hit_rate: 0.50 }, NOW).LOW_PAYWALL).toBe(false);
  });

  it("RECENT is false when most_recent is null", () => {
    expect(deriveFlags({ items_last_90d: 0, most_recent: null, avg_content_chars: 0, paywall_hit_rate: 0 }, NOW).RECENT).toBe(false);
  });
});

describe("deriveVerdict", () => {
  const allTrue = { ALIVE: true, RECENT: true, SUBSTANTIVE: true, LOW_PAYWALL: true };
  const allFalse = { ALIVE: false, RECENT: false, SUBSTANTIVE: false, LOW_PAYWALL: false };

  it("returns reject on fetch failure regardless of metrics", () => {
    expect(deriveVerdict("error:timeout", 0, allFalse)).toBe("reject");
    expect(deriveVerdict("error:dns", 10, allTrue)).toBe("reject");
  });

  it("returns defer when total_items is 0 or ALIVE is false", () => {
    expect(deriveVerdict("ok", 0, allTrue)).toBe("defer");
    expect(deriveVerdict("ok", 10, { ...allTrue, ALIVE: false })).toBe("defer");
  });

  it("returns promote_candidate only when all four flags pass", () => {
    expect(deriveVerdict("ok", 10, allTrue)).toBe("promote_candidate");
  });

  it("returns review when ALIVE but some other flag fails", () => {
    expect(deriveVerdict("ok", 10, { ...allTrue, RECENT: false })).toBe("review");
    expect(deriveVerdict("ok", 10, { ...allTrue, SUBSTANTIVE: false })).toBe("review");
    expect(deriveVerdict("ok", 10, { ...allTrue, LOW_PAYWALL: false })).toBe("review");
  });
});
```

- [ ] **Step 3.2: Run all audit tests**

Run: `npm test -- tests/unit/scripts/audit-experts.test.ts`
Expected: PASS — both the Task 2 specs and the new boundary specs (≥15 specs total).

- [ ] **Step 3.3: Commit**

```bash
git add tests/unit/scripts/audit-experts.test.ts
git commit -m "test(audit): add boundary tests for deriveFlags and deriveVerdict"
```

---

## Task 4: formatAuditTable markdown renderer

**Files:**
- Modify: `scripts/audit-experts.ts`
- Modify: `tests/unit/scripts/audit-experts.test.ts`

Pure function that takes audit rows and returns a markdown table string. The output is committed alongside the analyst's hand-edited verdict column, so the column order and headers matter.

- [ ] **Step 4.1: Write the failing test**

Append to `tests/unit/scripts/audit-experts.test.ts`:

```typescript
import { formatAuditTable } from "@/scripts/audit-experts";

describe("formatAuditTable", () => {
  const baseRow = {
    slug: "test_pub",
    name: "Test Pub",
    feed_url: "https://example.com/feed",
    fetch_status: "ok",
    total_items: 20,
    items_last_90d: 12,
    items_last_30d: 4,
    most_recent: "2026-05-20T10:00:00.000Z",
    avg_content_chars: 8500,
    paywall_hit_rate: 0.1,
    ticker_yield: 0.6,
    date_quality: "ok" as const,
    flags: { ALIVE: true, RECENT: true, SUBSTANTIVE: true, LOW_PAYWALL: true },
    verdict: "promote_candidate" as const,
  };

  it("renders a markdown table with one row per audit row", () => {
    const md = formatAuditTable([baseRow], new Date("2026-05-22T00:00:00Z"));
    expect(md).toContain("# Substack roster audit — 2026-05-22");
    expect(md).toContain("| slug | name | items_90d | items_30d | most_recent | avg_chars | paywall % | ticker % | flags | verdict_auto | verdict_final | notes |");
    expect(md).toContain("test_pub");
    expect(md).toContain("promote_candidate");
    expect(md).toContain("ALIVE,RECENT,SUBSTANTIVE,LOW_PAYWALL");
  });

  it("renders an empty-section message when no rows", () => {
    const md = formatAuditTable([], new Date("2026-05-22T00:00:00Z"));
    expect(md).toContain("# Substack roster audit — 2026-05-22");
    expect(md).toContain("No candidates audited");
  });

  it("includes the threshold legend", () => {
    const md = formatAuditTable([baseRow], new Date("2026-05-22T00:00:00Z"));
    expect(md).toContain("ALIVE = items_last_90d >= 3");
    expect(md).toContain("RECENT = most_recent within 30 days");
    expect(md).toContain("SUBSTANTIVE = avg_content_chars >= 2000");
    expect(md).toContain("LOW_PAYWALL = paywall_hit_rate < 0.5");
  });
});
```

- [ ] **Step 4.2: Run the test to confirm it fails**

Run: `npm test -- tests/unit/scripts/audit-experts.test.ts`
Expected: FAIL — `formatAuditTable` is not exported.

- [ ] **Step 4.3: Implement formatAuditTable**

Append to `scripts/audit-experts.ts`:

```typescript
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
  lines.push("- `review` — alive but at least one of RECENT / SUBSTANTIVE / LOW_PAYWALL failed");
  lines.push("");
  lines.push("Set `verdict_final` by hand after review. Use `notes` for the one-line reason.");
  lines.push("");

  if (rows.length === 0) {
    lines.push("_No candidates audited (registry has no `active: false` entries)._");
    return lines.join("\n") + "\n";
  }

  lines.push(
    "| slug | name | items_90d | items_30d | most_recent | avg_chars | paywall % | ticker % | flags | verdict_auto | verdict_final | notes |",
  );
  lines.push(
    "|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|",
  );
  for (const r of rows) {
    const recent = r.most_recent ? r.most_recent.slice(0, 10) : "—";
    lines.push(
      `| ${r.slug} | ${r.name} | ${r.items_last_90d} | ${r.items_last_30d} | ${recent} | ${r.avg_content_chars} | ${pct(r.paywall_hit_rate)} | ${pct(r.ticker_yield)} | ${flagsList(r.flags) || "—"} | ${r.verdict} | | |`,
    );
  }
  lines.push("");
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 4.4: Run the test to confirm it passes**

Run: `npm test -- tests/unit/scripts/audit-experts.test.ts`
Expected: PASS (all specs including the new 3 for formatAuditTable).

- [ ] **Step 4.5: Commit**

```bash
git add scripts/audit-experts.ts tests/unit/scripts/audit-experts.test.ts
git commit -m "feat(audit): add formatAuditTable markdown renderer"
```

---

## Task 5: I/O wrapper, file-write helper, and main()

**Files:**
- Modify: `scripts/audit-experts.ts`

This is the only part of the audit that touches the network and filesystem. No unit tests — the pattern matches `lib/ingest/expert-corpus.ts`, where `refreshCorpus` is similarly not unit-tested and validated by running.

- [ ] **Step 5.1: Add the orchestration code**

Append to `scripts/audit-experts.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import Parser from "rss-parser";
import { loadRegistry } from "@/lib/data/experts";

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
      `\n\n<!-- additional run @ ${new Date().toISOString()} -->\n\n` + markdown,
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
  process.stdout.write(`\nWrote ${path.relative(process.cwd(), outPath)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 5.2: Re-run all audit unit tests to confirm nothing broke**

Run: `npm test -- tests/unit/scripts/audit-experts.test.ts`
Expected: PASS (all prior specs still pass; no new ones).

- [ ] **Step 5.3: Run typecheck via vitest's tsc step (or `tsc --noEmit`)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5.4: Commit**

```bash
git add scripts/audit-experts.ts
git commit -m "feat(audit): add I/O wrapper and main for audit-experts script"
```

---

## Task 6: Expand sector registry + add 14 candidates to experts.json

**Files:**
- Modify: `lib/data/experts.json`

Single commit, because the new experts depend on the new sector keys being declared (the registry-integrity test from Task 1 enforces this). The candidates are added with `active: false` so the live ingest pipeline ignores them until the post-audit promotion commit.

- [ ] **Step 6.1: Replace `lib/data/experts.json` with the expanded registry**

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
    },
    {
      "slug": "doomberg",
      "name": "Doomberg",
      "author": "Anonymous team",
      "url": "https://newsletter.doomberg.com",
      "feed_url": "https://newsletter.doomberg.com/feed",
      "sectors": ["energy", "materials", "macro"],
      "active": false,
      "notes": "Energy, commodities, geopolitics. Mostly paid with free previews — audit RSS yield carefully."
    },
    {
      "slug": "macro_compass",
      "name": "The Macro Compass",
      "author": "Alfonso Peccatiello",
      "url": "https://themacrocompass.substack.com",
      "feed_url": "https://themacrocompass.substack.com/feed",
      "sectors": ["macro", "financials"],
      "active": false,
      "notes": "Credit cycles, liquidity, central-bank plumbing. Free + paid."
    },
    {
      "slug": "apricitas",
      "name": "Apricitas Economics",
      "author": "Joseph Politano",
      "url": "https://www.apricitas.io",
      "feed_url": "https://www.apricitas.io/feed",
      "sectors": ["macro"],
      "active": false,
      "notes": "Data-driven economics, US labor / manufacturing / trade. Chart-forward."
    },
    {
      "slug": "concoda",
      "name": "Concoda",
      "author": "Greg Barker",
      "url": "https://concoda.substack.com",
      "feed_url": "https://concoda.substack.com/feed",
      "sectors": ["macro", "financials"],
      "active": false,
      "notes": "Money-market plumbing (repo, Eurodollar, Fed)."
    },
    {
      "slug": "net_interest",
      "name": "Net Interest",
      "author": "Marc Rubinstein",
      "url": "https://www.netinterest.co",
      "feed_url": "https://www.netinterest.co/feed",
      "sectors": ["financials"],
      "active": false,
      "notes": "Banks, asset managers, exchanges, fintech."
    },
    {
      "slug": "the_diff",
      "name": "The Diff",
      "author": "Byrne Hobart",
      "url": "https://www.thediff.co",
      "feed_url": "https://www.thediff.co/feed",
      "sectors": ["macro", "tech_platforms", "financials"],
      "active": false,
      "notes": "Inflections in finance and tech; cross-cutting daily."
    },
    {
      "slug": "yet_another_value",
      "name": "Yet Another Value Blog",
      "author": "Andrew Walker",
      "url": "https://www.yetanothervalueblog.com",
      "feed_url": "https://www.yetanothervalueblog.com/feed",
      "sectors": ["value_quality"],
      "active": false,
      "notes": "Quirky special situations; media / sports / telecom lean."
    },
    {
      "slug": "speedwell_memos",
      "name": "Speedwell Memos",
      "author": "Speedwell Research",
      "url": "https://www.speedwellmemos.com",
      "feed_url": "https://www.speedwellmemos.com/feed",
      "sectors": ["value_quality"],
      "active": false,
      "notes": "Long-form business-quality memos."
    },
    {
      "slug": "compounding_quality",
      "name": "Compounding Quality",
      "author": "Pieter Slegers",
      "url": "https://www.compoundingquality.net",
      "feed_url": "https://www.compoundingquality.net/feed",
      "sectors": ["value_quality"],
      "active": false,
      "notes": "Quality-bias long-duration."
    },
    {
      "slug": "bear_cave",
      "name": "The Bear Cave",
      "author": "Edwin Dorsey",
      "url": "https://thebearcave.substack.com",
      "feed_url": "https://thebearcave.substack.com/feed",
      "sectors": ["short_forensic"],
      "active": false,
      "notes": "Weekly 'Problems at...' short-biased forensic pieces."
    },
    {
      "slug": "citrini_research",
      "name": "Citrini Research",
      "author": "Citrini (pseudonymous)",
      "url": "https://www.citriniresearch.com",
      "feed_url": "https://www.citriniresearch.com/feed",
      "sectors": ["macro", "tech_platforms"],
      "active": false,
      "notes": "Thematic cross-asset; AI / industrial policy / fiscal frameworks. Paid-only — audit RSS carefully."
    },
    {
      "slug": "sinocism",
      "name": "Sinocism",
      "author": "Bill Bishop",
      "url": "https://sinocism.com",
      "feed_url": "https://sinocism.com/feed",
      "sectors": ["china_asia", "macro"],
      "active": false,
      "notes": "China politics + policy daily."
    },
    {
      "slug": "sinica_trivium",
      "name": "Sinica (Trivium)",
      "author": "Kaiser Kuo / Trivium team",
      "url": "https://www.sinicapodcast.com",
      "feed_url": "https://www.sinicapodcast.com/feed",
      "sectors": ["china_asia"],
      "active": false,
      "notes": "Free podcast tier of Trivium China; institutional product at triviumchina.com."
    },
    {
      "slug": "chinatalk",
      "name": "ChinaTalk",
      "author": "Jordan Schneider",
      "url": "https://www.chinatalk.media",
      "feed_url": "https://www.chinatalk.media/feed",
      "sectors": ["china_asia", "tech_platforms", "semis"],
      "active": false,
      "notes": "US-China tech / industrial policy / export controls; cross-tagged semis intentionally."
    }
  ],
  "sectors": {
    "semis": {
      "label": "Semiconductors",
      "gics": ["45301010", "45301020"]
    },
    "financials": {
      "label": "Financials",
      "gics": ["4030"]
    },
    "energy": {
      "label": "Energy",
      "gics": ["1010"]
    },
    "materials": {
      "label": "Materials",
      "gics": ["1510"]
    },
    "tech_platforms": {
      "label": "Tech platforms (software + media)",
      "gics": ["4510", "4520"]
    },
    "macro": {
      "label": "Macro / cross-asset",
      "gics": []
    },
    "value_quality": {
      "label": "Value / quality style",
      "gics": []
    },
    "short_forensic": {
      "label": "Short-biased / forensic style",
      "gics": []
    },
    "china_asia": {
      "label": "China / Asia regional",
      "gics": []
    }
  }
}
```

- [ ] **Step 6.2: Run the registry-integrity test from Task 1**

Run: `npm test -- tests/unit/data/experts-registry.test.ts`
Expected: PASS — every new expert's `sectors[]` references a declared key in the expanded sectors block.

- [ ] **Step 6.3: Run the existing ingest tests to confirm nothing broke**

Run: `npm test -- tests/unit/ingest/expert-corpus.test.ts`
Expected: PASS — `ingestFeed` is unchanged and the test doesn't load `experts.json`.

- [ ] **Step 6.4: Commit**

```bash
git add lib/data/experts.json
git commit -m "feat(corpus): add 14 candidate experts (active:false) and 8 sector tags"
```

---

## Task 7: Wire npm script + end-to-end audit run

**Files:**
- Modify: `package.json`

The `audit:experts` script doesn't need `.env` or any API keys (no Supabase, no Anthropic) — just HTTP fetches.

- [ ] **Step 7.1: Add the npm script**

Modify `package.json` `scripts` block — insert after `corpus:refresh`:

```json
"audit:experts": "tsx scripts/audit-experts.ts"
```

After the edit, the relevant lines should be:

```json
"corpus:refresh": "unset ANTHROPIC_API_KEY; tsx --env-file=.env scripts/corpus-refresh.ts",
"audit:experts": "tsx scripts/audit-experts.ts"
```

Note: be careful with JSON commas — `corpus:refresh` becomes the second-last entry and needs a trailing comma; `audit:experts` is last and does not.

- [ ] **Step 7.2: Run the full test suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS (all prior tests + Task 1 registry-integrity test + Task 2-4 audit tests, ~all green).

- [ ] **Step 7.3: Run the audit end-to-end**

Run: `npm run audit:experts`
Expected:
- Stdout shows a markdown table with rows for all 14 candidates
- `docs/superpowers/audits/<TODAY>-substack-roster-audit-results.md` is created
- Final stdout line confirms the path
- Exit code 0

Do **not** commit the audit-results file from this step yet — that's the analyst's job (Task 8 wraps up by leaving it staged but unedited, since the verdict column is hand-set).

- [ ] **Step 7.4: Eyeball the audit output**

Skim the table. The expected observations:

- ~10–12 of 14 should be `promote_candidate` or `review`. ChinaTalk, Sinica, Apricitas, Net Interest, Macro Compass usually publish frequently — should show ALIVE.
- Doomberg / Citrini / SemiAnalysis-like paid-heavy pubs may show high `paywall_hit_rate` if their RSS is excerpts-only — they'd land in `review`.
- `ticker_yield` will likely be near-zero for macro / financials / value pubs because `extractTickers` only recognizes the semis ticker dictionary today. **This is expected and not a defect** — flag in the verdict_final notes if relevant, but don't block promotion on it.
- Any fetch errors are the script's red flags for "reject".

- [ ] **Step 7.5: Commit the npm script**

```bash
git add package.json
git commit -m "chore: wire audit:experts npm script"
```

---

## Task 8: Hand-review the audit and prep the promotion commit

This task is partially manual — the engineer runs the audit, opens the results doc, fills `verdict_final` and `notes` columns by hand, commits the results, then makes a follow-up commit that flips `active: true` for promoted candidates.

- [ ] **Step 8.1: Open the audit results doc**

Open `docs/superpowers/audits/<TODAY>-substack-roster-audit-results.md` in the editor. For each row, set the `verdict_final` column to one of `promote` / `defer` / `reject` and write a one-line `notes` reason.

Suggested rules of thumb (engineer's call to override):

- `verdict_auto = promote_candidate` and no red flag → `promote`
- `verdict_auto = review` with only LOW_PAYWALL failing → `promote` (paid-heavy but content visible enough)
- `verdict_auto = review` with SUBSTANTIVE failing → `defer` (we'd be ingesting excerpts only)
- `verdict_auto = defer` → `defer`
- `verdict_auto = reject` (fetch failed) → `reject` with notes recording the error

- [ ] **Step 8.2: Commit the hand-reviewed audit results**

```bash
git add docs/superpowers/audits/*.md
git commit -m "docs(audit): record substack roster audit results"
```

- [ ] **Step 8.3: Flip `active: true` for promoted candidates in `lib/data/experts.json`**

For each row marked `verdict_final = promote` in the results doc, change that expert's `"active": false` to `"active": true` in `lib/data/experts.json`. Leave deferred and rejected ones at `false`.

Add a top-of-file comment line in the JSON's first `notes` field (the Fabricated Knowledge entry, which already has notes) referencing the audit-results filename — or, alternatively, add it as a note alongside each promoted expert. The acceptance criterion just requires the audit doc be discoverable from the registry.

- [ ] **Step 8.4: Re-run the registry-integrity test**

Run: `npm test -- tests/unit/data/experts-registry.test.ts`
Expected: PASS — flipping `active` doesn't affect sector-tag integrity.

- [ ] **Step 8.5: Run `corpus:refresh` against the newly promoted experts**

Run: `npm run corpus:refresh`
Expected: stdout lists each newly-active expert with `+N new` posts. Confirm no errors. If any expert errors here that passed the audit, investigate before merging (could be a transient feed issue, or could be a real difference between the audit's `rss-parser` config and production's).

- [ ] **Step 8.6: Commit the promotion**

```bash
git add lib/data/experts.json
git commit -m "feat(corpus): promote audited experts to active"
```

---

## Self-review checklist (do this before opening the PR)

**Spec coverage:**

| Spec section | Task |
|---|---|
| 17 experts, 9 sectors, schema-valid | Task 1, Task 6 |
| `scripts/audit-experts.ts` runs and writes audit doc | Task 2–5, Task 7 |
| `npm run audit:experts` wired | Task 7 |
| Unit tests for auditFeed pure core | Task 2 |
| Boundary tests for flags / verdict | Task 3 |
| Registry-integrity test | Task 1 |
| Audit-results doc committed | Task 8 |
| Promotion commit referenced by audit doc | Task 8 |
| Coverage-gaps documented as out-of-scope | Spec itself (no implementation task) |
| `substack-equity-experts.md` as source-of-truth reference | Spec itself + commit messages |

**Placeholder scan:** none — every code block is complete and runnable. The `<TODAY>` and `<date>` placeholders in commands are filled by the runtime, not by the engineer.

**Type consistency:** `AuditRow`, `Flags`, `Verdict` are defined once in Task 2 and used unchanged through Tasks 3–5. `Expert` is imported from the existing schema. `ParsedFeed`/`ParsedItem` are internal to the audit script.

**Frequent commits:** 7 atomic commits across Tasks 1–8 (Task 7 produces commit 7, Task 8 produces commits 8a and 8b). Each commit independently passes tests.
