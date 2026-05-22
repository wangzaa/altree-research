import { describe, it, expect } from "vitest";
import { auditFeed } from "@/scripts/audit-experts";
import type { Expert } from "@/lib/schemas/experts";

const EXPERT: Expert = {
  slug: "sample",
  name: "Sample Pub",
  author: "Sample Author",
  url: "https://example.com",
  feed_url: "https://example.com/feed",
  sectors: ["macro"],
  active: false,
};

const NOW = new Date("2026-05-22T00:00:00Z");
const day = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toUTCString();

describe("auditFeed metrics", () => {
  it("counts total/90d/30d items and computes most_recent", () => {
    const feed = {
      items: [
        {
          guid: "a",
          title: "fresh",
          pubDate: day(5),
          contentEncoded: "<p>hello world</p>".repeat(200),
        },
        {
          guid: "b",
          title: "midage",
          pubDate: day(45),
          contentEncoded: "<p>hello world</p>".repeat(200),
        },
        {
          guid: "c",
          title: "old",
          pubDate: day(120),
          contentEncoded: "<p>hello world</p>".repeat(200),
        },
      ],
    };
    const row = auditFeed(EXPERT, feed, NOW);
    expect(row.total_items).toBe(3);
    expect(row.items_last_90d).toBe(2);
    expect(row.items_last_30d).toBe(1);
    expect(row.most_recent).toBe(new Date(day(5)).toISOString());
    expect(row.fetch_status).toBe("ok");
  });

  it("computes avg_content_chars over htmlToText", () => {
    const feed = {
      items: [
        {
          guid: "x",
          title: "t",
          pubDate: day(1),
          contentEncoded: "<p>" + "a".repeat(1000) + "</p>",
        },
        {
          guid: "y",
          title: "t",
          pubDate: day(2),
          contentEncoded: "<p>" + "b".repeat(3000) + "</p>",
        },
      ],
    };
    const row = auditFeed(EXPERT, feed, NOW);
    expect(row.avg_content_chars).toBe(2000);
  });

  it("computes paywall_hit_rate from detectPaywall", () => {
    const feed = {
      items: [
        {
          guid: "p1",
          title: "t",
          pubDate: day(1),
          contentEncoded: "<p>This post is for paid subscribers.</p>",
        },
        {
          guid: "p2",
          title: "t",
          pubDate: day(2),
          contentEncoded: "<p>Free content here.</p>".repeat(50),
        },
      ],
    };
    const row = auditFeed(EXPERT, feed, NOW);
    expect(row.paywall_hit_rate).toBe(0.5);
  });

  it("returns zero metrics for empty feed", () => {
    const row = auditFeed(EXPERT, { items: [] }, NOW);
    expect(row.total_items).toBe(0);
    expect(row.items_last_90d).toBe(0);
    expect(row.most_recent).toBeNull();
    expect(row.avg_content_chars).toBe(0);
    expect(row.paywall_hit_rate).toBe(0);
  });

  it("flags degraded date_quality when an item has an unparseable pubDate", () => {
    const feed = {
      items: [
        {
          guid: "g",
          title: "t",
          pubDate: "not-a-date",
          contentEncoded: "<p>x</p>",
        },
        {
          guid: "h",
          title: "t",
          pubDate: day(5),
          contentEncoded: "<p>y</p>",
        },
      ],
    };
    const row = auditFeed(EXPERT, feed, NOW);
    expect(row.date_quality).toBe("degraded");
  });
});
