# Expert-Corpus Stage 4 Rework — Design

**Date:** 2026-05-19
**Supersedes:** GitHub issue #5 (S6, "adversarial-context-builder + Bull researcher")
**Narrows:** GitHub issue #8 (S7, "Bear researcher + Verifier + Triangulator (full Stage 4, one driver)")
**Parent:** GitHub issue #1 (Research System MVP — investment thesis pipeline)
**Validated by:** [prototypes/semi-substack-pulse/](../../../prototypes/semi-substack-pulse/) — keyword retrieval + Opus 4.7 Bull/Bear on the 4 semi Substacks, 70-post corpus, 2 queries (NVDA, ASML)

## Why we're pivoting

Original S6/S7 sourced Bull/Bear evidence via Anthropic `web_search` + `fetch_url` + `fetch_transcript`, with a Tier 1/2/3 source-class rubric (filings, wires, trade press) and a citation-verifier that re-fetched every URL. That works, but it leaves Bull/Bear to wander the open web — every run is exposed to whatever the search index returns that day, and citation verification is a recurring failure surface.

This design replaces the evidence source with a curated, persistent corpus of independent-expert commentary, ingested from Substack RSS feeds. The corpus is the entire evidence universe for Bull/Bear. No open web search. The trade-off — losing primary-source filings and transcripts — is deliberate: this system is for synthesizing independent-expert views, not for primary-source extraction. Filings remain accessible elsewhere in the pipeline (Stage 3 scan, Stage 2 IR-page-finder) and the synthesizer (S12) can cite them separately.

## Scope

**Close** issue #5 (S6). This design supersedes it.

**Narrow** issue #8 (S7). Keep it open, but reduce its scope to **Verifier + Triangulator only**. Bear researcher moves into this ticket. Narrowed S7's Verifier becomes a deterministic substring check of `quote` against the local `expert_posts.content` for the cited `post_id` — no URL refetch. Triangulator is unchanged conceptually but operates on corpus-citation evidence shape.

**Open** one new ticket: **"S6-new: Expert-corpus Stage 4 — ingest + Bull + Bear researchers"**. Labeled `ready-for-human` because the HITL prompt review still applies. This ticket covers everything below.

### Cascading touches (flag in PR description, do not expand scope)

- **Parent issue #1.**
  - **User story 38** ("Anthropic `web_search` as the only web-search provider — no Brave fallback") is invalidated. Rewrite to reflect the corpus model: "Expert-corpus retrieval is the only Bull/Bear evidence channel — no open web search."
  - **User story 35** (config knobs): drop the source-tier-weights knob; add an expert-corpus retrieval-limit knob.
  - **Implementation Decisions section** of parent #1 references `web_search` and the Tier 1/2/3 rubric in the deep-modules description. Update the deep-modules block to describe the expert-corpus retrieval module and remove the tier rubric.
  - User stories 11-13 (four-agent flow, separate Anthropic contexts, `buildLensContext`) are conceptually unchanged — only their implementation details shift.
- **No code changes** to S10 (screener), S11 (LLM notes), S12 (synthesizer), S13 (cron). Those depend on a populated `validation_runs` row. The shape change (no `source_tier`, corpus-style citations) flows through cleanly when narrowed S7 lands.

## Decisions made during brainstorm

| Decision | Choice |
|---|---|
| Corpus role | Replace `web_search` entirely. Corpus is the only evidence universe. |
| Decomposition | One new mega-ticket replaces S6; narrows S7. |
| Registry storage | JSON file at `lib/data/experts.json`; sectors and experts both editable by committing JSON. |
| Retrieval mechanism | **Keyword + ticker prefilter** (in-DB), full-content injection into prompt. **No embeddings / pgvector.** (Reversal of the initial brainstorm answer — overturned by prototype evidence.) |
| Verifier + Triangulator | Deferred to narrowed S7. Not in this ticket. |
| Per-driver ticker scope | New `tickers?: string[]` field on each `IndustryDriver` in the thesis schema. Falls back to full universe if empty. |
| Default Bull/Bear model | `claude-opus-4-7`. Prototype showed Sonnet 4.6 stringifies tool-input on nested-quote payloads. |

