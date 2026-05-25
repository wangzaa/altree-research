// Server-only module. The Yahoo Finance client below pulls in Node's `net`
// shim, which breaks if this file ends up in a client bundle. Any client
// component that needs FX conversion should import the pure `toUsdLive`
// helper from `./fx` instead — that file has no Yahoo dependency.
import YahooFinance from "yahoo-finance2";
import { toUsd as toUsdStatic } from "./fx";

// Reuse the v3 yahoo-finance2 client pattern from lib/data/yahoo.ts. The
// instance is module-scoped so caching is shared across calls within the
// same Node process (the Next.js server runtime keeps it alive across
// requests when warm).
const yahooFinance = new YahooFinance();

const TTL_MS = 30 * 60 * 1000;

interface CachedRate {
  /** "1 unit of CCY in USD" — same shape as the static USD_PER table. */
  rate: number;
  fetched_at: number;
  /** Yahoo's last-trade timestamp for the FX pair, ms epoch. Surfaced to
   * callers that want to render an "as of" indicator. */
  market_time_ms: number | null;
}

const cache = new Map<string, CachedRate>();

export interface FxRatesResult {
  /** "1 unit of CCY in USD", keyed by uppercase ISO currency code. */
  rates: Record<string, number>;
  /** Most recent Yahoo `regularMarketTime` across the returned live rates,
   * ms epoch. Null when no currency has a live timestamp (e.g., everything
   * fell back to the static table, or only USD was requested). The "FX as
   * of …" UI indicator surfaces this. */
  as_of_ms: number | null;
}

/**
 * Fetches Yahoo's most recent FX rate for each currency, expressed as
 * "1 unit of CCY in USD". Uses an in-process 30-minute cache so a refresh
 * triggered by one user action won't re-hit Yahoo on every subsequent
 * render in the same window.
 *
 * Falls back to the static table in [lib/data/fx.ts] when Yahoo returns
 * no quote for a currency (rare — covers exotics or transient API hiccups).
 * Currencies that are unknown to both Yahoo and the static table are
 * simply absent from the returned map.
 *
 * USD is hardcoded to 1.
 */
export async function getRatesUsd(
  currencies: string[],
): Promise<FxRatesResult> {
  const now = Date.now();
  const upper = Array.from(new Set(currencies.map((c) => c.toUpperCase())));
  const stale: string[] = [];
  const out: Record<string, number> = {};
  // Track the most recent live market timestamp across every currency we
  // touched (cached + freshly fetched). Cached entries contribute too —
  // the indicator should reflect the freshest underlying data, not just
  // whatever was fetched on this call.
  let maxMarketTimeMs: number | null = null;

  for (const ccy of upper) {
    if (ccy === "USD") {
      out[ccy] = 1;
      continue;
    }
    const cached = cache.get(ccy);
    if (cached && now - cached.fetched_at < TTL_MS) {
      out[ccy] = cached.rate;
      if (cached.market_time_ms !== null) {
        maxMarketTimeMs =
          maxMarketTimeMs === null
            ? cached.market_time_ms
            : Math.max(maxMarketTimeMs, cached.market_time_ms);
      }
    } else {
      stale.push(ccy);
    }
  }

  if (stale.length === 0) {
    return { rates: out, as_of_ms: maxMarketTimeMs };
  }

  const results = await Promise.allSettled(
    stale.map(async (ccy) => {
      const raw = await yahooFinance.quote(`${ccy}USD=X`);
      const r = raw as {
        regularMarketPrice?: number;
        regularMarketTime?: number | Date;
      } | undefined;
      if (!r || typeof r.regularMarketPrice !== "number" || !(r.regularMarketPrice > 0)) {
        return { ccy, rate: null as number | null, market_time_ms: null as number | null };
      }
      const t = r.regularMarketTime;
      const market_time_ms =
        typeof t === "number"
          ? t * 1000
          : t instanceof Date
            ? t.getTime()
            : null;
      return { ccy, rate: r.regularMarketPrice, market_time_ms };
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const ccy = stale[i];
    const settled = results[i];
    if (settled.status === "fulfilled" && settled.value.rate !== null) {
      cache.set(ccy, {
        rate: settled.value.rate,
        fetched_at: now,
        market_time_ms: settled.value.market_time_ms,
      });
      out[ccy] = settled.value.rate;
      if (settled.value.market_time_ms !== null) {
        maxMarketTimeMs =
          maxMarketTimeMs === null
            ? settled.value.market_time_ms
            : Math.max(maxMarketTimeMs, settled.value.market_time_ms);
      }
      continue;
    }
    // Failed / no-data path: fall back to the static rate where possible.
    const fallback = toUsdStatic(1, ccy);
    if (fallback !== null) {
      out[ccy] = fallback;
    }
  }

  return { rates: out, as_of_ms: maxMarketTimeMs };
}

/**
 * Pre-formats an "FX as of …" string for the UI indicator. Uses a UTC,
 * locale-stable format so server-render and client-render produce
 * identical strings (no React hydration mismatch).
 */
export function formatFxAsOf(ms: number | null): string | null {
  if (ms === null) return null;
  const d = new Date(ms);
  // en-GB gives "23 May, 21:47" — short month, 24h time. Append UTC to
  // make the timezone explicit since we forced timeZone: "UTC".
  const formatted = d.toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatted} UTC`;
}

/**
 * Test helper — clears the in-memory FX cache so each test starts from a
 * known state. Not for production use; the cache otherwise lives for the
 * lifetime of the Node process.
 */
export function _resetFxCacheForTests(): void {
  cache.clear();
}
