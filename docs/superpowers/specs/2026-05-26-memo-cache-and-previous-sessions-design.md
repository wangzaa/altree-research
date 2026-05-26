# Memo cache + Previous-sessions discovery (design)

**Status:** spec, not yet shipped.

## Why

Two gaps surfaced by returning users:

1. The memo is the only pipeline output that isn't persisted to DB. After we made Anti/Thesis user-triggered earlier today (spec: [`2026-05-26-antithesis-user-triggered-design.md`](./2026-05-26-antithesis-user-triggered-design.md)), revisits to `/thesis/[id]` now show an empty Anti/Thesis until the user clicks **Proceed to Anti/Thesis / Refresh →** again. That re-pays LLM tokens for what is effectively the same synthesis.
2. `/thesis/new` has no surface for returning users to resume work. A `RecentSessions` carousel lives in the sidebar Live Log panel, but its rows expand into per-thesis LiveLogs — designed for peeking at pipeline events, not picking a thesis to continue.

Closing both gaps lets a returning user land on `/thesis/new`, see what they've already started, jump back in, and find the Anti/Thesis bubbles already filled with the last synthesis — with one click to refresh when they want a fresh read.

## Goals

- Persist the memo (with the params it was generated with) so revisits render the last Anti/Thesis bubbles immediately, without firing the model.
- Show a small "Last refreshed …" caption above the bubbles so the user knows when it was generated. The existing **Proceed to Anti/Thesis / Refresh →** button remains the only path to update the memo.
- On `/thesis/new`, render a list of the user's previous theses below the textarea, each a clickable card showing snippet + date + verdict chip, linking back to `/thesis/[id]`.

## Non-goals

- Persisting chart state (`windowKey`, `selectedTickers`). The user explicitly scoped (b) to memo only.
- Persisting the anchor choice explicitly. The anchor already lives implicitly in the universe; no separate row.
- Cross-section "stale" detection (e.g. "scan re-ran since memo"). The user picked the simpler "Last refreshed at …" caption over a stale badge.
- Touching the sidebar `RecentSessions` component. The discovery surface on `/thesis/new` is a separate component.
- Pagination on the `/thesis/new` list — show the last N, no infinite scroll. N defaults to 10.

## Architecture

### Memo persistence

Append-only table `memos`, mirroring the `scan_runs` / `validation_runs` pattern in [`supabase/migrations/0001_init.sql`](../../../supabase/migrations/0001_init.sql).

```sql
-- supabase/migrations/0007_memos.sql
create table memos (
  id                  uuid primary key default gen_random_uuid(),
  thesis_id           text references theses(id) on delete cascade,
  generated_at        timestamptz default now(),
  memo                jsonb,                  -- full Memo schema
  chart_window        text,                   -- "3mth" | "6mth" | "12mth" | "3y" | "5y"
  visible_metric_keys text[],
  selected_tickers    text[]
);
create index on memos (thesis_id, generated_at desc);

-- RLS enabled, deny-all by default. Server-side API routes use the service-role
-- client (which bypasses RLS) and enforce ownership in code by joining on
-- theses.user_id. Mirrors the pattern in 0001_init.sql for scan_runs /
-- validation_runs.
alter table memos enable row level security;
```

### Write path

[`app/api/memo/generate/route.ts`](../../../app/api/memo/generate/route.ts) gains one insert after `writeMemo` returns ok:

```ts
await supabase.from("memos").insert({
  thesis_id,
  memo: result.memo,
  chart_window,
  visible_metric_keys,
  selected_tickers,
});
```

No new schema fields needed — `chart_window`, `visible_metric_keys`, `selected_tickers` are already on the body schema as of this morning's shipment.

### Read path

[`app/thesis/[id]/page.tsx`](../../../app/thesis/%5Bid%5D/page.tsx) fetches the latest memo alongside the other state hydrations:

```ts
let initialMemo: Memo | null = null;
let memoGeneratedAt: string | null = null;
const { data: mRows } = await supabase
  .from("memos")
  .select("memo, generated_at")
  .eq("thesis_id", id)
  .order("generated_at", { ascending: false })
  .limit(1);
const raw = mRows?.[0]?.memo;
if (raw) {
  const parsed = MemoSchema.safeParse(raw);
  if (parsed.success) {
    initialMemo = parsed.data;
    memoGeneratedAt = mRows?.[0]?.generated_at as string;
  }
}
```

`ThesisDetail` gains two new props: `initialMemo` and `memoGeneratedAt`. Component seeds `useState<Memo | null>(initialMemo)` instead of `null`. When `memo !== null`, render a small grey caption above the bubbles:

```tsx
<p className="text-xs" style={{ color: "#9a9a9a" }}>
  Last refreshed {formatRefreshedAt(memoGeneratedAtState)}
</p>
```

`memoGeneratedAtState` updates to "now" when the user re-clicks Proceed → so refreshing without a page reload still updates the caption. `formatRefreshedAt` reuses the same `Apr 20 · 14:32` format as [`components/recent-sessions.tsx:formatDate`](../../../components/recent-sessions.tsx) — lift into a shared helper.

### Previous-sessions surface

New component `components/previous-sessions.tsx`. Self-contained client component that hits the existing `/api/thesis/list` endpoint and renders a stacked list of clickable cards.

```
┌──────────────────────────────────────────────┐
│ Japanese small-caps are entering a multi-…   │
│ Apr 20 · 14:32          [supports]           │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ EU defense rearmament — Rheinmetall, BAE…    │
│ Apr 18 · 09:11          [inconclusive]       │
└──────────────────────────────────────────────┘
```

Each card is a `<Link href={`/thesis/${item.id}`}>` with snippet (60 chars + ellipsis), date, and a verdict chip. Chip styles:

| Verdict | Color |
|---|---|
| `supports` | green-ish bg, white text |
| `breaches` | red-ish bg, white text |
| `inconclusive` | grey bg, black text |
| (null verdict) | light grey bg, "Draft" label |

`/api/thesis/list` already returns `id`, `source_snippet`, `created_at`, `status`. Extend the SELECT and response shape to include `verdict`. Existing sidebar caller ignores extra fields; no breaking change.

`/thesis/new/page.tsx` renders `<PreviousSessions />` below the white extract-form card, separated by a heading: small uppercase "Previous sessions" tag matching the existing "altree research" tag on the landing page.

Empty state: *"No previous sessions yet."* (grey, 12px).

## Testing

- **Migration:** `supabase/migrations/0007_memos.sql` lints with `supabase db lint` (manual; CI doesn't run it).
- **Route:** `/api/memo/generate` inserts into `memos` on success. Existing test gains a `from('memos').insert` mock assertion.
- **Route:** `/api/thesis/list` returns `verdict` in each item.
- **Component:** `PreviousSessions` renders rows with snippet/date/chip; renders empty state when the list is empty; renders an error caption on fetch failure.
- **Component:** `ThesisDetail` with `initialMemo` provided renders the bubbles immediately + the "Last refreshed" caption; without it, renders the click-to-generate empty state (regression of this morning's shipment).
- **Page:** `/thesis/[id]/page.tsx` SSR fetches the latest memo and passes it through — covered by a fixture test if practical, otherwise smoke-tested manually.

## Open question (out of scope, flagged)

Verdict can lag the memo: `theses.verdict` is updated by the validate route (not the memo route, today). If a user re-runs validation but not the memo, the chip in `/thesis/new` may show a verdict that differs from the cached memo's verdict. Tolerable for now — the chip is a discovery cue, not a contract. If it becomes confusing, store `verdict` on the `memos` row too and read from there.
