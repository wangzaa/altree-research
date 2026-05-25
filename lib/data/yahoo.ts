import YahooFinance from "yahoo-finance2";

// v3 of yahoo-finance2 requires instantiation (the default export changed
// from a singleton to a class).
const yahooFinance = new YahooFinance();

export interface Quote {
  name: string;
  /** Market cap in the LISTING's local reporting currency. Yahoo returns
   * `marketCap` in the trading currency (KRW for .KS, JPY for .T, etc.).
   * Callers convert to USD via lib/data/fx#toUsd before persisting. */
  market_cap_local: number | null;
  /** ISO-4217 currency of `market_cap_local`. */
  currency: string | null;
}

export interface Fundamentals {
  sector?: string;
  industry?: string;
}

export async function getQuote(ticker: string): Promise<Quote | null> {
  try {
    const raw = await yahooFinance.quote(ticker);
    if (!raw) return null;
    const r = raw as {
      longName?: string;
      shortName?: string;
      marketCap?: number;
      currency?: string;
      financialCurrency?: string;
    };
    const name = r.longName ?? r.shortName;
    if (!name) return null;
    const market_cap_local =
      typeof r.marketCap === "number" ? r.marketCap : null;
    // Trading currency is the right one for marketCap; financialCurrency
    // tracks the reporting currency on the income statement (often the
    // same, but for ADRs they diverge).
    const currency =
      typeof r.currency === "string"
        ? r.currency
        : typeof r.financialCurrency === "string"
          ? r.financialCurrency
          : null;
    return { name, market_cap_local, currency };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[lib/data/yahoo] getQuote error for ${ticker}:`, message);
    return null;
  }
}

export async function getFundamentals(
  ticker: string,
): Promise<Fundamentals | null> {
  try {
    const raw = await yahooFinance.quoteSummary(ticker, {
      modules: ["assetProfile"],
    });
    const profile = (raw as { assetProfile?: { sector?: string; industry?: string } })
      .assetProfile;
    if (!profile) return null;
    const result: Fundamentals = {};
    if (typeof profile.sector === "string") result.sector = profile.sector;
    if (typeof profile.industry === "string") result.industry = profile.industry;
    if (Object.keys(result).length === 0) return null;
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[lib/data/yahoo] getFundamentals error for ${ticker}:`, message);
    return null;
  }
}

export interface HistoryPoint {
  date: string;
  close: number;
}

