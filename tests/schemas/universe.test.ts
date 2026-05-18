import { describe, it, expect } from "vitest";
import { UniverseSchema, ExposureTierSchema } from "@/lib/schemas/universe";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";

describe("UniverseSchema", () => {
  it("round-trips the canonical fixture", () => {
    const u = cloneCanonicalUniverse();
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual(u);
  });

  it("rejects unknown exposure_tier values", () => {
    const u = cloneCanonicalUniverse();
    (u.tickers[0] as { exposure_tier: string }).exposure_tier = "speculative";
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown region values", () => {
    const u = cloneCanonicalUniverse();
    (u.tickers[0] as { region: string }).region = "MARS";
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });

  it("rejects more than 30 tickers", () => {
    const u = cloneCanonicalUniverse();
    const tooMany = Array.from({ length: 31 }, (_, i) => ({
      ...u.tickers[0],
      ticker: `STUB${i}.L`,
    }));
    u.tickers = tooMany;
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });

  it("rejects zero tickers", () => {
    const u = cloneCanonicalUniverse();
    u.tickers = [];
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });

  it("accepts notes defaulting to empty string", () => {
    const u = cloneCanonicalUniverse();
    delete (u.tickers[0] as { notes?: string }).notes;
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.tickers[0].notes).toBe("");
  });

  it("rejects malformed Yahoo ticker", () => {
    const u = cloneCanonicalUniverse();
    u.tickers[0].ticker = "has spaces.L";
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });

  it("rejects negative market_cap_usd_b", () => {
    const u = cloneCanonicalUniverse();
    u.tickers[0].market_cap_usd_b = -1;
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid GICS code", () => {
    const u = cloneCanonicalUniverse();
    u.gics_codes = ["999999"];
    const parsed = UniverseSchema.safeParse(u);
    expect(parsed.success).toBe(false);
  });
});

describe("ExposureTierSchema", () => {
  it("accepts the three canonical tiers", () => {
    expect(ExposureTierSchema.safeParse("pure_play").success).toBe(true);
    expect(ExposureTierSchema.safeParse("diversified").success).toBe(true);
    expect(ExposureTierSchema.safeParse("etf_proxy").success).toBe(true);
  });

  it("rejects unknown tiers", () => {
    expect(ExposureTierSchema.safeParse("watchlist").success).toBe(false);
  });
});
