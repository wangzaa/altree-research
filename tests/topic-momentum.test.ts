import { describe, it, expect } from "vitest";
import { buildMomentum } from "@/lib/agents/expert-corpus/topic-momentum";
import type { ExpertPostRow } from "@/lib/agents/expert-corpus/retrieve";

function post(over: Partial<ExpertPostRow>): ExpertPostRow {
  return {
    id: over.id ?? "id",
    expert_slug: over.expert_slug ?? "slug",
    expert_name: over.expert_name ?? "Expert",
    author: over.author ?? "Author",
    title: over.title ?? "",
    link: over.link ?? "https://x/1",
    published: over.published ?? "2026-01-01T00:00:00.000Z",
    content: over.content ?? "",
    is_paywalled: over.is_paywalled ?? false,
    tickers: over.tickers ?? [],
    sectors: over.sectors ?? [],
  };
}

describe("buildMomentum", () => {
  const rows: ExpertPostRow[] = [
    post({ id: "a", link: "https://x/a", title: "DRAM pricing recovers", published: "2026-05-01T00:00:00Z", content: "HBM demand strong" }),
    post({ id: "b", link: "https://x/b", title: "Coffee futures", published: "2026-05-10T00:00:00Z", content: "nothing relevant here" }),
    post({ id: "c", link: "https://x/c", title: "NAND glut ends", published: "2026-04-01T00:00:00Z", content: "memory supply tightens" }),
  ];
  const keywords = ["dram", "nand", "hbm", "memory"];

  it("keeps only keyword-matching posts", () => {
    const out = buildMomentum(rows, keywords);
    expect(out.map((m) => m.title)).toEqual([
      "DRAM pricing recovers",
      "NAND glut ends",
    ]);
  });

  it("orders by published date descending", () => {
    const out = buildMomentum(rows, keywords);
    expect(out[0].published_at >= out[1].published_at).toBe(true);
  });

  it("de-dupes by URL", () => {
    const dup = [...rows, post({ id: "a2", link: "https://x/a", title: "DRAM pricing recovers", content: "HBM" })];
    const out = buildMomentum(dup, keywords);
    expect(out.filter((m) => m.url === "https://x/a")).toHaveLength(1);
  });

  it("respects the limit", () => {
    expect(buildMomentum(rows, keywords, 1)).toHaveLength(1);
  });

  it("truncates long content into an excerpt", () => {
    const long = post({ id: "l", link: "https://x/l", title: "memory", content: "x".repeat(500) });
    const [item] = buildMomentum([long], ["memory"], 1);
    expect(item.excerpt.endsWith("…")).toBe(true);
    expect(item.excerpt.length).toBeLessThan(260);
  });

  it("returns nothing when no keyword matches", () => {
    expect(buildMomentum(rows, ["defense", "naval"])).toHaveLength(0);
  });
});
