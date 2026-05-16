import { describe, it, expect } from "vitest";
import { sluggifyForThesis } from "@/lib/schemas/slug";

const SLUG_REGEX = /^[a-z][a-z0-9_]*$/;

describe("sluggifyForThesis", () => {
  it("normalizes a typical thesis sentence", () => {
    expect(
      sluggifyForThesis(
        "EU defense rearmament cycle is the multi-year theme",
      ),
    ).toBe("eu_defense_rearmament_cycle_is_the_multi");
  });

  it("prepends t_ when input starts with a digit", () => {
    expect(sluggifyForThesis("7203 Toyota analysis")).toBe(
      "t_7203_toyota_analysis",
    );
  });

  it("returns 'thesis' for empty input", () => {
    expect(sluggifyForThesis("")).toBe("thesis");
  });

  it("returns 'thesis' when input has no alphanumerics", () => {
    expect(sluggifyForThesis("!!@#$%")).toBe("thesis");
  });

  it("strips leading and trailing whitespace and underscores", () => {
    expect(sluggifyForThesis("  leading and trailing  ")).toBe(
      "leading_and_trailing",
    );
  });

  it("truncates results longer than 40 characters", () => {
    const out = sluggifyForThesis(
      "a very long sentence about european defense rearmament and capex cycle visibility",
    );
    expect(out.length).toBeLessThanOrEqual(40);
  });

  it("always matches the strict slug regex for non-empty input", () => {
    const inputs = [
      "EU defense rearmament cycle",
      "7203 Toyota analysis",
      "  leading and trailing  ",
      "Multiple   spaces   collapse",
      "Mixed-case   With.Punctuation!!",
      "12345 starts with digits",
      "a",
    ];
    for (const input of inputs) {
      const out = sluggifyForThesis(input);
      expect(out).toMatch(SLUG_REGEX);
    }
  });

  it("is idempotent under repeated application", () => {
    const inputs = [
      "EU defense rearmament cycle",
      "7203 Toyota analysis",
      "  leading and trailing  ",
      "!!@#$%",
      "",
      "a very long sentence about european defense rearmament and capex cycle visibility",
    ];
    for (const input of inputs) {
      const once = sluggifyForThesis(input);
      const twice = sluggifyForThesis(once);
      expect(twice).toBe(once);
    }
  });
});
