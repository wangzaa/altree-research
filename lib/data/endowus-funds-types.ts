// Client-safe sibling of `endowus-funds.ts`. Holds the shared row type +
// pure UI helpers that have no Node dependency, so both client components
// (FundSelectionCards) and server modules can import from here without
// dragging `node:fs` into the client bundle.

export interface EndowusFund {
  fund_name: string;
  isin: string;
  asset_class: string;
  sub_category: string;
  region: string;
  funding_source: string;
  distribution_type: string;
  /** 1 (lowest) to 7 (highest) on the Endowus scale. */
  risk_rating: number;
  fund_fees_pct: number | null;
  return_1y_pct: number | null;
  return_3y_annualised_pct: number | null;
  payout_1y_pct: number | null;
}

/**
 * Map a 1-7 Endowus risk rating to a coarse UI label that matches the
 * "VERY HIGH RISK / HIGH RISK / MEDIUM RISK / LOW RISK" labelling on the
 * fund cards. The Endowus scale is roughly: 1 capital preservation,
 * 2-3 income, 4-5 balanced, 6 growth, 7 aggressive thematic.
 */
export function riskRatingLabel(rating: number): string {
  if (rating <= 2) return "LOW RISK";
  if (rating <= 4) return "MEDIUM RISK";
  if (rating <= 5) return "HIGH RISK";
  return "VERY HIGH RISK";
}
