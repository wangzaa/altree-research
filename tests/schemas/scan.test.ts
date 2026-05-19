import { describe, it, expect } from "vitest";
import { ScanResultsSchema } from "@/lib/schemas/scan";
import { cloneCanonicalScan } from "@/tests/fixtures/scan";

describe("ScanResultsSchema", () => {
  it("round-trips the canonical fixture", () => {
    const parsed = ScanResultsSchema.safeParse(cloneCanonicalScan());
    expect(parsed.success).toBe(true);
  });

  it("rejects history_5y with an empty array", () => {
    const bad = cloneCanonicalScan();
    bad.history_5y = [];
    expect(ScanResultsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a history point with a malformed date", () => {
    const bad = cloneCanonicalScan();
    bad.history_5y[0].points[0] = { date: "2026-5-1", close: 100 };
    const r = ScanResultsSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });

  it("rejects a negative close price", () => {
    const bad = cloneCanonicalScan();
    bad.history_5y[0].points[0] = { date: "2021-05-01", close: -1 };
    expect(ScanResultsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty descriptive_markdown", () => {
    const bad = cloneCanonicalScan();
    bad.descriptive_markdown = "";
    expect(ScanResultsSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts null mean / median values for fundamentals columns", () => {
    const ok = cloneCanonicalScan();
    ok.fundamentals_snapshot.mean.trailing_pe = null;
    ok.fundamentals_snapshot.median.trailing_pe = null;
    expect(ScanResultsSchema.safeParse(ok).success).toBe(true);
  });
});
