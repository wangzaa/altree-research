import YahooFinance from "yahoo-finance2";

// v3 of yahoo-finance2 requires instantiation (the default export changed
// from a singleton to a class).
const yahooFinance = new YahooFinance();

export interface Quote {
  name: string;
  market_cap_usd: number | null;
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
    };
    const name = r.longName ?? r.shortName;
    if (!name) return null;
    const market_cap_usd = typeof r.marketCap === "number" ? r.marketCap : null;
    return { name, market_cap_usd };
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
  trailing_pe: number | null;
  // Per-ticker fields used by the scan-panel per-ticker table. Not
  // aggregated; passed through to the UI as-is.
  ebitda: number | null;             // native reporting currency, absolute
  ebitda_margin: number | null;      // decimal (ebitda / totalRevenue)
  revenue_growth_yoy: number | null; // decimal (Yahoo's financialData.revenueGrowth)
  currency: string | null;           // ISO currency code, e.g. "USD", "KRW", "TWD"
  quarterly_eps: QuarterlyEps[];     // up to ~8 quarters from earningsChart
}

// "1Q2024" -> "2024-03-31"; "4Q2023" -> "2023-12-31".
// Quarter strings from Yahoo's earnings.earningsChart.quarterly[].date.
const QUARTER_END_DAY: Record<number, [number, number]> = {
  1: [3, 31],
  2: [6, 30],
  3: [9, 30],
  4: [12, 31],
};

function quarterStringToPeriodEnd(qs: string): string | null {
  const m = qs.match(/^([1-4])Q(\d{4})$/);
  if (!m) return null;
  const q = Number(m[1]);
  const y = Number(m[2]);
  const [month, day] = QUARTER_END_DAY[q];
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function getRatios(ticker: string): Promise<TickerRatios | null> {
  try {
    const raw = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "financialData",
        "defaultKeyStatistics",
        "earnings",
        "summaryDetail",
        "price",
      ],
    });
    const r = raw as {
      financialData?: {
        grossMargins?: number;
        operatingMargins?: number;
        ebitda?: number;
        totalRevenue?: number;
        revenueGrowth?: number;
        financialCurrency?: string;
      };
      defaultKeyStatistics?: { trailingPE?: number };
      earnings?: {
        earningsChart?: {
          quarterly?: Array<{ date?: string; actual?: number }>;
        };
        financialCurrency?: string;
      };
      summaryDetail?: { currency?: string };
      price?: { currency?: string };
    };
    const fd = r.financialData ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const earningsQuarterly = r.earnings?.earningsChart?.quarterly ?? [];

    // Negative trailing P/E (loss-making company) is meaningless as a ratio —
    // surface as null so it doesn't drag the universe mean.
    const pe =
      typeof ks.trailingPE === "number" && Number.isFinite(ks.trailingPE) && ks.trailingPE > 0
        ? ks.trailingPE
        : null;

    const ebitda =
      typeof fd.ebitda === "number" && Number.isFinite(fd.ebitda) ? fd.ebitda : null;
    const totalRevenue =
      typeof fd.totalRevenue === "number" && Number.isFinite(fd.totalRevenue)
        ? fd.totalRevenue
        : null;
    const ebitda_margin =
      ebitda !== null && totalRevenue !== null && totalRevenue > 0
        ? ebitda / totalRevenue
        : null;

    const revenue_growth_yoy =
      typeof fd.revenueGrowth === "number" && Number.isFinite(fd.revenueGrowth)
        ? fd.revenueGrowth
        : null;

    // Currency preference: financialData.financialCurrency (the reporting
    // currency for the income statement, which matches ebitda) > earnings >
    // summaryDetail/price (trading currency, which may differ for ADRs).
    const currency =
      fd.financialCurrency ??
      r.earnings?.financialCurrency ??
      r.summaryDetail?.currency ??
      r.price?.currency ??
      null;

    const quarterly_eps: QuarterlyEps[] = [];
    for (const q of earningsQuarterly) {
      if (typeof q.date !== "string" || typeof q.actual !== "number") continue;
      const period_end_iso = quarterStringToPeriodEnd(q.date);
      if (!period_end_iso) continue;
      quarterly_eps.push({ period_end_iso, eps: q.actual });
    }

    return {
      gross_margin: typeof fd.grossMargins === "number" ? fd.grossMargins : null,
      ebit_margin: typeof fd.operatingMargins === "number" ? fd.operatingMargins : null,
      trailing_pe: pe,
      ebitda,
      ebitda_margin,
      revenue_growth_yoy,
      currency,
      quarterly_eps,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[lib/data/yahoo] getRatios error for ${ticker}:`, message);
    return null;
  }
}
