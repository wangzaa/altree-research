from pathlib import Path

import pytest

import financials

FIXTURES = Path(__file__).parent / "fixtures" / "flash"


def load(ticker: str) -> str:
    return (FIXTURES / f"{ticker}.md").read_text()


def test_extracts_latest_revenue_4565():
    fin = financials.extract_financials(load("4565"))
    rev = fin.latest.metrics["revenue"]
    assert rev.value == 11256
    assert rev.yoy == pytest.approx(0.694)


def test_4565_latest_period_label_and_margins():
    fin = financials.extract_financials(load("4565"))
    assert fin.latest.label == "FY12/26 Q1"
    assert fin.unit == "JPYmn"
    gp = fin.latest.metrics["gross_profit"]
    assert gp.value == 10137
    assert gp.yoy == pytest.approx(1.016)
    assert gp.margin == pytest.approx(0.901)


def test_4565_pre_tax_profit_maps_to_recurring_profit_ifrs():
    # IFRS filer: "Pre-tax profit" -> recurring_profit.
    fin = financials.extract_financials(load("4565"))
    assert fin.latest.metrics["recurring_profit"].value == 3043
    assert fin.latest.metrics["recurring_profit"].margin == pytest.approx(0.270)


def test_4565_operating_profit_loss_yoy_is_none():
    fin = financials.extract_financials(load("4565"))
    op = fin.latest.metrics["operating_profit"]
    assert op.value == 3244
    assert op.margin == pytest.approx(0.288)
    assert op.yoy is None  # printed as "-"


def test_4565_last_full_year_is_prior_completed_fy():
    fin = financials.extract_financials(load("4565"))
    fy = fin.last_full_year
    assert fy.label == "FY12/25 Q1–Q4"
    assert fy.metrics["revenue"].value == 29615
    assert fy.metrics["revenue"].yoy == pytest.approx(0.027)
    assert fy.metrics["recurring_profit"].value == -14950


def test_2934_partial_period_latest_is_q1_q3():
    fin = financials.extract_financials(load("2934"))
    assert fin.latest.label == "FY05/26 Q1–Q3"
    assert fin.latest.metrics["revenue"].value == 16382
    assert fin.latest.metrics["revenue"].yoy == pytest.approx(0.002)
    assert fin.latest.metrics["gross_profit"].margin == pytest.approx(0.410)
    assert fin.latest.metrics["operating_profit"].value == 304
    assert fin.latest.metrics["operating_profit"].yoy == pytest.approx(0.508)
    assert fin.last_full_year.label == "FY05/25 Q1–Q4"
    assert fin.last_full_year.metrics["revenue"].value == 21504


def test_4582_revenue_alias_sales():
    fin = financials.extract_financials(load("4582"))
    rev = fin.latest.metrics["revenue"]
    assert rev.value == 233
    assert rev.yoy == pytest.approx(-0.116)
    assert fin.latest.metrics["gross_profit"].margin == pytest.approx(0.740)
    assert fin.latest.metrics["operating_profit"].value == -2341


def test_4579_operating_revenue_alias_and_no_gross_profit():
    fin = financials.extract_financials(load("4579"))
    rev = fin.latest.metrics["revenue"]
    assert rev.value == 802
    assert rev.yoy == pytest.approx(-0.169)
    assert "gross_profit" not in fin.latest.metrics  # royalty model: no GP line
    assert fin.latest.metrics["recurring_profit"].value == -159
    assert fin.latest.metrics["operating_profit"].value == -160
    assert fin.last_full_year.metrics["revenue"].value == 3980
    assert fin.last_full_year.metrics["operating_profit"].margin == pytest.approx(0.122)


def test_4392_all_core_metrics_present():
    fin = financials.extract_financials(load("4392"))
    m = fin.latest.metrics
    assert fin.latest.label == "FY12/26 Q1"
    assert m["revenue"].value == 3889
    assert m["revenue"].yoy == pytest.approx(0.127)
    assert m["gross_profit"].value == 1200
    assert m["gross_profit"].margin == pytest.approx(0.309)
    assert m["operating_profit"].value == 397
    assert m["operating_profit"].yoy == pytest.approx(0.551)
    assert m["operating_profit"].margin == pytest.approx(0.102)
    assert m["recurring_profit"].value == 400
    assert "net_income" not in m
    assert fin.last_full_year.metrics["revenue"].value == 13318


def test_empty_content_returns_no_periods():
    fin = financials.extract_financials("# Just a headline\n\nNo tables here.")
    assert fin.latest is None
    assert fin.last_full_year is None


