import type { Universe } from "@/lib/schemas/universe";

export const canonicalUniverse: Universe = {
  id: "eu_defense_rearmament_cycle_26_05_01_universe_01",
  created_at: "2026-05-18T12:00:00.000Z",
  last_refreshed: "2026-05-18T12:00:00.000Z",
  gics_codes: ["20101010"],
  regions: ["EUROZONE", "UK", "NORDICS"],
  market_cap_min_usd: 1_000_000_000,
  tickers: [
    {
      ticker: "RHM.DE",
      name: "Rheinmetall AG",
      region: "EUROZONE",
      market_cap_usd_b: 38,
      exposure_tier: "pure_play",
      notes: "Anchor — German armored vehicle and ammunition prime",
    },
    {
      ticker: "BA.L",
      name: "BAE Systems plc",
      region: "UK",
      market_cap_usd_b: 52,
      exposure_tier: "pure_play",
      notes: "UK defence prime; platforms + electronics",
    },
    {
      ticker: "LDO.MI",
      name: "Leonardo S.p.A.",
      region: "EUROZONE",
      market_cap_usd_b: 18,
      exposure_tier: "pure_play",
      notes: "Italian defence prime; helicopters + electronics",
    },
    {
      ticker: "SAAB-B.ST",
      name: "Saab AB",
      region: "NORDICS",
      market_cap_usd_b: 14,
      exposure_tier: "pure_play",
      notes: "Swedish defence prime; Gripen + AEW",
    },
    {
      ticker: "ITA",
      name: "iShares U.S. Aerospace & Defense ETF",
      region: "US",
      market_cap_usd_b: 6,
      exposure_tier: "etf_proxy",
      notes: "Broad US A&D exposure (Lockheed, Northrop, Boeing, RTX)",
    },
  ],
};

/** Returns a deep clone so test mutations don't bleed across cases. */
export function cloneCanonicalUniverse(): Universe {
  return structuredClone(canonicalUniverse);
}
