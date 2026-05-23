# Cycle 3 — Phase 1: Open-Question Classifier + Derivable Resolver (design)

**Status:** shipped on `s12-cycle-3-phase-1`. See plan: [`docs/superpowers/plans/2026-05-22-cycle-3-phase-1-question-resolver.md`](../plans/2026-05-22-cycle-3-phase-1-question-resolver.md).

**Scope of this doc:** Phase 1 only — the classifier + the deterministic `derivable` resolver + the `/api/question/*` routes + the UI surface. Phases 2 (`corpus`) and 3 (`web` + credibility allowlist + LLM judge) remain in `local/cycle-3-open-question-resolver.md` and will get their own design + plan when scheduled.

---

## Why

The cycle-2 memo writer already produces high-signal open questions per thesis (e.g. "Does the forward P/E spread between Korean memory and US/EU peers exceed 10%?", "What share of SK Hynix revenue is HBM-derived?"). Today they're left as text — the analyst leaves the app to chase down each answer. Phase 1 wires the first slice of answers back into the same chat thread by routing each question through a classifier and resolving the `derivable` subset with zero LLM calls.

## The routing problem

Different questions need different data sources. A generic research agent that hits the web for every question is wasteful and slow when ~30% of typical memo questions are answerable from data already in the universe + scan tables. The cycle-3 design is a Haiku classifier that bins each question into one of five categories, plus a focused resolver per bin.

| Category | What it means | Resolver (Phase 1 status) |
|---|---|---|
| `derivable` | Solvable from scan + universe data already in hand. Spread questions, valuation rank within the universe, growth rank, exposure-tier counts. | **Implemented.** Deterministic compute over local data, no LLM call. Cites the tickers + scan column used. |
| `fundamentals_extra` | Yahoo has it, we just didn't pull it. Segment revenue breakdowns, share counts, balance-sheet items. | **Out of scope for cycle 3** — the resolve route returns `{ status: "not_implemented" }`. |
| `corpus` | Answerable from the expert substack corpus already ingested for bull/bear (`expert_posts` table). | **Phase 2.** Resolve route returns `{ status: "not_implemented", message: "Phase 2 — corpus resolver not built yet." }`. |
| `web` | External research needed. Industry-analyst views, forward roadmap claims, regulatory developments. | **Phase 3.** Resolve route returns `{ status: "not_implemented", message: "Phase 3 — web resolver not built yet." }`. |
| `needs_analyst` | Proprietary intel (sell-side numbers, internal forecasts), or unanswerable from any feed the system has access to. | **No resolver, ever.** Resolve route returns 400. UI disables the Resolve button and surfaces the tag. |

## Architecture (as shipped)

```
memo_writer (cycle 2)
   ↓ produces open_questions[]
OpenQuestionsResolver (client component, components/open-questions-resolver.tsx)
   ↓ POST /api/question/classify { thesis_id, questions[] } on mount
question_classifier (Haiku, lib/agents/question-classifier.ts)
   ↓ tags each question with { question, category, hint, confidence }
   ↓ ClassifiedQuestion[] returned to the UI
   ↓ on Resolve click: POST /api/question/resolve { thesis_id, question, category, hint }
   ├── derivable        → lib/resolvers/derivable.ts (pure functions over scan + universe)
   ├── corpus           → returns not_implemented (Phase 2)
   ├── web              → returns not_implemented (Phase 3)
   ├── fundamentals_extra → returns not_implemented (out of scope)
   └── needs_analyst    → 400 (client should not call)

UI renders answer as a chat bubble below the question, with a "Show sources (N)" toggle that reveals tickers + scan column.
pipeline_events writes for every classify + resolve action under stage="question".
```

## Schema decisions

Captured in [`lib/schemas/question.ts`](../../../lib/schemas/question.ts).

