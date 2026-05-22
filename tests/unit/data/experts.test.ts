import { describe, it, expect } from "vitest";
import {
  loadRegistry,
  getActiveExpertsForSectors,
} from "@/lib/data/experts";

describe("expert registry", () => {
  it("validates and loads the bundled JSON without throwing", () => {
    const reg = loadRegistry();
    expect(reg.experts.length).toBeGreaterThanOrEqual(3);
    expect(reg.sectors.semis).toBeDefined();
  });

  it("filters active experts by sector intersection", () => {
    const semis = getActiveExpertsForSectors(["semis"]);
    const slugs = semis.map((e) => e.slug).sort();
    expect(slugs).toEqual([
      "asianometry",
      "fabricated_knowledge",
      "semianalysis",
    ]);
  });

  it("returns empty array for unknown sector", () => {
    expect(getActiveExpertsForSectors(["nonexistent_sector"])).toEqual([]);
  });

  it("excludes inactive experts", () => {
    const semis = getActiveExpertsForSectors(["semis"]);
    expect(semis.every((e) => e.active !== false)).toBe(true);
  });

  it("every expert's sectors[] entry references a declared sector key", () => {
    const reg = loadRegistry();
    const declared = new Set(Object.keys(reg.sectors));
    const offenders: { slug: string; bad: string[] }[] = [];
    for (const e of reg.experts) {
      const bad = e.sectors.filter((s) => !declared.has(s));
      if (bad.length) offenders.push({ slug: e.slug, bad });
    }
    expect(offenders, JSON.stringify(offenders)).toEqual([]);
  });
});
