-- 0008_jp_catalysts.sql
-- Recent Japanese corporate catalysts (NEWS_UPDATE) for the covered set,
-- synced from the upstream sr.db by scripts/jp-covered-set.ts --sync-catalysts.
-- Volatile data: backs per-company evidence and feeds the theme-exposure
-- funnel's recent-activity gate. See ADR-0002 / ADR-0003.
-- (The stable 388-company snapshot lives in the committed lib/data/jp-companies.json,
-- not here.)

create table jp_catalysts (
  id            text primary key,             -- sr.db reports.project_id
  ticker        text not null,                -- bare TSE code, e.g. "2802"
  yahoo_ticker  text not null,                -- bare code + ".T"
  published_at  timestamptz not null,
  title         text not null,
  excerpt       text not null,                -- HTML/markdown-stripped, truncated
  type          text not null default 'NEWS_UPDATE',
  synced_at     timestamptz not null default now()
);

create index jp_catalysts_published_idx on jp_catalysts (published_at desc);
create index jp_catalysts_ticker_idx     on jp_catalysts (ticker, published_at desc);

-- RLS: read-only for authenticated; service-role (the sync script) writes.
-- Mirrors expert_posts in 0005.
alter table jp_catalysts enable row level security;

create policy jp_catalysts_read_authenticated on jp_catalysts
  for select to authenticated
  using (true);
