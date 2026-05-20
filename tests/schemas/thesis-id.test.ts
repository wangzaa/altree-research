import { describe, it, expect } from "vitest";
import { generateThesisId } from "@/lib/schemas/thesis-id";

describe("generateThesisId", () => {
  it("returns run 01 with no existing IDs", () => {
    expect(
      generateThesisId({
        slug: "eu_defense_rearmament",
        year: 2026,
        month: 5,
        existingIds: [],
      }),
    ).toBe("eu_defense_rearmament_26_05_01");
  });

  it("increments to 02 when 01 exists", () => {
    expect(
      generateThesisId({
        slug: "eu_defense_rearmament",
        year: 2026,
        month: 5,
        existingIds: ["eu_defense_rearmament_26_05_01"],
      }),
    ).toBe("eu_defense_rearmament_26_05_02");
  });

  it("increments to 03 when 01 and 02 exist", () => {
    expect(
      generateThesisId({
        slug: "eu_defense_rearmament",
        year: 2026,
        month: 5,
        existingIds: [
          "eu_defense_rearmament_26_05_01",
          "eu_defense_rearmament_26_05_02",
        ],
      }),
    ).toBe("eu_defense_rearmament_26_05_03");
  });

  it("does not increment from a different month", () => {
    expect(
      generateThesisId({
        slug: "eu_defense_rearmament",
        year: 2026,
        month: 5,
        existingIds: ["eu_defense_rearmament_26_04_05"],
      }),
    ).toBe("eu_defense_rearmament_26_05_01");
  });

  it("does not increment from a different slug", () => {
    expect(
      generateThesisId({
        slug: "eu_defense_rearmament",
        year: 2026,
        month: 5,
        existingIds: ["other_thesis_26_05_01"],
      }),
    ).toBe("eu_defense_rearmament_26_05_01");
  });

  it("uses max+1, not gap-fill, when runs are non-contiguous", () => {
    expect(
      generateThesisId({
        slug: "eu_defense_rearmament",
        year: 2026,
        month: 5,
        existingIds: [
          "eu_defense_rearmament_26_05_01",
          "eu_defense_rearmament_26_05_03",
        ],
      }),
    ).toBe("eu_defense_rearmament_26_05_04");
  });

  it("throws on invalid slug with uppercase or dashes", () => {
    expect(() =>
      generateThesisId({
        slug: "Bad-Slug",
        year: 2026,
        month: 5,
        existingIds: [],
      }),
    ).toThrow();
  });

  it("throws on year 1999", () => {
    expect(() =>
      generateThesisId({
        slug: "valid_slug",
        year: 1999,
        month: 5,
        existingIds: [],
      }),
    ).toThrow();
  });

  it("throws on month 13", () => {
    expect(() =>
      generateThesisId({
        slug: "valid_slug",
        year: 2026,
        month: 13,
        existingIds: [],
      }),
    ).toThrow();
  });
});
