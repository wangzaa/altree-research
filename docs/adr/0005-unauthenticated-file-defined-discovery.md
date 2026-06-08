---
status: accepted
---

# Unauthenticated, file-defined discovery

The Shared Research API exposes a paginated cross-company "recent reports" feed (`GET /api/projects/recent/subscribed?locale=en&page=N`) that would collapse steady-state discovery from ~388 per-company `/api/projects` polls down to ~3 requests per run. We deliberately **do not** use it: discovery stays unauthenticated and per-company, and the Universe is enumerated solely from `sr_universe.json`.

**Supersedes:** The subscribed-feed approach considered in ADR-0002 (covered-set data residency).

## Why

The feed is **account-scoped** — it requires authentication and returns only what the logged-in account *subscribes* to, not our file-defined Universe. Adopting it would force a login/cookie-refresh flow into an otherwise credential-free system, expose the Premium quota surface (`reports-limits`), and couple ingestion scope to subscription state that has to be kept in sync with the file. A per-company poll at 1 rps is ~6.5 minutes of anonymous, read-only traffic once a day — a fine price to keep the entire authentication dimension out of the system.

## Consequences

- Discovery cost is O(Universe) requests per run. Acceptable at the chosen daily cadence; the lock + 1-rps rate keep it polite.
- If discovery load ever becomes a real problem, revisit as a **hybrid** — use the recent feed for incremental discovery only, while retaining per-company `/api/projects` for the initial full backfill (the feed shows only the latest ~150 reports). This would still require taking on auth + `autofollow` of the full Universe, which is the cost this decision is avoiding.

## Considered and rejected

- **Authenticate + `autofollow` the Universe + use `recent/subscribed`.** Rejected for the auth/quota/coupling reasons above; the request-count savings do not justify reintroducing credentials and subscription management.

## See Also

- [ADR-0002: Covered-set data residency](../adr/0002-covered-set-data-residency.md) — stable vs volatile data split
- [Shared Research Handoff](../shared_research_handoff.md) — domain language and operations for the ingester
