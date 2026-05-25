// Hardcoded foreign-exchange rates against USD, refreshed manually for
// cycle 2. A live FX feed (Yahoo `<CCY>USD=X` quotes, ECB daily reference,
// etc.) is the obvious upgrade; until then, an explicit static table keeps
// the build deterministic and avoids cross-ticker FX lookups per universe.
//
// Each value is "1 unit of <CCY> in USD". So `USD_PER` is the multiplier:
//   amount_usd = amount_local * USD_PER[currency]
//
// Updated: 2026-05-22

const USD_PER: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CHF: 1.12,
  CAD: 0.74,
  AUD: 0.66,
  NZD: 0.61,
  JPY: 0.0066,
  KRW: 0.00073,
  TWD: 0.031,
  HKD: 0.128,
  CNY: 0.139,
  SGD: 0.74,
  INR: 0.0119,
  BRL: 0.20,
  MXN: 0.058,
  ZAR: 0.054,
  SEK: 0.094,
  NOK: 0.094,
  DKK: 0.144,
  PLN: 0.25,
  CZK: 0.043,
  HUF: 0.0028,
  ILS: 0.27,
  AED: 0.272,
  SAR: 0.267,
};

/** Returns the USD-equivalent of an amount in the given currency, or null
 * if the currency code is unknown. Pass an uppercase ISO code (e.g. "KRW"). */
export function toUsd(
  amountLocal: number | null,
  currency: string | null,
): number | null {
  if (amountLocal === null) return null;
  if (!currency) return null;
  const rate = USD_PER[currency.toUpperCase()];
  if (typeof rate !== "number") return null;
  return amountLocal * rate;
}

/**
 * Sync USD conversion that prefers a pre-fetched live-rates map and falls
 * back to the static table above. Pure function — client-safe (no Yahoo
 * dependency), so client components can import it directly. The live-rates
 * map is produced server-side by `getRatesUsd` in `lib/data/fx-live.ts`.
 */
export function toUsdLive(
  amountLocal: number | null,
  currency: string | null,
  rates?: Record<string, number>,
): number | null {
  if (amountLocal === null) return null;
  if (!currency) return null;
  const upper = currency.toUpperCase();
  if (rates && upper in rates) return amountLocal * rates[upper];
  return toUsd(amountLocal, currency);
}

/** True when we have a USD rate for the given currency code. */
export function hasRate(currency: string | null | undefined): boolean {
  if (!currency) return false;
  return currency.toUpperCase() in USD_PER;
}
