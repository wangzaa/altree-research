import { describe, it, expect } from "vitest";
import { IntroRequestBodySchema } from "@/lib/schemas/intro-request";

describe("IntroRequestBodySchema", () => {
  const valid = {
    thesis_id: "memory_26_06_01",
    ticker: "2802.T",
    memo_id: "11111111-1111-4111-8111-111111111111",
    note: "Interested post-earnings.",
  };

  it("accepts a full valid payload", () => {
    expect(IntroRequestBodySchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a minimal payload (thesis_id + ticker only)", () => {
    expect(
      IntroRequestBodySchema.safeParse({
        thesis_id: "memory_26_06_01",
        ticker: "7203.T",
      }).success,
    ).toBe(true);
  });

  it("rejects a missing ticker", () => {
    const { ticker, ...rest } = valid;
    void ticker;
    expect(IntroRequestBodySchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an empty ticker", () => {
    expect(
      IntroRequestBodySchema.safeParse({ ...valid, ticker: "" }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid memo_id", () => {
    expect(
      IntroRequestBodySchema.safeParse({ ...valid, memo_id: "not-a-uuid" })
        .success,
    ).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      IntroRequestBodySchema.safeParse({ ...valid, partner: "X" }).success,
    ).toBe(false);
  });
});
