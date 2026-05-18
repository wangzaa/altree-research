# S3: Universe build (sector-theme path) with manual edit — design

**Issue:** [#4](https://github.com/wangzaa/altree-research/issues/4)
**Builds on:** S1 (#2), S2 (#3), S2.5 (#16).
**Status:** Design approved 2026-05-18.

## Goal

Given a thesis whose scope identifies a sector/region/market-cap profile, let the operator pick one **anchor ticker** that embodies the thesis. Generate a 10–30-ticker candidate universe using a comps-style peer-selection LLM agent (seeded by the anchor's Yahoo metadata), enrich each candidate via Yahoo, filter for market cap floor, persist as a fresh `universes` row, and surface an editable table in the middle panel. Stage 2 lights up green when a universe is attached to the thesis.

## Decisions

| # | Choice | Decision |
|---|---|---|
| 1 | Discovery approach | **Anchor + comps methodology.** `yahoo-finance2` has no custom GICS+region+marketcap screener API, so the spec's "screener pass" is replaced with: operator-picked anchor → Yahoo enrichment of the anchor → agent generates comparable peers using comps-analysis peer-selection rules (similar business model, similar scale, similar geography; avoid conglomerates, distressed names, materially different business models). |
| 2 | Skill integration | **Port methodology into the agent system prompt.** Distill peer-selection rules from `/Users/neo/code/altree-finance/plugin/skills/comps-analysis/SKILL.md` into the universe-discoverer's system prompt. No Python/Excel dependency; fits the existing Next.js + Anthropic stack. |
| 3 | Universe identity / persistence | **Fresh row per build.** Each build creates a new universes row with id `<thesis_id>_universe_<nn>` (two-digit counter scoped to that thesis). Old rows persist as historical artifacts. `thesis.universe_id` updates to point at the most recent. Cross-thesis caching is deferred to S10. |
| 4 | Anchor selection UX | **Free-text input + `tickers_seed` as clickable suggestion chips.** The chips populate the input when clicked. The submit suffix-validates against `REGION_BY_SUFFIX`. Seeds are surfaced for convenience without being authoritative — quality of S1's seed extraction is uneven (verified live against the two existing thesis rows). |
| 5 | Edit endpoint | **`PATCH /api/universe/[id]`.** Matches the verb already established for `/api/thesis/[id]`. Body is the full edited universe payload; server validates with Zod and replaces in place. |
| 6 | Editable fields | **`exposure_tier`, `notes`, add/remove rows only.** `ticker` is set at row-creation only (suffix validated). `region` is derived from suffix and read-only. `name` / `market_cap_usd_b` are Yahoo-fetched at row-creation and read-only. Keeps editing surface tight and the data trustworthy. |

## AC corrections vs. the issue

The issue (#4) was written before S2 and S2.5 landed. Two corrections in this design:

- **Region taxonomy:** the AC example uses `["EUROZONE", "UK", "NON_EZ_DM_EU"]`. S2.5 replaced the broad "non-Eurozone Developed Market Europe" bucket with two first-class regions: `NORDICS` (Sweden, Norway, Denmark, Iceland) and `SWITZERLAND`. The cleaner post-S2.5 representation for an EU-defence thesis that wants to include Saab (`SAAB-B.ST`) and Kongsberg (`KOG.OL`) is `["EUROZONE", "UK", "NORDICS"]`; a tighter scope is `["EUROZONE", "UK"]` with Nordic primes arriving via `thesis.scope.tickers_seed` or the discoverer agent's anchor-driven peer expansion.
- **Discovery semantics:** the AC says "yahoo-finance2 screener pass". `yahoo-finance2` has no custom screener; replaced with the anchor+comps approach. The same downstream expectations hold: 10–30 ticker output, region mapped via `REGION_BY_SUFFIX`, market-cap floor enforced, ETF proxies tagged.

## Architecture

```
lib/data/yahoo.ts                      ← new: thin yahoo-finance2 wrapper (getQuote, getFundamentals)
lib/schemas/universe.ts                ← new: Zod for Universe shape
lib/schemas/universe-id.ts             ← new: generateUniverseId({thesisId, existingIds}) -> '<thesis_id>_universe_<nn>'
lib/agents/universe-discoverer.ts      ← new: anchor + thesis → peer list (comps methodology in system prompt)
app/api/universe/build/route.ts        ← new: POST { thesis_id, anchor_ticker } → builds & writes universe + bumps thesis.universe_id
app/api/universe/[id]/route.ts         ← new: GET + PATCH
components/universe-table.tsx          ← new: editable table (tier dropdown, notes, add/remove rows)
components/anchor-picker.tsx           ← new: free-text + seed chips
app/thesis/[id]/page.tsx               ← edit: mount AnchorPicker + UniverseTable in middle panel
components/stage-list.tsx              ← edit: light up Stage 2 when thesis.universe_id is set
```

No DB migration. `theses.thesis` jsonb already supports `universe_id`; the existing `public.universes` table (`id text PK, created_by text, created_at timestamptz, refreshed_at timestamptz, universe jsonb`) already matches the shape.

## Components

### `lib/data/yahoo.ts`

Installs `yahoo-finance2` as a runtime dep. Exports:

```ts
export interface Quote {
  name: string;
  market_cap_usd: number | null;
}
export interface Fundamentals {
  sector?: string;
  industry?: string;
}
export async function getQuote(ticker: string): Promise<Quote | null>;
export async function getFundamentals(ticker: string): Promise<Fundamentals | null>;
```

Returns `null` on any error (unknown ticker, rate-limit, network, parse failure). Caller decides skip behavior. Serial fetches only — no `p-limit`, no daily cache (S10 will add both). Each function logs `[lib/data/yahoo] error:` with the ticker and error message on failure so we can see rate-limit / outage signal in dev.

### `lib/schemas/universe.ts`

Mirrors HANDOFF.md §3 shape:

```ts
export const ExposureTierSchema = z.enum(["pure_play", "diversified", "etf_proxy"]);
export const TranscriptSourceSchema = z.enum(["yahoo_finance2", "ir_page", "unavailable"]).optional();

export const UniverseTickerSchema = z.object({
  ticker: z.string().regex(YAHOO_TICKER_REGEX),
  name: z.string().min(1),
  region: RegionSchema,
  market_cap_usd_b: z.number().nonnegative(),
  exposure_tier: ExposureTierSchema,
  transcript_source: TranscriptSourceSchema,
  transcript_url: z.string().url().optional(),
  notes: z.string().default(""),
}).strict();

export const UniverseSchema = z.object({
  id: z.string().min(1),
  created_at: z.string(),
  last_refreshed: z.string(),
  gics_codes: z.array(z.string().refine(isValidGicsCode)).min(1),
  regions: z.array(RegionSchema).min(1),
  market_cap_min_usd: z.number().nonnegative(),
  tickers: z.array(UniverseTickerSchema).min(1).max(30),
}).strict();

export type Universe = z.infer<typeof UniverseSchema>;
```

The 30-row max enforces the AC's upper bound; the discoverer agent also caps its tool output but server-side validation is the source of truth.

### `lib/schemas/universe-id.ts`

```ts
export function generateUniverseId(params: {
  thesisId: string;
  existingIds: string[];
}): string;
```

Returns `<thesisId>_universe_<nn>` where `nn` is the smallest unused two-digit positive integer (starts at `01`). Mirrors the `generateThesisId` pattern from S1.

### `lib/agents/universe-discoverer.ts`

Forced `tool_use` against a tool named `propose_universe`. Returns `{ ok: true; tickers: ProposedTicker[] } | { ok: false; error; raw? }` after Zod validation.

```ts
export interface DiscoverUniverseInput {
  thesis: Thesis;
  anchor: {
    ticker: string;
    name: string;
    sector?: string;
    industry?: string;
    market_cap_usd: number | null;
  };
}

export interface ProposedTicker {
  ticker: string;
  exposure_tier: "pure_play" | "diversified" | "etf_proxy";
  notes: string;
}
```

System prompt distills comps-analysis peer-selection wisdom:

> You are building a comparable-company universe for an investment thesis.
>
> Inputs:
> - The thesis claim and scope (sectors, regions, market_cap_min_usd).
> - An anchor ticker the analyst has identified as embodying the thesis, with its name, sector, industry, and market cap.
>
> Your job: propose 10–25 ticker candidates that are TRULY comparable to the anchor for the purpose of evaluating this thesis.
>
> Peer-selection rules:
> - Same business model as the anchor (pure-play preferred; diversified conglomerates only when no pure-play exists in a region).
> - Comparable scale (within ~10x of the anchor's market cap; exclude micro-caps below `market_cap_min_usd`).
> - Comparable geography (prefer companies in the thesis's `regions`; cross-region peers only when they are clear market leaders).
> - Avoid: distressed/bankrupt names, pre-revenue startups, holding companies, pure-financial wrappers (BDCs, REITs unless the thesis IS about REITs).
> - Include 1–2 ETF proxies (broad-sector ETFs that approximate the thesis exposure) tagged `etf_proxy`.
> - Each non-ETF ticker is classified as `pure_play` (single-business primary exposure) or `diversified` (the company has the exposure but it's part of a larger mix).
>
> Yahoo ticker conventions (suffix → region):
> - US (no suffix). UK: `.L`. EUROZONE: `.DE/.F/.PA/.MI/.MC/.AS/.BR/.LS/.I/.VI/.HE/.AT/.RG/.TL/.VS`. NORDICS: `.ST/.OL/.CO/.IC`. SWITZERLAND: `.SW/.VX`. CEE: `.WA/.BD/.PR/.RO/.IS`. JAPAN: `.T`. KOREA: `.KS/.KQ`. GREATER_CHINA: `.SS/.SZ/.HK/.TW/.TWO`. SOUTH_ASIA: `.NS/.BO/.KA/.DH/.CM`. SEA: `.SI/.JK/.KL/.BK/.PS/.VN`. ANZ: `.AX/.NZ`. CANADA: `.TO/.V/.NE/.CN`. LATAM: `.SA/.MX/.SN/.BA/.CL/.LM`. MIDDLE_EAST: `.TA/.AE/.SR/.QA/.KW`. AFRICA: `.JO/.CA/.LG/.MA`.
> - There is no catch-all region; if a ticker's market doesn't fit any of these, do not include it in the thesis.
>
> Return the full candidate list via the supplied tool. Do not return free-text.

Tool input schema:

```jsonc
{
  type: "object",
  properties: {
    tickers: {
      type: "array",
      minItems: 5,
      maxItems: 30,
      items: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Yahoo Finance ticker with suffix" },
          exposure_tier: { type: "string", enum: ["pure_play", "diversified", "etf_proxy"] },
          notes: { type: "string", description: "One-line why this is a peer or what makes it a proxy" }
        },
        required: ["ticker", "exposure_tier", "notes"]
      }
    }
  },
  required: ["tickers"]
}
```

The system blocks use `cache_control: { type: "ephemeral" }` exactly like the extractor and refiner.

### `POST /api/universe/build`

Body: `{ thesis_id: ThesisIdSchema, anchor_ticker: z.string().min(1).max(40) }`.

Flow:

1. Body Zod validation; session resolution; thesis lookup (owner-scoped) → 400/401/404 paths.
2. `getRegionForTicker(anchor_ticker)` — if `null`, return `400 { error: "unknown_suffix", suffix }`.
3. Yahoo `getQuote(anchor)` + `getFundamentals(anchor)`. If `getQuote` returns null, return `502 { error: "anchor_lookup_failed" }`. `getFundamentals` returning null is non-fatal (sector/industry omitted).
4. `discoverUniverse({ thesis, anchor: { ticker, name, sector, industry, market_cap_usd } })`. If `ok: false`, return `422 { error: "discovery_failed", detail, raw }`.
5. For each proposed ticker:
   - `getRegionForTicker(t.ticker)` — if `null`, record in `dropped` with `reason: "unknown_suffix"` and skip.
   - Yahoo `getQuote(t.ticker)` — if `null`, record in `dropped` with `reason: "yahoo_lookup_failed"` and skip.
   - If `quote.market_cap_usd === null` OR `quote.market_cap_usd < thesis.scope.market_cap_min_usd`, record in `dropped` with `reason: "below_market_cap_floor"` and skip.
   - Otherwise assemble a `UniverseTickerSchema` row: `{ticker, name: quote.name, region, market_cap_usd_b: quote.market_cap_usd / 1e9, exposure_tier, notes, transcript_source: undefined, transcript_url: undefined}`.
6. If fewer than 5 tickers survive the filter (and we always include the anchor as one), return `422 { error: "discovery_failed", detail: "too_few_survivors" }`. The anchor is always added to the universe row as its own ticker entry (deduped against the agent's output if it proposed itself).
7. Generate the universe id via `generateUniverseId({thesisId: thesis.id, existingIds})` where `existingIds` is fetched with `LIKE '<thesis_id>_universe_%'`.
8. INSERT into `universes` (`id`, `created_by: user.id`, `universe`, `created_at: now`, `refreshed_at: now`).
9. UPDATE `theses` for this thesis: set `thesis.universe_id = <new id>`, `version = version + 1`.
10. 200 `{ universe: <row>, dropped: [...] }`.

### `GET /api/universe/[id]`

Owner-scoped via the universes row's `created_by`. Returns 404 if missing or not owner.

### `PATCH /api/universe/[id]`

Body: full edited Universe payload.

1. `UniverseSchema.safeParse(body)` → 422 on failure.
2. Assert `body.id === param.id` → 400 `id_mismatch` if not.
3. Owner check via existing row's `created_by`.
4. UPDATE `universes` SET `universe = <body>`, `refreshed_at = NOW()`.
5. 200 `{ universe: <row> }`.

Edits do not bump `thesis.version` — universe edits are separate from thesis state.

### `<AnchorPicker>`

Controlled component. Props: `{ tickers_seed: string[]; onSubmit: (anchor: string) => void; disabled: boolean }`.

Layout (ASCII):

```
┌────────────────────────────────────────────────────────────┐
│ Anchor ticker for this universe                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Yahoo ticker (e.g. RHM.DE)                             │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ Suggested from thesis: [RHM.DE] [BA.L] [LDO.MI]            │
│                                                            │
│                                       [Build universe →]   │
└────────────────────────────────────────────────────────────┘
```

Chips render only when `tickers_seed.length > 0`. Submit validates suffix via `REGION_BY_SUFFIX` — unknown suffix surfaces inline as a red-text error below the input ("Unknown ticker suffix .ZZ — not a supported Yahoo market"). Disabled state shown while parent is loading.

### `<UniverseTable>`

Middle-panel component. Props: `{ initial: Universe; onSaved: (next: Universe) => void }`.

Columns: ticker / name / region / market_cap_usd_b / exposure_tier (`<select>`) / notes (`<input>`) / remove button.

Below the table: "Add row" affordance that opens an inline row-creation form (free-text ticker → suffix validation → Yahoo fetch on submit → new row appended, defaulting to `exposure_tier: "diversified"`, empty notes).

Top-right: "Save" button (disabled when no dirty rows) + "Refresh from scope" button (calls parent which re-opens `<AnchorPicker>`).

Save flow: assemble full Universe payload from local state → PATCH `/api/universe/<id>` → on success, call `onSaved(next)` and clear dirty state. On 422, surface the validation error in a red-text alert.

Local state is dirty when:
- A row's `exposure_tier` or `notes` differs from `initial`.
- Rows added or removed.

### `app/thesis/[id]/page.tsx` edit

The existing client wrapper `thesis-detail.client.tsx` (added in S2) becomes the host for the universe affordance. New state:

```ts
const [universe, setUniverse] = useState<Universe | null>(initialUniverse);
const [picking, setPicking] = useState<boolean>(initialUniverse === null);
```

When `picking`, render `<AnchorPicker>` instead of the universe table. On successful `/api/universe/build` response, hide the picker, set the universe, and re-render. "Refresh from scope" sets `picking = true`.

### `<StageList>` edit

Reads `thesis.universe_id` and a flag indicating whether the universe has any tickers (passed from parent). Stage 2 row's status switches from placeholder to `complete` when both conditions hold.

## Data flow

```
[user on /thesis/<id> with no universe yet]
   └─> <AnchorPicker> renders (free-text + chips from thesis.scope.tickers_seed)
   └─> user submits anchor → POST /api/universe/build { thesis_id, anchor_ticker }
         ├─> validate body / session / thesis owner          → 400/401/404
         ├─> getRegionForTicker(anchor)                      → 400 unknown_suffix
         ├─> Yahoo getQuote+getFundamentals(anchor)          → 502 anchor_lookup_failed
         ├─> discoverUniverse(thesis, anchor)                → 422 discovery_failed
         ├─> for each proposed peer:
         │     suffix validation, Yahoo getQuote, market-cap floor
         │     (dropped peers recorded with reason)
         ├─> generateUniverseId({thesisId, existingIds})
         ├─> INSERT into universes
         ├─> UPDATE theses SET thesis.universe_id, version + 1
         └─> 200 { universe, dropped }
   └─> client hides picker, renders <UniverseTable> with the universe
   └─> user edits rows → 'Save' → PATCH /api/universe/<id>
         └─> Zod validate, replace, refreshed_at = NOW()
         └─> 200 { universe }
   └─> 'Refresh from scope' → client re-opens <AnchorPicker> → next build creates a new universe row
```

## Error matrix

| Failure | HTTP | Body |
|---|---|---|
| POST /build body shape wrong | 400 | `{ error: "invalid_body" }` |
| POST /build unknown ticker suffix on anchor | 400 | `{ error: "unknown_suffix", suffix }` |
| POST /build thesis not found / not owner | 404 | `{ error: "not_found" }` |
| POST /build Yahoo fails on anchor | 502 | `{ error: "anchor_lookup_failed" }` |
| POST /build agent fails or returns junk | 422 | `{ error: "discovery_failed", detail }` |
| POST /build fewer than 5 survivors after filtering | 422 | `{ error: "discovery_failed", detail: "too_few_survivors" }` |
| POST /build DB write fails | 500 | `{ error: "persist_failed" }` |
| GET /universe/[id] not found / not owner | 404 | `{ error: "not_found" }` |
| PATCH /universe/[id] body fails Zod | 422 | `{ error: "invalid_universe", detail }` |
| PATCH /universe/[id] body id mismatches param | 400 | `{ error: "id_mismatch" }` |
| PATCH /universe/[id] not found / not owner | 404 | `{ error: "not_found" }` |
| PATCH /universe/[id] DB write fails | 500 | `{ error: "persist_failed" }` |

Yahoo errors on peer tickers (not anchor) are silently absorbed — the dropped peer goes into the `dropped[]` response array with a reason, and the universe ships without it. No retry.

## Testing

| File | Scope |
|---|---|
| `tests/data/yahoo.test.ts` | Mock `yahoo-finance2`; assert `getQuote` / `getFundamentals` return null on error and parse fields on success; ticker not found returns null. |
| `tests/schemas/universe.test.ts` | Zod round-trip on a canonical Universe; `exposure_tier` enum rejects unknown values; unknown region rejected; >30 tickers rejected; <1 ticker rejected. |
| `tests/schemas/universe-id.test.ts` | First ID is `<thesis_id>_universe_01`; with existing `_01,_02` next is `_03`; gap in `_01,_03` returns `_02` (smallest unused). |
| `tests/agents/universe-discoverer.test.ts` | Mock `createMessage`; assert tool name and tool_choice; assert system prompt mentions pure_play/diversified/etf_proxy and at least three region suffixes; tool_use missing → ok:false; wrong tool name → ok:false; >30 tickers → ok:false; agent returns valid → ok:true with parsed list. |
| `tests/api/universe-build.test.ts` | POST happy-path with mocked Yahoo + discoverer + supabase; 400 invalid_body; 400 unknown_suffix; 401 unauthenticated; 404 not_found; 502 anchor_lookup_failed; 422 discovery_failed; 422 too_few_survivors; assertion that the inserted universe has the right id pattern and that `thesis.universe_id` + `thesis.version` get updated; dropped[] surfaces peers filtered by market cap. |
| `tests/api/universe-patch.test.ts` | PATCH happy-path (universe replaced, refreshed_at bumped); 422 invalid; 400 id_mismatch; 404 not_found; 401. |
| `tests/api/universe-get.test.ts` | GET happy-path; 404 not_found; 404 not_owner. |
| `tests/components/anchor-picker.test.tsx` | Renders free-text input; renders chips when tickers_seed non-empty; chip click populates input; submit triggers parent callback; unknown-suffix inline error surfaces. |
| `tests/components/universe-table.test.tsx` | Renders rows from initial; add row triggers Yahoo fetch (mocked) and appends; remove row triggers state change; exposure_tier dropdown change updates dirty state; Save button disabled when clean, enabled when dirty; Save triggers PATCH with full payload; onSaved called on success; 422 surfaces inline error. |

## Acceptance criteria mapping (post-design)

Issue #4 ACs translated for the anchor+comps approach (and S2.5 region taxonomy):

- [ ] **EU-defence (preserves issue continuity):** A thesis with `scope.sectors = ["20101010"]`, `scope.regions = ["EUROZONE", "UK", "NORDICS"]`, `scope.market_cap_min_usd = 1_000_000_000`, anchored on `RHM.DE`, produces a universe with 10–30 tickers including the major EU-defence primes (Rheinmetall, BAE Systems, Leonardo, Thales, Dassault Aviation) plus Nordic primes Saab (`SAAB-B.ST`) and Kongsberg (`KOG.OL`) via the now-first-class `NORDICS` region. → covered by manual smoke + agent test.

- [ ] **APAC semis (showcases the regional-cluster taxonomy):** A thesis with `scope.sectors = ["453010"]` (Semiconductors), `scope.regions = ["GREATER_CHINA", "KOREA"]`, `scope.market_cap_min_usd = 1_000_000_000`, anchored on `2330.TW` (TSMC), produces a universe of 10–30 names including TSMC (`2330.TW`, GREATER_CHINA), Samsung Electronics (`005930.KS`, KOREA), SK Hynix (`000660.KS`, KOREA), MediaTek (`2454.TW`, GREATER_CHINA), and SMIC (`0981.HK`, GREATER_CHINA). ASML (`ASML.AS`, EUROZONE) may also be included by the agent as a cross-region market leader per the "prefer in-scope but allow clear leaders" rule in the discoverer's system prompt. → covered by manual smoke + agent test.
- [ ] Each ticker row carries `region` mapped via `REGION_BY_SUFFIX`, a `market_cap_usd_b` value from Yahoo, and an agent-assigned `exposure_tier`. → covered by `universe-build` test + universe Zod schema.
- [ ] ETF proxies appear as rows with `exposure_tier: "etf_proxy"` and a `notes` string. → covered by discoverer test + agent system prompt explicitly asks for 1–2 ETFs.
- [ ] Editing a row and saving persists; refresh shows the edit. → covered by `universe-patch` + manual smoke.
- [ ] Adding a seed ticker by hand validates the suffix against `REGION_BY_SUFFIX` and fetches metadata via `lib/data/yahoo.ts`. → covered by universe-table add-row test.
- [ ] The universe payload matches `UniverseSchema` (mirrors HANDOFF.md §3). → covered by Zod tests.
- [ ] **AC re-cast:** original wording was "a second thesis with the same scope reuses the existing universe row". That's deferred to S10 along with the daily cache. S3 lands "fresh row per build" with `<thesis_id>_universe_<nn>` numbering; the historical builds are queryable but not auto-shared.
- [ ] Vitest unit tests for `REGION_BY_SUFFIX` mapping completeness (already in `tests/data/regions.test.ts` from S2.5), GICS code validation (already in `tests/data/gics.test.ts` from S1), universe Zod round-trip → `tests/schemas/universe.test.ts`.
- [ ] Stage 2 in the left panel lights up green when a universe is attached → `<StageList>` test + manual smoke.

## YAGNI cuts

- **Cross-thesis universe caching** (the "same scope → reuse row" AC as originally written) → S10.
- **Daily refresh / staleness detection** → S10.
- **Concurrency in Yahoo wrapper** (p-limit, retry, rate-limit handling) → S10.
- **Multi-GICS theme-spanning universes** → v2 (per issue).
- **Editing ticker/region/market_cap_usd_b inline** → operator removes + re-adds.
- **`transcript_source` / `transcript_url` population** → S4.
- **"If-Match" / 409 on concurrent universe PATCH edits** → S13.
- **A YAML artifact file alongside the DB row** (mentioned in HANDOFF.md §3 as `universes/<id>.yaml`) → not implemented in S3; DB row is the source of truth.

## Risks and open questions

- **Agent comp quality is the main risk.** A bad anchor or a thinly-covered sector produces low-signal peers. Mitigation: the design surfaces `dropped[]` so the operator sees what was filtered out; the table is fully editable so bad rows can be removed; "Refresh from scope" lets the operator try a different anchor cheaply.
- **Yahoo rate-limiting.** Serial fetches in dev are unlikely to trip rate limits at this volume, but at the limit (anchor + up to 30 peers) we could hit IP-based throttles. S10 will add proper concurrency control. Until then: serial fetches with logged failures.
- **Anchor that doesn't match the thesis scope.** If the operator picks an anchor whose `getRegionForTicker` returns a region not in `thesis.scope.regions`, we still build. The agent is told the thesis regions and tends to respect them, but cross-region anchors are allowed by design — they're useful for "what's the US equivalent of this EU thesis" exploration. This is a deliberate non-enforcement.
- **First-build idempotency on accidental double-click.** Two rapid POST `/build` calls produce two universe rows (counter `_01`, `_02`). The second `thesis.universe_id` update wins. Trade-off accepted — guarding against this needs an in-flight lock that's overkill for a single-user dev tool. Reconsider in S13.
