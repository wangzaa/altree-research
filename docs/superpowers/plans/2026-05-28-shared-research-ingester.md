# Shared Research Ingester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python CLI that pulls publicly-accessible English teaser research from sharedresearch.jp for a ~388-company universe, converts each to Markdown, and stores it idempotently in SQLite, runnable as a daily cron.

**Architecture:** Flat-module package run via `python -m ingester` from the project directory. Pure, isolated-testable modules (`convert`, `parse`, `poll_logic`) hold the bug-prone logic; `db` is a thin SQLite adapter; `api` is a thin HTTP client; `runlock` is an flock guard; `ingester` is the CLI orchestrator. The full spec lives in [`../shared_research_handoff.md`](../shared_research_handoff.md), the glossary in [`../../CONTEXT.md`](../../CONTEXT.md), and the unauthenticated-discovery decision in [ADR-0005](../../adr/0005-unauthenticated-file-defined-discovery.md).

**Tech Stack:** Python 3.11+, `requests`, `markdownify`, stdlib `sqlite3`/`fcntl`/`argparse`/`logging`, `pytest`.

---

## Notes for the implementer (read once)

- **Source of truth:** [`../shared_research_handoff.md`](../shared_research_handoff.md). This plan encodes its decisions; if anything here is ambiguous, that spec wins.
- **Working directory:** all app commands run with the current directory set to `sharedresearch_ingester/`. That's what puts the flat modules and the test `conftest.py` on `sys.path`, and it's what the cron line does (`cd sharedresearch_ingester`).
- **Ticker is always a string.** Never `int(ticker)` — 11 universe tickers look like `504A`.
- **Timestamps we write are UTC ISO-8601** in the exact form `YYYY-MM-DDTHH:MM:SSZ`. The API's `createdAt`/`publishedAt` are already UTC `Z`, so lexicographic string comparison of two `createdAt` values is valid (that's how revision detection works).
- **Run tests** from inside `sharedresearch_ingester/`: `pytest` (unit only; integration is skipped by default), or `pytest -m integration` for the network smoke test.

## File Structure

All paths are relative to the repo root (`.`).

