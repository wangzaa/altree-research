-- 0005_expert_posts.sql
-- Local ingested corpus of independent-expert Substack posts.
-- Bull/Bear researchers query this table instead of doing open web search.

create table expert_posts (
  id              text primary key,            -- sha256(slug::guid)[:16]
  expert_slug     text not null,
  expert_name     text not null,
  author          text not null,
  title           text not null,
  link            text not null,
  published       timestamptz not null,
  content         text not null,               -- HTML-stripped plain text
  is_paywalled    boolean not null default false,
  tickers         text[] not null default '{}',
  sectors         text[] not null default '{}', -- denormalized from registry at ingest time
  ingested_at     timestamptz not null default now()
);

create index expert_posts_published_idx on expert_posts (published desc);
create index expert_posts_tickers_gin   on expert_posts using gin (tickers);
create index expert_posts_sectors_gin   on expert_posts using gin (sectors);
create index expert_posts_slug_idx      on expert_posts (expert_slug);

-- RLS: read-only for authenticated; service-role writes only (the cron job).
alter table expert_posts enable row level security;

create policy expert_posts_read_authenticated on expert_posts
  for select to authenticated
  using (true);