- `QuestionCategorySchema` — enum of the five categories.
- `ScanMetricSchema` — enum locked to the three metrics the resolver knows about: `revenue_growth_yoy`, `ebitda_margin`, `market_cap_usd_b`.
- `GroupFilterSchema` — `region` + `exposure_tier`, both optional, both bound to the **canonical** enums (`RegionSchema` from `lib/schemas/universe.ts`, `ExposureTierSchema`). This was the single most important schema decision: an earlier draft used `string` + numeric tiers, which would have silently failed every filter against real universe data. The schema enforces canonical values so the classifier cannot hand a bogus filter to the resolver.
- `DerivableHintSchema` — discriminated union on `op`. Three branches: `rank_by_metric` (with `direction`, `limit ≤ 20`, optional filter), `aggregate_by_group` (with `median|mean|max|min` aggregator + optional filter), `filter_count` (filter required). Each branch is `.strict()`. `DerivableOpSchema` is exported separately and reused by `DerivableSourcesSchema` so a future op only needs adding in one place.
- `ClassifiedQuestionSchema` — discriminated union on `category`. The `derivable` branch carries a structured `DerivableHint`; the other narrative-style categories carry `string | null`; `needs_analyst` carries `null`. Strict on every branch — a derivable classification with a string hint is rejected at parse time.
- `DerivableAnswerSchema` — `{ text, sources: { tickers, scan_column, op } }`. The `scan_column` is constrained to `ScanMetricSchema | "n/a"` (the sentinel for `filter_count` which doesn't read a metric).
- `ResolveResponseSchema` — discriminated on `status`: `resolved` | `not_implemented` | `unresolvable`. Lets the UI's render switch be exhaustive.

## Resolver design (`lib/resolvers/derivable.ts`)

Pure function `resolveDerivable(hint, scan, universe) → {ok:true, answer} | {ok:false, reason}`. No IO, no LLM. Three operations:

- **`rank_by_metric`** — sort filtered+joined tickers by metric, return top N.
- **`aggregate_by_group`** — `median | mean | max | min` over filtered values.
- **`filter_count`** — count of tickers matching the filter.

The function joins `scan.tickers_snapshot` ⨝ `universe.tickers` by ticker, applies the filter, then dispatches on `hint.op`. `market_cap_usd_b` is sourced from the universe, not the scan. Null values + non-finite numbers collapse to "no numeric values for this metric" rather than producing NaN. The fallthrough at the end of the switch uses `const _exhaustive: never = hint;` so adding a fourth op is a compile error.

## API design

Two POST routes, both following the canonical pattern from `app/api/memo/generate/route.ts`: outer try/catch, JSON body parse, Zod `.safeParse`, `getCurrentUser` from `@/lib/auth/session`, `getSupabaseServerClient` for the service-role client, ownership check on the thesis row, `pipeline_events` write for every start / complete / error transition, descriptive error envelopes.

### `/api/question/classify` (bulk)
- Body: `{ thesis_id, questions: string[] }` with `questions.max(20)` (the memo caps open_questions at 8; 20 is a generous cap).
- Reads the thesis blob from `theses`, validates with `ThesisSchema.safeParse`, calls `classifyQuestions({ thesis, questions })`.
- Returns `{ classifications: ClassifiedQuestion[] }`.
- Empty `questions` short-circuits with no LLM call and no `pipeline_events` row.

### `/api/question/resolve` (single)
- Body: `ClassifiedQuestion ∩ { thesis_id }`.
- `needs_analyst` → 400 before any DB call.
- `corpus | web | fundamentals_extra` → 200 with `{ status: "not_implemented", message }`. A `pipeline_events` `complete` row records the placeholder status.
- `derivable` → fetches the latest scan (`scan_runs.order("run_at").limit(1)`) AND the thesis's universe (`universes.eq("id", thesis.universe_id).maybeSingle()` with `created_by` ownership check). Runs `resolveDerivable()`. Returns `{ status: "resolved", answer }` or `{ status: "unresolvable", message }`.
- 409 if scan or universe missing. 500 if a stored blob fails schema validation (paired with an error pipeline_event so the start/end invariant holds).

### `pipeline_events` schema
Standard shape: `{ thesis_id, stage: "question", agent: "question_classifier" | "question_derivable" | "question_corpus" | "question_web" | "question_fundamentals_extra", event_type: "start" | "complete" | "error", payload }`. Payload carries category, model (for the classifier), counts (for classify complete), and `ticker_count` / `reason` / `status` (for resolve complete).

## UI design

`components/open-questions-resolver.tsx` replaces the bare `<ul>` inside the memo `<ChatBubble label="Open questions">`.

- **Mount:** POSTs `{ thesis_id, questions }` to `/api/question/classify`. Each question renders with a `CategoryChip` (showing "classifying…" while waiting, then the real category label once the response arrives).
- **Tones (Pear tokens):** derivable = cyan-light, corpus = beige, web = peach, fundamentals_extra + needs_analyst = neutral.
- **Resolve button:** disabled while loading, and permanently disabled for `needs_analyst`.
- **Resolved answer:** rendered as a small bubble below the question with a "Show sources (N)" toggle that expands to show the ticker list + scan column.
- **Not-implemented:** italic placeholder text below the question; no source toggle.
- **Cancellation:** classify uses a `cancelled` flag inside the effect; both classify and resolve guard `setState` with a `mountedRef` so unmount during fetch doesn't warn.
- **Stable-content re-renders:** `useEffect` deps are `[thesisId, questions.join(" ")]` — a parent re-render that produces the same question list does NOT re-classify, so resolved bubbles survive memo re-draft unless the question list actually changed.
- **Array-length drift:** both `classifications` and `resolveStates` are initialized to `[]` and rebuilt by the classify effect on every content change. The previous draft had parallel arrays that drifted when `questions.length` changed.

## Non-obvious tradeoffs (carried forward from the brainstorm)

- **Mis-routing.** Even a good classifier will pick the wrong bin ~5–10% of the time. Phase 1 ships with no manual override dropdown — the analyst sees the chip and re-words the open-question text upstream if they want a different routing. The override is a Phase 2/3 follow-up.
- **Corpus blind-spot honesty.** Phase 2's empty-corpus result will be surfaced as "no expert covered this" rather than auto-falling back to web. Phase 1's not-implemented placeholder is the prototype of that pattern.
- **No persistence.** Classifications and resolutions live in client state only; reloading the thesis page re-renders the memo without them. Mirrors how memos themselves aren't persisted today. Adding a `resolved_questions` table is a future concern.

## Acceptance criteria (Phase 1)

All shipped:

- [x] `question_classifier` registered in `lib/data/agent-models.json` and exported from `AGENT_NAMES`. Classifies each open question with `{ category, hint, confidence }`. Order-preservation enforced; bad ordering returns `ok:false`.
- [x] `lib/resolvers/derivable.ts` answers rank / aggregate / count questions with zero LLM calls; cites the tickers + scan column used; exhaustiveness-guarded on `op`.
- [x] `/api/question/classify` POST route with `pipeline_events` writes (start + complete OR error).
- [x] `/api/question/resolve` POST route. `needs_analyst` → 400; `corpus | web | fundamentals_extra` → 200 `not_implemented`; `derivable` → resolved/unresolvable with the answer + sources. 409 on missing scan/universe; 500 on corrupt stored blob, both paired with `error` pipeline events.
- [x] Memo UI renders category-tag chip + Resolve button per open question.
- [x] Resolved answers render as chat bubbles with a "Show sources (N)" toggle.
- [x] Empty / not-implemented results surfaced honestly — no auto-fallback to a different category.

Out-of-scope (deferred to Phase 2 / 3 / future):
- Real `corpus` resolver (Phase 2 — separate spec + plan).
- Real `web` resolver + `lib/data/credible-sources.ts` allowlist + LLM judge (Phase 3).
- `fundamentals_extra` resolver (out of cycle 3 per the brainstorm — Yahoo segment data is inconsistent per region).
- Manual category-override dropdown.
- Persistence of resolved answers across reloads.
