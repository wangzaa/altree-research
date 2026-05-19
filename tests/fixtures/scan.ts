import type { ScanResults } from "@/lib/schemas/scan";

export const canonicalScan: ScanResults = {
  thesis_id: "eu_defense_rearmament_cycle_26_05_01",
  universe_id: "eu_defense_rearmament_cycle_26_05_01_universe_01",
  ran_at: "2026-05-19T12:00:00.000Z",
  history_5y: [
    {
      ticker: "RHM.DE",
      points: [
        { date: "2021-05-01", close: 90 },
        { date: "2021-06-01", close: 95 },
        { date: "2021-07-01", close: 100 },
      ],
    },
    {
      ticker: "BA.L",
      points: [
        { date: "2021-05-01", close: 5.50 },
        { date: "2021-06-01", close: 5.80 },
        { date: "2021-07-01", close: 6.00 },
      ],
    },
  ],
  fundamentals_snapshot: {
    as_of: "2026-05-19T12:00:00.000Z",
    mean: { gross_margin: 0.35, ebit_margin: 0.15, trailing_pe: 18.5 },
    median: { gross_margin: 0.34, ebit_margin: 0.14, trailing_pe: 17.2 },
    per_ticker_used: 2,
  },
  descriptive_markdown:
    "The universe price level rose roughly 25% over the period, with the steepest move from late 2024 into Q1 2026.\n\nMean gross margin sits at 35% with the median close behind at 34%. EBIT margin averages 15%; P/E around 18.\n\nRheinmetall accounts for the largest single-name move, rising ~110% over the period; BAE Systems compounded ~75%; Leonardo moved roughly in line with the universe.",
};

export function cloneCanonicalScan(): ScanResults {
  return structuredClone(canonicalScan);
}
