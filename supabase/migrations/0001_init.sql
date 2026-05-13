-- 0001_init.sql
-- Public schema for altree-research. Auth schema (auth.user etc.) is created
-- separately by Better Auth's own migration in Task C.

create table theses (
  id              text primary key,           -- e.g., eu_defense_rearmament_26_05_01
  user_id         text not null,              -- Better Auth user id; FK added in 0003 once auth.user exists
  version         int default 1,
  created_at      timestamptz default now(),

  source_snippet  text,                       -- prose user pasted
  thesis          jsonb,                      -- full thesis schema

  status          text default 'draft',       -- draft | validated | stale | broken
  verdict         text,                       -- supports | breaches | inconclusive
  last_validated_at timestamptz
);

create table universes (
  id              text primary key,
  created_by      text,                       -- Better Auth user id; FK added in 0003
  created_at      timestamptz default now(),
  refreshed_at    timestamptz,
  universe        jsonb                       -- full universe schema
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

-- RLS enabled, deny-all by default. Service-role API routes bypass RLS and
-- enforce ownership in application code (HANDOFF.md §8). Real policies land
-- in slice S13.
alter table theses          enable row level security;
alter table universes       enable row level security;
alter table validation_runs enable row level security;
alter table scan_runs       enable row level security;
alter table screener_runs   enable row level security;
alter table pipeline_events enable row level security;

-- Live progress stream
alter publication supabase_realtime add table pipeline_events;
