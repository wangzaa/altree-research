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