## Components

### 1. Expert registry — `lib/data/experts.json`

JSON file at the same tier as `lib/data/gics.ts` and `lib/data/regions.ts`. Validated via Zod schema in `lib/schemas/experts.ts`. Editable by hand; PR-reviewed.

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
      "notes": "Heavily paywalled per stated policy, but RSS currently returns full content for free posts. Re-check if posts shrink to excerpts later."
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

`sectors.<tag>.gics` ties a sector tag back to GICS codes from `lib/data/gics.ts`, so thesis-scope→corpus filtering matches by code at retrieval time.

The registry helper:
```typescript
// lib/data/experts.ts
export function getActiveExpertsForSectors(sectorTags: string[]): Expert[];
```

### 2. Ingest pipeline — `lib/ingest/expert-corpus.ts`

Inputs: `lib/data/experts.json`. Outputs: rows in `expert_posts`.

**Supabase schema (one migration):**

```sql
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
  sectors         text[] not null default '{}', -- denormalized from registry at ingest
  ingested_at     timestamptz not null default now()
);
create index expert_posts_published_idx on expert_posts (published desc);
create index expert_posts_tickers_gin on expert_posts using gin (tickers);
create index expert_posts_sectors_gin on expert_posts using gin (sectors);
create index expert_posts_slug_idx on expert_posts (expert_slug);
```

RLS: read-only for all authenticated users; writes only by service-role (the ingest job runs server-side with `SUPABASE_SERVICE_KEY`).

