import { describe, it, expect } from "vitest";
import {
  GICS_NODES,
  isValidGicsCode,
  gicsLevelFromCode,
  gicsAncestors,
} from "@/lib/data/gics";

describe("GICS_NODES sectors", () => {
  it("contains all 11 sectors with level 'sector' and null parent", () => {
    const sectors = GICS_NODES.filter((n) => n.level === "sector");
    expect(sectors).toHaveLength(11);
    for (const s of sectors) {
      expect(s.parent).toBeNull();
      expect(s.code).toMatch(/^\d{2}$/);
    }
    const codes = sectors.map((s) => s.code).sort();
    expect(codes).toEqual(["10", "15", "20", "25", "30", "35", "40", "45", "50", "55", "60"]);
  });

  it("has at least 30 industries", () => {
    const industries = GICS_NODES.filter((n) => n.level === "industry");
    expect(industries.length).toBeGreaterThanOrEqual(30);
  });

  it("has at least 30 sub-industries", () => {
    const subs = GICS_NODES.filter((n) => n.level === "sub_industry");
    expect(subs.length).toBeGreaterThanOrEqual(30);
  });

  it("includes 201010 (aerospace & defense industry) and 20101010 (sub-industry)", () => {
    expect(GICS_NODES.find((n) => n.code === "201010")).toBeDefined();
    expect(GICS_NODES.find((n) => n.code === "20101010")).toBeDefined();
  });

  it("every non-sector node's parent exists in GICS_NODES", () => {
    const codes = new Set(GICS_NODES.map((n) => n.code));
    for (const node of GICS_NODES) {
      if (node.level === "sector") {
        expect(node.parent).toBeNull();
      } else {
        expect(node.parent).not.toBeNull();
        expect(codes.has(node.parent as string)).toBe(true);
      }
    }
  });
});

describe("isValidGicsCode", () => {
  it("returns true for '20'", () => {
    expect(isValidGicsCode("20")).toBe(true);
  });

  it("returns true for '20101010'", () => {
    expect(isValidGicsCode("20101010")).toBe(true);
  });

  it("returns false for '999999'", () => {
    expect(isValidGicsCode("999999")).toBe(false);
  });

  it("returns false for arbitrary garbage", () => {
    expect(isValidGicsCode("ABC")).toBe(false);
    expect(isValidGicsCode("")).toBe(false);
  });
});

describe("gicsLevelFromCode", () => {
  it("returns 'sector' for 2-digit codes", () => {
    expect(gicsLevelFromCode("20")).toBe("sector");
  });

  it("returns 'industry_group' for 4-digit codes", () => {
    expect(gicsLevelFromCode("2010")).toBe("industry_group");
  });

  it("returns 'industry' for 6-digit codes", () => {
    expect(gicsLevelFromCode("201010")).toBe("industry");
  });

  it("returns 'sub_industry' for 8-digit codes", () => {
    expect(gicsLevelFromCode("20101010")).toBe("sub_industry");
  });

  it("returns null for non-numeric input", () => {
    expect(gicsLevelFromCode("ABC")).toBeNull();
  });

  it("returns null for odd-length numeric codes", () => {
    expect(gicsLevelFromCode("123")).toBeNull();
    expect(gicsLevelFromCode("1234567")).toBeNull();
  });
});

describe("gicsAncestors", () => {
  it("returns the full chain for an 8-digit code", () => {
    expect(gicsAncestors("20101010")).toEqual(["20", "2010", "201010", "20101010"]);
  });

  it("returns just the sector for a 2-digit code", () => {
    expect(gicsAncestors("20")).toEqual(["20"]);
  });

  it("returns sector + industry_group for a 4-digit code", () => {
    expect(gicsAncestors("2010")).toEqual(["20", "2010"]);
  });

  it("returns empty array for an invalid code", () => {
    expect(gicsAncestors("ABC")).toEqual([]);
    expect(gicsAncestors("123")).toEqual([]);
  });
});
