import { describe, it, expect, beforeEach, vi } from "vitest";

const quoteMock = vi.fn();
const quoteSummaryMock = vi.fn();
const historicalMock = vi.fn();

// v3 default export is a class; lib/data/yahoo.ts does `new YahooFinance()`,
// so the mock returns a constructor that yields an object with the spied methods.
vi.mock("yahoo-finance2", () => ({
  default: vi.fn().mockImplementation(() => ({
    quote: quoteMock,
    quoteSummary: quoteSummaryMock,
    historical: historicalMock,
  })),
}));

describe("getQuote", () => {
  beforeEach(() => {
    quoteMock.mockReset();
  });

  it("returns { name, market_cap_usd } on success", async () => {
    quoteMock.mockResolvedValueOnce({
      longName: "Rheinmetall AG",
      shortName: "Rheinmetall",
      marketCap: 38_000_000_000,
    });
    const { getQuote } = await import("@/lib/data/yahoo");
    const result = await getQuote("RHM.DE");
    expect(result).toEqual({ name: "Rheinmetall AG", market_cap_usd: 38_000_000_000 });
    expect(quoteMock).toHaveBeenCalledWith("RHM.DE");
  });

  it("falls back to shortName when longName missing", async () => {
    quoteMock.mockResolvedValueOnce({
      shortName: "Rheinmetall",
      marketCap: 1_000_000_000,
    });
    const { getQuote } = await import("@/lib/data/yahoo");
    const result = await getQuote("RHM.DE");
    expect(result?.name).toBe("Rheinmetall");
  });

  it("returns { name, market_cap_usd: null } when marketCap missing", async () => {
    quoteMock.mockResolvedValueOnce({
      longName: "Some Name",
    });
    const { getQuote } = await import("@/lib/data/yahoo");
    const result = await getQuote("XYZ");
    expect(result).toEqual({ name: "Some Name", market_cap_usd: null });
  });

  it("returns null when the quote throws", async () => {
    quoteMock.mockRejectedValueOnce(new Error("not found"));
    const { getQuote } = await import("@/lib/data/yahoo");
    const result = await getQuote("NONEXISTENT");
    expect(result).toBeNull();
  });

  it("returns null when the quote returns null or missing fields", async () => {
    quoteMock.mockResolvedValueOnce(null);
    const { getQuote } = await import("@/lib/data/yahoo");
    expect(await getQuote("X")).toBeNull();

    quoteMock.mockResolvedValueOnce({});
    expect(await getQuote("Y")).toBeNull();
  });
});

describe("getFundamentals", () => {
  beforeEach(() => {
    quoteSummaryMock.mockReset();
  });

  it("returns { sector, industry } on success", async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      assetProfile: { sector: "Industrials", industry: "Aerospace & Defense" },
    });
    const { getFundamentals } = await import("@/lib/data/yahoo");
    const result = await getFundamentals("RHM.DE");
    expect(result).toEqual({ sector: "Industrials", industry: "Aerospace & Defense" });
    expect(quoteSummaryMock).toHaveBeenCalledWith("RHM.DE", {
      modules: ["assetProfile"],
    });
  });

  it("returns partial fields when only sector or industry is present", async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      assetProfile: { sector: "Tech" },
    });
    const { getFundamentals } = await import("@/lib/data/yahoo");
    const result = await getFundamentals("AAPL");
    expect(result).toEqual({ sector: "Tech" });
  });

  it("returns null on error", async () => {
    quoteSummaryMock.mockRejectedValueOnce(new Error("rate limit"));
    const { getFundamentals } = await import("@/lib/data/yahoo");
    const result = await getFundamentals("RHM.DE");
    expect(result).toBeNull();
  });

  it("returns null when assetProfile missing", async () => {
    quoteSummaryMock.mockResolvedValueOnce({});
    const { getFundamentals } = await import("@/lib/data/yahoo");
    const result = await getFundamentals("X");
    expect(result).toBeNull();
  });
});