| File | Responsibility |
|---|---|
| `sharedresearch_ingester/convert.py` | Deep, pure. `html_to_markdown(html) -> ConvertResult(markdown, char_count, is_short)`. markdownify config, script/style strip, <500-char short flag. No table-required assumption. |
| `sharedresearch_ingester/parse.py` | Deep, pure. `CompanyRecord`, `ReportRecord` dataclasses; `parse_company`, `select_teaser_link`, `parse_projects`. Type filter, EN/HTML/TEASER selection, `.en`/`.ja` extraction, `file_created_at` capture. |
| `sharedresearch_ingester/poll_logic.py` | Deep, pure. `Action` enum; `decide(stored_file_created_at, incoming_file_created_at) -> Action`. The re-fetch-on-change rule. |
| `sharedresearch_ingester/db.py` | SQLite adapter. Schema + WAL/`busy_timeout` pragmas, idempotent upserts, the `meta` health row, the fetch-queue query. Tested against a temp DB. |
| `sharedresearch_ingester/api.py` | Thin HTTP client. `SharedResearchClient` (resolve/list_projects/fetch_report), headers, rate-limit, retry/backoff, `BlockedError` on 403. |
| `sharedresearch_ingester/runlock.py` | `acquire_lock`/`release_lock` — non-blocking `flock` on `data/sr.lock`. |
| `sharedresearch_ingester/ingester.py` | CLI orchestrator + `__main__`. argparse, the five commands, exit codes, healthcheck ping, logging + summary, dir creation. |
| `sharedresearch_ingester/requirements.txt` | Pinned deps. |
| `sharedresearch_ingester/pytest.ini` | Registers the `integration` marker and skips it by default. |
| `sharedresearch_ingester/conftest.py` | Empty — puts the project root on `sys.path` for imports. |
| `sharedresearch_ingester/sr_universe.json` | Input universe (copied from the repo's `SR_universe.json`). |
| `sharedresearch_ingester/README.md` | Install + run + cron docs. |
| `sharedresearch_ingester/tests/test_convert.py` | Unit. |
| `sharedresearch_ingester/tests/test_parse.py` | Unit. |
| `sharedresearch_ingester/tests/test_poll_logic.py` | Unit. |
| `sharedresearch_ingester/tests/test_db.py` | Unit (temp SQLite). |
| `sharedresearch_ingester/tests/test_runlock.py` | Unit. |
| `sharedresearch_ingester/tests/test_api.py` | Unit (fake session, no network). |
| `sharedresearch_ingester/tests/test_cli.py` | Unit (`status` on an empty DB, no network). |
| `sharedresearch_ingester/tests/test_smoke.py` | Integration (network, `@pytest.mark.integration`). |
| `.gitignore` | Ignore HARs, venv, db/logs, caches. |

---

### Task 1: Project scaffold

**Files:**
- Create: `.gitignore`, `sharedresearch_ingester/requirements.txt`, `sharedresearch_ingester/pytest.ini`, `sharedresearch_ingester/conftest.py`, `sharedresearch_ingester/sr_universe.json`

- [ ] **Step 1: Initialise git (repo is not yet under version control) and the directory tree**

Run:
```bash
cd .
git init
mkdir -p sharedresearch_ingester/tests
```

- [ ] **Step 2: Create `.gitignore` at repo root**

```gitignore
# large captures and generated artifacts
*.har
**/data/
**/logs/
.venv/
__pycache__/
*.pyc
.pytest_cache/
.DS_Store
```

- [ ] **Step 3: Copy the universe file into the project**

Run:
```bash
cd .
cp SR_universe.json sharedresearch_ingester/sr_universe.json
python3 -c "import json;print('entries:',len(json.load(open('sharedresearch_ingester/sr_universe.json'))))"
```
Expected: `entries: 388`

- [ ] **Step 4: Create `sharedresearch_ingester/requirements.txt`**

```text
requests>=2.31
markdownify>=0.13
pytest>=7.0
```
(Note: the spec listed `python-dateutil`; it is intentionally omitted — we only compare/format ISO-8601 strings with stdlib `datetime`, so it's unused. YAGNI.)

- [ ] **Step 5: Create `sharedresearch_ingester/pytest.ini`**

```ini
[pytest]
markers =
    integration: network-dependent end-to-end test (skipped by default)
addopts = -m "not integration"
```

- [ ] **Step 6: Create `sharedresearch_ingester/conftest.py` (empty)**

```python
# Present so pytest adds the project root to sys.path, making the flat
# modules (convert, parse, db, ...) importable from tests/.
```

- [ ] **Step 7: Create and activate a venv, install deps**

Run:
```bash
cd ./sharedresearch_ingester
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```
Expected: installs `requests`, `markdownify`, `pytest` without error.

- [ ] **Step 8: Commit**

```bash
cd .
git add .gitignore sharedresearch_ingester/requirements.txt sharedresearch_ingester/pytest.ini sharedresearch_ingester/conftest.py sharedresearch_ingester/sr_universe.json
git commit -m "chore: scaffold sharedresearch_ingester project"
```

---

### Task 2: `convert` — HTML → Markdown (deep, pure)

**Files:**
- Create: `sharedresearch_ingester/convert.py`
- Test: `sharedresearch_ingester/tests/test_convert.py`

- [ ] **Step 1: Write the failing tests**

`sharedresearch_ingester/tests/test_convert.py`:
```python
import convert


def test_strips_scripts_and_keeps_text():
    r = convert.html_to_markdown(
        "<html><body><script>var x=1</script><p>Hello world</p></body></html>"
    )
    assert "Hello world" in r.markdown
    assert "var x=1" not in r.markdown


def test_preserves_table_cells_with_pipes():
    html = (
        "<table><tr><th>FY</th><th>Rev</th></tr>"
        "<tr><td>FY25</td><td>150</td></tr></table>"
    )
    r = convert.html_to_markdown(html)
    for token in ("FY", "Rev", "FY25", "150"):
        assert token in r.markdown
    assert "|" in r.markdown


def test_short_flag_set_for_tiny_content():
    r = convert.html_to_markdown("<p>tiny</p>")
    assert r.is_short is True
    assert r.char_count == len(r.markdown)


def test_short_flag_clear_for_long_content():
    html = "<p>" + ("word " * 200) + "</p>"
    r = convert.html_to_markdown(html)
    assert r.is_short is False


def test_tableless_prose_converts_without_error():
    # The United Arrows teaser case: prose only, no Key Financial Data table.
    html = "<h2>Executive summary</h2><p>Revenue rose 9.1% YoY.</p>"
    r = convert.html_to_markdown(html)
    assert "Executive summary" in r.markdown
    assert "9.1% YoY" in r.markdown
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ./sharedresearch_ingester && pytest tests/test_convert.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'convert'`.

- [ ] **Step 3: Write the implementation**

`sharedresearch_ingester/convert.py`:
```python
from dataclasses import dataclass

from markdownify import markdownify

SHORT_THRESHOLD = 500


@dataclass(frozen=True)
class ConvertResult:
    markdown: str
    char_count: int
    is_short: bool


def html_to_markdown(html: str, short_threshold: int = SHORT_THRESHOLD) -> ConvertResult:
    md = markdownify(html, heading_style="ATX", strip=["script", "style"]).strip()
    n = len(md)
    return ConvertResult(markdown=md, char_count=n, is_short=n < short_threshold)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_convert.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd .
git add sharedresearch_ingester/convert.py sharedresearch_ingester/tests/test_convert.py
git commit -m "feat: html_to_markdown with short-content flag"
```

---

### Task 3: `parse` — API JSON → typed records (deep, pure)

**Files:**
- Create: `sharedresearch_ingester/parse.py`
- Test: `sharedresearch_ingester/tests/test_parse.py`

- [ ] **Step 1: Write the failing tests**

`sharedresearch_ingester/tests/test_parse.py`:
```python
import parse

TICK = {
    "_id": "5fc9fb97f9d6ab000394dd5d",
    "tick": "6862",
    "name": {"ja": "ミナトホールディングス", "en": "MINATO HOLDINGS INC."},
    "exchangeName": {"en": "Tokyo Stock Exchange, Standard Market"},
    "coverageInitiatedAt": "2023-02-08",
    "listedAt": "1990-01-01",
    "website": "https://example.com",
    "summary": {"en": "A summary of the company."},
}

PROJECTS = [
    {  # keep: FLASH with an EN/HTML/TEASER link among several variants
        "_id": "p_flash",
        "type": "FLASH",
        "reportTitle": {"ja": "決算", "en": "Full-year FY03/26 flash update"},
        "companyId": "5fc9fb97f9d6ab000394dd5d",
        "publishedAt": {"ja": "2026-05-13T00:00:00.000Z", "en": "2026-05-13T00:00:00.000Z"},
        "links": [
            {"fileId": "f_full", "filename": "4488_EN_20260513.html",
             "createdAt": "2026-05-13T08:51:27.786Z", "locale": "en", "format": "HTML", "size": "FULL"},
            {"fileId": "f_teaser", "filename": "4488_EN_20260513_Flash.html",
             "createdAt": "2026-05-13T08:52:00.000Z", "locale": "en", "format": "HTML", "size": "TEASER"},
        ],
    },
    {  # skip: only a JP teaser exists
        "_id": "p_jp_only",
        "type": "NEWS_UPDATE",
        "reportTitle": {"ja": "お知らせ", "en": "Notice"},
        "companyId": "5fc9fb97f9d6ab000394dd5d",
        "publishedAt": {"en": "2025-01-01T00:00:00.000Z"},
        "links": [
            {"fileId": "j1", "filename": "j.html", "createdAt": "2025-01-01T00:00:00.000Z",
             "locale": "ja", "format": "HTML", "size": "TEASER"},
        ],
    },
    {  # skip: type not in the allowed set
        "_id": "p_other",
        "type": "INITIATION",
        "reportTitle": {"en": "Initiation"},
        "companyId": "5fc9fb97f9d6ab000394dd5d",
        "publishedAt": {"en": "2024-01-01T00:00:00.000Z"},
        "links": [
            {"fileId": "o1", "filename": "o.html", "createdAt": "2024-01-01T00:00:00.000Z",
             "locale": "en", "format": "HTML", "size": "TEASER"},
        ],
    },
]


def test_parse_company_extracts_en_and_ja_fields():
    c = parse.parse_company(TICK, "6862")
    assert c.ticker == "6862"
    assert c.internal_id == "5fc9fb97f9d6ab000394dd5d"
    assert c.name_en == "MINATO HOLDINGS INC."
    assert c.name_ja == "ミナトホールディングス"
    assert c.exchange_en == "Tokyo Stock Exchange, Standard Market"
    assert c.coverage_initiated_at == "2023-02-08"
    assert c.summary_en == "A summary of the company."


def test_parse_company_alpha_ticker_stays_string():
    c = parse.parse_company({"_id": "x" * 24, "name": {}, "exchangeName": {}}, "504A")
    assert c.ticker == "504A"
    assert isinstance(c.ticker, str)


def test_parse_company_tolerates_missing_fields():
    c = parse.parse_company({"_id": "abc"}, "1234")
    assert c.internal_id == "abc"
    assert c.name_en is None
    assert c.coverage_initiated_at is None


def test_parse_projects_filters_types_and_selects_teaser():
    recs = parse.parse_projects(PROJECTS)
    assert len(recs) == 1
    r = recs[0]
    assert r.project_id == "p_flash"
    assert r.type == "FLASH"
    assert r.title_en == "Full-year FY03/26 flash update"
    assert r.title_ja == "決算"
    assert r.published_at == "2026-05-13T00:00:00.000Z"
    assert r.file_id == "f_teaser"
    assert r.filename == "4488_EN_20260513_Flash.html"
    assert r.file_created_at == "2026-05-13T08:52:00.000Z"


def test_select_teaser_link_returns_none_when_only_jp():
    assert parse.select_teaser_link(PROJECTS[1]["links"]) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_parse.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'parse'`.

- [ ] **Step 3: Write the implementation**

`sharedresearch_ingester/parse.py`:
```python
from dataclasses import dataclass
from typing import Optional

REPORT_TYPES = {"FLASH", "POST_INTERVIEW_UPDATE", "NEWS_UPDATE"}
SUMMARY_MAX = 500


@dataclass(frozen=True)
class CompanyRecord:
    ticker: str
    internal_id: Optional[str]
    name_en: Optional[str]
    name_ja: Optional[str]
    exchange_en: Optional[str]
    coverage_initiated_at: Optional[str]
    listed_at: Optional[str]
    website: Optional[str]
    summary_en: Optional[str]


@dataclass(frozen=True)
class ReportRecord:
    project_id: str
    type: str
    title_en: Optional[str]
    title_ja: Optional[str]
    published_at: Optional[str]
    file_id: str
    filename: str
    file_created_at: str


def _en(obj):
    return obj.get("en") if isinstance(obj, dict) else None


def _ja(obj):
    return obj.get("ja") if isinstance(obj, dict) else None


def parse_company(tick: dict, ticker: str) -> CompanyRecord:
    summary = _en(tick.get("summary"))
    if summary:
        summary = summary[:SUMMARY_MAX]
    return CompanyRecord(
        ticker=str(ticker),
        internal_id=tick.get("_id"),
        name_en=_en(tick.get("name")),
        name_ja=_ja(tick.get("name")),
        exchange_en=_en(tick.get("exchangeName")),
        coverage_initiated_at=tick.get("coverageInitiatedAt"),
        listed_at=tick.get("listedAt"),
        website=tick.get("website"),
        summary_en=summary,
    )


def select_teaser_link(links) -> Optional[dict]:
    for link in links or []:
        if (link.get("locale") == "en"
                and link.get("format") == "HTML"
                and link.get("size") == "TEASER"):
            return link
    return None


def parse_projects(projects) -> list:
    out = []
    for p in projects or []:
        if p.get("type") not in REPORT_TYPES:
            continue
        link = select_teaser_link(p.get("links"))
        if link is None:
            continue
        out.append(ReportRecord(
            project_id=p["_id"],
            type=p["type"],
            title_en=_en(p.get("reportTitle")),
            title_ja=_ja(p.get("reportTitle")),
            published_at=_en(p.get("publishedAt")),
            file_id=link["fileId"],
            filename=link["filename"],
            file_created_at=link["createdAt"],
        ))
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_parse.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd .
git add sharedresearch_ingester/parse.py sharedresearch_ingester/tests/test_parse.py
git commit -m "feat: parse tick + projects JSON into typed records"
```

---

### Task 4: `poll_logic` — revision decision (deep, pure)

**Files:**
- Create: `sharedresearch_ingester/poll_logic.py`
- Test: `sharedresearch_ingester/tests/test_poll_logic.py`

- [ ] **Step 1: Write the failing tests**

`sharedresearch_ingester/tests/test_poll_logic.py`:
```python
from poll_logic import decide, Action


def test_unknown_project_is_insert():
    assert decide(None, "2026-05-13T08:52:00.000Z") == Action.INSERT


def test_newer_created_at_is_refetch():
    assert decide("2026-05-13T08:52:00.000Z", "2026-05-14T00:00:00.000Z") == Action.REFETCH


def test_identical_created_at_is_skip():
    assert decide("2026-05-13T08:52:00.000Z", "2026-05-13T08:52:00.000Z") == Action.SKIP


def test_older_created_at_is_skip():
    assert decide("2026-05-13T08:52:00.000Z", "2026-05-01T00:00:00.000Z") == Action.SKIP
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_poll_logic.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'poll_logic'`.

- [ ] **Step 3: Write the implementation**

`sharedresearch_ingester/poll_logic.py`:
```python
from enum import Enum
from typing import Optional


class Action(Enum):
    INSERT = "insert"
    REFETCH = "refetch"
    SKIP = "skip"


def decide(stored_file_created_at: Optional[str], incoming_file_created_at: str) -> Action:
    # Both values are UTC ISO-8601 with a trailing Z, so lexicographic
    # comparison is equivalent to chronological comparison.
    if stored_file_created_at is None:
        return Action.INSERT
    if incoming_file_created_at > stored_file_created_at:
        return Action.REFETCH
    return Action.SKIP
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_poll_logic.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd .
git add sharedresearch_ingester/poll_logic.py sharedresearch_ingester/tests/test_poll_logic.py
git commit -m "feat: re-fetch-on-change revision decision"
```

---

### Task 5: `db` — SQLite adapter

**Files:**
- Create: `sharedresearch_ingester/db.py`
- Test: `sharedresearch_ingester/tests/test_db.py`

- [ ] **Step 1: Write the failing tests**

`sharedresearch_ingester/tests/test_db.py`:
```python
import db as dbmod
from parse import CompanyRecord, ReportRecord

C = CompanyRecord("6862", "id6862", "MINATO", "ミナト", "TSE",
                  "2023-02-08", "1990-01-01", "http://x", "summary")


def _report(pid="p1", created="2026-05-13T08:52:00.000Z"):
    return ReportRecord(pid, "FLASH", "T_en", "T_ja",
                        "2026-05-13T00:00:00.000Z", "fid", "fn.html", created)


def make_db(tmp_path):
    return dbmod.Database(str(tmp_path / "t.db"))


def test_upsert_company_is_idempotent(tmp_path):
    d = make_db(tmp_path)
    d.upsert_company(C, "2026-05-28T00:00:00Z")
    d.upsert_company(C, "2026-05-28T01:00:00Z")
    assert d.get_internal_id("6862") == "id6862"
    assert d.stats()["companies"] == 1
    assert d.is_resolved("6862") is True


def test_company_404_has_null_internal_id(tmp_path):
    d = make_db(tmp_path)
    null_co = CompanyRecord("9999", None, None, None, None, None, None, None, None)
    d.upsert_company(null_co, "2026-05-28T00:00:00Z")
    assert d.get_internal_id("9999") is None
    assert d.is_resolved("9999") is True  # resolved == we tried, regardless of 404


def test_insert_report_and_get_version(tmp_path):
    d = make_db(tmp_path)
    d.upsert_company(C, "t")
    d.insert_report(_report(), "6862", "id6862", "2026-05-28T00:00:00Z")
    assert d.get_report_version("p1") == "2026-05-13T08:52:00.000Z"
    assert d.get_report_version("missing") is None


def test_insert_report_is_idempotent(tmp_path):
    d = make_db(tmp_path)
    d.upsert_company(C, "t")
    d.insert_report(_report(), "6862", "id6862", "t")
    d.insert_report(_report(), "6862", "id6862", "t")
    assert d.stats()["reports"] == 1


def test_reports_to_fetch_respects_max_attempts(tmp_path):
    d = make_db(tmp_path)
    d.upsert_company(C, "t")
    d.insert_report(_report(), "6862", "id6862", "t")
    assert [t.project_id for t in d.reports_to_fetch(max_attempts=5, limit=10)] == ["p1"]
    for _ in range(5):
        d.record_fetch_error("p1", "boom")  # attempts -> 5
    assert d.reports_to_fetch(5, 10) == []


def test_save_content_marks_fetched(tmp_path):
    d = make_db(tmp_path)
    d.upsert_company(C, "t")
    d.insert_report(_report(), "6862", "id6862", "t")
    d.save_content("p1", "# Body", html_size=1234, is_short=False, when="2026-05-28T02:00:00Z")
    assert d.reports_to_fetch(5, 10) == []
    assert d.newest_content_fetched_at() == "2026-05-28T02:00:00Z"
    assert d.stats()["with_content"] == 1


def test_mark_for_refetch_renulls_and_requeues(tmp_path):
    d = make_db(tmp_path)
    d.upsert_company(C, "t")
    d.insert_report(_report(), "6862", "id6862", "t")
    d.save_content("p1", "# Body", 10, False, "2026-05-28T02:00:00Z")
    assert d.reports_to_fetch(5, 10) == []
    d.mark_for_refetch("p1", "2026-05-20T00:00:00.000Z")
    assert [t.project_id for t in d.reports_to_fetch(5, 10)] == ["p1"]
    assert d.get_report_version("p1") == "2026-05-20T00:00:00.000Z"


def test_meta_roundtrip(tmp_path):
    d = make_db(tmp_path)
    d.set_meta("last_error", "boom")
    d.set_meta("last_error", "boom2")  # upsert
    assert d.get_meta("last_error") == "boom2"
    assert d.get_meta("missing") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_db.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'db'`.

- [ ] **Step 3: Write the implementation**

`sharedresearch_ingester/db.py`:
```python
import sqlite3
from collections import namedtuple

FetchTarget = namedtuple("FetchTarget", "project_id internal_id file_id filename")

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
    ticker            TEXT PRIMARY KEY,
    internal_id       TEXT UNIQUE,
    name_en           TEXT,
    name_ja           TEXT,
    exchange_en       TEXT,
    coverage_initiated_at  TEXT,
    listed_at         TEXT,
    website           TEXT,
    summary_en        TEXT,
    last_resolved_at  TEXT NOT NULL,
    last_polled_at    TEXT
);

CREATE TABLE IF NOT EXISTS reports (
    project_id        TEXT PRIMARY KEY,
    ticker            TEXT NOT NULL,
    internal_id       TEXT NOT NULL,
    type              TEXT NOT NULL,
    title_en          TEXT,
    title_ja          TEXT,
    published_at      TEXT,
    file_id           TEXT,
    filename          TEXT,
    file_created_at   TEXT,
    content_md        TEXT,
    content_short     INTEGER DEFAULT 0,
    content_html_size INTEGER,
    content_fetched_at TEXT,
    fetch_attempts    INTEGER DEFAULT 0,
    fetch_last_error  TEXT,
    discovered_at     TEXT NOT NULL,
    FOREIGN KEY (ticker) REFERENCES companies(ticker)
);

CREATE INDEX IF NOT EXISTS idx_reports_ticker ON reports(ticker);
CREATE INDEX IF NOT EXISTS idx_reports_published ON reports(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_unfetched ON reports(fetch_attempts) WHERE content_md IS NULL;

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


class Database:
    def __init__(self, path):
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL;")
        self.conn.execute("PRAGMA busy_timeout=30000;")
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    # --- companies ---
    def upsert_company(self, c, resolved_at):
        self.conn.execute(
            """
            INSERT INTO companies (ticker, internal_id, name_en, name_ja, exchange_en,
                coverage_initiated_at, listed_at, website, summary_en, last_resolved_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(ticker) DO UPDATE SET
                internal_id=excluded.internal_id, name_en=excluded.name_en,
                name_ja=excluded.name_ja, exchange_en=excluded.exchange_en,
                coverage_initiated_at=excluded.coverage_initiated_at,
                listed_at=excluded.listed_at, website=excluded.website,
                summary_en=excluded.summary_en, last_resolved_at=excluded.last_resolved_at
            """,
            (c.ticker, c.internal_id, c.name_en, c.name_ja, c.exchange_en,
             c.coverage_initiated_at, c.listed_at, c.website, c.summary_en, resolved_at),
        )
        self.conn.commit()

    def get_internal_id(self, ticker):
        row = self.conn.execute(
            "SELECT internal_id FROM companies WHERE ticker=?", (ticker,)).fetchone()
        return row["internal_id"] if row else None

    def is_resolved(self, ticker):
        row = self.conn.execute(
            "SELECT 1 FROM companies WHERE ticker=? AND last_resolved_at IS NOT NULL",
            (ticker,)).fetchone()
        return row is not None

    def mark_polled(self, ticker, when):
        self.conn.execute(
            "UPDATE companies SET last_polled_at=? WHERE ticker=?", (when, ticker))
        self.conn.commit()

    # --- reports ---
    def get_report_version(self, project_id):
        row = self.conn.execute(
            "SELECT file_created_at FROM reports WHERE project_id=?", (project_id,)).fetchone()
        return row["file_created_at"] if row else None

    def insert_report(self, r, ticker, internal_id, discovered_at):
        self.conn.execute(
            """
            INSERT OR IGNORE INTO reports
                (project_id, ticker, internal_id, type, title_en, title_ja, published_at,
                 file_id, filename, file_created_at, discovered_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """,
            (r.project_id, ticker, internal_id, r.type, r.title_en, r.title_ja,
             r.published_at, r.file_id, r.filename, r.file_created_at, discovered_at),
        )
        self.conn.commit()

    def mark_for_refetch(self, project_id, new_file_created_at):
        self.conn.execute(
            """
            UPDATE reports SET file_created_at=?, content_md=NULL, content_short=0,
                content_fetched_at=NULL, fetch_attempts=0, fetch_last_error=NULL
            WHERE project_id=?
            """,
            (new_file_created_at, project_id),
        )
        self.conn.commit()

    def reports_to_fetch(self, max_attempts, limit):
        rows = self.conn.execute(
            """
            SELECT project_id, internal_id, file_id, filename FROM reports
            WHERE content_md IS NULL AND fetch_attempts < ?
            ORDER BY published_at DESC LIMIT ?
            """,
            (max_attempts, limit),
        ).fetchall()
        return [FetchTarget(r["project_id"], r["internal_id"], r["file_id"], r["filename"])
                for r in rows]

    def save_content(self, project_id, markdown, html_size, is_short, when):
        self.conn.execute(
            """
            UPDATE reports SET content_md=?, content_html_size=?, content_short=?,
                content_fetched_at=?, fetch_attempts=fetch_attempts+1, fetch_last_error=NULL
            WHERE project_id=?
            """,
            (markdown, html_size, 1 if is_short else 0, when, project_id),
        )
        self.conn.commit()

    def record_fetch_error(self, project_id, error):
        self.conn.execute(
            "UPDATE reports SET fetch_attempts=fetch_attempts+1, fetch_last_error=? WHERE project_id=?",
            (error, project_id),
        )
        self.conn.commit()

    # --- meta / stats ---
    def set_meta(self, key, value):
        self.conn.execute(
            "INSERT INTO meta (key, value) VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
        self.conn.commit()

    def get_meta(self, key):
        row = self.conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row["value"] if row else None

    def stats(self):
        companies = self.conn.execute("SELECT COUNT(*) n FROM companies").fetchone()["n"]
        reports = self.conn.execute("SELECT COUNT(*) n FROM reports").fetchone()["n"]
        with_content = self.conn.execute(
            "SELECT COUNT(*) n FROM reports WHERE content_md IS NOT NULL").fetchone()["n"]
        return {"companies": companies, "reports": reports, "with_content": with_content}

    def newest_content_fetched_at(self):
        row = self.conn.execute("SELECT MAX(content_fetched_at) m FROM reports").fetchone()
        return row["m"]

    def close(self):
        self.conn.close()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_db.py -v`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
cd .
git add sharedresearch_ingester/db.py sharedresearch_ingester/tests/test_db.py
git commit -m "feat: SQLite adapter with idempotent upserts, fetch queue, meta health"
```

---

### Task 6: `runlock` — flock run guard

**Files:**
- Create: `sharedresearch_ingester/runlock.py`
- Test: `sharedresearch_ingester/tests/test_runlock.py`

- [ ] **Step 1: Write the failing tests**

`sharedresearch_ingester/tests/test_runlock.py`:
```python
import runlock


def test_second_acquire_returns_none_then_releases(tmp_path):
    path = str(tmp_path / "x.lock")
    first = runlock.acquire_lock(path)
    assert first is not None
    second = runlock.acquire_lock(path)
    assert second is None          # already held
    runlock.release_lock(first)
    third = runlock.acquire_lock(path)
    assert third is not None        # released, can re-acquire
    runlock.release_lock(third)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_runlock.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'runlock'`.

- [ ] **Step 3: Write the implementation**

`sharedresearch_ingester/runlock.py`:
```python
import fcntl


def acquire_lock(path):
    """Take a non-blocking exclusive flock. Returns the open file object on
    success (keep it alive for the run), or None if another holder has it."""
    f = open(path, "w")
    try:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return None
    return f


def release_lock(f):
    try:
        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    finally:
        f.close()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_runlock.py -v`
Expected: 1 passed.
(Note: two separate `open()` calls create distinct open file descriptions, so the second `LOCK_EX | LOCK_NB` conflicts and raises — even within one process. This is the behaviour the test asserts.)

- [ ] **Step 5: Commit**

```bash
cd .
git add sharedresearch_ingester/runlock.py sharedresearch_ingester/tests/test_runlock.py
git commit -m "feat: non-blocking flock run guard"
```

---

### Task 7: `api` — thin HTTP client

**Files:**
- Create: `sharedresearch_ingester/api.py`
- Test: `sharedresearch_ingester/tests/test_api.py`

- [ ] **Step 1: Write the failing tests**

`sharedresearch_ingester/tests/test_api.py`:
```python
import pytest
import requests

import api


class FakeResp:
    def __init__(self, status, json_data=None, content=b"", headers=None):
        self.status_code = status
        self._json = json_data
        self.content = content
        self.headers = headers or {}

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(str(self.status_code))


class FakeSession:
    def __init__(self, resp):
        self.resp = resp
        self.headers = {}

    def get(self, url, **kwargs):
        return self.resp


def client_with(resp):
    return api.SharedResearchClient(session=FakeSession(resp), rate_limit=0)


def test_resolve_404_returns_none():
    assert client_with(FakeResp(404)).resolve_ticker("9999") is None


def test_resolve_ok_returns_json():
    c = client_with(FakeResp(200, json_data={"_id": "x"}))
    assert c.resolve_ticker("6862") == {"_id": "x"}


def test_403_raises_blocked():
    with pytest.raises(api.BlockedError):
        client_with(FakeResp(403)).list_projects("id")


def test_fetch_report_returns_bytes():
    c = client_with(FakeResp(200, content=b"<html>ok</html>"))
    assert c.fetch_report("cid", "fid", "f.html") == b"<html>ok</html>"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_api.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api'`.

- [ ] **Step 3: Write the implementation**

`sharedresearch_ingester/api.py`:
```python
import time

import requests

DEFAULT_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)
BASE = "https://sharedresearch.jp/api"
RETRY_STATUS = {429, 502, 503, 504}
BACKOFF = [2, 8, 30]


class BlockedError(Exception):
    """Raised on HTTP 403 — we are being blocked; abort the run."""


def build_headers(user_agent=DEFAULT_UA):
    return {
        "User-Agent": user_agent,
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://sharedresearch.jp/en/companies",
        "Origin": "https://sharedresearch.jp",
    }


class SharedResearchClient:
    def __init__(self, session=None, rate_limit=1.0, user_agent=DEFAULT_UA):
        self.session = session or requests.Session()
        self.session.headers.update(build_headers(user_agent))
        self.rate_limit = rate_limit

    def _sleep(self):
        if self.rate_limit:
            time.sleep(self.rate_limit)

    def _get(self, url, accept=None, allow_redirects=False):
        headers = {"Accept": accept} if accept else {}
        for attempt in range(4):
            try:
                r = self.session.get(
                    url, headers=headers, allow_redirects=allow_redirects, timeout=30)
            except requests.exceptions.RequestException:
                if attempt == 3:
                    raise
                time.sleep(BACKOFF[attempt])
                continue
            if r.status_code == 403:
                raise BlockedError(f"403 from {url}")
            if r.status_code in RETRY_STATUS and attempt < 3:
                retry_after = r.headers.get("Retry-After")
                delay = int(retry_after) if (retry_after and retry_after.isdigit()) else BACKOFF[attempt]
                time.sleep(delay)
                continue
            self._sleep()
            return r
        self._sleep()
        return r

    def resolve_ticker(self, ticker):
        r = self._get(f"{BASE}/companies/tick/{ticker}")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()

    def list_projects(self, internal_id):
        r = self._get(f"{BASE}/projects?companyId={internal_id}&locale=en")
        r.raise_for_status()
        return r.json()

    def fetch_report(self, internal_id, file_id, filename):
        url = f"{BASE}/companies/{internal_id}/reports/{file_id}/{filename}"
        r = self._get(url, accept="*/*", allow_redirects=True)
        r.raise_for_status()
        return r.content
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_api.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd .
git add sharedresearch_ingester/api.py sharedresearch_ingester/tests/test_api.py
git commit -m "feat: thin Shared Research HTTP client with retry + BlockedError"
```

---

### Task 8: `ingester` — CLI orchestrator

**Files:**
- Create: `sharedresearch_ingester/ingester.py`
- Test: `sharedresearch_ingester/tests/test_cli.py`

- [ ] **Step 1: Write the failing test (status on an empty DB, no network)**

`sharedresearch_ingester/tests/test_cli.py`:
```python
import ingester


def test_status_on_empty_db(tmp_path, capsys):
    rc = ingester.main(["status", "--db", str(tmp_path / "s.db")])
    out = capsys.readouterr().out
    assert rc == 0
    assert "Companies: 0" in out
    assert "Reports:" in out
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_cli.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingester'`.

- [ ] **Step 3: Write the implementation**

`sharedresearch_ingester/ingester.py`:
```python
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


def _ping(url):
    try:
        requests.get(url, timeout=10)
    except Exception as e:  # never let a monitoring ping fail the run
        log.warning("healthcheck ping failed: %s", e)


# --- entrypoint -----------------------------------------------------------

def build_parser():
    p = argparse.ArgumentParser(prog="ingester")
    p.add_argument("command", choices=["resolve", "poll", "fetch", "ingest", "status"])
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
```

- [ ] **Step 4: Run the CLI test to verify it passes**

Run: `pytest tests/test_cli.py -v`
Expected: 1 passed.

- [ ] **Step 5: Run the full unit suite + a manual status smoke**

Run:
```bash
pytest -v
python -m ingester status --db data/sr.db
```
Expected: all unit tests pass (integration deselected); `status` prints `Companies: 0` and exits cleanly.

- [ ] **Step 6: Commit**

```bash
cd .
git add sharedresearch_ingester/ingester.py sharedresearch_ingester/tests/test_cli.py
git commit -m "feat: CLI orchestrator (resolve/poll/fetch/ingest/status) with lock, exit codes, health"
```

---

### Task 9: Integration smoke test (network)

**Files:**
- Create: `sharedresearch_ingester/tests/test_smoke.py`

- [ ] **Step 1: Write the integration test**

`sharedresearch_ingester/tests/test_smoke.py`:
```python
import pytest

import db as dbmod
import ingester


@pytest.mark.integration
def test_end_to_end_6862(tmp_path):
    db_path = str(tmp_path / "smoke.db")
    universe = tmp_path / "uni.json"
    universe.write_text('[{"ticker":"6862","name":"MINATO","updated":null}]', encoding="utf-8")

    assert ingester.main(["resolve", "--db", db_path, "--universe", str(universe)]) == 0
    assert ingester.main(["poll", "--db", db_path, "--universe", str(universe)]) == 0
    assert ingester.main(["fetch", "--db", db_path, "--limit", "1"]) == 0

    d = dbmod.Database(db_path)
    row = d.conn.execute(
        "SELECT content_md FROM reports WHERE content_md IS NOT NULL LIMIT 1").fetchone()
    d.close()
    assert row is not None and row["content_md"]
```

- [ ] **Step 2: Verify it is skipped by default**

Run: `pytest -v`
Expected: collected tests run; `test_end_to_end_6862` is **deselected** (by `addopts = -m "not integration"`).

- [ ] **Step 3: Run it explicitly against the live API**

Run: `pytest -m integration tests/test_smoke.py -v`
Expected: PASS — resolves 6862, discovers projects, fetches one teaser, asserts stored Markdown. (Network-dependent; if SR is unreachable it will fail — that's expected for an integration test.)

- [ ] **Step 4: Commit**

```bash
cd .
git add sharedresearch_ingester/tests/test_smoke.py
git commit -m "test: network-gated end-to-end smoke test for ticker 6862"
```

---

### Task 10: README

**Files:**
- Create: `sharedresearch_ingester/README.md`

- [ ] **Step 1: Write the README**

`sharedresearch_ingester/README.md`:
```markdown
# Shared Research Ingester

Pulls publicly-accessible English **teaser** research from sharedresearch.jp for the
~388-company universe in `sr_universe.json`, converts each to Markdown, and stores it in
SQLite (`data/sr.db`). Unauthenticated, polite (1 req/sec), runnable as a daily cron.
Full design rationale is in `../../shared_research_handoff.md`; the glossary in `../CONTEXT.md`.

## Install

    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt

## Commands

    python -m ingester resolve   # fill/refresh companies from sr_universe.json (upsert)
    python -m ingester poll      # discover new/revised reports for resolved companies
    python -m ingester fetch [--limit N]   # download teaser HTML -> Markdown for unfetched reports
    python -m ingester ingest    # resolve-if-needed -> poll -> fetch (the cron command)
    python -m ingester status    # DB stats + run health (last successful ingest, last error, staleness)

Global flags: `--db PATH` (default `data/sr.db`), `--universe PATH`, `--rate-limit SECONDS`
(default 1.0), `--user-agent STRING`, `--max-attempts N` (default 5), `--limit N`,
`--dry-run`, `--healthcheck-url URL`.

Exit codes: `0` ok/skip, `1` completed with some fetch errors, `2` blocked (403), `3` fatal.

## First run (one-time backfill, ~50 min at 1 rps)

Run the backlog **before** enabling the cron:

    python -m ingester resolve
    python -m ingester poll
    python -m ingester fetch

Check it:

    python -m ingester status
    sqlite3 data/sr.db "SELECT type, COUNT(*) FROM reports GROUP BY type;"

## Daily cron (only after the backfill finishes)

    # daily at 22:00 JST (13:00 UTC) — adjust the hour to your host's timezone
    0 13 * * * cd /path/to/sharedresearch_ingester && /path/to/.venv/bin/python -m ingester ingest >> logs/ingest.log 2>&1

## Operational notes

- **Only one writer at a time** — a second `ingest`/`fetch` that overlaps logs
  `previous run still active, skipping` and exits 0 (flock on `data/sr.lock`).
- **Failure visibility:** the exit-code signal only reaches you if cron `MAILTO`/MTA delivers —
  verify it, or pass `--healthcheck-url` (a dead-man's switch that catches *missing* runs too).
- **Staleness** is owned by the downstream consumer: it should refuse to synthesize when
  `last_successful_ingest_at` / the newest `content_fetched_at` is older than its threshold.

## Tests

    pytest                 # unit tests (offline, fast)
    pytest -m integration  # network-gated end-to-end smoke test
```

- [ ] **Step 2: Commit**

```bash
cd .
git add sharedresearch_ingester/README.md
git commit -m "docs: README with install, commands, backfill, cron, ops notes"
```

---

## Testing Decisions

**What makes a good test here:** assert *external behaviour* through each module's public function, not internal steps. For `parse`, feed real-shaped JSON (modeled on the HAR captures) and assert the selected records; for `poll_logic`, assert the returned `Action`; for `convert`, assert text/flags on the output; for `db`, drive the public methods against a temp SQLite file and assert what comes back out. Do **not** assert on SQL strings, private attributes, or call counts.

**Modules unit-tested (offline, CI):** `convert`, `parse`, `poll_logic`, `db`, `runlock`, and a thin slice of `api` (404→None, 403→BlockedError, 200→json/bytes via a fake session) plus `ingester status` on an empty DB. These cover the spec's five named cases: link selection + `.en` + ticker-as-string (`parse`), revision detection (`poll_logic`), table-less conversion (`convert`).

**Integration (network-gated, `@pytest.mark.integration`, skipped by default):** `test_smoke.py` runs resolve→poll→fetch against ticker `6862` and asserts stored Markdown.

**Prior art:** none — greenfield repo. Tests follow standard pytest conventions: `tmp_path` for DB isolation, `capsys` for CLI output, a hand-rolled fake session for the HTTP client. Fixtures are inlined in the test modules (deterministic) rather than loaded from disk.

## Out of Scope

Per `../shared_research_handoff.md`: no FULL/REGULAR sizes, no auth/login/cookies, no Japanese-locale content, no PDF handling, no LLM synthesis, no real-time push (no WebSocket), no web UI, no subscription management, and none of the telemetry/quota/subscribed endpoints documented in the spec's "Endpoints we deliberately do NOT call" section. No multi-threading/concurrency beyond the single session. No automatic purge of delisted companies (manual SQL).

## Further Notes

- **Module split deliberately exceeds the spec's four files** (`api`/`db`/`convert`/`ingester`) by extracting `parse`, `poll_logic`, and `runlock` as deep, isolated-testable units — the spec's testing section already requires the parsing/selection logic be callable without a live session, which this structure delivers.
- **`python-dateutil` dropped** from the spec's dependency list: we never do date arithmetic beyond formatting/comparing ISO-8601 `Z` strings, handled by stdlib `datetime`.
- **`fetch_attempts` increments on every attempt** (both `save_content` and `record_fetch_error`), so the `--max-attempts` ceiling bounds retries of a permanently-broken report.
- **Revision detection relies on lexicographic comparison** of `file_created_at`, valid only because both timestamps are same-format UTC `Z`. If the API ever changes that format, revisit `poll_logic.decide`.

---

## Self-Review

**Spec coverage** (each `../shared_research_handoff.md` decision → task):
- Resolve/poll/fetch/ingest/status CLI → Task 8. Global flags incl. `--max-attempts`, `--dry-run`, `--healthcheck-url` → Task 8.
- DB schema (companies/reports/meta + indexes, `file_created_at`, `content_short`) → Task 5.
- Re-fetch-on-change → Task 4 (`decide`) + Task 5 (`mark_for_refetch`) + Task 8 (`cmd_poll`).
- Everything-once backfill → Task 8 (`cmd_fetch` with `NO_LIMIT`) + README first-run.
- Lockfile + WAL + busy_timeout, skip-and-exit-0 → Task 6 + Task 5 (pragmas) + Task 8.
- Unauthenticated per-company poll → Task 7 endpoints; the subscribed/telemetry/quota endpoints are simply never called.
- Daily cadence → README cron line.
- Failure visibility (exit codes 0/1/2/3, `meta` health, healthcheck) → Task 5 + Task 8.
- Two-layer testing (offline units + network smoke) → Tasks 2–9.
- Universe drift (poll iterates JSON, no auto-delete) → Task 8 (`cmd_poll` loops the loaded universe; no delete path exists anywhere).
- Edge cases: 404→internal_id NULL (Task 8 `cmd_resolve`); coverage null→empty projects, not an error (parse returns `[]`); no EN/HTML/TEASER link→skip (Task 3); empty body→error+attempt (Task 8); short markdown→`content_short=1` (Task 2 flag + Task 5/8 store); unicode→UTF-8 (sqlite default + `encoding="utf-8"` on file reads).

**Placeholder scan:** none — every code step contains complete, runnable code; every run step has an exact command and expected output.

**Type consistency:** `CompanyRecord`/`ReportRecord` field names are identical across Tasks 3, 5, 8. `FetchTarget(project_id, internal_id, file_id, filename)` defined in Task 5, consumed in Task 8. `Action.{INSERT,REFETCH,SKIP}` defined in Task 4, consumed in Task 8. `BlockedError`/`DEFAULT_UA` defined in Task 7, referenced in Task 8. `html_to_markdown -> ConvertResult(markdown, char_count, is_short)` defined in Task 2, consumed in Task 8. Exit-code constants defined once in Task 8.
