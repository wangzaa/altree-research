# Shared Research Ingester

Pulls publicly-accessible English **teaser** research from sharedresearch.jp for the
~388-company universe in `sr_universe.json`, converts each to Markdown, and stores it in
SQLite (`data/sr.db`). Unauthenticated, polite (1 req/sec), run on-demand.
Full design rationale is in `../SR_handoff.md`; the glossary in `../CONTEXT.md`.

## Install

    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt

## Commands

    python -m ingester resolve   # fill/refresh companies from sr_universe.json (upsert)
    python -m ingester poll      # discover new/revised reports for resolved companies
    python -m ingester fetch [--limit N]   # download teaser HTML -> Markdown for unfetched reports
    python -m ingester ingest    # resolve-if-needed -> poll -> fetch (run when data refresh is needed)
    python -m ingester status    # DB stats + run health (last successful ingest, last error, staleness)

Global flags: `--db PATH` (default `data/sr.db`), `--universe PATH`, `--rate-limit SECONDS`
(default 1.0), `--user-agent STRING`, `--max-attempts N` (default 5), `--limit N`,
`--dry-run`, `--healthcheck-url URL`.

Exit codes: `0` ok/skip, `1` completed with some fetch errors, `2` blocked (403), `3` fatal.

## First run (one-time backfill, ~50 min at 1 rps)

    python -m ingester resolve
    python -m ingester poll
    python -m ingester fetch

Check it:

    python -m ingester status
    sqlite3 data/sr.db "SELECT type, COUNT(*) FROM reports GROUP BY type;"

## On-demand usage

Run `ingest` whenever you need to refresh data from SharedResearch. There is no scheduled
cron job; updates are triggered manually as needed.

    cd /path/to/sharedresearch_ingester && /path/to/.venv/bin/python -m ingester ingest

Output is appended to `logs/ingest.log`.

## Operational notes

- **Only one writer at a time** — a second `ingest`/`fetch` that overlaps logs
  `previous run still active, skipping` and exits 0 (flock on `data/sr.lock`).
- **Failure visibility:** pass `--healthcheck-url` (a dead-man's switch that catches *missing* runs).
- **Staleness** is owned by the downstream consumer: it should refuse to synthesize when
  `last_successful_ingest_at` / the newest `content_fetched_at` is older than its threshold.

## Tests

    pytest                 # unit tests (offline, fast)
    pytest -m integration  # network-gated end-to-end smoke test
