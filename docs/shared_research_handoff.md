# Shared Research Ingester

A standalone component that pulls publicly-accessible English **teaser** research from sharedresearch.jp for a fixed **Universe** of Japanese small/mid-cap **Companies**, converts each to Markdown, and stores it in SQLite for a downstream synthesis layer to consume.

## Language

**Company**:
A Japanese small/mid-cap issuer covered by Shared Research, identified by its **Ticker**. Has at most one internal `_id` in the API.
_Avoid_: issuer, firm, stock, name.

**Ticker**:
The exchange code identifying a Company. Always a string — mostly 4-digit numeric (`6862`), but ~11 are `\d{3}[A-Z]` (`504A`). Never `int()` it.
_Avoid_: symbol, code, id.

**Universe**:
The fixed set of ~388 Companies enumerated in `sr_universe.json` that the ingester operates over. Membership changes only by editing that file.
_Avoid_: watchlist, portfolio, coverage list, subscriptions.

**Report**:
A single English research publication about one Company, of type FLASH, POST_INTERVIEW_UPDATE, or NEWS_UPDATE. The unit we discover and store (one row in `reports`).
_Avoid_: project (the API's wire name — see Flagged ambiguities), article, document.

**Teaser**:
The publicly-accessible *size* of a Report — no auth required, the only size this project ingests. Prose-dominant: an "Executive summary" (business overview + an "Earnings trends" block that carries the YoY figures) and *sometimes* a "Key Financial Data" table. The YoY signal lives in the prose; the table is not guaranteed present.
_Avoid_: preview, snippet, summary (Summary is a Company field, not a Report size).

## Operations

**Resolve**:
Turn a Ticker into its Company `_id` via the API and record the Company. Idempotent; re-running refreshes coverage.

**Poll**:
Ask the API which Reports exist for each resolved Company and record newly-seen ones (and re-queue revised ones).

**Fetch**:
Download a Report's Teaser HTML and convert it to Markdown.

**Ingest**:
The cron cycle: resolve-if-needed → poll → fetch.

## Flagged ambiguities

**project vs Report**:
The API returns objects it calls `projects` (`/api/projects`, `_id`). The domain entity is a **Report**. They are the same thing. `project_id` survives in the schema purely as the API-supplied stable identifier — it is not a separate concept.

## Example dialogue

> **Analyst:** Did we pick up the new flash on 4488?
> **Dev:** The *poll* discovered the Report this morning, but *fetch* hasn't run since — `content_md` is still null.
> **Analyst:** And if they correct it this afternoon?
> **Dev:** Next poll sees the Teaser's `createdAt` moved, re-queues it, and the next fetch overwrites the Markdown. Same Report, same `project_id` — we just don't keep the old version.
> **Analyst:** What about 6644? They're in the Universe but I never see Reports.
> **Dev:** Resolved fine, but the API returns zero projects — coverage hasn't started. Not an error, just an empty Company.
