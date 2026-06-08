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
