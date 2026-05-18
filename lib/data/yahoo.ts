import yahooFinance from "yahoo-finance2";

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
