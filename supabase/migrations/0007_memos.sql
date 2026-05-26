-- 0007_memos.sql
-- Cache the memo synthesised by /api/memo/generate so revisits to
-- /thesis/[id] render the last Anti/Thesis bubbles immediately, without
-- re-paying LLM tokens. Append-only, mirroring scan_runs and
-- validation_runs in 0001_init.sql.

create table memos (
  id                  uuid primary key default gen_random_uuid(),
  thesis_id           text references theses(id) on delete cascade,
  generated_at        timestamptz default now(),
  memo                jsonb,
  chart_window        text,
  visible_metric_keys text[],
  selected_tickers    text[]
);

create index memos_thesis_generated_at_idx
  on memos (thesis_id, generated_at desc);

-- RLS enabled, deny-all by default. Server-side API routes use the
-- service-role client (which bypasses RLS) and enforce ownership by
-- joining on theses.user_id.
alter table memos enable row level security;
