import { describe, it, expect } from "vitest";
import { IndustryDriverSchema } from "@/lib/schemas/thesis";

describe("IndustryDriverSchema tickers field", () => {
  const base = {
    id: "M1",
    claim: "Backlog converts to revenue within 3 years",
    central_estimate: { value: 3, unit: "years" },
    thesis_breaks_below: 2,
    classification: "industry" as const,
  };

  it("accepts a driver with no tickers field (back-compat)", () => {
    const parsed = IndustryDriverSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("accepts a driver with tickers populated", () => {
    const parsed = IndustryDriverSchema.safeParse({
      ...base,
      tickers: ["TSM", "ASML"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.tickers).toEqual(["TSM", "ASML"]);
  });

  it("rejects non-string tickers entries", () => {
    const parsed = IndustryDriverSchema.safeParse({
      ...base,
      tickers: ["TSM", 123],
    });
    expect(parsed.success).toBe(false);
  });
});
