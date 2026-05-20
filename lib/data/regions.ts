export type Region =
  | "US"
  | "CANADA"
  | "LATAM"
  | "UK"
  | "EUROZONE"
  | "NORDICS"
  | "SWITZERLAND"
  | "CEE"
  | "MIDDLE_EAST"
  | "AFRICA"
  | "JAPAN"
  | "KOREA"
  | "GREATER_CHINA"
  | "SOUTH_ASIA"
  | "SEA"
  | "ANZ";

export const REGION_BY_SUFFIX = {
  // US (no suffix in Yahoo)
  "": "US",

  // Canada
  ".TO": "CANADA",
  ".V": "CANADA",
  ".NE": "CANADA",
  ".CN": "CANADA",

  // Latin America
  ".SA": "LATAM",
  ".MX": "LATAM",
  ".SN": "LATAM",
  ".BA": "LATAM",
  ".CL": "LATAM",
  ".LM": "LATAM",

  // UK
  ".L": "UK",

  // Eurozone (12 majors + Baltic states .RG/.TL/.VS — Latvia/Estonia/Lithuania)
  ".DE": "EUROZONE",
  ".F": "EUROZONE",
  ".PA": "EUROZONE",
  ".MI": "EUROZONE",
  ".MC": "EUROZONE",
  ".AS": "EUROZONE",
  ".BR": "EUROZONE",
  ".LS": "EUROZONE",
  ".I": "EUROZONE",
  ".VI": "EUROZONE",
  ".HE": "EUROZONE",
  ".AT": "EUROZONE",
  ".RG": "EUROZONE",
  ".TL": "EUROZONE",
  ".VS": "EUROZONE",

  // Nordics
  ".ST": "NORDICS",
  ".OL": "NORDICS",
  ".CO": "NORDICS",
  ".IC": "NORDICS",

  // Switzerland (.VX is the legacy Swiss Virt-X listing suffix)
  ".SW": "SWITZERLAND",
  ".VX": "SWITZERLAND",

  // Central & Eastern Europe
  ".WA": "CEE",
  ".BD": "CEE",
  ".PR": "CEE",
  ".RO": "CEE",
  ".IS": "CEE",

  // Middle East
  ".TA": "MIDDLE_EAST",
  ".AE": "MIDDLE_EAST",
  ".SR": "MIDDLE_EAST",
  ".QA": "MIDDLE_EAST",
  ".KW": "MIDDLE_EAST",

  // Africa
  ".JO": "AFRICA",
  ".CA": "AFRICA",
  ".LG": "AFRICA",
  ".MA": "AFRICA",

  // Japan
  ".T": "JAPAN",

  // Korea
  ".KS": "KOREA",
  ".KQ": "KOREA",

  // Greater China (mainland + Hong Kong + Taiwan)
  ".SS": "GREATER_CHINA",
  ".SZ": "GREATER_CHINA",
  ".HK": "GREATER_CHINA",
  ".TW": "GREATER_CHINA",
  ".TWO": "GREATER_CHINA",

  // South Asia (India + Pakistan + Bangladesh + Sri Lanka)
  ".NS": "SOUTH_ASIA",
  ".BO": "SOUTH_ASIA",
  ".KA": "SOUTH_ASIA",
  ".DH": "SOUTH_ASIA",
  ".CM": "SOUTH_ASIA",

  // Southeast Asia
  ".SI": "SEA",
  ".JK": "SEA",
  ".KL": "SEA",
  ".BK": "SEA",
  ".PS": "SEA",
  ".VN": "SEA",

  // ANZ (Australia + New Zealand)
  ".AX": "ANZ",
  ".NZ": "ANZ",
} as const satisfies Record<string, Region>;

export const REGION_VALUES: readonly Region[] = Array.from(
  new Set(Object.values(REGION_BY_SUFFIX)),
);

/**
 * Map a Yahoo Finance ticker symbol to a Region.
 * "AAPL" -> "US", "RHM.DE" -> "EUROZONE", "BA.L" -> "UK", "7203.T" -> "JAPAN",
 * "2330.TW" -> "GREATER_CHINA", "000660.KS" -> "KOREA", "PETR4.SA" -> "LATAM".
 * Returns null if the suffix is unknown.
 */
export function getRegionForTicker(ticker: string): Region | null {
  const lastDot = ticker.lastIndexOf(".");
  if (lastDot === -1) {
    return REGION_BY_SUFFIX[""];
  }
  const suffix = ticker.slice(lastDot) as keyof typeof REGION_BY_SUFFIX;
  if (suffix in REGION_BY_SUFFIX) {
    return REGION_BY_SUFFIX[suffix];
  }
  return null;
}
