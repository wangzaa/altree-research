import { toUsdLive } from "@/lib/data/fx";
import type { JpCompany, JpFinancials } from "@/lib/schemas/jp-company";
import type { OpportunitySet } from "@/lib/schemas/theme-exposure";

/** An opportunity-set company enriched for display: the qualitative "why"
 *  (dated rationale) from the exposure set, joined to the covered-set
 *  description + financials for the quantitative columns (#30). */
export type OpportunityRow = {
  ticker: string;
  yahoo_ticker: string;
  name_en: string;
  rationale: string;
  as_of: string;
  description: string | null;
  financials: JpFinancials;
};

const NULL_FINANCIALS: JpFinancials = {
  revenue_jpy_mn: null,
  gross_profit_jpy_mn: null,
  operating_profit_jpy_mn: null,
  operating_margin: null,
  revenue_yoy: null,
};

/** Join the persisted opportunity set to the committed covered set. Pure: the
 *  caller supplies the lookup (getCoveredCompany). The exposure row carries the
 *  qualitative fields; the covered company supplies description + financials.
 *  A row survives even if the covered lookup misses (renders quant as "—"). */
export function joinCoveredData(
  set: OpportunitySet,
  lookup: (ticker: string) => JpCompany | undefined,
): OpportunityRow[] {
  return set.companies.map((c) => {
    const company = lookup(c.ticker);
    return {
      ticker: c.ticker,
      yahoo_ticker: c.yahoo_ticker,
      name_en: c.name_en,
      rationale: c.rationale,
      as_of: c.as_of,
      description: company?.description ?? null,
      financials: company?.financials ?? NULL_FINANCIALS,
    };
  });
}

/** Render a JPY-millions figure as USD millions via live FX (falls back to the
 *  static table). The covered set stores JPYmn; USD is a render-time concern. */
export function fmtJpyMnToUsdM(
  jpyMn: number | null,
  rates?: Record<string, number>,
): string {
  if (jpyMn === null) return "—";
  const usd = toUsdLive(jpyMn * 1e6, "JPY", rates);
  if (usd === null) return "—";
  return Math.round(usd / 1e6).toLocaleString();
}

/** Render a decimal ratio (0.126) as a percentage ("12.6%"). With
 *  `signed`, prefix a + for non-negative values (for YoY growth). */
export function fmtPct(
  value: number | null,
  opts: { signed?: boolean } = {},
): string {
  if (value === null) return "—";
  const pct = value * 100;
  const sign = opts.signed && pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format an ISO date as "12 Apr 2026", in UTC, so server and client renders
 *  produce identical strings (no hydration mismatch). */
export function fmtAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
