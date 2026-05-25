import { describe, it, expect, beforeEach, vi } from "vitest";

const quoteMock = vi.fn();

vi.mock("yahoo-finance2", () => {
  return {
    default: class FakeYahooFinance {
      quote = quoteMock;
    },
  };
});

beforeEach(() => {
  quoteMock.mockReset();
});

describe("getRatesUsd", () => {
  it("returns 1 for USD without hitting Yahoo, and null as_of_ms", async () => {
    const { getRatesUsd, _resetFxCacheForTests } = await import(
      "@/lib/data/fx-live"
    );
    _resetFxCacheForTests();

    const { rates, as_of_ms } = await getRatesUsd(["USD"]);
    expect(rates.USD).toBe(1);
    expect(as_of_ms).toBeNull();
    expect(quoteMock).not.toHaveBeenCalled();
  });

  it("normalises currency codes to uppercase and dedupes", async () => {
    quoteMock.mockResolvedValue({
      regularMarketPrice: 0.0067,
      regularMarketTime: 1716000000,
    });
    const { getRatesUsd, _resetFxCacheForTests } = await import(
      "@/lib/data/fx-live"
    );
    _resetFxCacheForTests();

    const { rates } = await getRatesUsd(["jpy", "JPY", "Jpy"]);
    expect(rates.JPY).toBe(0.0067);
    expect(quoteMock).toHaveBeenCalledTimes(1);
    expect(quoteMock).toHaveBeenCalledWith("JPYUSD=X");
  });

  it("returns Yahoo's regularMarketPrice as the USD-per-CCY rate", async () => {
    quoteMock.mockImplementation(async (pair: string) => {
      if (pair === "JPYUSD=X") return { regularMarketPrice: 0.0066 };
      if (pair === "KRWUSD=X") return { regularMarketPrice: 0.00073 };
      return null;
    });
    const { getRatesUsd, _resetFxCacheForTests } = await import(
      "@/lib/data/fx-live"
    );
    _resetFxCacheForTests();

    const { rates } = await getRatesUsd(["JPY", "KRW"]);
    expect(rates).toEqual({ JPY: 0.0066, KRW: 0.00073 });
  });

  it("exposes the latest market timestamp across the fetched currencies", async () => {
    quoteMock.mockImplementation(async (pair: string) => {
      if (pair === "JPYUSD=X")
        return { regularMarketPrice: 0.0066, regularMarketTime: 1716000000 };
      if (pair === "KRWUSD=X")
        return { regularMarketPrice: 0.00073, regularMarketTime: 1716000500 };
      return null;
    });
    const { getRatesUsd, _resetFxCacheForTests } = await import(
      "@/lib/data/fx-live"
    );
    _resetFxCacheForTests();

    const { as_of_ms } = await getRatesUsd(["JPY", "KRW"]);
    // Yahoo returns seconds; the module converts to ms epoch.
    expect(as_of_ms).toBe(1716000500 * 1000);
  });

  it("caches fetched rates for subsequent calls in the same TTL window", async () => {
    quoteMock.mockResolvedValue({ regularMarketPrice: 0.0066 });
    const { getRatesUsd, _resetFxCacheForTests } = await import(
      "@/lib/data/fx-live"
    );
    _resetFxCacheForTests();

    const first = await getRatesUsd(["JPY"]);
    const second = await getRatesUsd(["JPY"]);
    expect(first.rates.JPY).toBe(0.0066);
    expect(second.rates.JPY).toBe(0.0066);
    expect(quoteMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the static table when Yahoo returns no price", async () => {
    quoteMock.mockResolvedValue({ regularMarketPrice: null });
    const { getRatesUsd, _resetFxCacheForTests } = await import(
      "@/lib/data/fx-live"
    );
    _resetFxCacheForTests();

    const { rates } = await getRatesUsd(["JPY"]);
    // Static rate for JPY in lib/data/fx.ts is 0.0066.
    expect(rates.JPY).toBeCloseTo(0.0066, 4);
  });

  it("falls back to the static table when Yahoo throws", async () => {
    quoteMock.mockRejectedValue(new Error("Yahoo down"));
    const { getRatesUsd, _resetFxCacheForTests } = await import(
      "@/lib/data/fx-live"
    );
    _resetFxCacheForTests();

    const { rates } = await getRatesUsd(["JPY"]);
    expect(typeof rates.JPY).toBe("number");
  });

  it("omits unknown currencies from the returned map", async () => {
    quoteMock.mockResolvedValue({ regularMarketPrice: null });
    const { getRatesUsd, _resetFxCacheForTests } = await import(
      "@/lib/data/fx-live"
    );
    _resetFxCacheForTests();

    const { rates } = await getRatesUsd(["XYZ"]);
    expect(rates.XYZ).toBeUndefined();
  });
});

describe("formatFxAsOf", () => {
  it("formats a ms epoch as 'DD Mon, HH:mm UTC' (locale-stable)", async () => {
    const { formatFxAsOf } = await import("@/lib/data/fx-live");
    // 2026-05-23 21:47:00 UTC
    const ms = Date.UTC(2026, 4, 23, 21, 47, 0);
    expect(formatFxAsOf(ms)).toBe("23 May, 21:47 UTC");
  });

  it("returns null when given null", async () => {
    const { formatFxAsOf } = await import("@/lib/data/fx-live");
    expect(formatFxAsOf(null)).toBeNull();
  });
});

describe("toUsdLive", () => {
  it("multiplies the local amount by the supplied rate", async () => {
    const { toUsdLive } = await import("@/lib/data/fx");
    const usd = toUsdLive(100_000_000, "JPY", { JPY: 0.0066 });
    expect(usd).toBeCloseTo(660_000, 0);
  });

  it("falls back to the static table when the rates map omits the currency", async () => {
    const { toUsdLive } = await import("@/lib/data/fx");
    const usd = toUsdLive(100, "EUR", {});
    // Static EUR rate is 1.08.
    expect(usd).toBeCloseTo(108, 2);
  });

  it("returns null for null amount or null currency", async () => {
    const { toUsdLive } = await import("@/lib/data/fx");
    expect(toUsdLive(null, "JPY", { JPY: 0.0066 })).toBeNull();
    expect(toUsdLive(100, null, { JPY: 0.0066 })).toBeNull();
  });
});
