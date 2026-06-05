-- 0010_jp_theme_exposure.sql
-- Theme-exposure opportunity sets (issue #28 / ADR-0003). The output of the
-- theme-exposure funnel: per hot topic, the movers' subset of the covered 388
-- that the theme_tagger confirmed has GENUINE recent activity, each with a
-- dated "why". Volatile + re-derivable: a sync recomputes the funnel and
-- replaces a theme's rows (delete-by-theme then insert). Sits alongside the
-- volatile jp_catalysts (0008) it reads from; the stable 388-company snapshot
-- stays in the committed lib/data/jp-companies.json.

create table jp_theme_exposure (
  theme_id      text not null,                -- themes.json topic id
  ticker        text not null,                -- bare TSE code, e.g. "6146"
  yahoo_ticker  text not null,                -- bare code + ".T"
  name_en       text not null,
  rationale     text not null,                -- theme_tagger dated one-liner
  as_of         date not null,                -- date of the announcement/pivot
  derived_at    timestamptz not null default now(),
  primary key (theme_id, ticker)
);

create index jp_theme_exposure_theme_idx on jp_theme_exposure (theme_id, as_of desc);

-- RLS: read-only for authenticated; service-role (the sync script) writes.
-- Mirrors jp_catalysts in 0008.
alter table jp_theme_exposure enable row level security;

create policy jp_theme_exposure_read_authenticated on jp_theme_exposure
  for select to authenticated
  using (true);
