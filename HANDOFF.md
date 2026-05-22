# altree-research — Project handoff

**Status as of:** 2026-05-13 (from grilling session)
**Builds on:** `altree-finance` (Yahoo suffix → region taxonomy, country tax tables, source-citation convention)
**Standalone repo:** yes — separate from `altree-finance`, shares conceptual conventions only

This document captures design decisions from a grilling session on what to build
to fill the gaps in `altree-finance`: **investment thesis formulation,
validation, value-driver decomposition, and thesis-derived screening over
global equities**. The reference (aspirational, partial) was Tauric Research's
[TradingAgents](https://github.com/TauricResearch/TradingAgents).

The Excel-output skills in `altree-finance` (`/dcf`, `/comps`,
`/3-statement-model`, `/competitive-analysis`) stay where they are. This is
a separate system that shares the same data conventions but produces a
different deliverable: **structured, evidence-validated research artifacts**,
not Excel models.

---

## 1. Purpose & objectives

### Purpose

A personal-use **investment research system** that takes a prose snippet
(Economist paragraph, FT note, sell-side commentary, scratch paragraph) and
produces a structured, evidence-validated research artifact:

- A typed **thesis** (claim, premise, scope, drivers, falsification)
- A persistent **universe** of candidate tickers + ETF proxies
- Per-driver **validation** with adversarially-separated Bull/Bear evidence,
  citation verification, and a qualitative verdict
- A **screener** of candidate tickers with sortable numerical metrics
- A markdown **research note** + JSON sidecar

Global equities. No commodities, no DCF, no execution.

### Objectives

1. **Thesis is the unit of analysis, not ticker.** Entry point is prose; output
   is a structured thesis with named drivers and a candidate universe.
2. **Evidence-validated, not synthesized.** Bull/Bear research lens operates in
   adversarially-separated contexts. Every citation is re-fetched and verified.
   Qualitative verdicts (`supports` / `breaches` / `inconclusive`) at thesis
   and driver levels; evidence is preserved verbatim with source tier.
3. **Global by default.** Reuses `altree-finance`'s `REGION_BY_SUFFIX` taxonomy
   (~50 Yahoo suffixes). MVP covers US, UK, Eurozone, non-EZ DM Europe, Japan,
   Asia DM, Asia EM, Americas non-US, ANZ DM.
4. **OpenBB-free.** Single-language Node stack via `yahoo-finance2`. Earnings
   transcripts via **IR-page discovery as primary path** (not fallback) given
   `yahoo-finance2`'s thin transcript coverage.
5. **Three-panel web UI** for observability of multi-agent work — stages list /
   artifact view / live log + config.
6. **Versioned thesis runs.** Re-validating a thesis later writes a new dated
   run; a delta agent (built post-MVP) surfaces what changed.

### What this is NOT

- **Not a fork or extension of altree-finance's Excel skills.** Separate repo,
  separate runtime.
- **Not a trading bot.** No execution, no position sizing, no backtest.
- **Not multi-tenant SaaS.** Personal use, optional 1-2 person collab via
  Better Auth.
- **Not commodity-driven theses** (tin, uranium, rare earths). Global equities
  only.
- **Not macro forecasting.** Macro is a stated *premise* on the thesis, not a
  validated *driver*.

### What this does that TradingAgents doesn't

- **Thesis as first-class artifact.** TradingAgents has no thesis object; its
  "thesis" is implicit in debate prose.
- **Driver decomposition** with `threshold + central + evidence` schema.
  TradingAgents has no driver schema at all.
- **Adversarial separation** of Bull and Bear contexts. TradingAgents'
  researchers share full debate history — debate is rhetorical synthesis over
  a fixed information set, not evidence-gathering.
- **Citation verification.** Every URL re-fetched, every quote confirmed. The
  #1 LLM failure mode (hallucinated citations) is closed by design.
- **Global scope** with region-aware transcript fallbacks (Korea, Japan, HK).
  TradingAgents is effectively NASDAQ-only.
- **Thesis-driven screening.** Universe matched against validated drivers.
  TradingAgents has no screener at all — it takes a ticker as input.
- **Universe as separate, persisted artifact** that accretes across theses
  (`universes/eu_defense.yaml` is reusable).

---

## 2. Pipeline — 6 stages, 3 user touchpoints

```
prose snippet
    ↓
[1. Thesis extraction]            user touchpoint: review thesis + drivers + scope
    ↓
[2. Universe construction]        user touchpoint: confirm / edit universe
    ↓
[3. Driver-informed scan]         (deterministic + LLM context)
    ↓
[4. Researcher-lens validation]   (Bull / Bear adversarial-separated + Verifier + Triangulator)
    ↓
[5. Screener]                     (parallel metric fetch + tag assembly; optional per-ticker LLM notes)
    ↓
[6. Synthesis]                    user touchpoint: read research note
    ↓
research_note.md  +  research_artifact.json
```

### Stage 1: Thesis extraction

**Input:** prose snippet pasted by user.

**Agent:** LLM extracts a draft `thesis.json` containing:
- `claim`
- `macro_premise` (stipulated, not validated)
- `scope` (sectors, regions, market cap, seed/exclude tickers)
- `horizon_years`
- `falsification` (primary + secondary)
- 1-2 industry drivers with `central_estimate` + `thesis_breaks_below`
  (company-level signals surface in Stage 5 as screener metrics + optional
  per-ticker notes, not as structured thesis drivers)

**Output:** `theses` row in Supabase with full thesis JSON.

**User touchpoint:** review draft, edit via natural-language ("add Japan to
regions", "tighten M1 break threshold"). LLM applies edit, shows diff, user
confirms. No form-filling.

### Stage 2: Universe construction

**Input:** `thesis.scope`.

**Branches by theme type:**

| Theme type | Mechanic | Example |
|---|---|---|
| Sector | GICS code + region filter + market cap filter via `yahoo-finance2` screener | EU defense → GICS 20101010 + EUROZONE/UK + mcap >$1B |
| Multi-GICS (theme-spanning) | LLM-assisted multi-GICS resolution + revenue-segment data where available | AI infrastructure → semis + IT services + utilities |
| Style (quality / value) | Quantitative screen on fundamentals | quality compounders → ROIC > X, FCF yield > Y |

**Discovery & persistence (Option C from grilling):** first thesis using a
given scope triggers LLM-assisted discovery; user confirms; **the confirmed
universe is stored as a reusable `universes/<id>.yaml` artifact**. Subsequent
theses with same scope load from cache. Manual `/api/universe/refresh`
re-discovers.

**Per-ticker transcript availability check** runs during this stage:

1. Try `yahoo-finance2` (best-effort; coverage thin)
2. Try IR-page discovery (LLM web search → company IR page → most recent
   transcript URL)
3. If neither works, flag ticker `transcript_unavailable`; surface in
   synthesis as `data-starved` and tag the ticker in the screener output.

The IR URL is **cached on the universe entry** so discovery is one-shot
per ticker.

**Output:** `universes/<id>.yaml` artifact + Supabase row.

**User touchpoint:** confirm/edit universe table. Add seeds, drop wrong
inclusions, edit exposure tiering.

### Stage 3: Driver-informed scan

**Input:** thesis + universe.

**Logic:**
- Fetch 5-year historical price/return for universe tickers + ETF proxies
- Fetch driver-specific time series where mechanical (e.g., sector
  backlog/revenue ratio if available, sector EBIT margins from
  yahoo-finance2 fundamentals aggregated across universe)
- LLM produces 3-paragraph descriptive context for the user reading the
  final note — no judgments yet

**Output:** `scan_runs` row with charts data + descriptive markdown.

**No user touchpoint.** Context input to stage 4 and stage 6.

### Stage 4: Researcher-lens validation

**The load-bearing stage.** This is what makes the system better than
TradingAgents.

**Input:** `thesis.drivers.industry` — one driver at a time.

**Per driver, four sub-agents in sequence:**

1. **Bull researcher** — separate Anthropic API context. Tools: `web_search`,
   `fetch_url`, `fetch_transcript`. Prompt: "Find evidence
   that this driver's central estimate holds or is conservative. Limit to
   trusted sources (company filings, transcripts, Reuters/Bloomberg/FT,
   industry trade press). Return `{ url, source_tier, quote, date }` entries."

2. **Bear researcher** — separate context, **no visibility** to Bull's output.
   Symmetric prompt for threshold-breach evidence.

3. **Verifier** — third context. Re-fetches every URL from Bull and Bear.
   Confirms: (a) URL is live; (b) page contains the quoted text; (c) date
   matches. Drops unverified citations.

4. **Triangulator** — fourth context. Sees both Bull and Bear verified
   evidence. Outputs:
   - `verdict` (`supports` | `breaches` | `inconclusive`) — qualitative judgment
     on whether verified evidence holds the driver's central estimate or
     breaches the `thesis_breaks_below` threshold
   - `central_estimate_revised` (if warranted)
   - `unresolved_tensions` (explicit list of contradictions Bull/Bear couldn't
     resolve)
   - `evidence_summary` — counts of verified evidence by source tier and
     direction (e.g., `{ bull: {1: 3, 2: 2, 3: 0}, bear: {1: 1, 2: 0, 3: 1} }`)

**Sequential across drivers within a thesis** — Bull's investigation of driver
I1 (backlog) informs the search for driver I2 (order intake). Cross-driver
context sharing *within the same lens* is fine; cross-lens contamination is
what adversarial separation prevents. The orchestrator passes
`prior_lens_evidence` to each per-driver call after the first.

**Output:** `validation_runs` row per thesis-run with driver-keyed results.
Multiple runs over time supported (versioned).

**API call shape:** `POST /api/validate/driver` called from frontend per
driver, allowing per-driver progress display in the right-panel log. Keeps
each call within Vercel function timeout (<60s without Fluid Compute, <300s
with).

### Stage 5: Screener

**Input:** universe + validated industry drivers + thesis.

**No composite score.** The screener is a sortable table of standard
numerical metrics fetched from `yahoo-finance2` fundamentals. The user sorts
and filters in the UI; ranking is intentionally not collapsed into a single
made-up number.

**Default columns (always fetched):**

- `market_cap_usd` — converted to USD via cross-rate where ticker is non-USD
- `trailing_pe`
- `forward_pe`
- `revenue_growth_yoy`
- `gross_margin`
- `ebit_margin`
- `fcf_yield` — TTM FCF / market cap
- `net_debt_to_ebitda`
- `dividend_yield`

**Qualitative tags from prior stages** attached to each ticker (filterable,
not sortable):

- `exposure_tier` (from universe): `pure_play | diversified | etf_proxy`
- `transcript_source`: `yahoo_finance2 | ir_page | unavailable`
- Per-driver verdict label inherited from Stage 4 Triangulator (e.g.,
  `backlog_to_revenue: supports`, `order_intake_growth: inconclusive`)
- `data-starved` flag where any required metric is missing

**Optional company-driver notes** (LLM, per-ticker, off by default): when
enabled, the synthesizer in Stage 6 fetches the most recent transcript per
ticker and writes a 1-2 sentence prose note flagging company-specific
evidence for/against the thesis. Not a score, not summed — appears as a
column of notes in the screener table. Toggleable because it's the cost peak
(roughly N×LLM calls where N is universe size).

**Output:** `screener_runs` row — universe rows with metrics + tags +
optional notes. Sort/filter happens client-side.

### Stage 6: Synthesis

**Input:** all prior artifacts.

**Output:**
- `research_note.md` (markdown, human-readable, ~1 page)
- `research_artifact.json` (typed sidecar, machine-readable)

**Markdown skeleton:**

```markdown
# Thesis: <id>
**Verdict: <supports|breaches|inconclusive>** | Horizon: <n>y | Validated: <date>

## Premise
<macro_premise>

## Claim
<claim>

## Drivers
### Industry
- **<driver-id>: <claim>** [verdict: <supports|breaches|inconclusive>] [central: <validated estimate>]
  - Bull: <quote with citation>
  - Bear: <quote with citation>
  - Evidence: T1 <n> / T2 <n> / T3 <n> (bull) · T1 <n> / T2 <n> / T3 <n> (bear)

## Screener (top by market cap / sortable in UI)
| Ticker | Market Cap USD | P/E (fwd) | Rev Growth YoY | EBIT Margin | Tags |
| ... |

## Unresolved tensions
- ...

## Falsification triggers (monitor)
- ...
```

**Design decisions baked in:**
- Verdict (qualitative, three values) replaces numerical confidence at every
  level — drivers, theses, and the synthesis header
- Evidence counts by tier and direction are surfaced verbatim instead of being
  collapsed into a single number
- "Unresolved tensions" is a first-class section, not buried in driver notes
- Screener is sortable in the UI; no composite "thesis_fit" score
- Markdown is the read surface; JSON sidecar is the contract for future tools
  (delta agent, screener filters, eventual portfolio layer)

**User touchpoint:** read the note. Open JSON for full evidence trail.

---

## 3. Schemas

### `thesis` (Supabase row, JSONB column)

```jsonc
{
  "id": "eu_defense_rearmament_26_05_01",
  "version": 1,
  "createdAt": "2026-05-13",
  "createdBy": "<supabase_auth_user_id>",

  "source_snippet": "<the prose user pasted>",

  "claim": "EU defense capex cycle benefits primes with multi-year backlog visibility",
  "macro_premise": "EU defense rearmament continues; NATO 3% commitment holds through 2030",
  "horizon_years": 5,

  "scope": {
    "type": "thematic",                       // "thematic" | "single_name"
    "sectors": ["20101010"],                  // GICS industry codes
    "regions": ["EUROZONE", "UK"],
    "market_cap_min_usd": 1000000000,
    "tickers_seed": ["RHM.DE", "BA.L", "LDO.MI"],
    "tickers_exclude": []
  },

  "drivers": {
    "industry": [
      {
        "id": "backlog_to_revenue",
        "claim": "Sector backlog/revenue ≥ 2y sustained",
        "central_estimate": { "value": 3.0, "unit": "years" },
        "thesis_breaks_below": 1.5,
        "evidence": [],
        "verdict": null,                       // null | "supports" | "breaches" | "inconclusive"
        "classification": "industry"          // tag for filterability
      }
    ]
  },

  "falsification": {
    "primary": "NATO 3% commitment formally rolled back, OR EU procurement budget cut >20% YoY",
    "secondary": "Sector backlog/revenue <1.5y for 2 consecutive quarters"
  },

  "universe_id": "eu_defense_global",         // FK to universes table

  "validation": {
    "status": "draft",                         // "draft" | "validated" | "stale" | "broken"
    "verdict": null,                           // overall thesis verdict — supports | breaches | inconclusive
    "last_validated_at": null,
    "open_tensions": []
  }
}
```

### `universe` (Supabase row + `universes/<id>.yaml` artifact)

```yaml
id: eu_defense_global
created_at: 2026-05-13
last_refreshed: 2026-05-13
gics_codes: [20101010]
regions: [EUROZONE, UK]
market_cap_min_usd: 1000000000

tickers:
  - ticker: RHM.DE
    name: Rheinmetall AG
    region: EUROZONE
    market_cap_usd_b: 38
    exposure_tier: pure_play        # pure_play | diversified | etf_proxy
    transcript_source: ir_page      # yahoo_finance2 | ir_page | unavailable
    transcript_url: https://...     # cached
    notes: ""

  - ticker: BA.L
    name: BAE Systems
    region: UK
    market_cap_usd_b: 52
    exposure_tier: pure_play
    transcript_source: ir_page
    transcript_url: https://...

  - ticker: PICK
    name: iShares MSCI Global Metals & Mining Producers
    exposure_tier: etf_proxy
    notes: "imperfect proxy — broad metals miner basket; flag for limited defense signal"
```

### `validation_run` (Supabase row, JSONB)

```jsonc
{
  "id": "<uuid>",
  "thesis_id": "eu_defense_rearmament_26_05_01",
  "run_at": "2026-05-13T10:23:00Z",

  "results": {
    "backlog_to_revenue": {
      "bull_evidence": [
        {
          "claim": "NATO Q1 procurement +18% YoY",
          "source_url": "https://reuters.com/...",
          "source_tier": 2,
          "quote": "...verbatim quote...",
          "fetched_at": "2026-05-13T10:18:00Z",
          "verified": true
        }
      ],
      "bear_evidence": [...],
      "triangulator_output": {
        "verdict": "supports",                   // supports | breaches | inconclusive
        "central_estimate_revised": { "value": 3.2, "unit": "years" },
        "unresolved_tensions": [
          "BAE H2 guidance flagged delivery slippage; contradicts sector backlog narrative"
        ],
        "evidence_summary": {
          "bull": { "1": 3, "2": 2, "3": 0 },
          "bear": { "1": 1, "2": 0, "3": 1 }
        }
      }
    },
    "order_intake_growth": { ... }
  },

  "overall_verdict": "supports"                  // worst-of across driver verdicts is the simple default
}
```

---

## 4. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14+ (App Router) | TypeScript |
| Hosting | Vercel | Pro plan for Fluid Compute (validation may exceed 60s) |
| DB | Supabase Postgres | metadata + JSONB columns for artifacts |
| File storage | Supabase Storage | `research_note.md` files |
| Auth | [Better Auth](https://dash.better-auth.com/onboarding) | Postgres adapter against the Supabase DB; email + OAuth; single-user start, ready for collab |
| Realtime | Supabase Realtime | live pipeline progress for right-panel log |
| LLM | Anthropic SDK | Claude Sonnet 4.x for orchestration, Haiku for Verifier |
| Prompt caching | Anthropic prompt cache | for long contexts in validation (drivers + prior evidence) |
| Equity data | `yahoo-finance2` (npm) | replaces all OpenBB equity calls |
| HTML parsing | Cheerio | for IR-page scraping |
| PDF parsing | `pdfjs-dist` | IR transcripts often PDF; `pdf-parse` is unmaintained and breaks on multi-column layouts |
| Web search | Anthropic `web_search` tool | for IR page discovery + Bull/Bear research; single integration, no fallback |

### Why this stack

- **Single language end-to-end (TypeScript).** No Python microservice for OpenBB.
- **One vendor for state + auth + realtime + storage** (Supabase) — replaces
  three integrations.
- **Vercel-native deployment.** Push to GitHub, auto-deploy.
- **Anthropic prompt caching** is load-bearing for cost — validation passes
  same thesis context to many sub-agents.

### What's NOT in the stack

- **OpenBB.** Entirely dropped. Every OpenBB provider HANDOFF used except
  yfinance is out of scope (DCF parked → no rates/FX, macro is premise → no
  FRED/OECD, no commodities → no econdb commodities).
- **Python.** Same reason.
- **Inngest / Trigger.dev / dedicated background-job service.** Pipeline is
  client-orchestrated, each stage fits in a single function call.
- **Redis / KV.** Realtime via Supabase, no need.

---

## 5. API routes (client-orchestrated pipeline)

| Route | Stage | Method | Timeout target |
|---|---|---|---|
| `/api/thesis/extract` | 1 | POST | <30s |
| `/api/thesis/refine` | 1 (NL edit) | POST | <30s |
| `/api/thesis/[id]` | — (read) | GET | <5s |
| `/api/thesis/[id]/stream` | — | GET (SSE) | streams |
| `/api/universe/build` | 2 | POST | <60s |
| `/api/universe/refresh` | 2 | POST | <60s |
| `/api/scan/run` | 3 | POST | <30s |
| `/api/validate/driver` | 4 (per driver) | POST | <60s standard, <300s Fluid Compute |
| `/api/screen` | 5 | POST | <60s (universe-size dependent) |
| `/api/synthesize` | 6 | POST | <30s |
| `/api/thesis/diff` | v2 | POST | <30s |

Frontend orchestrates the sequence. Each call writes its output to Supabase;
Realtime broadcasts progress to subscribed clients (right-panel log).

---

## 6. UI — three-panel layout

Modeled on the trading-agents.ai pattern, adapted to this pipeline.

**Left panel: pipeline stages**
- 6 rows, one per stage
- Status pills: pending / running / completed / failed
- Click to open stage's artifact in middle panel
- Stage 4 expands to show 1-N drivers; per-driver status (Bull running /
  Bear running / Verifier running / Triangulator running / done)

**Middle panel: selected artifact**
- Thesis: pretty-printed JSON with inline natural-language edit
- Universe: tabular ticker view with exposure tier, transcript source,
  market cap, drag-to-reorder
- Scan: time-series charts + descriptive markdown
- Validation (per driver): Bull evidence cards / Bear evidence cards /
  Triangulator output (verdict + revised estimate + unresolved tensions +
  evidence counts by tier)
- Screener: sortable table — market cap, P/E (trailing/forward), revenue growth YoY, EBIT margin, FCF yield, net debt/EBITDA, dividend yield; filterable by exposure tier, transcript source, per-driver verdict, data-starved flag
- Synthesis: rendered `research_note.md` with "open in new tab" link

**Right panel: log + config**
- **Log:** live activity stream via Supabase Realtime — subagent calls,
  URL fetches, verifications, token spend per stage. Filterable by stage.
- **Config:** model selection, evidence lookback window (default 12 months),
  max evidence per driver per side (default 6), source tier weights.

---

## 7. File structure (Next.js app)

```
altree-research/
├── README.md
├── HANDOFF.md                              ← this file
├── package.json
├── tsconfig.json
├── next.config.js
├── .env.example
├── .env.local                              SUPABASE_*, ANTHROPIC_API_KEY, etc.
│
├── app/
│   ├── (auth)/sign-in/page.tsx
│   ├── (main)/
│   │   ├── page.tsx                        ← thesis list + "new thesis" CTA
│   │   ├── thesis/new/page.tsx             ← Stage 1 entry (paste prose)
│   │   └── thesis/[id]/page.tsx            ← three-panel view
│   ├── api/
│   │   ├── thesis/extract/route.ts
│   │   ├── thesis/refine/route.ts
│   │   ├── thesis/[id]/route.ts
│   │   ├── thesis/[id]/stream/route.ts
│   │   ├── universe/build/route.ts
│   │   ├── universe/refresh/route.ts
│   │   ├── scan/run/route.ts
│   │   ├── validate/driver/route.ts
│   │   ├── screen/route.ts
│   │   └── synthesize/route.ts
│   └── layout.tsx
│
├── lib/
│   ├── agents/
│   │   ├── thesis-extractor.ts             ← Stage 1 LLM agent
│   │   ├── thesis-refiner.ts               ← NL edit agent
│   │   ├── universe-discoverer.ts          ← Stage 2 LLM agent
│   │   ├── ir-page-finder.ts               ← IR discovery (used in Stage 2 + ad-hoc)
│   │   ├── bull-researcher.ts              ← Stage 4 sub-agent
│   │   ├── bear-researcher.ts              ← Stage 4 sub-agent
│   │   ├── verifier.ts                     ← Stage 4 sub-agent
│   │   ├── triangulator.ts                 ← Stage 4 sub-agent
│   │   ├── screener.ts                     ← Stage 5 (mechanical metric fetch + tag assembly; optional per-ticker LLM notes)
│   │   └── synthesizer.ts                  ← Stage 6 LLM agent
│   ├── data/
│   │   ├── yahoo.ts                        ← yahoo-finance2 wrapper (shared p-limit, daily cache)
│   │   ├── aggregate.ts                    ← in-memory aggregation over TickerMetrics[]
│   │   ├── ir-fetch.ts                     ← IR page fetch + PDF parsing (pdfjs-dist)
│   │   ├── gics.ts                         ← GICS taxonomy + filters
│   │   └── regions.ts                      ← REGION_BY_SUFFIX ported from altree-finance
│   ├── schemas/
│   │   ├── thesis.ts                       ← Zod schemas
│   │   ├── universe.ts
│   │   ├── driver.ts
│   │   ├── validation.ts
│   │   └── screener.ts                     ← ticker metrics + tags row schema
│   └── supabase/
│       ├── client.ts                       ← browser + server clients
│       └── types.ts                        ← generated by `supabase gen types`
│
├── components/
│   ├── three-panel-layout.tsx
│   ├── stage-list.tsx
│   ├── artifact-view.tsx
│   ├── live-log.tsx
│   ├── thesis-editor.tsx                   ← NL edit UI for Stage 1
│   ├── universe-table.tsx                  ← editable for Stage 2
│   └── driver-validation-card.tsx          ← Stage 4 Bull/Bear/Tri display
│
└── supabase/
    └── migrations/
        └── 0001_init.sql
```

---

## 8. Supabase schema (initial migration)

```sql
-- users table managed by Better Auth (Postgres adapter) in schema `public`
-- (Supabase reserves the `auth` schema for its own service; Better Auth uses
-- public by default. `user` is a SQL keyword and must be quoted: public."user")
-- (table + column names are Better Auth's defaults; rename via adapter config if needed)

create table theses (
  id              text primary key,           -- e.g., eu_defense_rearmament_26_05_01
  user_id         text references public."user"(id) on delete cascade,
  version         int default 1,
  created_at      timestamptz default now(),

  source_snippet  text,                       -- prose user pasted
  thesis          jsonb,                      -- full thesis schema

  status          text default 'draft',       -- draft | validated | stale | broken
  verdict         text,                       -- supports | breaches | inconclusive
  last_validated_at timestamptz,

  unique (user_id, id)
);

create table universes (
  id              text primary key,
  created_by      text references public."user"(id) on delete set null,
  created_at      timestamptz default now(),
  refreshed_at    timestamptz,
  universe        jsonb                        -- full universe schema
);

create table validation_runs (
  id              uuid primary key default gen_random_uuid(),
  thesis_id       text references theses(id) on delete cascade,
  run_at          timestamptz default now(),
  results         jsonb,                       -- map of driver_id → validation result
  overall_verdict text                         -- supports | breaches | inconclusive
);

create table scan_runs (
  id              uuid primary key default gen_random_uuid(),
  thesis_id       text references theses(id) on delete cascade,
  run_at          timestamptz default now(),
  results         jsonb
);

create table screener_runs (
  id              uuid primary key default gen_random_uuid(),
  thesis_id       text references theses(id) on delete cascade,
  run_at          timestamptz default now(),
  rows            jsonb                        -- universe rows with metrics, tags, optional notes
);

create table pipeline_events (
  id              bigserial primary key,
  thesis_id       text references theses(id) on delete cascade,
  stage           text,                        -- 'extract' | 'universe' | 'scan' | 'validate' | 'screen' | 'synthesize'
  agent           text,                        -- 'bull_researcher' | 'verifier' | ...
  event_type      text,                        -- 'start' | 'tool_call' | 'complete' | 'error'
  payload         jsonb,
  created_at      timestamptz default now()
);

-- RLS
alter table theses enable row level security;
alter table universes enable row level security;
alter table validation_runs enable row level security;
alter table scan_runs enable row level security;
alter table screener_runs enable row level security;
alter table pipeline_events enable row level security;

-- RLS policies. Better Auth does not issue Supabase-flavored JWTs by default,
-- so `auth.uid()` is not populated. Two viable approaches:
--   (a) Service-role only from API routes; enforce ownership in application
--       code after verifying the Better Auth session. RLS stays enabled as
--       defence-in-depth with a deny-all default and no public policies.
--   (b) Wire Supabase's third-party auth integration with Better Auth so
--       `auth.jwt() ->> 'sub'` resolves to the Better Auth user id; then use
--       policies like the ones below.
-- MVP defaults to (a). Slice S13 evaluates (b) once collab semantics are
-- decided. Reference policy shapes for (b):
--
-- create policy "users see own theses" on theses
--   for all using (auth.jwt() ->> 'sub' = user_id);
-- create policy "all auth users read universes" on universes
--   for select using (auth.jwt() is not null);
-- create policy "creators edit universes" on universes
--   for all using (auth.jwt() ->> 'sub' = created_by);

-- enable realtime for live progress
alter publication supabase_realtime add table pipeline_events;
```

---

## 9. MVP scope vs deferred

### In MVP

- All 6 pipeline stages end-to-end
- **Researcher lens only** (Bull/Bear/Verifier/Triangulator)
- 1-2 industry drivers per thesis; company-level signals via screener metrics + optional per-ticker LLM notes
- IR-page discovery as **primary** transcript path
- `yahoo-finance2` as the only data provider
- Three-panel web UI on Vercel + Supabase
- Versioned validation runs persisted to DB
- Better Auth (single-user initially), Postgres adapter against the Supabase DB
- Live progress via Supabase Realtime

### Deferred to v2+

- **Positioning lens** (consensus delta — sell-side ratings, ETF flows,
  futures positioning, retail attention proxies)
- **Risk lens** (asymmetric downside analysis beyond `falsification` field)
- **Delta agent** for thesis-evolution comparison across validation runs
- **National filing system adapters** (DART for Korea, EDGAR for US, TDnet
  for Japan, HKEX for Hong Kong, RNS for UK)
- Theme-aware trusted-source whitelist (currently company-data only)
- Macro/industry source surface beyond company sources
- Commodity-driven theses (tin, uranium, rare earths)
- Real-time / intraday data
- Portfolio context / position sizing
- Backtest harness
- Theme YAML pre-curation (currently universes accrete via use)

---

## 10. Known constraints & follow-ups

### Data

- **`yahoo-finance2` transcript coverage is thin.** IR-page discovery is the
  primary path, not a fallback. Expect ~80% transcript coverage on global
  large-caps, <40% on small-caps. Tickers missing transcripts get a
  `data-starved` flag in synthesis and a tag on the screener row.
- **GICS taxonomy** needs to ship as a static data file in
  `lib/data/gics.ts`. MSCI publishes structure; codes are stable but not
  freely redistributable in full. MVP can use the 4-level structure
  (sector/industry-group/industry/sub-industry) without sub-industry
  descriptions.
- **Region taxonomy** — port `REGION_BY_SUFFIX` from
  `altree-finance/tools/tickers.py` to `lib/data/regions.ts`.
- **Universe staleness** — cached universe YAML doesn't auto-refresh. UI shows
  "last refreshed" badge; user triggers refresh manually.

### Optimized data handling (yahoo-finance2)

`yahoo-finance2` is a per-ticker client; it does not aggregate across a
universe and does not parallelise. Stages 3 (scan) and 5 (screener) both
need cross-universe data. Options, in increasing order of complexity — pick
based on universe size:

| Universe size | Approach | Notes |
|---|---|---|
| <30 tickers | Serial per-ticker fetch, in-memory aggregate | Simplest. Acceptable latency (~5-15s). |
| 30-150 tickers | Parallel fetch with `p-limit` (concurrency 5-8) + in-memory aggregate | Stay under Yahoo's implicit rate limit (~10 rps). Add jittered retry on 429. |
| 150+ tickers | Same as above, plus per-ticker daily cache in Supabase | New table `ticker_metrics_daily(ticker, fetched_on date, payload jsonb)`. Reuse rows where `fetched_on = current_date`. Backfill misses in parallel. |
| Recurring use | Daily Vercel cron (`/api/cron/refresh-metrics`) | Walks all universes' tickers once per day; populates `ticker_metrics_daily`. Screener reads from cache; on-demand path only fetches misses. |

Implementation rules:

1. **One module owns the wrapper:** `lib/data/yahoo.ts`. Every yahoo call
   goes through it. Never call `yahooFinance.*` directly from agent code.
2. **Aggregation is TypeScript, not yahoo-finance2.** Mean/median/sum across
   the universe lives in `lib/data/aggregate.ts`, fed by the cached or live
   per-ticker payloads. Keep aggregations pure functions of `TickerMetrics[]`
   so the same code works for live and cached inputs.
3. **Cache invalidation is daily, not on-demand.** A user-triggered refresh
   bypasses cache for that one universe; otherwise daily cron handles it.
4. **Concurrency limit is shared across stages.** A single `p-limit(8)`
   instance lives in the wrapper module — Stage 3 and Stage 5 share it so
   simultaneous orchestrator calls don't compound into 16+ parallel fetches.
5. **Failure mode is fail-soft per ticker, fail-loud at universe level.** A
   single ticker's fetch failure tags it `metrics_unavailable` and continues
   the screener with N-1 rows. >20% failure rate aborts the screener run with
   a clear error.

### LLM / agent

- **Citation verification is non-negotiable.** Without the Verifier sub-agent,
  the evidence layer rots fast. Red-team test before shipping.
- **Prompt caching** for the validation phase is load-bearing for cost. Same
  thesis context passes to Bull, Bear, Verifier, Triangulator. Cache the
  thesis + driver descriptions; only the per-agent task prompt differs. Cache
  key shape: `(thesis_id, driver_id)` for validation sub-agents.
- **Web search provider.** Anthropic `web_search` tool only — no fallback.
  Used for IR-page discovery and Bull/Bear research alike.

### Adversarial separation — implementation harness

Bull and Bear must run in genuinely separate Anthropic API contexts. This is
the single mechanism that makes the system better than TradingAgents'
shared-debate-history model; if it leaks even once, the differentiator is
gone. Implement it as follows:

1. **One `AnthropicClient` call per lens.** Bull and Bear each have their own
   `messages: Anthropic.MessageParam[]` array. Never construct one and pass
   the same reference to both. Never concatenate Bull's transcript into
   Bear's messages or vice versa.

2. **Separate system prompts per lens, with no cross-reference.** Bull's
   system prompt must not contain the strings "bear", "downside",
   "counter-evidence", or any framing of the opposing side. Bear's must not
   contain "bull", "upside", or equivalents. Each lens is given the thesis,
   the driver definition, and a one-sided directive — nothing about the
   other lens existing.

3. **No shared tool-result history.** Tool results from Bull's `web_search`
   / `fetch_url` calls go into Bull's messages only. There is no shared
   "tool cache" — even if Bear would search the same URL, it must search
   independently. Two reasons: (a) sequencing reveals the other lens's
   evidence, (b) shared cache becomes an implicit channel for prompt leakage.

4. **The orchestrator never assembles a combined prompt before validation
   completes.** Verifier is the first agent allowed to see both sides;
   Triangulator the second. Both run in their own contexts after Bull and
   Bear have fully returned. The orchestrator's job until then is strictly
   to fan out, not to merge.

5. **A `buildLensContext(lens, thesis, driver, priorEvidence)` helper that
   asserts isolation.** Before sending, the helper must check: (a) the
   `messages` array contains no string from the opposite lens's prior
   evidence, (b) the system prompt does not contain the opposite lens's
   identifier ("bear_researcher", etc.), (c) the tool-result blobs in the
   messages all originated from this lens's prior turns within this driver
   (or the lens's prior driver in the same run, for sequential context).
   Assertion failures throw and fail the run — they are not warnings.

6. **`priorEvidence` carry-over within a lens, across drivers.** Bull's prior
   evidence on driver I1 can enter Bull's prompt for driver I2 (the
   sequential-within-lens behavior). Bear's prior evidence on I1 can enter
   Bear's I2 prompt. **Never cross.** The helper in step 5 enforces this
   by accepting only same-lens prior evidence.

7. **Red-team test before shipping Stage 4.** Construct a thesis where the
   bull case is the string `XYZZY_BULL_ONLY` and the bear case is
   `XYZZY_BEAR_ONLY`. Run validation. Assert: the string `XYZZY_BEAR_ONLY`
   never appears in any payload sent to the Bull researcher (system prompt,
   messages, tool results, or cached prompt prefix), and symmetrically for
   Bear. Run this test in CI on every change to the agents directory.

8. **Logging redaction.** `pipeline_events.payload` for Bull/Bear events
   stores only the lens's own content. Triangulator events may store both.
   Do not log a unified "Stage 4 status" event that includes both lenses'
   raw output before Triangulator runs — log per-lens events, then a
   Triangulator event.

### Infrastructure

- **Vercel function timeouts.** Per-driver validation must fit <60s (Hobby/Pro
  default) or <300s (Fluid Compute on Pro). If a single driver requires >6
  evidence sources per side, expect timeout pressure. Mitigation: cap
  evidence count or split Bull and Bear into separate API calls.
- **Cost monitoring.** Track per-thesis spend in `pipeline_events`. Set an
  upper bound (e.g., $5/thesis) and alert above.

### Schema / UX

- **Driver classification** — industry/company tag on each driver kept for
  filterability later. Macro driver classification dropped from schema.
- **Versioning theses across time** — schema supports it via `version` field
  and IDs of shape `<slug>_<yy>_<mm>_<run>`. UI needs a "thesis history" view
  before this is usable (deferred).
- **Delta agent design** — build after 3-5 real re-validations have happened
  so the diff format reflects actual change patterns.

---

## 11. Quick start (VS Code session, day 1)

```bash
# Scaffold first (create-next-app refuses non-empty dirs and would clobber .git)
npx create-next-app@latest altree-research --typescript --app --tailwind --eslint
cd altree-research

# Init repo + create remote
git init
gh repo create altree-research --private --source=. --remote=origin

# Dependencies
npm install @supabase/supabase-js @supabase/ssr
npm install @anthropic-ai/sdk
npm install yahoo-finance2 cheerio pdfjs-dist p-limit
npm install zod

# Supabase
npx supabase init
npx supabase start                            # local Postgres + studio
# Create the migration above as supabase/migrations/0001_init.sql
npx supabase db push                          # apply

# Env
cp .env.example .env.local
# Fill: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#       SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY

# Run
npm run dev                                   # http://localhost:3000

# Deploy
# Push to GitHub; connect repo in Vercel; add same env vars in Vercel project settings.
# Enable Vercel password protection (Project Settings → Deployment Protection)
# until Better Auth is wired up.
```

---

## 12. Suggested implementation order (4-week MVP)

**Week 1 — foundations**
- Next.js + Supabase scaffolding, auth wired
- Three-panel layout shell (no data)
- `yahoo-finance2` wrapper + smoke tests against 10 global tickers
- GICS taxonomy + `regions.ts` ported
- Anthropic SDK setup with prompt caching scaffold

**Week 2 — stages 1-3 (the easy half)**
- Stage 1: thesis extractor agent + Zod validation + Supabase write
- Stage 1 UX: paste prose, see draft, NL-edit, confirm
- Stage 2: universe builder (sector-theme mechanical path only — defer
  multi-GICS and style themes)
- Stage 2: IR-page-discovery sub-agent + universe table editor
- Stage 3: scan runner + simple chart UI

**Week 3 — stage 4 (the hard one)**
- Bull researcher with separate context + tool use
- Bear researcher (separate context, no Bull visibility)
- Verifier: URL refetch + quote-presence confirmation + date check
- Triangulator: verdict assignment + revised central estimate + tension extraction + evidence-count summary
- Per-driver progress display in left panel
- Realtime log via Supabase Realtime

**Week 4 — stages 5-6 + polish**
- Screener (parallel yahoo-finance2 fetch + tag assembly; daily cache if universe size warrants)
- Optional per-ticker LLM notes column, off by default
- Synthesizer: markdown + JSON sidecar
- "Read note" view with inline JSON-sidecar drill-down
- 3 end-to-end test theses on real prose snippets
- Cost instrumentation

**After week 4:** real validation work on 5-10 theses. Adjust based on actual
failure modes. Build Positioning lens, delta agent, and theme YAML
pre-curation in v2 only after seeing what's actually painful.

---

## 13. Open design decisions left for implementation

These were settled at the level of approach but not concrete spec:

1. **GICS code source** — which list to bundle. MSCI publishes structure but
   full descriptors aren't open-licensed. Decide between (a) bundling the
   4-level code structure only and looking up descriptors at runtime via a
   public source, or (b) maintaining a hand-curated subset for the sectors
   you care about.
2. **Prompt cache key strategy** — likely `(thesis_id, driver_id)` for
   validation sub-agents. Confirm Anthropic's caching constraints for the
   actual prompts you write.
3. **Verdict aggregation rule** — how driver-level verdicts roll up to a
   thesis-level `overall_verdict`. Default starting point: worst-of (any
   `breaches` → thesis breaches; any `inconclusive` and no `breaches` →
   inconclusive; else supports). Revisit after 5-10 real validations.
4. **Universe sharing semantics** — current schema lets all auth'd users read
   universes. Decide whether collab partner can edit your universe or only
   fork it.
5. **Source tier list ratification** — Tier 1/2/3 boundaries are sketched
   (filings → wire press → trade press → sell-side). Confirm specific
   publications in each tier before shipping the Bull/Bear prompts.
6. **Cost cap behavior** — when a thesis hits the per-thesis spend cap mid-
   pipeline, fail-loud or partial-result? Default: fail-loud with clear error;
   user re-runs with explicit confirmation.
7. **Screener metric set** — current default columns (market cap, P/E
   trailing/forward, revenue growth YoY, EBIT margin, FCF yield, net
   debt/EBITDA, dividend yield) cover most theses. Add sector-specific
   metrics (book/value for banks, RPO/billings for SaaS) once you see what
   actually misses.

---

## 14. Naming & identifiers

- **Repo:** `altree-research`
- **Vercel project:** `altree-research`
- **Supabase project:** `altree-research`
- **Thesis IDs:** `<slug>_<yy>_<mm>_<run>` (e.g., `eu_defense_rearmament_26_05_01`).
  Underscores; lowercase; 2-digit year + month + 2-digit run number within that
  month, zero-padded. A second pass in the same month becomes `..._26_05_02`;
  a re-pass in November is `..._26_11_01`.
- **Universe IDs:** lowercase slug (e.g., `eu_defense_global`,
  `semis_ai_infra`). Not month-versioned — universes evolve in place.
- **Driver IDs:** lowercase slug within a thesis (e.g., `backlog_to_revenue`,
  `order_intake_growth`). Unique within a thesis only.

---

## 15. Cycle 3 — Open-question resolver

**Status:** speced, not implemented. Builds on the memo-writer's
`open_questions` output landed in cycle 2.

### Why

The memo step already produces high-signal open questions per thesis (e.g.
"Does the forward P/E spread between Korean memory and US/EU peers exceed
10%?", "What share of SK Hynix revenue is HBM-derived?", "Is Huawei's
indigenous DRAM program on a credible timeline?"). Today they're left as
text — the analyst has to leave the app to chase down each answer. Cycle 3
wires answers back into the same chat thread.

### The routing problem

Different questions need different data sources. A generic research agent
that hits the web for every question is wasteful and slow when ~30% of
typical memo questions are answerable from data already in the universe
+ scan tables. The cycle 3 design is a question classifier that bins each
question into one of five categories, plus a focused resolver per bin.

| Category | What it means | Resolver |
|---|---|---|
| `derivable` | Solvable from scan + universe data already in hand. Spread questions, valuation discounts vs peers, growth rank within the universe. | Deterministic compute over local data, no LLM call for the answer itself. Format the result + cite which tickers were used. |
| `fundamentals_extra` | Yahoo has it, we just didn't pull it. Segment revenue breakdowns, share counts, balance-sheet items. | One-shot Yahoo `quoteSummary` extension per question. Cheap. |
| `corpus` | Answerable from the expert substack corpus already ingested for bull/bear (`expert_posts` table). | Re-use the bull/bear researcher retrieval, scoped to the specific entity/claim in the question. |
| `web` | External research needed. Industry-analyst views, forward roadmap claims, recent regulatory developments. | Search through a credibility-filtered provider; see §15.3 below. |
| `needs_analyst` | Proprietary intel (sell-side numbers, internal forecasts), or unanswerable from any feed the system has access to. | Tag for human; never auto-answer. |

### Architecture

```
memo_writer (cycle 2)
   ↓ produces open_questions[]
question_classifier (new, Haiku)
   ↓ tags each question with { category, hint, confidence }
   ↓
   ├── derivable    → lib/resolvers/derivable.ts (pure functions)
   ├── fundamentals_extra → lib/resolvers/yahoo-extra.ts (Yahoo + Haiku summarize)
   ├── corpus       → lib/agents/question-corpus.ts (reuse retrieval)
   ├── web          → lib/agents/question-web.ts (allowlist + LLM judge)
   └── needs_analyst → no-op, surface tag in UI

Result → /api/question/resolve (POST) → app bubble below the question
                                         + sources chips
```

### Credibility filter for the `web` path

Three layers stacked:

1. **Hard allowlist** of finance/research domains: SEC filings, company IR,
   Reuters, Bloomberg, WSJ, FT, Nikkei Asia, IEEE Spectrum, semianalysis,
   TrendForce, IDC, Gartner, government statistical agencies. Lives in
   `lib/data/credible-sources.ts`, version-controlled. Anything outside the
   list is excluded by default.
2. **Tiering inside the allowlist**: tier 1 = primary source (10-K, IR
   release), tier 2 = mainstream financial press, tier 3 = analyst/blog
   inside the list. Surfaced on each fact as a coloured chip so the analyst
   sees provenance at a glance.
3. **LLM-as-judge gate**: even allowlisted results pass through a Haiku
   check that rejects dateless pages, opinion editorials, and anything
   contradicted by the other top results. The judge's rationale is stored
   alongside the answer for audit.

### Phased rollout

1. **Phase 1:** classifier + `derivable` resolver. Free LLM cost for the
   ~30% of questions that are pure computations over local data. Validates
   the routing pattern end-to-end.
2. **Phase 2:** `corpus` resolver. Already 80% built — reuses the
   bull/bear researcher's retrieval logic with a different query shape.
3. **Phase 3:** `web` resolver with allowlist + LLM judge.
4. **Out of scope for cycle 3:** `fundamentals_extra`. The Yahoo segment
   data is inconsistent across regions and ADRs; defer until we have a
   clearer story on which fields are reliable per region.

### Non-obvious tradeoffs

- **Mis-routing.** Even a good classifier will pick the wrong bin ~5–10% of
  the time. Plan for a manual override: small dropdown next to "Resolve"
  letting the analyst force a different resolver.
- **Allowlist as moat AND constraint.** Tight allowlist means high-trust
  answers but lots of "I can't answer this credibly" replies. The analyst
  will eventually want to add their favourite niche substack — make the
  allowlist editable from the UI rather than buried in code, with an audit
  trail of what was added when and by whom.
- **Bus factor on the corpus.** Cycle 2's expert corpus is fed by a small
  number of Substacks. The `corpus` resolver inherits the same blind spots
  — if the question asks about a topic no expert in the corpus has covered,
  the answer is empty and the system should say so rather than reaching to
  the web by default. Falling back to `web` automatically is tempting and
  wrong: it lets corpus gaps go undetected. Surface the empty result first;
  let the analyst request the web upgrade explicitly.

### UI surface

In the memo bubble's "Open questions" list, each bullet gets:

- A small category tag chip (e.g. "from scan data", "from corpus",
  "needs web", "needs analyst")
- A "Resolve" button (disabled for `needs_analyst`)
- An optional category-override dropdown for power users

On click, the resolution appears as a chat bubble below the question
with source chips. Sources hidden behind a "Show sources (N)" toggle to
keep the thread tight.

### Acceptance criteria

- [ ] `question_classifier` agent registered in `lib/data/agent-models.json`;
      classifies each open question with `{ category, hint, confidence }`
- [ ] `lib/resolvers/derivable.ts` answers spread / valuation-rank questions
      with zero LLM calls; cites the tickers + scan column used
- [ ] `lib/agents/question-corpus.ts` reuses corpus retrieval, returns a
      synthesis + the same `CorpusEvidence[]` shape as bull/bear
- [ ] `lib/agents/question-web.ts` enforces the allowlist + runs the
      Haiku judge; rejects anything outside the list
- [ ] `lib/data/credible-sources.ts` version-controlled allowlist + tier map
- [ ] `/api/question/resolve` POST route with `pipeline_events` writes for
      classifier + resolver per question
- [ ] Memo UI renders category tag chip + Resolve button per open question
- [ ] Resolved answers render as chat bubbles with source chips; "Show
      sources (N)" toggle reveals the underlying evidence
- [ ] Empty corpus result is surfaced honestly — no auto-fallback to web

---

**End of handoff.**