export async function getHistory(
  ticker: string,
  options?: { period?: "5y" | "1y"; interval?: "1mo" | "1d" },
): Promise<HistoryPoint[] | null> {
  const period = options?.period ?? "5y";
  const interval = options?.interval ?? "1mo";
  const yearsBack = period === "5y" ? 5 : 1;
  const period2 = new Date();
  const period1 = new Date(period2);
  period1.setFullYear(period2.getFullYear() - yearsBack);

  try {
    const raw = await yahooFinance.historical(ticker, {
      period1,
      period2,
      interval,
    });
    if (!Array.isArray(raw)) return null;
    return raw.map((row) => {
      const r = row as {
        date: Date | string;
        close: number;
        adjClose?: number;
      };
      const close = typeof r.adjClose === "number" ? r.adjClose : r.close;
      const dateStr =
        r.date instanceof Date
          ? r.date.toISOString().slice(0, 10)
          : String(r.date).slice(0, 10);
      return { date: dateStr, close };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[lib/data/yahoo] getHistory error for ${ticker}:`, message);
    return null;
  }
}

export interface QuarterlyEps {
  period_end_iso: string; // YYYY-MM-DD
  eps: number;
}

export interface TickerRatios {
  gross_margin: number | null;
  ebit_margin: number | null;
  // Per-ticker fields used by the scan-panel per-ticker table. Not
  // aggregated; passed through to the UI as-is.
  ebitda: number | null;             // native reporting currency, absolute
  ebitda_margin: number | null;      // decimal (ebitda / totalRevenue)
  revenue_growth_yoy: number | null; // decimal (Yahoo's financialData.revenueGrowth)
  currency: string | null;           // ISO currency code, e.g. "USD", "KRW", "TWD"
  quarterly_eps: QuarterlyEps[];     // up to ~4 actual-EPS quarters from earningsHistory.history
  // Yahoo's pre-computed trailing P/E from `summaryDetail.trailingPE`.
  // Used as a fallback in the UI when our compute-from-EPS path returns
  // null (the EPS history is sparse for many HK/KR/TW listings, but
  // Yahoo's aggregate trailing P/E is usually still populated).
  trailing_pe: number | null;
}

// Yahoo's quoteSummary can return numeric fields either as a bare number or
// as a `{raw, fmt}` object depending on the ticker / module / market.
// yahoo-finance2 v3's bundled schema sometimes mismatches the live shape and
// silently strips fields when validateResult is on. We disable validation
// (so we receive the raw shape) and normalise here.
function extractNumber(field: unknown): number | null {
  if (typeof field === "number" && Number.isFinite(field)) return field;
  if (typeof field === "object" && field !== null && "raw" in field) {
    const raw = (field as { raw?: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

function extractString(field: unknown): string | null {
  if (typeof field === "string" && field.length > 0) return field;
  return null;
}

function extractDateIso(field: unknown): string | null {
  if (field instanceof Date && !Number.isNaN(field.getTime())) {
    return field.toISOString().slice(0, 10);
  }
  if (typeof field === "string") {
    const d = new Date(field);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof field === "object" && field !== null && "raw" in field) {
    const raw = (field as { raw?: unknown }).raw;
    if (typeof raw === "number") {
      // Yahoo unix seconds.
      const d = new Date(raw * 1000);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

export async function getRatios(ticker: string): Promise<TickerRatios | null> {
  try {
    const raw = await yahooFinance.quoteSummary(
      ticker,
      {
        modules: [
          "financialData",
          "earnings",
          "earningsHistory",
          "summaryDetail",
          "price",
        ],
      },
      // Disable yahoo-finance2's strict schema validation; it strips fields
      // that don't match the bundled schema (e.g. revenueGrowth or EBITDA
      // for some KS/TW markets). We normalise the raw response ourselves.
      { validateResult: false },
    );
    const r = raw as Record<string, unknown>;
    const fd = (r.financialData ?? {}) as Record<string, unknown>;
    const sd = (r.summaryDetail ?? {}) as Record<string, unknown>;
    const earningsHistory =
      ((r.earningsHistory as Record<string, unknown> | undefined)?.history as
        | Array<Record<string, unknown>>
        | undefined) ?? [];

    const ebitda = extractNumber(fd.ebitda);
    const totalRevenue = extractNumber(fd.totalRevenue);
    const ebitda_margin =
      ebitda !== null && totalRevenue !== null && totalRevenue > 0
        ? ebitda / totalRevenue
        : null;

    const revenue_growth_yoy = extractNumber(fd.revenueGrowth);

    // Currency preference: financialData.financialCurrency (the reporting
    // currency for the income statement, which matches ebitda) > earnings >
    // summaryDetail/price (trading currency, which may differ for ADRs).
    const currency =
      extractString(fd.financialCurrency) ??
      extractString((r.earnings as Record<string, unknown> | undefined)?.financialCurrency) ??
      extractString((r.summaryDetail as Record<string, unknown> | undefined)?.currency) ??
      extractString((r.price as Record<string, unknown> | undefined)?.currency) ??
      null;

    // earningsHistory.history[] holds the actuals (~4 quarters) with real
    // Date objects on `.quarter`. Cleaner source than earningsChart.quarterly
    // which mixes actuals with forward estimates.
    const quarterly_eps: QuarterlyEps[] = [];
    for (const q of earningsHistory) {
      const period_end_iso = extractDateIso(q.quarter);
      const eps = extractNumber(q.epsActual);
      if (!period_end_iso || eps === null) continue;
      quarterly_eps.push({ period_end_iso, eps });
    }

    // Yahoo sometimes returns negative or wildly large trailing P/E values
    // (loss-makers or stale data). Clip to a sane positive range so the
    // table doesn't surface gibberish; null means "not available".
    const rawPe = extractNumber(sd.trailingPE);
    const trailing_pe =
      rawPe !== null && Number.isFinite(rawPe) && rawPe > 0 && rawPe < 10_000
        ? rawPe
        : null;

    return {
      gross_margin: extractNumber(fd.grossMargins),
      ebit_margin: extractNumber(fd.operatingMargins),
      ebitda,
      ebitda_margin,
      revenue_growth_yoy,
      currency,
      quarterly_eps,
      trailing_pe,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[lib/data/yahoo] getRatios error for ${ticker}:`, message);
    return null;
  }
}
