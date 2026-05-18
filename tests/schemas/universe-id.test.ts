import { describe, it, expect } from "vitest";
import { generateUniverseId } from "@/lib/schemas/universe-id";

const THESIS = "eu_defense_rearmament_cycle_26_05_01";

describe("generateUniverseId", () => {
  it("returns _01 when there are no existing ids", () => {
    expect(generateUniverseId({ thesisId: THESIS, existingIds: [] })).toBe(
      `${THESIS}_universe_01`,
    );
  });

  it("returns _02 when _01 exists", () => {
    expect(
      generateUniverseId({
        thesisId: THESIS,
        existingIds: [`${THESIS}_universe_01`],
      }),
    ).toBe(`${THESIS}_universe_02`);
  });

  it("returns _03 when _01 and _02 both exist", () => {
    expect(
      generateUniverseId({
        thesisId: THESIS,
        existingIds: [
          `${THESIS}_universe_01`,
          `${THESIS}_universe_02`,
        ],
      }),
    ).toBe(`${THESIS}_universe_03`);
  });

  it("fills gaps (returns _02 when only _01 and _03 exist)", () => {
    expect(
      generateUniverseId({
        thesisId: THESIS,
        existingIds: [
          `${THESIS}_universe_01`,
          `${THESIS}_universe_03`,
        ],
      }),
    ).toBe(`${THESIS}_universe_02`);
  });

  it("ignores existing ids that don't match the thesis prefix", () => {
    expect(
      generateUniverseId({
        thesisId: THESIS,
        existingIds: ["other_thesis_26_05_01_universe_01"],
      }),
    ).toBe(`${THESIS}_universe_01`);
  });

  it("ignores malformed existing ids (wrong suffix pattern)", () => {
    expect(
      generateUniverseId({
        thesisId: THESIS,
        existingIds: [`${THESIS}_universe_xx`, `${THESIS}_universe_999`],
      }),
    ).toBe(`${THESIS}_universe_01`);
  });

  it("pads to two digits", () => {
    const existing = Array.from(
      { length: 8 },
      (_, i) => `${THESIS}_universe_${String(i + 1).padStart(2, "0")}`,
    );
    expect(generateUniverseId({ thesisId: THESIS, existingIds: existing })).toBe(
      `${THESIS}_universe_09`,
    );
  });
});
