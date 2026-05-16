export type Region =
  | "US"
  | "UK"
  | "EUROZONE"
  | "NON_EZ_DM_EU"
  | "JAPAN"
  | "ASIA_DM"
  | "ASIA_EM"
  | "AMERICAS_NON_US"
  | "ANZ_DM";

export const REGION_BY_SUFFIX = {
  // US (no suffix in Yahoo)
  "": "US",

  // UK
  ".L": "UK",

  // Eurozone (alphabetical by suffix)
  ".AS": "EUROZONE",
  ".AT": "EUROZONE",
  ".BR": "EUROZONE",
  ".DE": "EUROZONE",
  ".F": "EUROZONE",
  ".HE": "EUROZONE",
  ".IR": "EUROZONE",
  ".LS": "EUROZONE",
  ".MC": "EUROZONE",
  ".MI": "EUROZONE",
  ".PA": "EUROZONE",
  ".RG": "EUROZONE",
  ".TL": "EUROZONE",
  ".VI": "EUROZONE",
  ".VS": "EUROZONE",

  // Non-EZ Developed Europe
  ".CO": "NON_EZ_DM_EU",
  ".IC": "NON_EZ_DM_EU",
  ".OL": "NON_EZ_DM_EU",
  ".ST": "NON_EZ_DM_EU",
  ".SW": "NON_EZ_DM_EU",
  ".VX": "NON_EZ_DM_EU",

  // Japan
  ".T": "JAPAN",

  // Asia DM (HK, Singapore, Korea, Taiwan)
  ".HK": "ASIA_DM",
  ".SI": "ASIA_DM",
  ".KS": "ASIA_DM",
  ".KQ": "ASIA_DM",
  ".TW": "ASIA_DM",
  ".TWO": "ASIA_DM",

  // Asia EM
  ".SS": "ASIA_EM",
  ".SZ": "ASIA_EM",
  ".BO": "ASIA_EM",
  ".NS": "ASIA_EM",
  ".JK": "ASIA_EM",
  ".KL": "ASIA_EM",
  ".BK": "ASIA_EM",

  // Americas non-US
  ".TO": "AMERICAS_NON_US",
  ".V": "AMERICAS_NON_US",
  ".CN": "AMERICAS_NON_US",
  ".NE": "AMERICAS_NON_US",
  ".SA": "AMERICAS_NON_US",
  ".MX": "AMERICAS_NON_US",
  ".SN": "AMERICAS_NON_US",
  ".BA": "AMERICAS_NON_US",

  // ANZ DM
  ".AX": "ANZ_DM",
  ".NZ": "ANZ_DM",
} as const satisfies Record<string, Region>;

export const REGION_VALUES: readonly Region[] = Array.from(
  new Set(Object.values(REGION_BY_SUFFIX)),
);

/**
 * Map a Yahoo Finance ticker symbol to a Region.
 * "AAPL" -> "US", "RHM.DE" -> "EUROZONE", "BA.L" -> "UK", "7203.T" -> "JAPAN".
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
