# S5: Scan stage (history + descriptive context) — design

**Issue:** [#7](https://github.com/wangzaa/altree-research/issues/7)
**Builds on:** S3 (#4 — universe row available; `lib/data/yahoo.ts` already wraps `quote` + `quoteSummary`).
**Status:** Design draft 2026-05-19.

## Goal

Stage 3 of the pipeline. Given a thesis with a built universe, fetch 5-year monthly price history for every ticker (anchor + peers + ETF proxies), compute a single cross-universe fundamentals snapshot (mean/median margins + FCF yield), then have an LLM agent write a strictly-descriptive 3-paragraph markdown. Persist as a `scan_runs` row (the table already exists from migration 0001). Surface the markdown + a simple line chart in the middle panel under Stage 3. Stage 3 lights up green on success.

S5 has zero IR-transcript dependency. The `transcript_source` / `transcript_url` fields on universe rows are optional and ignored by the scan path.

## Decisions

| # | Choice | Decision |
|---|---|---|
| 1 | Charting library | **`recharts@^2`.** Issue's suggestion; React-friendly, server-rendering-safe (we render client-side only), 150KB gzipped. Tradeoff vs. lightweight-charts is bundle size, but recharts' declarative API matches the rest of the React UI. |
| 2 | History resolution | **Monthly closes for 5 years via `yahoo.getHistory(ticker, "5y", "1mo")`.** Adjusted close preferred (`adjClose ?? close`). Returns are computed downstream as `(close_t / close_{t-1}) - 1`. No daily series — 60 points per ticker × 20 tickers = 1,200 points payload, comfortably fits in the `scan_runs.results` jsonb column. |
| 3 | Fundamentals snapshot | **Single snapshot at scan time, three columns: `gross_margin`, `ebit_margin`, `fcf_yield`.** Fetched via `yahoo.quoteSummary(t, ["financialData", "defaultKeyStatistics"])` per ticker. `getRatios(ticker)` joins the modules into a flat `TickerRatios` row. Snapshot includes `mean`, `median`, and `per_ticker_used` (counts how many tickers contributed; tickers with all-null fields are excluded from the aggregate). ETFs are excluded from the fundamentals aggregate (proxy noise) — included only in history. |
| 4 | Idempotency on `/api/scan/run` | **Delete-then-insert in the route.** `scan_runs.id` is a uuid PK and there's no unique constraint on `thesis_id`, so UPSERT would need a migration. The route does `DELETE FROM scan_runs WHERE thesis_id = $1; INSERT ...`. Both queries owner-scoped via the existing thesis ownership check. The prior payload survives in the `pipeline_events` log per issue text. |
| 5 | `pipeline_events` write contract | **Two rows per scan: `event_type: "start"` then `event_type: "complete"` with the full results payload.** Keeps `pipeline_events` useful as an archive (prior runs are recoverable from the `complete` events) without over-instrumenting per-ticker fetches. Failures write `event_type: "error"`. |
| 6 | Judgment-leakage check | **Log warning, ship the result.** Per issue AC. The route runs a single regex over `descriptive_markdown` for the banned substrings (`should`, `will`, `expect`, `likely`, `believe`, `outperform`, `undervalued`, `overvalued`) and `console.warn`s with the first 3 matches. Operator sees the markdown anyway; this is a soft check that surfaces drift, not a gate. |
| 7 | Concurrency for Yahoo calls | **Serial, mirroring S3.** A 20-row universe → 20 history calls + 20 quoteSummary calls = 40 sequential requests. Estimated ~30–90s wall time. Acceptable for the dev tool; S10 will add proper concurrency control. |
| 8 | Re-run UX | **"Run scan" button in middle panel.** When no `scan_runs` row exists for the thesis, the button is the only thing rendered. When a row exists, render the markdown + chart + "Re-run scan" button (same endpoint, replaces the row). No background scheduling. |
| 9 | Stage 3 light-up | **Live-query `scan_runs` server-side.** `thesis-detail.client.tsx` accepts `initialScan: ScanResults \| null` (resolved in the server `page.tsx` via `getScanByThesis(thesisId, userId)`). `<StageList>` accepts a `scanComplete` prop derived from `initialScan !== null` — same pattern as the S3 `universeAttached` flag. |

## Architecture

```
lib/data/yahoo.ts                           ← edit: add getHistory(ticker, period, interval) + getRatios(ticker)
lib/aggregation/fundamentals.ts             ← new: pure aggregateFundamentals(rows) → {mean, median, per_ticker_used}
lib/schemas/scan.ts                         ← new: Zod for ScanResultsSchema + HistoryPointSchema + FundamentalsSnapshotSchema
lib/agents/scan-runner.ts                   ← new: describe-only LLM agent → 3-paragraph markdown
app/api/scan/run/route.ts                   ← new: POST orchestrator + delete-then-insert
app/api/scan/[thesisId]/route.ts            ← new: GET helper for client-side re-fetch (mirrors universe GET pattern)
components/scan-panel.tsx                   ← new: middle-panel host (Run button → results render)
components/scan-chart.tsx                   ← new: recharts <LineChart> wrapper
app/thesis/[id]/page.tsx                    ← edit: server fetch initialScan and pass through
app/thesis/[id]/thesis-detail.client.tsx    ← edit: mount <ScanPanel /> below UniverseTable
components/stage-list.tsx                   ← edit: light up Stage 3 when scanComplete is true
```

New runtime dependency in `package.json`:

- `recharts@^2`

No DB migration. `scan_runs` and `pipeline_events` are in `supabase/migrations/0001_init.sql`.

## Components

### `lib/data/yahoo.ts` extensions

Existing `getQuote` + `getFundamentals` are unchanged. Add:

```ts
export interface HistoryPoint {
  date: string;        // ISO month-end date "YYYY-MM-DD"
  close: number;       // adjusted close where available, else raw close
}

export async function getHistory(
  ticker: string,
  options?: { period?: "5y" | "1y"; interval?: "1mo" | "1d" },
): Promise<HistoryPoint[] | null>;

export interface TickerRatios {
  gross_margin: number | null;
  ebit_margin: number | null;
  fcf_yield: number | null;
}

export async function getRatios(ticker: string): Promise<TickerRatios | null>;
```

`getHistory` defaults to `period: "5y"` / `interval: "1mo"`. Computes `period1` as `today - 5 years` (or 1 year for "1y"), `period2` as today. Returns `null` on any error — caller decides skip behavior, mirroring `getQuote` semantics.

`getRatios` calls `quoteSummary(ticker, {modules: ["financialData", "defaultKeyStatistics"]})`. Field mapping:
- `gross_margin = financialData.grossMargins ?? null` (Yahoo serves as a decimal: 0.34 = 34%)
- `ebit_margin = financialData.operatingMargins ?? null` (EBIT margin proxy)
- `fcf_yield = financialData.freeCashflow != null && defaultKeyStatistics.marketCap != null ? freeCashflow / marketCap : null`

Returns `null` only if the entire quoteSummary call fails; an individual missing field becomes `null` in the row.

### `lib/aggregation/fundamentals.ts`

Pure module. One export:

```ts
import type { TickerRatios } from "@/lib/data/yahoo";

export interface FundamentalsAggregate {
  mean: TickerRatios;
  median: TickerRatios;
  per_ticker_used: number;
}

export function aggregateFundamentals(
  rows: TickerRatios[],
): FundamentalsAggregate;
```

For each column (`gross_margin`, `ebit_margin`, `fcf_yield`):
- Filter rows whose value is non-null AND finite.
- Mean = `sum / count`; median = standard middle-element / two-middle-average.
- If zero rows have a value for a column, that column's mean and median are `null`.
- `per_ticker_used` = the count of input rows where *any* of the three columns is non-null (so the operator can see "12 of 20 tickers contributed").

### `lib/schemas/scan.ts`

```ts
export const HistoryPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  close: z.number().nonnegative(),
}).strict();

export const TickerHistorySchema = z.object({
  ticker: z.string().min(1),
  points: z.array(HistoryPointSchema).min(1),
}).strict();

export const TickerRatiosSchema = z.object({
  gross_margin: z.number().nullable(),
  ebit_margin: z.number().nullable(),
  fcf_yield: z.number().nullable(),
}).strict();

export const FundamentalsSnapshotSchema = z.object({
  as_of: z.string(),
  mean: TickerRatiosSchema,
  median: TickerRatiosSchema,
  per_ticker_used: z.number().int().nonnegative(),
}).strict();

export const ScanResultsSchema = z.object({
  thesis_id: ThesisIdSchema,
  universe_id: z.string().min(1),
  ran_at: z.string(),
  history_5y: z.array(TickerHistorySchema).min(1),
  fundamentals_snapshot: FundamentalsSnapshotSchema,
  descriptive_markdown: z.string().min(1),
}).strict();

export type ScanResults = z.infer<typeof ScanResultsSchema>;
```

### `lib/agents/scan-runner.ts`

Forced tool use against `return_scan_description`. Returns `{ok: true; markdown: string} | {ok: false; error; raw?}` after Zod validation of the tool input.

```ts
export interface ScanRunnerInput {
  thesis: Thesis;
  universe: Universe;
  history_5y: TickerHistory[];
  fundamentals_snapshot: FundamentalsAggregate;
}
```

System prompt (single cached block):

> You are writing the descriptive Stage-3 context for an investment research artifact.
>
> You are given: the thesis claim, the universe of tickers being investigated, 5 years of monthly closing prices per ticker, and a single snapshot of universe-aggregate fundamentals (mean and median gross margin, EBIT margin, FCF yield).
>
> Your job: write exactly three short paragraphs (~80-120 words each) of *purely descriptive* prose summarising what the data shows.
>
> Paragraph 1 — universe price-history trajectory: aggregate trends across the universe (e.g. "the universe rose roughly 60% over the period, with the steepest move concentrated in 2024"). No predictions.
>
> Paragraph 2 — fundamentals snapshot: report mean and median for gross margin, EBIT margin, FCF yield as observed today. Note the spread between mean and median where notable.
>
> Paragraph 3 — dispersion / outliers: name 1-3 tickers whose 5y trajectory diverges sharply from the universe (top performer, bottom performer, or notable shape). Cite the rough magnitude.
>
> FORBIDDEN: judgment, prediction, valuation language. Do NOT use: "should", "will", "expect", "likely", "believe", "outperform", "undervalued", "overvalued". State only what the numbers are. Do NOT recommend action.
>
> Return the markdown via the `return_scan_description` tool. Do not return free-text alone.

Custom tool schema:

```jsonc
{
  type: "object",
  properties: {
    markdown: {
      type: "string",
      description: "Exactly three short markdown paragraphs separated by blank lines."
    }
  },
  required: ["markdown"]
}
```

`tool_choice: { type: "tool", name: "return_scan_description" }`. `max_tokens: 1024`.

### `POST /api/scan/run`

Body: `{ thesis_id: ThesisIdSchema }`.

Flow:

1. Body Zod parse; session resolution; thesis lookup (owner-scoped). 400/401/404 paths.
2. Resolve `universe_id = thesis.universe_id`. If null → 422 `{error: "no_universe"}`.
3. Fetch universe row (owner-scoped). If missing → 404.
4. INSERT `pipeline_events {stage: "scan", event_type: "start", payload: {thesis_id, universe_id}}`.
5. For each ticker in `universe.tickers` (serial):
   - `getHistory(ticker)` → push to `history_5y` array. Null result → record in `dropped[]` with reason `history_lookup_failed`; ticker excluded from both history and fundamentals.
   - If non-ETF (`exposure_tier !== "etf_proxy"`): `getRatios(ticker)` → push to ratios. Null → record in `dropped_ratios[]`; still keep history.
6. If `history_5y` has fewer than 3 entries → 422 `{error: "scan_failed", detail: "too_few_history", dropped}`.
7. `fundamentals_snapshot = aggregateFundamentals(ratios)`.
8. `scanRunner({thesis, universe, history_5y, fundamentals_snapshot})`. On `ok: false` → INSERT `pipeline_events {event_type: "error"}` then return 422.
9. Build `ScanResults` payload. Zod-validate.
10. Run judgment-leakage regex `/(\bshould\b|\bwill\b|\bexpect\b|\blikely\b|\bbelieve\b|\boutperform\b|\bundervalued\b|\bovervalued\b)/gi` over `descriptive_markdown`. On any match → `console.warn` with up to 3 matched substrings.
11. `DELETE FROM scan_runs WHERE thesis_id = $1` (idempotency).
12. `INSERT INTO scan_runs {thesis_id, results: <payload>}` (id auto-generated; `run_at` defaults to now).
13. INSERT `pipeline_events {stage: "scan", event_type: "complete", payload: <payload>}`.
14. 200 `{scan: <payload>, dropped, dropped_ratios}`.

### `GET /api/scan/[thesisId]`

Owner-scoped helper for client-side re-fetch. Returns the most recent `scan_runs` row's `results` for the thesis (the prior delete-then-insert means at most one row per thesis, but `ORDER BY run_at DESC LIMIT 1` is a defensive belt-and-suspenders). 404 if absent.

### `<ScanPanel>`

Client component. Props: `{ thesisId: ThesisId; universeId: string; initial: ScanResults \| null }`.

States:
- `initial === null` → render placeholder card with "Run scan" button.
- `initial !== null` → render `<ScanChart history={initial.history_5y} />`, `<ScanFundamentalsTable snapshot={initial.fundamentals_snapshot} />`, `<ReactMarkdown>{initial.descriptive_markdown}</ReactMarkdown>`, and a "Re-run scan" button.

On button click → POST `/api/scan/run` → on success, swap local state to new results. While running, button shows spinner and is disabled.

Surface `dropped` / `dropped_ratios` count as a collapsible `<details>` similar to the universe-build dropped list.

(`react-markdown` is **not** added as a dep — we use a `<pre className="whitespace-pre-wrap">` block, since the agent output is plain paragraphs without rich markdown features. This keeps the dep footprint tight.)

### `<ScanChart>`

Client component. Props: `{ history: TickerHistory[] }`.

Computes one normalised series: universe-mean monthly close, rebased to 100 at the start date. Renders a single `recharts` `<LineChart>` with `<XAxis dataKey="date" />` and `<YAxis />`. No per-ticker series in S5 (that's screener territory); the chart is just the universe trajectory.

### `app/thesis/[id]/page.tsx` server-side change

Pseudo-code:

```ts
const [thesis, universe, scan] = await Promise.all([
  fetchThesisByOwner(id, user.id),
  thesis?.universe_id ? fetchUniverseByOwner(thesis.universe_id, user.id) : null,
  fetchScanByThesis(id, user.id),   // new
]);
return <ThesisDetail initial={thesis} initialUniverse={universe} initialScan={scan} ... />;
```

### `<StageList>` edit

Add a `scanComplete?: boolean` prop next to the existing `universeAttached?: boolean`. Light up Stage 3 row when `scanComplete && universeAttached` (scan can't be complete without a universe — defence in depth, not gating).

## Data flow

```
[user on /thesis/<id> with a universe]
   └─> <ScanPanel /> renders placeholder with "Run scan" button
   └─> click → POST /api/scan/run {thesis_id}
         ├─> validate body / session / thesis owner
         ├─> resolve universe (404 if missing, 422 if thesis has no universe_id)
         ├─> pipeline_events start row
         ├─> for each ticker (serial):
         │     getHistory(ticker)  → history_5y[]
         │     getRatios(ticker)   → ratios[] (skip if ETF proxy)
         ├─> aggregateFundamentals(ratios) → snapshot
         ├─> scanRunner agent → descriptive_markdown (forced tool_use)
         ├─> Zod-validate ScanResults
         ├─> judgment-leakage regex → console.warn on matches
         ├─> DELETE scan_runs WHERE thesis_id = ?
         ├─> INSERT scan_runs (results jsonb)
         ├─> pipeline_events complete row
         └─> 200 {scan, dropped, dropped_ratios}
   └─> client swaps placeholder for ScanChart + Markdown + fundamentals table
   └─> StageList lights up Stage 3
```

## Error matrix

| Failure | HTTP | Body |
|---|---|---|
| Body shape wrong | 400 | `{ error: "invalid_body" }` |
| Unauthenticated | 401 | `{ error: "unauthenticated" }` |
| Thesis not found / not owner | 404 | `{ error: "not_found" }` |
| Thesis has no universe_id | 422 | `{ error: "no_universe" }` |
| Universe not found | 404 | `{ error: "not_found" }` |
| Fewer than 3 tickers with history | 422 | `{ error: "scan_failed", detail: "too_few_history", dropped }` |
| LLM agent failure | 422 | `{ error: "scan_failed", detail: <agent error>, raw }` |
| Zod re-validation failure | 422 | `{ error: "invalid_scan", detail }` |
| DB delete or insert failure | 500 | `{ error: "persist_failed", detail }` |

Judgment-leakage matches never block the response — they only log.

## Testing

| File | Scope |
|---|---|
| `tests/data/yahoo.test.ts` (append) | Mock `yahoo-finance2.historical` + `quoteSummary`. `getHistory` returns `[{date, close}]` array on success and `null` on error. `getRatios` returns the joined ratios row; missing fields become `null`; ETF-style responses (no `freeCashflow`) yield `fcf_yield: null`. |
| `tests/aggregation/fundamentals.test.ts` | `aggregateFundamentals` on a 5-row input returns expected mean + median. With all-null rows for a column, that column's mean and median are `null`. Empty array returns `{mean: {all null}, median: {all null}, per_ticker_used: 0}`. |
| `tests/schemas/scan.test.ts` | Zod round-trip on a canonical `ScanResults`. Empty `history_5y` rejected. `date` regex rejects `"2026-5-1"`. |
| `tests/agents/scan-runner.test.ts` | Mock `createMessage`; assert tool name `return_scan_description`, `tool_choice: {type: "tool", name: "return_scan_description"}`, system prompt mentions "descriptive", "FORBIDDEN", and at least three forbidden words. Happy path returns markdown. Missing tool_use → `ok: false`. Empty markdown → `ok: false`. |
| `tests/api/scan-run.test.ts` | POST happy path with mocked yahoo + agent + supabase; 400 invalid_body; 401; 404 thesis; 422 no_universe; 422 too_few_history; 422 scan_failed (agent error); 500 persist_failed; assertion that the delete-then-insert runs in order; pipeline_events start + complete rows recorded; judgment-leakage warning logged (spy on console.warn) when the agent output contains "should" but the response is still 200. |
| `tests/api/scan-get.test.ts` | GET happy path; 404 not_found; 401. |
| `tests/components/scan-panel.test.tsx` | Renders "Run scan" button when `initial === null`; renders chart + markdown when initial set; click on button POSTs to `/api/scan/run` and renders the new payload; surfaces `dropped` count when present; 422 surfaces the detail in an inline error. |
| `tests/components/scan-chart.test.tsx` | Renders without crashing on a canonical history (smoke test — recharts behaviour is upstream); produces a single line series; renders an empty state for zero-length history. |

## Acceptance-criteria mapping

- [ ] `POST /api/scan/run` returns `{scan: {history_5y, fundamentals_snapshot, descriptive_markdown}}` for a real thesis — covered by `scan-run.test.ts` happy path + manual smoke.
- [ ] Descriptive markdown contains none of the forbidden tokens — covered by agent system prompt + judgment-leakage regex test (the regex is a *check*; the agent prompt is the *cause*).
- [ ] Chart renders the 5y returns line — covered by ScanChart test + manual smoke.
- [ ] Re-run produces a new payload; prior payload observable via `pipeline_events` — covered by scan-run.test.ts (delete-then-insert assertion + pipeline_events start+complete assertions).
- [ ] Aggregation function unit test — `tests/aggregation/fundamentals.test.ts`.
- [ ] Stage 3 lights up — `<StageList>` test + manual smoke.

## YAGNI cuts

- **Per-ticker chart series** — defer to S10 (screener) or S12 (synthesizer).
- **Driver-specific time series** (e.g. sector backlog/revenue ratio) — issue text mentioned them but the data isn't deterministically available via yahoo-finance2 for arbitrary tickers; deferring until S9 (sequential drivers) makes the requirement concrete.
- **`react-markdown`** — plain whitespace-preserving `<pre>` is enough for three paragraphs.
- **Concurrency in Yahoo calls** — serial; S10 problem.
- **Background scheduling / cron** — S13.
- **Re-running on universe edit auto-invalidation** — operator clicks Re-run; no auto-trigger on universe PATCH.
- **`scan_runs.thesis_id` unique constraint** — delete-then-insert keeps the schema unchanged.

## Risks and open questions

- **Agent judgment leakage.** The system prompt is the primary defence; the regex is a soft alarm. If the model frequently leaks, S5 ships with a noisy warning; a future S8 (red-team test) would catch this systematically.
- **Yahoo historical coverage for non-US tickers.** Some Asian / European listings have spotty `historical` coverage; the `dropped[]` array surfaces them. The 3-ticker minimum is the floor before the route 422s.
- **`fcf_yield` definition divergence.** We compute `freeCashflow / marketCap` (a yield); some sources use `freeCashflow / enterpriseValue` (an FCF-to-EV ratio). The agent prompt uses "FCF yield" without specifying; we'll note the formula in the markdown if it becomes confusing in practice.
- **Recharts SSR.** Mount inside a client component and confirm no hydration warning surfaces with React 19. If it does, we'll lazy-import via `next/dynamic({ssr: false})`.
