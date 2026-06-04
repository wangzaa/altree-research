-- 0009_intro_requests.sql
-- Lead-gen capture (ADR-0004). When a user finishes a deep-dive they can
-- "Request intro" — an intent to be routed to a partnered Japanese fund or
-- brokerage for the researched company. v1 captures the request only; there is
-- NO live partner routing yet. This replaces the retired Endowus fund_selector
-- execution. Append-only, mirroring memos in 0007.

create table intro_requests (
  id           uuid primary key default gen_random_uuid(),
  thesis_id    text references theses(id) on delete cascade,
  user_id      text,
  ticker       text not null,
  memo_id      uuid references memos(id) on delete set null,
  note         text,
  status       text not null default 'captured',
  created_at   timestamptz not null default now()
);

create index intro_requests_user_idx   on intro_requests (user_id, created_at desc);
create index intro_requests_thesis_idx on intro_requests (thesis_id, created_at desc);

-- RLS enabled, deny-all by default. The service-role API route enforces
-- ownership by joining on theses.user_id (same pattern as memos/scan_runs).
alter table intro_requests enable row level security;
