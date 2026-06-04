import { describe, it, expect } from "vitest";
import { ThemeRegistrySchema } from "@/lib/schemas/themes";
import { getThemes, getTheme } from "@/lib/data/themes";

describe("hot topics (themes.json)", () => {
  it("parses against the schema", () => {
    expect(
      ThemeRegistrySchema.safeParse({ themes: getThemes() }).success,
    ).toBe(true);
  });

  it("declares 4–5 topics", () => {
    const n = getThemes().length;
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(5);
  });

  it("gives every topic a wide keyword set (>=6)", () => {
    for (const t of getThemes()) {
      expect(t.keywords.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("has unique topic ids", () => {
    const ids = getThemes().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("looks up a topic by id", () => {
    const first = getThemes()[0];
    expect(getTheme(first.id)?.id).toBe(first.id);
  });
});
