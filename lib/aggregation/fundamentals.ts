// The aggregator only cares about the three numeric ratios used by the
// scan-runner agent prompt (gross / EBIT / P/E). The data layer's TickerRatios
// is wider — it also carries per-ticker extras (EBITDA, currency, quarterly
// EPS) used by the per-ticker UI table.
export interface AggregatedRatios {
  gross_margin: number | null;
  ebit_margin: number | null;
  trailing_pe: number | null;
}

export interface FundamentalsAggregate {
  mean: AggregatedRatios;
  median: AggregatedRatios;
  per_ticker_used: number;
}

const COLUMNS = ["gross_margin", "ebit_margin", "trailing_pe"] as const;
type Column = (typeof COLUMNS)[number];

function meanOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function columnValues(rows: AggregatedRatios[], col: Column): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const v = row[col];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function aggregateFundamentals(
  rows: AggregatedRatios[],
): FundamentalsAggregate {
  const mean: AggregatedRatios = {
    gross_margin: null,
    ebit_margin: null,
    trailing_pe: null,
  };
  const median: AggregatedRatios = {
    gross_margin: null,
    ebit_margin: null,
    trailing_pe: null,
  };
  for (const col of COLUMNS) {
    const vals = columnValues(rows, col);
    mean[col] = meanOf(vals);
    median[col] = medianOf(vals);
  }
  let used = 0;
  for (const row of rows) {
    if (
      (typeof row.gross_margin === "number" && Number.isFinite(row.gross_margin)) ||
      (typeof row.ebit_margin === "number" && Number.isFinite(row.ebit_margin)) ||
      (typeof row.trailing_pe === "number" && Number.isFinite(row.trailing_pe))
    ) {
      used++;
    }
  }
  return { mean, median, per_ticker_used: used };
}
