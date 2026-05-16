import { describe, it, expect } from "vitest";
import { getRegionForTicker, REGION_BY_SUFFIX, type Region } from "@/lib/data/regions";

describe("getRegionForTicker", () => {
  it("maps plain US tickers (no suffix) to US", () => {
    expect(getRegionForTicker("AAPL")).toBe("US");
  });

  it("maps .DE to EUROZONE", () => {
    expect(getRegionForTicker("RHM.DE")).toBe("EUROZONE");
  });

  it("maps .L to UK", () => {
    expect(getRegionForTicker("BA.L")).toBe("UK");
  });

  it("maps .T to JAPAN", () => {
    expect(getRegionForTicker("7203.T")).toBe("JAPAN");
  });

  it("maps .AX to ANZ_DM", () => {
    expect(getRegionForTicker("BHP.AX")).toBe("ANZ_DM");
  });

  it("maps .NZ to ANZ_DM", () => {
    expect(getRegionForTicker("FPH.NZ")).toBe("ANZ_DM");
  });

  it("returns null for unknown suffixes", () => {
    expect(getRegionForTicker("RANDOM.ZZ")).toBeNull();
  });

  it("returns null for BRK.B (Yahoo uses BRK-B; .B is not a known suffix)", () => {
    // Yahoo's canonical symbol for Berkshire Hathaway Class B is BRK-B (hyphen).
    // BRK.B is sometimes written elsewhere but it is not a Yahoo suffix, so we
    // treat ".B" as unknown and return null rather than guessing it is US.
    expect(getRegionForTicker("BRK.B")).toBeNull();
  });

  it("maps .HK to ASIA_DM", () => {
    expect(getRegionForTicker("0700.HK")).toBe("ASIA_DM");
  });

  it("maps .SS to ASIA_EM", () => {
    expect(getRegionForTicker("600519.SS")).toBe("ASIA_EM");
  });

  it("maps .TO to AMERICAS_NON_US", () => {
    expect(getRegionForTicker("SHOP.TO")).toBe("AMERICAS_NON_US");
  });

  it("maps .OL to NON_EZ_DM_EU", () => {
    expect(getRegionForTicker("EQNR.OL")).toBe("NON_EZ_DM_EU");
  });
});

describe("REGION_BY_SUFFIX", () => {
  it("covers exactly 9 distinct regions", () => {
    const regions = new Set<Region>(Object.values(REGION_BY_SUFFIX));
    expect(regions.size).toBe(9);
  });

  it("includes the empty-string key for US default", () => {
    expect(REGION_BY_SUFFIX[""]).toBe("US");
  });

  it("includes ANZ_DM via .AX and .NZ", () => {
    expect(REGION_BY_SUFFIX[".AX"]).toBe("ANZ_DM");
    expect(REGION_BY_SUFFIX[".NZ"]).toBe("ANZ_DM");
  });
});
