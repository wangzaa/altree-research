import { describe, it, expect } from "vitest";
import { aggregateFundamentals } from "@/lib/aggregation/fundamentals";

describe("aggregateFundamentals", () => {
  it("computes mean + median per column on a complete 5-row input", () => {
    const result = aggregateFundamentals([
      { gross_margin: 0.30, ebit_margin: 0.10 },
      { gross_margin: 0.40, ebit_margin: 0.20 },
      { gross_margin: 0.50, ebit_margin: 0.15 },
      { gross_margin: 0.20, ebit_margin: 0.05 },
      { gross_margin: 0.60, ebit_margin: 0.25 },
    ]);
    expect(result.per_ticker_used).toBe(5);
    expect(result.mean.gross_margin).toBeCloseTo(0.40, 5);
    expect(result.median.gross_margin).toBeCloseTo(0.40, 5);
    expect(result.mean.ebit_margin).toBeCloseTo(0.15, 5);
    expect(result.median.ebit_margin).toBeCloseTo(0.15, 5);
  });

  it("averages the two middle elements for even-length inputs", () => {
    const result = aggregateFundamentals([
      { gross_margin: 0.10, ebit_margin: null },
      { gross_margin: 0.30, ebit_margin: null },
      { gross_margin: 0.20, ebit_margin: null },
      { gross_margin: 0.40, ebit_margin: null },
    ]);
    expect(result.median.gross_margin).toBeCloseTo(0.25, 5);
  });

  it("ignores null values within each column independently", () => {
    const result = aggregateFundamentals([
      { gross_margin: 0.20, ebit_margin: null },
      { gross_margin: null, ebit_margin: 0.10 },
      { gross_margin: 0.40, ebit_margin: 0.20 },
    ]);
    expect(result.per_ticker_used).toBe(3);
    expect(result.mean.gross_margin).toBeCloseTo(0.30, 5);
    expect(result.mean.ebit_margin).toBeCloseTo(0.15, 5);
  });

  it("returns null mean + median for an all-null column", () => {
    const result = aggregateFundamentals([
      { gross_margin: 0.30, ebit_margin: null },
      { gross_margin: 0.40, ebit_margin: null },
    ]);
    expect(result.mean.ebit_margin).toBeNull();
    expect(result.median.ebit_margin).toBeNull();
  });

  it("returns all-null aggregate + per_ticker_used 0 for an empty input", () => {
    const result = aggregateFundamentals([]);
    expect(result.per_ticker_used).toBe(0);
    expect(result.mean).toEqual({ gross_margin: null, ebit_margin: null });
    expect(result.median).toEqual({ gross_margin: null, ebit_margin: null });
  });

  it("filters non-finite values (NaN, Infinity) out of the aggregate", () => {
    const result = aggregateFundamentals([
      { gross_margin: 0.30, ebit_margin: NaN },
      { gross_margin: 0.40, ebit_margin: 0.20 },
    ]);
    expect(result.mean.ebit_margin).toBeCloseTo(0.20, 5);
  });
});
