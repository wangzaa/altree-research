import { describe, it, expect } from "vitest";
import { ingestFeed, hashPostId } from "@/lib/ingest/expert-corpus";

const FAKE_FEED = {
  items: [
    {
      guid: "fk-guid-1",
      title: "TSMC capacity update",
      link: "https://www.fabricatedknowledge.com/p/tsmc-capacity",
      pubDate: "Wed, 12 Jun 2024 10:00:00 GMT",
      content: "<p>TSMC is building more <strong>N3</strong> capacity.</p>",
      contentEncoded:
        "<p>TSMC is building more <strong>N3</strong> capacity.</p>",
    },
    {
      guid: "fk-guid-2",
      title: "Already-seen post",
      link: "https://www.fabricatedknowledge.com/p/seen",
      pubDate: "Tue, 11 Jun 2024 10:00:00 GMT",
      content: "<p>Old content.</p>",
      contentEncoded: "<p>Old content.</p>",
    },
  ],
};

describe("hashPostId", () => {
  it("returns a stable 16-char hex string", () => {
    expect(hashPostId("slug", "guid").length).toBe(16);
    expect(hashPostId("slug", "guid")).toBe(hashPostId("slug", "guid"));
  });

  it("differs across slug/guid combinations", () => {
    expect(hashPostId("slug", "guid")).not.toBe(hashPostId("slug2", "guid"));
    expect(hashPostId("slug", "guid")).not.toBe(hashPostId("slug", "guid2"));
  });
});

describe("ingestFeed", () => {
  it("returns only new posts and extracts expected fields", () => {
    const expert = {
      slug: "fabricated_knowledge",
      name: "Fabricated Knowledge",
      author: "Doug O'Laughlin",
      url: "https://www.fabricatedknowledge.com",
      feed_url: "https://www.fabricatedknowledge.com/feed",
      sectors: ["semis"],
      active: true,
    } as const;
    const existing = new Set([hashPostId("fabricated_knowledge", "fk-guid-2")]);
    const rows = ingestFeed(expert, FAKE_FEED, existing);
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("TSMC capacity update");
    expect(rows[0].tickers).toContain("TSM");
    expect(rows[0].sectors).toEqual(["semis"]);
    expect(rows[0].is_paywalled).toBe(false);
    expect(rows[0].expert_slug).toBe("fabricated_knowledge");
    expect(rows[0].link).toContain("tsmc-capacity");
  });

  it("returns empty when every post is already in existingIds", () => {
    const expert = {
      slug: "fabricated_knowledge",
      name: "Fabricated Knowledge",
      author: "Doug O'Laughlin",
      url: "https://www.fabricatedknowledge.com",
      feed_url: "https://www.fabricatedknowledge.com/feed",
      sectors: ["semis"],
      active: true,
    } as const;
    const existing = new Set([
      hashPostId("fabricated_knowledge", "fk-guid-1"),
      hashPostId("fabricated_knowledge", "fk-guid-2"),
    ]);
    const rows = ingestFeed(expert, FAKE_FEED, existing);
    expect(rows).toEqual([]);
  });
});