**Pipeline steps:**
1. Load + validate `experts.json` via Zod.
2. For each active expert: fetch RSS via `rss-parser`, parse items.
3. HTML→text via `lib/ingest/html.ts` (port of the prototype's `clean.ts` — regex-based strip; no cheerio dep).
4. Ticker extraction via `lib/data/semi-tickers.ts` (port of prototype's `tickers.ts`). Named explicitly `semi-tickers` because the dictionary is semis-only; other sectors will register their own dictionaries when added.
5. Paywall detection: substring match against the markers list in `lib/ingest/paywall-markers.ts`. Mark `is_paywalled` but do not drop the post — excerpts still carry citation value.
6. Idempotent upsert keyed on `id = sha256(slug::guid)[:16]`. Re-running adds new posts only.

**Triggers:**
- `POST /api/cron/refresh-corpus` (no auth; secret in `Authorization: Bearer ${CRON_SECRET}` header). Wired to a Vercel cron — daily.
- `npm run corpus:refresh` — one-shot manual backfill / dev use.

### 3. Retrieval — `lib/agents/expert-corpus/retrieve.ts`

Pure-ish module (one DB read, no LLM calls).

```typescript
export type RetrieveOpts = {
  thesis_sectors: string[];   // sector tags from thesis scope
  tickers?: string[];         // optional prefilter (from driver.tickers)
  keywords?: string[];        // optional substring filter
  since?: string;             // ISO date floor
  limit: number;              // hard cap on posts returned
};

export async function retrieve(opts: RetrieveOpts): Promise<ExpertPost[]>;
```

**Filtering order:**
1. **Sector intersection (mandatory)** — `expert_posts.sectors && opts.thesis_sectors`. SQL `WHERE sectors && $1::text[]`.
2. Ticker membership (optional) — `WHERE tickers && $2::text[]`.
3. Date floor (optional) — `WHERE published >= $3`.
4. Keyword substring on title + content (in-app, post-SQL — corpus size makes Postgres-side `ILIKE` fine but not worth the complexity).
5. Sort `published DESC`, slice to `limit`.

Default `limit = 12`. Tunable via the right-panel config (parent #1 user story 35).

### 4. Bull/Bear researchers + adversarial harness

**`lib/agents/adversarial-context-builder.ts` — unchanged interface, internal change only.**

```typescript
buildLensContext({ lens, thesis, driver, priorEvidence? }): AnthropicRequest;
```

Returns a complete Anthropic request `{ system, messages, tools, tool_choice }` for `anthropic.messages.create`. Asserts before returning (every assertion throws on violation — fail closed):
1. System prompt contains no string from the opposite-lens disallow-list (`/\b(bear|downside|counter[- ]evidence)\b/i` for the bull lens; mirror for bear).
2. System prompt does not contain the opposite-lens identifier (`"bear_researcher"` etc.).
3. `messages` array contains no string from the opposite lens's `priorEvidence` (strict — fail closed).
4. All tool-result blobs in `messages` originated from this lens's prior turns within this driver or this lens's prior driver in the same run (tracked via `lens_tag` on every constructed message).
5. `priorEvidence`, if supplied, has `lens === lens` and `thesis_id === thesis.id`.

Tools shrink to one: `submit_evidence` (per-lens tool-calling — avoids the JSON-parse failure mode the prototype exposed). No `web_search`, no `fetch_url`, no `fetch_transcript`.

**`lib/agents/bull-researcher.ts` / `lib/agents/bear-researcher.ts`:**

1. Resolve `tickers` from `driver.tickers ?? thesis.universe.tickers` (fallback to full universe if driver has none).
2. Call `retrieve({ thesis_sectors, tickers, limit: 12 })`.
3. Build user message: full content of retrieved posts (truncated per-post at ~8000 chars), per the prototype's prompt shape.
4. Send via `buildLensContext({ lens, thesis, driver, priorEvidence? })`.
5. Force `tool_choice = { type: "tool", name: "submit_evidence" }`.
6. Parse `tool_use.input.evidence` directly (SDK pre-parses tool args; no JSON.parse failure surface).
7. Return typed `BullResult` / `BearResult`:

```typescript
type Evidence = {
  expert: string;         // expert name
  post_id: string;        // FK into expert_posts.id
  post_url: string;
  post_title: string;
  quote: string;          // verbatim from the post
  date: string;           // ISO 8601 of the post
};
```

**No `source_tier`.** The tier rubric is gone — corpus is bounded to expert opinion; tiering by source class doesn't apply.

**Default model: `claude-opus-4-7`.** The prototype showed Sonnet 4.6 stringifies tool-call inputs when an extracted quote contains nested double quotes (e.g., `"...to "shrink" even more..."`), breaking the run. Opus 4.7 handles this. Model selection remains a config knob (parent #1 user story 35); if a Sonnet fallback is added later, it must use per-item tool calls instead of a single array.

### 5. API + UI + observability

**`POST /api/validate/driver`** accepts `{ thesis_id, driver_id, prior_lens_evidence? }`. Runs Bull and Bear in **parallel** (separate Anthropic clients, independent contexts). Writes a partial `validation_runs.results[driver_id]` row:

```typescript
{
  bull_evidence: Evidence[],
  bear_evidence: Evidence[],
  // verified flags + triangulator_output absent — populated by narrowed S7 later
}
```

Returns the row. The orchestrator never assembles a combined prompt — that's narrowed S7's Verifier/Triangulator job.

**UI — middle panel for a thesis with Stage 4 in progress:** render two columns per driver — Bull evidence and Bear evidence. Each evidence chip shows expert + post-title + clickable `post_url`, with the quote inline. No verdict yet (that lands with narrowed S7). The component lives at `components/validation/DriverEvidencePanel.tsx`.

**`pipeline_events`** rows:
- `bull_researcher: start | tool_call | complete` and `bear_researcher: ...` (interleaved is fine — parallel execution).
- Bear's payload is **redacted** from bull events and vice versa (the redaction code paths land here, per parent #1 user story 34; the full XYZZY CI red-team test lands in S8).

## HITL gates

The new ticket is `ready-for-human`. A reviewer must sign off (as a PR comment) before merge on:
1. Bull system prompt text.
2. Bear system prompt text.
3. Adversarial disallow-list regex (`/\b(bear|downside|counter[- ]evidence)\b/i` and mirror).
4. The expert registry JSON content (editorial: which voices are in scope).

## Acceptance criteria

- [ ] `lib/data/experts.json` validates against the Zod schema in `lib/schemas/experts.ts`. Registry contains ≥3 active semi experts.
- [ ] `getActiveExpertsForSectors(['semis'])` returns the expected slugs.
- [ ] `expert_posts` table created via Supabase migration with all listed indexes; RLS is read-only for authenticated, service-role write.
- [ ] `npm run corpus:refresh` ingests all active experts, idempotently. Re-running adds zero duplicates.
- [ ] `POST /api/cron/refresh-corpus` requires the `Bearer ${CRON_SECRET}` header and runs the same pipeline.
- [ ] `retrieve({ thesis_sectors: ['semis'], tickers: ['NVDA'], limit: 12 })` returns posts filtered by both, sorted by published desc.
- [ ] `buildLensContext` throws when given `priorEvidence` with the opposite lens or a different `thesis_id`.
- [ ] `buildLensContext` produces a Bull request where the system prompt contains no bear-disallow-list string.
- [ ] `POST /api/validate/driver` for a real semi thesis driver returns `bull_evidence[]` with ≥1 entry referencing a valid `post_id`, a non-empty `quote`, and a parseable `date`. Same for `bear_evidence[]`.
- [ ] Bull and Bear API requests are constructed by `buildLensContext` and the harness assertions all pass for both lenses.
- [ ] Driver schema gains `tickers?: string[]`; thesis-extractor and refiner populate / accept edits to it.
- [ ] `pipeline_events` shows `bull_researcher: start/tool_call/complete` and `bear_researcher: start/tool_call/complete` for the driver. Opposite-lens content does not appear in either log stream.
- [ ] `DriverEvidencePanel` renders Bull/Bear columns in the middle panel with clickable post URLs.
- [ ] Vitest unit tests pass for: (a) `getActiveExpertsForSectors` filtering, (b) HTML-strip + ticker extraction on synthetic post HTML, (c) idempotent ingest (re-run = zero new rows on fixture), (d) `retrieve` filter ordering, (e) all `buildLensContext` assertions (negative + positive).
- [ ] **Human reviewer signoff** on Bull prompt, Bear prompt, disallow-list regex, expert registry content. Recorded as a PR comment before merge.

## Out of scope (deferred)

- **Verifier** (corpus-local quote substring check) — narrowed S7.
- **Triangulator** (verdict synthesis) — narrowed S7.
- **XYZZY red-team CI test** — S8 (unchanged from original plan).
- **Embeddings / pgvector retrieval** — only if keyword retrieval shows recall problems in production. Not a planned next step.
- **Paid-post ingestion via email** — only if SemiAnalysis or others tighten RSS to excerpts. Not currently needed.
- **Asianometry YouTube transcripts** — Asianometry's Substack covers companion notes; YouTube transcript ingestion is a separate question for a separate ticket.
- **Sector expansion beyond semis** — adds entries to the registry, a new sector key in the JSON, and a new tickers dictionary. Drop-in once the semi prototype validates the model end-to-end.

## References

- Prototype: [prototypes/semi-substack-pulse/](../../../prototypes/semi-substack-pulse/) — runnable terminal demo. README contains the verdict that drove this design.
- Original S6 (closed by this design): GitHub issue #5.
- S7 (narrowed by this design): GitHub issue #8.
- Parent: GitHub issue #1.
- RSS pipeline reference: `semi-substack-pulse.md` (the user-provided reference; Python prototype, same shape).
