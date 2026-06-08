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
