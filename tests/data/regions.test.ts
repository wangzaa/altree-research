import { describe, it, expect } from "vitest";
import { getRegionForTicker, REGION_BY_SUFFIX, REGION_VALUES, type Region } from "@/lib/data/regions";

describe("getRegionForTicker", () => {
  it("maps plain US tickers (no suffix) to US", () => {
    expect(getRegionForTicker("AAPL")).toBe("US");
  });

  it("maps .TO to CANADA", () => {
    expect(getRegionForTicker("RY.TO")).toBe("CANADA");
  });

  it("maps .CN to CANADA (.CN gap fix)", () => {
    expect(getRegionForTicker("WCN.CN")).toBe("CANADA");
  });

  it("maps .SA to LATAM (Brazil)", () => {
    expect(getRegionForTicker("PETR4.SA")).toBe("LATAM");
  });

  it("maps .L to UK", () => {
    expect(getRegionForTicker("BA.L")).toBe("UK");
  });

  it("maps .DE to EUROZONE", () => {
    expect(getRegionForTicker("RHM.DE")).toBe("EUROZONE");
  });

  it("maps .RG to EUROZONE (Latvia, Baltic gap fix)", () => {
    expect(getRegionForTicker("STUB.RG")).toBe("EUROZONE");
  });

  it("maps .TL to EUROZONE (Estonia)", () => {
    expect(getRegionForTicker("STUB.TL")).toBe("EUROZONE");
  });

  it("maps .VS to EUROZONE (Lithuania)", () => {
    expect(getRegionForTicker("STUB.VS")).toBe("EUROZONE");
  });

  it("maps .ST to NORDICS (Sweden)", () => {
    expect(getRegionForTicker("VOLV-B.ST")).toBe("NORDICS");
  });

  it("maps .SW to SWITZERLAND", () => {
    expect(getRegionForTicker("NESN.SW")).toBe("SWITZERLAND");
  });

  it("maps .VX to SWITZERLAND (.VX gap fix)", () => {
    expect(getRegionForTicker("STUB.VX")).toBe("SWITZERLAND");
  });

  it("maps .WA to CEE (Poland)", () => {
    expect(getRegionForTicker("STUB.WA")).toBe("CEE");
  });

  it("maps .TA to MIDDLE_EAST (Israel)", () => {
    expect(getRegionForTicker("STUB.TA")).toBe("MIDDLE_EAST");
  });

  it("maps .JO to AFRICA (South Africa)", () => {
    expect(getRegionForTicker("STUB.JO")).toBe("AFRICA");
  });

  it("maps .T to JAPAN", () => {
    expect(getRegionForTicker("7203.T")).toBe("JAPAN");
  });

  it("maps .KS to KOREA", () => {
    expect(getRegionForTicker("000660.KS")).toBe("KOREA");
  });

  it("maps .TW to GREATER_CHINA (Taiwan)", () => {
    expect(getRegionForTicker("2330.TW")).toBe("GREATER_CHINA");
  });

  it("maps .HK to GREATER_CHINA (Hong Kong)", () => {
    expect(getRegionForTicker("9988.HK")).toBe("GREATER_CHINA");
  });

  it("maps .NS to SOUTH_ASIA (India NSE)", () => {
    expect(getRegionForTicker("TCS.NS")).toBe("SOUTH_ASIA");
  });

  it("maps .SI to SEA (Singapore)", () => {
    expect(getRegionForTicker("DBS.SI")).toBe("SEA");
  });

  it("maps .AX to ANZ (Australia)", () => {
    expect(getRegionForTicker("CBA.AX")).toBe("ANZ");
  });

  it("returns null for unknown suffixes (no catch-all)", () => {
    expect(getRegionForTicker("UNKNOWN.QQ")).toBeNull();
  });

  it("returns null for BRK.B (Yahoo uses BRK-B; .B is not a known suffix)", () => {
    // Yahoo's canonical symbol for Berkshire Hathaway Class B is BRK-B (hyphen).
    // BRK.B is sometimes written elsewhere but it is not a Yahoo suffix, so we
    // treat ".B" as unknown and return null rather than guessing it is US.
    expect(getRegionForTicker("BRK.B")).toBeNull();
  });
});

describe("REGION_BY_SUFFIX", () => {
  it("includes the empty-string key for US default", () => {
    expect(REGION_BY_SUFFIX[""]).toBe("US");
  });

  it("includes ANZ via .AX and .NZ", () => {
    expect(REGION_BY_SUFFIX[".AX"]).toBe("ANZ");
    expect(REGION_BY_SUFFIX[".NZ"]).toBe("ANZ");
  });
});

describe("REGION_VALUES", () => {
  it("has length 16", () => {
    expect(REGION_VALUES.length).toBe(16);
  });

  it("contains GREATER_CHINA (headline new region)", () => {
    expect(REGION_VALUES).toContain("GREATER_CHINA");
  });

  it("does not contain OTHERS (removed)", () => {
    expect(REGION_VALUES).not.toContain("OTHERS");
  });

  it("does not contain SOUTH_KOREA (renamed to KOREA)", () => {
    expect(REGION_VALUES).not.toContain("SOUTH_KOREA");
  });

  it("does not contain TAIWAN (folded into GREATER_CHINA)", () => {
    expect(REGION_VALUES).not.toContain("TAIWAN");
  });

  it("does not contain old 9-bucket taxonomy values", () => {
    expect(REGION_VALUES).not.toContain("NON_EZ_DM_EU");
    expect(REGION_VALUES).not.toContain("ASIA_DM");
    expect(REGION_VALUES).not.toContain("ASIA_EM");
    expect(REGION_VALUES).not.toContain("AMERICAS_NON_US");
    expect(REGION_VALUES).not.toContain("ANZ_DM");
  });
});