def test_build_record_merges_metadata_and_financials():
    company = {
        "ticker": "4565",
        "name_en": "Nxera Pharma Co., Ltd.",
        "exchange_en": "Tokyo Stock Exchange, Prime Market",
        "summary_en": "Nxera Pharma is a Japanese biopharmaceutical company.",
    }
    rec = financials.build_record(company, load("4565"))
    assert rec["ticker"] == "4565"
    assert rec["company"] == "Nxera Pharma Co., Ltd."
    assert rec["exchange"] == "Tokyo Stock Exchange, Prime Market"
    assert rec["description"] == "Nxera Pharma is a Japanese biopharmaceutical company."
    assert rec["sector"] is None  # not present in SR data
    assert rec["unit"] == "JPYmn"
    assert rec["latest"]["label"] == "FY12/26 Q1"
    assert rec["latest"]["metrics"]["revenue"]["value"] == 11256
    assert rec["latest"]["metrics"]["revenue"]["yoy"] == pytest.approx(0.694)
    assert rec["last_full_year"]["metrics"]["revenue"]["value"] == 29615


def test_build_record_handles_company_with_no_financials():
    company = {"ticker": "0000", "name_en": "X", "exchange_en": None, "summary_en": None}
    rec = financials.build_record(company, "no tables")
    assert rec["latest"] is None
    assert rec["last_full_year"] is None
    assert rec["description"] is None


def test_flatten_record_to_columns():
    company = {
        "ticker": "4565",
        "name_en": "Nxera Pharma Co., Ltd.",
        "exchange_en": "Tokyo Stock Exchange, Prime Market",
        "summary_en": "Biopharma.",
    }
    rec = financials.build_record(company, load("4565"))
    row = financials.flatten_record(rec, source_published_at="2026-05-01", generated_at="2026-05-29")
    assert row["ticker"] == "4565"
    assert row["sector"] is None
    assert row["source_published_at"] == "2026-05-01"
    assert row["generated_at"] == "2026-05-29"
    assert row["latest_label"] == "FY12/26 Q1"
    assert row["revenue"] == 11256
    assert row["revenue_yoy"] == pytest.approx(0.694)
    assert row["gross_profit"] == 10137
    assert row["gross_margin"] == pytest.approx(0.901)
    assert row["recurring_profit"] == 3043
    assert row["recurring_margin"] == pytest.approx(0.270)
    assert "net_income" not in row
    assert "net_margin" not in row
    assert row["fy_revenue"] == 29615


def test_flatten_record_missing_metric_is_none():
    company = {"ticker": "4579", "name_en": "R", "exchange_en": None, "summary_en": None}
    row = financials.flatten_record(financials.build_record(company, load("4579")))
    assert row["revenue"] == 802
    assert row["gross_profit"] is None  # royalty model: no GP line
    assert row["gross_margin"] is None


def test_build_all_populates_table_and_handles_no_flash(tmp_path):
    import db as dbmod

    database = dbmod.Database(str(tmp_path / "t.db"))
    conn = database.conn
    conn.execute(
        "INSERT INTO companies (ticker, name_en, exchange_en, summary_en, last_resolved_at) "
        "VALUES (?,?,?,?,?)",
        ("4565", "Nxera Pharma Co., Ltd.", "TSE Prime", "Biopharma.", "2026-05-01"),
    )
    conn.execute(
        "INSERT INTO companies (ticker, name_en, exchange_en, summary_en, last_resolved_at) "
        "VALUES (?,?,?,?,?)",
        ("9999", "No Flash Co.", "TSE", "A company without any flash report.", "2026-05-01"),
    )
    conn.execute(
        "INSERT INTO reports (project_id, ticker, internal_id, type, published_at, "
        "content_md, discovered_at) VALUES (?,?,?,?,?,?,?)",
        ("p1", "4565", "i1", "FLASH", "2026-05-01", load("4565"), "2026-05-01"),
    )
    conn.commit()

    n = financials.build_all(conn)
    assert n == 2

    nx = conn.execute(
        "SELECT * FROM company_financials WHERE ticker='4565'").fetchone()
    assert nx["revenue"] == 11256
    assert nx["sector"] is None
    assert nx["source_published_at"] == "2026-05-01"
    assert nx["fy_revenue"] == 29615

    nf = conn.execute(
        "SELECT * FROM company_financials WHERE ticker='9999'").fetchone()
    assert nf["description"] == "A company without any flash report."
    assert nf["revenue"] is None
    assert nf["latest_label"] is None
    database.close()
