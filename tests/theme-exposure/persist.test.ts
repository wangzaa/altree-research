import { describe, it, expect } from "vitest";
import {
  toExposureRows,
  fromExposureRows,
} from "@/lib/agents/theme-exposure/persist";
import type { OpportunitySet } from "@/lib/schemas/theme-exposure";

const set: OpportunitySet = {
  theme_id: "memory_cycle",
  derived_at: "2026-06-04T00:00:00Z",
  companies: [
    {
      ticker: "6146",
      yahoo_ticker: "6146.T",
      name_en: "Disco",
      rationale: "Expanded HBM dicing capacity (Apr 2026).",
      as_of: "2026-04-12",
    },
  ],
};

describe("exposure row mapping", () => {
  it("maps an opportunity set to flat per-company DB rows stamped with theme + derived_at", () => {
    const rows = toExposureRows(set);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      theme_id: "memory_cycle",
      ticker: "6146",
      yahoo_ticker: "6146.T",
      name_en: "Disco",
      rationale: "Expanded HBM dicing capacity (Apr 2026).",
      as_of: "2026-04-12",
      derived_at: "2026-06-04T00:00:00Z",
    });
  });

  it("round-trips rows back into an opportunity set for a theme", () => {
    const rows = toExposureRows(set);
    const back = fromExposureRows("memory_cycle", rows);
    expect(back.theme_id).toBe("memory_cycle");
    expect(back.derived_at).toBe("2026-06-04T00:00:00Z");
    expect(back.companies).toEqual(set.companies);
  });

  it("returns an empty set (no derived_at from rows) when a theme has no exposure", () => {
    const back = fromExposureRows("memory_cycle", []);
    expect(back.companies).toEqual([]);
    expect(back.theme_id).toBe("memory_cycle");
  });
});
