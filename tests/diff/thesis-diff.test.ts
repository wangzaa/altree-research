import { describe, it, expect } from "vitest";
import { diffThesis } from "@/lib/diff/thesis-diff";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

describe("diffThesis", () => {
  it("returns an empty diff for identical inputs", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("ignores envelope fields (id, version, createdAt, createdBy, source_snippet)", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.id = "different_id_26_05_99";
    b.version = 42;
    b.createdAt = "2099-12-31T00:00:00.000Z";
    b.createdBy = "someone_else";
    b.source_snippet = "totally different prose";
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("emits a single 'changed' entry for a scalar field change", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.drivers.industry[0].thesis_breaks_below = 1.5;
    a.drivers.industry[0].thesis_breaks_below = 2.5;
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([
      {
        path: "drivers.industry[id=backlog_to_revenue].thesis_breaks_below",
        before: 2.5,
        after: 1.5,
      },
    ]);
  });

  it("treats scope.regions as a set: pushed element shows up as 'added'", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.scope.regions = [...a.scope.regions, "JAPAN"];
    const diff = diffThesis(a, b);
    expect(diff.changed).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual([{ path: "scope.regions", after: "JAPAN" }]);
  });

  it("treats scope.regions as a set: removed element shows up as 'removed'", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.scope.regions = a.scope.regions.filter((r) => r !== "UK");
    const diff = diffThesis(a, b);
    expect(diff.changed).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([{ path: "scope.regions", before: "UK" }]);
  });

  it("treats scope.regions as a set: reorder alone is not a change", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.scope.regions = [...a.scope.regions].reverse();
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("treats drivers.industry as keyed-by-id: new id shows up as 'added'", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    const newDriver = {
      id: "operating_margin",
      claim: "Sector operating margin expands to >12% by 2028",
      central_estimate: { value: 12, unit: "pct" },
      thesis_breaks_below: 8,
      evidence: [],
      verdict: null,
      classification: "industry" as const,
    };
    b.drivers.industry.push(newDriver);
    const diff = diffThesis(a, b);
    expect(diff.changed).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual([
      { path: "drivers.industry[id=operating_margin]", after: newDriver },
    ]);
  });

  it("treats drivers.industry as keyed-by-id: changed scalar field nests under id", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.drivers.industry[0].claim = "Sector backlog/revenue >= 2.5y sustained";
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([
      {
        path: "drivers.industry[id=backlog_to_revenue].claim",
        before: "Sector backlog/revenue >= 2y sustained",
        after: "Sector backlog/revenue >= 2.5y sustained",
      },
    ]);
  });

  it("emits added/removed for nested optional fields appearing or disappearing", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    delete (b.falsification as { secondary?: string }).secondary;
    const diff = diffThesis(a, b);
    expect(diff.changed).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([
      { path: "falsification.secondary", before: a.falsification.secondary },
    ]);
  });

  it("emits a 'changed' entry per leaf for nested object replacement", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.falsification = {
      primary: "Different primary falsifier",
      secondary: "Different secondary falsifier",
    };
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toHaveLength(2);
    expect(diff.changed).toContainEqual({
      path: "falsification.primary",
      before: a.falsification.primary,
      after: "Different primary falsifier",
    });
    expect(diff.changed).toContainEqual({
      path: "falsification.secondary",
      before: a.falsification.secondary,
      after: "Different secondary falsifier",
    });
  });

  it("collects multiple unrelated changes in one diff", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.scope.regions = [...a.scope.regions, "JAPAN"];
    b.drivers.industry[0].thesis_breaks_below = 1.0;
    a.drivers.industry[0].thesis_breaks_below = 1.5;
    b.claim = "Refined claim text";
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([{ path: "scope.regions", after: "JAPAN" }]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toHaveLength(2);
    expect(diff.changed).toContainEqual({
      path: "drivers.industry[id=backlog_to_revenue].thesis_breaks_below",
      before: 1.5,
      after: 1.0,
    });
    expect(diff.changed).toContainEqual({
      path: "claim",
      before: a.claim,
      after: "Refined claim text",
    });
  });

  it("returns a result whose arrays are all defined even when empty", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    const diff = diffThesis(a, b);
    expect(Array.isArray(diff.added)).toBe(true);
    expect(Array.isArray(diff.removed)).toBe(true);
    expect(Array.isArray(diff.changed)).toBe(true);
  });
});
