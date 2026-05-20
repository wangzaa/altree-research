import { describe, it, expect } from "vitest";
import {
  applyClientFilters,
  type ExpertPostRow,
} from "@/lib/agents/expert-corpus/retrieve";

const FIXTURE: ExpertPostRow[] = [
  {
    id: "a",
    expert_slug: "x",
    expert_name: "X",
    author: "A",
    title: "Memory cycle",
    link: "https://x/p/1",
    published: "2025-06-01T00:00:00Z",
    content: "Memory pricing is ripping.",
    is_paywalled: false,
    tickers: ["MU", "NVDA"],
    sectors: ["semis"],
  },
  {
    id: "b",
    expert_slug: "x",
    expert_name: "X",
    author: "A",
    title: "EUV monopoly",
    link: "https://x/p/2",
    published: "2024-12-01T00:00:00Z",
    content: "ASML monopoly persists despite High-NA delays.",
    is_paywalled: false,
    tickers: ["ASML"],
    sectors: ["semis"],
  },
  {
    id: "c",
    expert_slug: "y",
    expert_name: "Y",
    author: "B",
    title: "Capex cools",
    link: "https://y/p/3",
    published: "2025-01-15T00:00:00Z",
    content: "Hyperscaler capex commitments are showing strain.",
    is_paywalled: false,
    tickers: ["NVDA"],
    sectors: ["semis"],
  },
];

describe("applyClientFilters", () => {
  it("returns posts sorted published desc and sliced to limit", () => {
    const out = applyClientFilters(FIXTURE, { limit: 2 });
    expect(out.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("filters by keyword substring on title+content", () => {
    const out = applyClientFilters(FIXTURE, { keywords: ["EUV"], limit: 10 });
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });

  it("matches keywords case-insensitively across multiple terms", () => {
    const out = applyClientFilters(FIXTURE, {
      keywords: ["MEMORY", "capex"],
      limit: 10,
    });
    expect(out.map((r) => r.id).sort()).toEqual(["a", "c"]);
  });

  it("returns empty when no keyword matches", () => {
    const out = applyClientFilters(FIXTURE, {
      keywords: ["nonsense"],
      limit: 10,
    });
    expect(out).toEqual([]);
  });

  it("limit=0 returns empty even with matches", () => {
    const out = applyClientFilters(FIXTURE, { limit: 0 });
    expect(out).toEqual([]);
  });
});
