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
