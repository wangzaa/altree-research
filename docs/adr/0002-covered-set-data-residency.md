---
status: accepted
---

# Covered-set data residency: stable data in a committed file, volatile data in Supabase

## Context & decision

The covered-set data from `sr.db` splits by volatility, and the two halves live
in different places:

- **Stable → committed file.** The 388-company snapshot (name, sector, financials,
  `yahoo_ticker`, the latest POST_INTERVIEW_UPDATE description) is generated into
  `lib/data/jp-companies.json` and committed. It powers the anchor picker and the
  thesis seed. Rendered fast, no DB round-trip.
- **Volatile → Supabase, synced on a cadence.** The catalyst feed (recent
  NEWS_UPDATE events: date, title, excerpt, ticker) is synced from `sr.db` into a
  `jp_catalysts` Postgres table and queried live (sector filter, recency window,
  pagination).

`sr.db` (in the separate `sharedresearch_ingester` repo) remains the upstream
source of truth; a sync script reads it and produces both artifacts.

## Why this is worth recording

- **Surprising without context.** A reader sees Japan company data in a committed
  JSON *and* in a Postgres table and will ask why it isn't one or the other. The
  answer is the volatility split, not an accident.
- **Real trade-off.** Considered: (A) all-static with cron-regenerated files —
  rejected because committing a churning catalyst data file to git on every
  refresh is awkward and the feed's freshness collapses to the regen cadence; and
  (C) querying `sr.db` live — rejected because it drags a second data engine and a
  cross-repo dependency into the request path. (B) keeps stable data cheap and
  static while giving the freshness-sensitive, query-heavy catalyst feed the
  database it needs.

## Consequences

- The generator emits **two artifacts**: the committed `jp-companies.json` and a
  Supabase `jp_catalysts` sync.
- Catalyst-feed freshness equals the **sync cadence**, not deploy frequency.
- Supersedes the "static artifact" framing in ADR-0001 for the catalyst data only;
  the company snapshot stays static as that ADR describes.
- **Amended by ADR-0003:** the catalyst feed is no longer the front door (themes
  are). The stable-file / volatile-Supabase residency split still holds, but
  `jp_catalysts` now backs *per-company evidence*, not the top-level discovery
  feed.
