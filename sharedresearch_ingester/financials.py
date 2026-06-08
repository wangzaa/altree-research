"""Extract income-statement (P&L) metrics from Shared Research FLASH teasers.

FLASH teasers carry a single "(cumulative)" earnings table: fiscal-year labels
across the top (forward-filled over merged cells), period labels (Q1, Q1-Q2, ...)
beneath them, then metric rows each followed by YoY and margin sub-rows. The last
columns are forecast ("% of forecast" / "FY Est.") and are ignored.

Balance-sheet metrics (EBITDA, total assets, leverage) are not in teasers.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional
import re

UNIT = "JPYmn"

# Canonical metric -> exact row labels (lowercased) that introduce it.
METRIC_ALIASES = {
    "revenue": {
        "revenue", "revenues", "sales", "net sales",
        "operating revenue", "operating revenues",
        "total operating revenue", "net revenue", "total revenue",
        "recurring revenue",        # insurer premium income
        "ordinary income",          # bank/financial top-line
        "ordinary revenues",        # insurer / financial top-line variant
        "ordinary revenue",
    },
    "gross_profit": {"gross profit"},
    "operating_profit": {"operating profit"},
    "recurring_profit": {"recurring profit", "pre-tax profit", "ordinary profit"},
}

# Sub-row label substrings that hold the margin for a given metric.
MARGIN_HINTS = {
    "gross_profit": ("gross profit margin", "gpm", "gross margin"),
    "operating_profit": ("operating profit margin", "opm"),
    "recurring_profit": ("recurring profit margin", "rpm", "pre-tax profit margin"),
}

_FY_RE = re.compile(r"FY\d", re.IGNORECASE)
_PERIOD_RE = re.compile(r"^Q[1-4](?:[–\-]Q[1-4])?$")
_NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")


@dataclass
class Metric:
    value: Optional[float] = None
    yoy: Optional[float] = None
    margin: Optional[float] = None


@dataclass
class PeriodFinancials:
    label: str
    fiscal_year: str
    period: str
    metrics: Dict[str, Metric] = field(default_factory=dict)


@dataclass
class CompanyFinancials:
    unit: str = UNIT
    latest: Optional[PeriodFinancials] = None
    last_full_year: Optional[PeriodFinancials] = None


def _parse_num(s: str) -> Optional[float]:
    s = s.strip().replace(",", "")
    if not s or s in ("-", "–", "—"):
        return None
    m = _NUM_RE.fullmatch(s)
    if not m:
        return None
    val = float(m.group())
    return int(val) if val.is_integer() else val


def _parse_pct(s: str) -> Optional[float]:
    s = s.strip().replace(",", "").replace("%", "")
    if not s or s in ("-", "–", "—"):
        return None
    m = _NUM_RE.fullmatch(s)
    return round(float(m.group()) / 100, 4) if m else None


_CUMUL_HEADER_RE = re.compile(r"\b(cumulative|earnings)\b", re.IGNORECASE)


def _find_cumulative_table(content: str) -> List[List[str]]:
    """Return the cumulative earnings table as a padded grid of cell strings.

    Accepts both 'Earnings (cumulative)' and 'Earnings (quarterly)' table
    headers — Shared Research uses both labels for the same cumulative
    (running-total) layout.
    """
    rows: List[List[str]] = []
    collecting = False
    for line in content.splitlines():
        if line.lstrip().startswith("|"):
            cells = [c.strip() for c in line.split("|")[1:-1]]
            first = cells[0].lower() if cells else ""
            if not collecting and _CUMUL_HEADER_RE.search(first):
                collecting = True
            if collecting:
                rows.append(cells)
        elif collecting:
            break
    if not rows:
        return []
    width = max(len(r) for r in rows)
    return [r + [""] * (width - len(r)) for r in rows]


def _column_map(grid: List[List[str]]):
    """Map each column index to (fiscal_year, period, is_period_column)."""
    fy_row = grid[0]
    period_row = grid[2]
    width = len(fy_row)

    fys: List[str] = []
    current = ""
    for c in range(width):
        cell = fy_row[c] if c < len(fy_row) else ""
        if _FY_RE.search(cell):
            current = cell
        fys.append(current)

    periods: List[str] = []
    is_period: List[bool] = []
    for c in range(width):
        cell = period_row[c].strip() if c < len(period_row) else ""
        norm = cell.replace("–", "-")
        periods.append(cell)
        is_period.append(bool(_PERIOD_RE.match(norm)))
    return fys, periods, is_period


def _metric_blocks(grid: List[List[str]]):
    """Group data rows into (label, [rows]) blocks keyed by the metric row."""
    blocks = []
    current_label = None
    current_rows: List[List[str]] = []
    for row in grid[3:]:
        label = row[0].strip() if row else ""
        if label:
            if current_label is not None:
                blocks.append((current_label, current_rows))
            current_label = label
            current_rows = [row]
        elif current_label is not None:
            current_rows.append(row)
    if current_label is not None:
        blocks.append((current_label, current_rows))
    return blocks


def _subrow_label(row: List[str]) -> str:
    for cell in row[1:]:
        if cell.strip():
            return cell.strip().lower()
    return ""


def _is_individual_quarters(periods: List[str], is_period: List[bool]) -> bool:
    """True when columns are individual Q1/Q2/Q3/Q4, not cumulative Q1–Q4 ranges."""
    active = [periods[c] for c, p in enumerate(is_period) if p]
    has_ranges = any("–" in p or "-" in p for p in active)
    return not has_ranges and any(p in {"Q2", "Q3"} for p in active)


def _build_period_annual(blocks, cols: List[int], fiscal_year: str) -> PeriodFinancials:
    """Annualize individual-quarter columns by summing Q1+Q2+Q3+Q4."""
    pf = PeriodFinancials(label=f"{fiscal_year} FY", fiscal_year=fiscal_year, period="FY")
    for canonical, aliases in METRIC_ALIASES.items():
        block = next((rows for lbl, rows in blocks if lbl.lower() in aliases), None)
        if block is None:
            continue
        vals = [_parse_num(block[0][c]) if c < len(block[0]) else None for c in cols]
        total = sum(v for v in vals if v is not None) if any(v is not None for v in vals) else None
        pf.metrics[canonical] = Metric(value=total)
    return pf


def _build_period(grid, blocks, col, fys, periods) -> PeriodFinancials:
    pf = PeriodFinancials(
        label=f"{fys[col]} {periods[col]}".strip(),
        fiscal_year=fys[col],
        period=periods[col],
    )
    for canonical, aliases in METRIC_ALIASES.items():
        block = next((rows for lbl, rows in blocks if lbl.lower() in aliases), None)
        if block is None:
            continue
        metric = Metric(value=_parse_num(block[0][col]) if col < len(block[0]) else None)
        for sub in block[1:]:
            lbl = _subrow_label(sub)
            val = sub[col] if col < len(sub) else ""
            if lbl == "yoy":
                metric.yoy = _parse_pct(val)
            elif any(h in lbl for h in MARGIN_HINTS.get(canonical, ())):
                metric.margin = _parse_pct(val)
        pf.metrics[canonical] = metric
    return pf


_METRICS = ["revenue", "gross_profit", "operating_profit", "recurring_profit"]
_MARGIN_COL = {
    "gross_profit": "gross_margin",
    "operating_profit": "operating_margin",
    "recurring_profit": "recurring_margin",
}
_PERIODS = [("", "latest"), ("fy_", "last_full_year")]

# (column, period_rec_key, metric, field) for every numeric column.
_METRIC_SPEC = []
for _pfx, _key in _PERIODS:
    for _m in _METRICS:
        _METRIC_SPEC.append((f"{_pfx}{_m}", _key, _m, "value"))
        _METRIC_SPEC.append((f"{_pfx}{_m}_yoy", _key, _m, "yoy"))
        if _m in _MARGIN_COL:
            _METRIC_SPEC.append((f"{_pfx}{_MARGIN_COL[_m]}", _key, _m, "margin"))

_TEXT_COLUMNS = [
    "ticker", "company", "exchange", "description", "sector", "unit",
    "source_published_at", "generated_at",
    "latest_label", "latest_fiscal_year", "latest_period",
    "fy_label", "fy_fiscal_year", "fy_period",
]
FINANCIAL_COLUMNS = _TEXT_COLUMNS + [c for c, *_ in _METRIC_SPEC]


def flatten_record(rec: dict, source_published_at=None, generated_at=None) -> dict:
    """Flatten a build_record dict into one row keyed by FINANCIAL_COLUMNS."""
    row = {
        "ticker": rec["ticker"], "company": rec["company"], "exchange": rec["exchange"],
        "description": rec["description"], "sector": rec["sector"], "unit": rec["unit"],
        "source_published_at": source_published_at, "generated_at": generated_at,
    }
    for key, prefix in (("latest", "latest"), ("last_full_year", "fy")):
        p = rec.get(key)
        row[f"{prefix}_label"] = p["label"] if p else None
        row[f"{prefix}_fiscal_year"] = p["fiscal_year"] if p else None
        row[f"{prefix}_period"] = p["period"] if p else None
    for col, period_key, metric, field in _METRIC_SPEC:
        period = rec.get(period_key)
        value = None
        if period:
            m = period["metrics"].get(metric)
            if m:
                value = m.get(field)
        row[col] = value
    return row


def ensure_financials_table(conn) -> None:
    cols = []
    for c in FINANCIAL_COLUMNS:
        if c == "ticker":
            cols.append("ticker TEXT PRIMARY KEY")
        elif c in _TEXT_COLUMNS:
            cols.append(f"{c} TEXT")
        else:
            cols.append(f"{c} REAL")
    conn.execute(f"CREATE TABLE IF NOT EXISTS company_financials ({', '.join(cols)})")


def upsert_financials(conn, row: dict) -> None:
    cols = list(row.keys())
    placeholders = ", ".join("?" * len(cols))
    # sector is populated externally (classify_sectors.py) — don't overwrite it.
    updates = ", ".join(f"{c}=excluded.{c}" for c in cols if c not in ("ticker", "sector"))
    conn.execute(
        f"INSERT INTO company_financials ({', '.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT(ticker) DO UPDATE SET {updates}",
        [row[c] for c in cols],
    )


def build_all(conn) -> int:
    """Extract latest-FLASH financials for every company and store one row each."""
    import datetime

    ensure_financials_table(conn)
    generated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    rows = conn.execute(
        """
        SELECT c.ticker, c.name_en, c.exchange_en, c.summary_en,
               r.content_md AS content_md, r.published_at AS published_at
        FROM companies c
        LEFT JOIN reports r ON r.project_id = (
            SELECT project_id FROM reports r2
            WHERE r2.ticker = c.ticker AND r2.type = 'FLASH'
              AND r2.content_md IS NOT NULL
            ORDER BY r2.published_at DESC LIMIT 1
        )
        """
    ).fetchall()

    n = 0
    for r in rows:
        company = {
            "ticker": r["ticker"], "name_en": r["name_en"],
            "exchange_en": r["exchange_en"], "summary_en": r["summary_en"],
        }
        rec = build_record(company, r["content_md"] or "")
        upsert_financials(conn, flatten_record(rec, r["published_at"], generated_at))
        n += 1
    conn.commit()
    return n


def _period_dict(pf: Optional[PeriodFinancials]):
    if pf is None:
        return None
    return {
        "label": pf.label,
        "fiscal_year": pf.fiscal_year,
        "period": pf.period,
        "metrics": {
            name: {"value": m.value, "yoy": m.yoy, "margin": m.margin}
            for name, m in pf.metrics.items()
        },
    }


def build_record(company: dict, content: str) -> dict:
    """Merge company metadata with extracted P&L into one structured record.

    `sector` is always None: Shared Research does not expose a sector field.
    """
    fin = extract_financials(content)
    return {
        "ticker": company.get("ticker"),
        "company": company.get("name_en"),
        "exchange": company.get("exchange_en"),
        "description": company.get("summary_en"),
        "sector": None,
        "unit": fin.unit,
        "latest": _period_dict(fin.latest),
        "last_full_year": _period_dict(fin.last_full_year),
    }


def extract_financials(content: str) -> CompanyFinancials:
    grid = _find_cumulative_table(content)
    if len(grid) < 4:
        return CompanyFinancials()

    fys, periods, is_period = _column_map(grid)
    blocks = _metric_blocks(grid)

    revenue_block = next(
        (rows for lbl, rows in blocks if lbl.lower() in METRIC_ALIASES["revenue"]),
        None,
    )
    if revenue_block is None:
        return CompanyFinancials()
    revenue_row = revenue_block[0]

    def has_revenue(c: int) -> bool:
        return is_period[c] and c < len(revenue_row) and _parse_num(revenue_row[c]) is not None

    period_cols = [c for c in range(len(periods)) if has_revenue(c)]
    if not period_cols:
        return CompanyFinancials()

    latest_col = period_cols[-1]
    result = CompanyFinancials()
    result.latest = _build_period(grid, blocks, latest_col, fys, periods)

    if _is_individual_quarters(periods, is_period):
        # Sum Q1+Q2+Q3+Q4 per FY to produce an annualized full-year figure.
        from collections import defaultdict
        fy_quarters: Dict[str, List[int]] = defaultdict(list)
        for c in period_cols:
            fy_quarters[fys[c]].append(c)
        complete = [(fy, cols) for fy, cols in fy_quarters.items() if len(cols) == 4]
        if complete:
            ann_fy, ann_cols = complete[-1]
            result.last_full_year = _build_period_annual(blocks, ann_cols, ann_fy)
    else:
        fy_cols = [c for c in period_cols if periods[c].replace("–", "-").endswith("Q4")]
        full_year_col = fy_cols[-1] if fy_cols else None
        if full_year_col is not None:
            result.last_full_year = _build_period(grid, blocks, full_year_col, fys, periods)

    return result