describe("getHistory", () => {
  beforeEach(() => {
    historicalMock.mockReset();
  });

  it("returns ISO-date + close pairs preferring adjClose", async () => {
    historicalMock.mockResolvedValueOnce([
      { date: new Date("2021-05-01"), open: 100, high: 110, low: 95, close: 105, adjClose: 102, volume: 1000 },
      { date: new Date("2021-06-01"), open: 105, high: 115, low: 100, close: 110, adjClose: 108, volume: 1100 },
    ]);
    const { getHistory } = await import("@/lib/data/yahoo");
    const result = await getHistory("RHM.DE");
    expect(result).toEqual([
      { date: "2021-05-01", close: 102 },
      { date: "2021-06-01", close: 108 },
    ]);
    expect(historicalMock).toHaveBeenCalledTimes(1);
    const args = historicalMock.mock.calls[0];
    expect(args[0]).toBe("RHM.DE");
    expect(args[1]).toEqual(
      expect.objectContaining({ interval: "1mo" }),
    );
  });

  it("falls back to raw close when adjClose is missing", async () => {
    historicalMock.mockResolvedValueOnce([
      { date: new Date("2024-12-01"), open: 200, high: 210, low: 195, close: 208, volume: 5000 },
    ]);
    const { getHistory } = await import("@/lib/data/yahoo");
    const result = await getHistory("FOO.BAR");
    expect(result).toEqual([{ date: "2024-12-01", close: 208 }]);
  });

  it("returns null on yahoo error", async () => {
    historicalMock.mockRejectedValueOnce(new Error("rate limited"));
    const { getHistory } = await import("@/lib/data/yahoo");
    const result = await getHistory("RHM.DE");
    expect(result).toBeNull();
  });

  it("requests period1 ~5 years back when period defaults to '5y'", async () => {
    historicalMock.mockResolvedValueOnce([]);
    const { getHistory } = await import("@/lib/data/yahoo");
    await getHistory("RHM.DE");
    const opts = historicalMock.mock.calls[0][1] as { period1: Date };
    const period1 = new Date(opts.period1);
    const yearsAgo = (Date.now() - period1.getTime()) / (1000 * 60 * 60 * 24 * 365);
    expect(yearsAgo).toBeGreaterThan(4.9);
    expect(yearsAgo).toBeLessThan(5.1);
  });
});

describe("getRatios", () => {
  beforeEach(() => {
    quoteSummaryMock.mockReset();
  });

  it("joins financialData + defaultKeyStatistics into a flat row", async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      financialData: {
        grossMargins: 0.34,
        operatingMargins: 0.18,
        freeCashflow: 1_500_000_000,
      },
      defaultKeyStatistics: {
        marketCap: 60_000_000_000,
      },
    });
    const { getRatios } = await import("@/lib/data/yahoo");
    const result = await getRatios("RHM.DE");
    expect(result).toEqual({
      gross_margin: 0.34,
      ebit_margin: 0.18,
      fcf_yield: 1_500_000_000 / 60_000_000_000,
    });
    expect(quoteSummaryMock).toHaveBeenCalledWith("RHM.DE", {
      modules: ["financialData", "defaultKeyStatistics"],
    });
  });

  it("returns nulls for missing fields without erroring", async () => {
    quoteSummaryMock.mockResolvedValueOnce({
      financialData: { grossMargins: 0.20 },
      defaultKeyStatistics: {},
    });
    const { getRatios } = await import("@/lib/data/yahoo");
    const result = await getRatios("FOO.BAR");
    expect(result).toEqual({
      gross_margin: 0.20,
      ebit_margin: null,
      fcf_yield: null,
    });
  });

  it("returns null on yahoo error", async () => {
    quoteSummaryMock.mockRejectedValueOnce(new Error("not found"));
    const { getRatios } = await import("@/lib/data/yahoo");
    const result = await getRatios("UNKNOWN");
    expect(result).toBeNull();
  });
});
