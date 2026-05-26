# Anti/Thesis — user-triggered, scan-aware refresh (design)

**Status:** spec, not yet shipped. Plan to follow at `docs/superpowers/plans/2026-05-26-antithesis-user-triggered.md`.

## Why

The Anti/Thesis section currently auto-fires on first arrival at a thesis page: `handleValidateAll` runs as soon as a scan exists with no validation, then `handleDraftMemo` runs the moment validation lands ([app/thesis/[id]/thesis-detail.client.tsx:199-224](../../../app/thesis/%5Bid%5D/thesis-detail.client.tsx#L199-L224)). The user has no control over when the synthesis happens and no way to feed it the chart state they're actually looking at.

Two concrete problems flow from that:

1. The memo writer has no awareness of which time horizon (3M / 6M / 12M / 3Y / 5Y) the analyst is reading the chart on, nor which tickers they've selected via the Show checkboxes. Returns get cited as undifferentiated "performance".
2. The memo writer may reference metrics that aren't on the ticker table — most jarringly **EBIT margin** alongside the table's **EBITDA margin**. The two read as near-duplicates and break analyst trust in the memo.

The fix is to make the Anti/Thesis trigger explicit (a "Proceed to Anti/Thesis / Refresh →" button below the ticker table, mirroring the existing "Proceed to scan / Refresh →" pattern in [components/universe-table.tsx:382-396](../../../components/universe-table.tsx#L382-L396)) and pass the chart state along to the memo route.

## Goals

- Anti/Thesis section does not render until the user clicks the new button.
- Clicking the button always re-runs validation **and** memo synthesis against the current scan state (no staleness detection — click === refresh).
- Memo prompt receives the active time horizon, the visible metric keys, and the selected tickers, and frames returns explicitly as "{6-month} return".
- Memo prompt forbids citing **EBIT** or **EBIT margin** when the table shows EBITDA; other fundamentals (net debt, ROE, ROIC, debt/assets, FCF, gross margin) remain allowed.
- The "Refresh" button at the end of the Anti/Thesis section ([app/thesis/[id]/thesis-detail.client.tsx:376-392](../../../app/thesis/%5Bid%5D/thesis-detail.client.tsx#L376-L392)) is removed — the new button is the only entry point.

## Non-goals

- Persisting the memo across page reloads. Memos are not stored in DB today and remain ephemeral; returning visits will show an empty Anti/Thesis until the user clicks. Worth revisiting later (see Open question).
- Making per-ticker-table columns dynamic. The columns stay hardcoded (Ticker · Name · Mcap · P/E · Rev YoY · EBITDA · EBITDA % · {window} return). The "visible metric keys" payload is forward-compatible plumbing for if/when that changes.
- Touching the validation API or driver evidence logic — driver corpus reads don't depend on chart state. Re-running validation on each click is a UX consistency choice, not a data dependency.
- Extract, Anchor, Execute sections are unchanged.

## Architecture

### State location

Today `windowKey` and `selectedTickers` are local to ScanPanel ([components/scan-panel.tsx:55-63](../../../components/scan-panel.tsx#L55-L63)). They get lifted into ThesisDetail so the memo handler can read them at click time.

```
ThesisDetail
  ├─ windowKey               ← lifted from ScanPanel
  ├─ selectedTickers         ← lifted from ScanPanel
  ├─ handleProceedToInsights ← new: validate → memo with current params
  │
  └─ ScanPanel (controlled)
       ├─ receives windowKey + setter
       ├─ receives selectedTickers + setter
       ├─ renders the new "Proceed to Anti/Thesis / Refresh →" button
       └─ button onClick → calls onProceedToInsights({ windowKey,
                                                       visibleMetricKeys,
                                                       selectedTickers })
```

`visibleMetricKeys` is the static list `["market_cap","pe","revenue_growth_yoy","ebitda","ebitda_margin","return_pct"]`, sourced from a constant in ScanPanel (or per-ticker-table, exported). The plumbing is explicit and ready for a future where the column set varies per scan.

### Trigger flow

```
User clicks "Proceed to Anti/Thesis / Refresh →"
   ↓
ScanPanel.onClick → ThesisDetail.handleProceedToInsights(params)
   ↓
handleValidateAll()                       // re-runs per-driver corpus reads
   ↓ on success
handleDraftMemo(params)                   // POST /api/memo/generate with chart state
   ↓
ChatBubble("Thesis" / "Anti-thesis") render with new memo
```

Both runs are sequential because the memo depends on validation. The button stays disabled (and shows a Spinner) for the duration of both calls.

### Removed code paths

- `autoValidateFired` effect ([app/thesis/[id]/thesis-detail.client.tsx:199-208](../../../app/thesis/%5Bid%5D/thesis-detail.client.tsx#L199-L208))
- `autoMemoFired` effect ([app/thesis/[id]/thesis-detail.client.tsx:215-224](../../../app/thesis/%5Bid%5D/thesis-detail.client.tsx#L215-L224))
- The end-of-section "Refresh" button block ([app/thesis/[id]/thesis-detail.client.tsx:376-392](../../../app/thesis/%5Bid%5D/thesis-detail.client.tsx#L376-L392))

### Empty-state copy

Replaces the current spinner/loading text in Anti/Thesis when no memo exists yet:

> Click **Proceed to Anti/Thesis** below the ticker table to generate.

When validation or memo is in flight, the existing italic copy ("Reading the corpus…" / "Drafting Thesis / Anti-thesis…") still renders.

## Memo API + prompt

### `/api/memo/generate` body

Schema gains three optional fields. All optional → fully backward-compatible with any other caller.

```ts
const BodySchema = z.object({
  thesis_id: ThesisIdSchema,
  chart_window: z.enum(["3mth","6mth","12mth","3y","5y"]).optional(),
  visible_metric_keys: z.array(z.string()).optional(),
  selected_tickers: z.array(z.string()).optional(),
}).strict();
```

These flow into `writeMemo({ thesis, scan, validation, chartWindow, visibleMetricKeys, selectedTickers })` and are surfaced to the model via `buildUserMessage`.

### Prompt addition

`memo-writer.ts` SYSTEM_PROMPT gains one new section after TICKER FORMAT:

> **METRIC HYGIENE.** The analyst's per-ticker table shows: Mcap, P/E, Rev YoY, EBITDA, EBITDA margin, and {windowLabel} return. Do NOT cite EBIT or EBIT margin — these are too close to EBITDA and mixing the two confuses the read. Other fundamentals are fair game when they sharpen the case: net debt, ROE, ROIC, debt/assets, FCF, gross margin, and similar. Return percentages refer to {windowLabel} trailing returns and must be framed as such ("6-month return", "3-year return"), never undifferentiated "performance". Confine commentary to selected tickers: {tickers}.

The {placeholders} are filled by `buildUserMessage` from the new payload. When `visible_metric_keys` is absent (legacy callers), the placeholder block is omitted entirely and the prompt falls back to today's behavior.

### Forbidden-lookalikes derivation

For Phase 1 the only rule is `ebitda` shown → blacklist `EBIT`, `EBIT margin`. The mapping lives as a small constant in `memo-writer.ts`:

```ts
const LOOKALIKE_BLACKLIST: Record<string, string[]> = {
  ebitda: ["EBIT", "EBIT margin"],
  // future: pe → P/B, P/S; revenue_growth_yoy → revenue CAGR; etc.
};
```

`buildUserMessage` iterates the visible keys, accumulates the blacklist, and renders it into the prompt. Adding future rules is one line.

## Testing

- **Component:** ScanPanel emits `onProceedToInsights` with the correct payload on button click (window, metric keys, selected tickers).
- **Component:** ThesisDetail no longer auto-fires validation or memo on first render with `initialScan` and no validation. Anti/Thesis renders empty-state copy.
- **Component:** Clicking the button fires validate-then-memo with the current chart state; a second click with a different `windowKey` fires both again with the new value.
- **Agent:** `memo-writer.ts` includes the METRIC HYGIENE block when `visible_metric_keys` is provided and omits it otherwise. EBIT blacklist appears when `ebitda` is in the keys.
- **Route:** `/api/memo/generate` accepts and forwards the three new optional fields; rejects unknown fields (`.strict()`).
- **No regression:** validation route and driver evidence shape are unchanged.

## Open question (out of scope, flagged for follow-up)

Memos aren't persisted to DB. With auto-fire removed, returning visitors land on an empty Anti/Thesis until they click. The current behavior auto-regenerates on every visit, which is friendlier but costs LLM tokens. A future iteration could persist the last memo + the params it was generated with, render it on revisit with a small "last refreshed at…" caption, and let the button restage it. Not blocking this design.
