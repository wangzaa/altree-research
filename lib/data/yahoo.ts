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

export interface TickerRatios {
  gross_margin: number | null;
  ebit_margin: number | null;
  trailing_pe: number | null;
}

export async function getRatios(ticker: string): Promise<TickerRatios | null> {
  try {
    const raw = await yahooFinance.quoteSummary(ticker, {
      modules: ["financialData", "defaultKeyStatistics"],
    });
    const r = raw as {
      financialData?: {
        grossMargins?: number;
        operatingMargins?: number;
      };
      defaultKeyStatistics?: { trailingPE?: number };
    };
    const fd = r.financialData ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    // Negative trailing P/E (loss-making company) is meaningless as a ratio —
    // surface as null so it doesn't drag the universe mean.
    const pe =
      typeof ks.trailingPE === "number" && Number.isFinite(ks.trailingPE) && ks.trailingPE > 0
        ? ks.trailingPE
        : null;
    return {
      gross_margin: typeof fd.grossMargins === "number" ? fd.grossMargins : null,
      ebit_margin: typeof fd.operatingMargins === "number" ? fd.operatingMargins : null,
      trailing_pe: pe,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[lib/data/yahoo] getRatios error for ${ticker}:`, message);
    return null;
  }
}
