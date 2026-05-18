import { describe, it, expect, beforeEach, vi } from "vitest";

const quoteMock = vi.fn();
const quoteSummaryMock = vi.fn();

// v3 default export is a class; lib/data/yahoo.ts does `new YahooFinance()`,
// so the mock returns a constructor that yields an object with the spied methods.
vi.mock("yahoo-finance2", () => ({
  default: vi.fn().mockImplementation(() => ({
    quote: quoteMock,
    quoteSummary: quoteSummaryMock,
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
