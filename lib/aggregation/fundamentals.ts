// The aggregator only cares about the two margin ratios used by the
// scan-runner agent prompt (gross margin / EBIT margin). The data layer's
// TickerRatios is wider — it also carries per-ticker extras (EBITDA,
// currency, quarterly EPS) used by the per-ticker UI table. P/E is no longer
// aggregated because we don't trust Yahoo's trailingPE field; the table
// computes P/E client-side per ticker from quarterly EPS + price history.
export interface AggregatedRatios {
  gross_margin: number | null;
  ebit_margin: number | null;
}

export interface FundamentalsAggregate {
  mean: AggregatedRatios;
  median: AggregatedRatios;
  per_ticker_used: number;
}

const COLUMNS = ["gross_margin", "ebit_margin"] as const;
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
  };
  const median: AggregatedRatios = {
    gross_margin: null,
    ebit_margin: null,
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
      (typeof row.ebit_margin === "number" && Number.isFinite(row.ebit_margin))
    ) {
      used++;
    }
  }
  return { mean, median, per_ticker_used: used };
}
