import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone

import requests

import api
import convert
import db as dbmod
import financials
import parse
import poll_logic
import runlock

log = logging.getLogger("ingester")

EXIT_OK, EXIT_PARTIAL, EXIT_BLOCKED, EXIT_FATAL = 0, 1, 2, 3
NO_LIMIT = 10 ** 9


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_universe(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# --- commands -------------------------------------------------------------

def cmd_resolve(client, d, universe, dry_run):
    resolved = 0
    for entry in universe:
        ticker = str(entry["ticker"])
        raw = client.resolve_ticker(ticker)
        if raw is None:
            log.info("404 %s — no such ticker; recording internal_id NULL", ticker)
            rec = parse.CompanyRecord(ticker, None, None, None, None, None, None, None, None)
        else:
            rec = parse.parse_company(raw, ticker)
            log.info("resolved %s -> %s (%s)", ticker, rec.internal_id, rec.name_en)
        if not dry_run:
            d.upsert_company(rec, utc_now())
        resolved += 1
    return resolved


def cmd_poll(client, d, universe, dry_run):
    new_total = 0
    for entry in universe:
        ticker = str(entry["ticker"])
        internal_id = d.get_internal_id(ticker)
        if not internal_id:
            continue
        recs = parse.parse_projects(client.list_projects(internal_id))
        new_here = 0
        for r in recs:
            action = poll_logic.decide(d.get_report_version(r.project_id), r.file_created_at)
            if action is poll_logic.Action.INSERT:
                if not dry_run:
                    d.insert_report(r, ticker, internal_id, utc_now())
                new_here += 1
            elif action is poll_logic.Action.REFETCH:
                if not dry_run:
                    d.mark_for_refetch(r.project_id, r.file_created_at)
                new_here += 1
        if not dry_run:
            d.mark_polled(ticker, utc_now())
        log.info("polled %s: %d projects, %d new/revised", ticker, len(recs), new_here)
        new_total += new_here
    return new_total


def cmd_fetch(client, d, limit, max_attempts, dry_run):
    success = failed = 0
    for t in d.reports_to_fetch(max_attempts, limit):
        try:
            content = client.fetch_report(t.internal_id, t.file_id, t.filename)
        except requests.exceptions.RequestException as e:
            log.warning("fetch %s failed: %s", t.project_id, e)
            if not dry_run:
                d.record_fetch_error(t.project_id, str(e))
            failed += 1
            continue
        if not content:
            log.warning("fetch %s empty body", t.project_id)
            if not dry_run:
                d.record_fetch_error(t.project_id, "empty body")
            failed += 1
            continue
        result = convert.html_to_markdown(content.decode("utf-8", errors="replace"))
        if result.is_short:
            log.warning("fetch %s short markdown (%d chars)", t.project_id, result.char_count)
        if not dry_run:
            d.save_content(t.project_id, result.markdown, len(content), result.is_short, utc_now())
        log.info("fetched %s -> %d chars markdown", t.project_id, result.char_count)
        success += 1
    return success, failed


def cmd_ingest(client, d, universe, max_attempts, dry_run):
    to_resolve = [e for e in universe if not d.is_resolved(str(e["ticker"]))]
    if to_resolve:
        cmd_resolve(client, d, to_resolve, dry_run)
    new = cmd_poll(client, d, universe, dry_run)
    success, failed = cmd_fetch(client, d, NO_LIMIT, max_attempts, dry_run)
    log.info("=== Summary === new/revised: %d, fetched: %d ok / %d failed", new, success, failed)
    return new, success, failed


def cmd_status(d):
    s = d.stats()
    print(f"Companies: {s['companies']}")
    print(f"Reports:   {s['reports']} ({s['with_content']} with content)")
    print(f"Last successful ingest: {d.get_meta('last_successful_ingest_at') or '(never)'}")
    print(f"Last error:             {d.get_meta('last_error') or '(none)'}")
    newest = d.newest_content_fetched_at()
    if newest:
        try:
            parsed = datetime.strptime(newest, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            age_days = (datetime.now(timezone.utc) - parsed).days
            print(f"Newest content: {newest} ({age_days}d ago)")
        except ValueError:
            print(f"Newest content: {newest}")
    else:
        print("Newest content: (none)")
    return EXIT_OK


def cmd_financials(d):
    n = financials.build_all(d.conn)
    with_pl = d.conn.execute(
        "SELECT COUNT(*) c FROM company_financials WHERE latest_label IS NOT NULL"
    ).fetchone()["c"]
    print(f"Financials built for {n} companies ({with_pl} with a FLASH P&L table).")
    return EXIT_OK


def _ping(url):
    try:
        requests.get(url, timeout=10)
    except Exception as e:  # never let a monitoring ping fail the run
        log.warning("healthcheck ping failed: %s", e)


# --- entrypoint -----------------------------------------------------------

def build_parser():
    p = argparse.ArgumentParser(prog="ingester")
    p.add_argument("command",
                   choices=["resolve", "poll", "fetch", "ingest", "status", "financials"])
    p.add_argument("--db", default="data/sr.db")
    p.add_argument("--universe", default="sr_universe.json")
    p.add_argument("--rate-limit", type=float, default=1.0)
    p.add_argument("--user-agent", default=api.DEFAULT_UA)
    p.add_argument("--max-attempts", type=int, default=5)
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--healthcheck-url", default=None)
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-5s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    os.makedirs(os.path.dirname(args.db) or ".", exist_ok=True)
    os.makedirs("logs", exist_ok=True)
    d = dbmod.Database(args.db)

    if args.command == "status":
        try:
            return cmd_status(d)
        finally:
            d.close()

    if args.command == "financials":
        try:
            return cmd_financials(d)
        finally:
            d.close()

    lock_path = os.path.join(os.path.dirname(args.db) or ".", "sr.lock")
    lock = runlock.acquire_lock(lock_path)
    if lock is None:
        log.info("previous run still active, skipping")
        d.close()
        return EXIT_OK

    failed = 0
    try:
        client = api.SharedResearchClient(rate_limit=args.rate_limit, user_agent=args.user_agent)
        d.set_meta("last_run_at", utc_now())
        if args.command == "resolve":
            cmd_resolve(client, d, load_universe(args.universe), args.dry_run)
        elif args.command == "poll":
            cmd_poll(client, d, load_universe(args.universe), args.dry_run)
        elif args.command == "fetch":
            limit = args.limit if args.limit is not None else NO_LIMIT
            _, failed = cmd_fetch(client, d, limit, args.max_attempts, args.dry_run)
        elif args.command == "ingest":
            _, _, failed = cmd_ingest(client, d, load_universe(args.universe),
                                      args.max_attempts, args.dry_run)
        if not args.dry_run:
            d.set_meta("last_successful_ingest_at", utc_now())
            d.set_meta("last_error", "")
        if args.healthcheck_url and not args.dry_run:
            _ping(args.healthcheck_url)
        return EXIT_PARTIAL if failed else EXIT_OK
    except api.BlockedError as e:
        log.error("BLOCKED: %s — aborting run", e)
        d.set_meta("last_error", str(e))
        d.set_meta("last_error_at", utc_now())
        return EXIT_BLOCKED
    except Exception as e:
        log.exception("fatal error")
        d.set_meta("last_error", str(e))
        d.set_meta("last_error_at", utc_now())
        return EXIT_FATAL
    finally:
        runlock.release_lock(lock)
        d.close()


if __name__ == "__main__":
    sys.exit(main())
