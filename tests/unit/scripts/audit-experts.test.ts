import { describe, it, expect } from "vitest";
import {
  auditFeed,
  deriveFlags,
  deriveVerdict,
  formatAuditTable,
} from "@/scripts/audit-experts";
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

describe("deriveFlags boundary behavior", () => {
  const ago = (days: number) =>
    new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

  it("ALIVE fires at exactly 3 items in last 90d, not 2", () => {
    expect(
      deriveFlags(
        {
          items_last_90d: 3,
          most_recent: ago(1),
          avg_content_chars: 9999,
          paywall_hit_rate: 0,
        },
        NOW,
      ).ALIVE,
    ).toBe(true);
    expect(
      deriveFlags(
        {
          items_last_90d: 2,
          most_recent: ago(1),
          avg_content_chars: 9999,
          paywall_hit_rate: 0,
        },
        NOW,
      ).ALIVE,
    ).toBe(false);
  });

  it("RECENT fires at exactly 30 days, not 31", () => {
    expect(
      deriveFlags(
        {
          items_last_90d: 5,
          most_recent: ago(30),
          avg_content_chars: 9999,
          paywall_hit_rate: 0,
        },
        NOW,
      ).RECENT,
    ).toBe(true);
    expect(
      deriveFlags(
        {
          items_last_90d: 5,
          most_recent: ago(31),
          avg_content_chars: 9999,
          paywall_hit_rate: 0,
        },
        NOW,
      ).RECENT,
    ).toBe(false);
  });

  it("SUBSTANTIVE fires at exactly 2000 avg chars, not 1999", () => {
    expect(
      deriveFlags(
        {
          items_last_90d: 5,
          most_recent: ago(1),
          avg_content_chars: 2000,
          paywall_hit_rate: 0,
        },
        NOW,
      ).SUBSTANTIVE,
    ).toBe(true);
    expect(
      deriveFlags(
        {
          items_last_90d: 5,
          most_recent: ago(1),
          avg_content_chars: 1999,
          paywall_hit_rate: 0,
        },
        NOW,
      ).SUBSTANTIVE,
    ).toBe(false);
  });

  it("LOW_PAYWALL fires when rate is strictly less than 0.5", () => {
    expect(
      deriveFlags(
        {
          items_last_90d: 5,
          most_recent: ago(1),
          avg_content_chars: 9999,
          paywall_hit_rate: 0.49,
        },
        NOW,
      ).LOW_PAYWALL,
    ).toBe(true);
    expect(
      deriveFlags(
        {
          items_last_90d: 5,
          most_recent: ago(1),
          avg_content_chars: 9999,
          paywall_hit_rate: 0.5,
        },
        NOW,
      ).LOW_PAYWALL,
    ).toBe(false);
  });

  it("RECENT is false when most_recent is null", () => {
    expect(
      deriveFlags(
        {
          items_last_90d: 0,
          most_recent: null,
          avg_content_chars: 0,
          paywall_hit_rate: 0,
        },
        NOW,
      ).RECENT,
    ).toBe(false);
  });
});

describe("deriveVerdict", () => {
  const allTrue: import("@/scripts/audit-experts").Flags = {
    ALIVE: true,
    RECENT: true,
    SUBSTANTIVE: true,
    LOW_PAYWALL: true,
  };
  const allFalse: import("@/scripts/audit-experts").Flags = {
    ALIVE: false,
    RECENT: false,
    SUBSTANTIVE: false,
    LOW_PAYWALL: false,
  };

  it("returns reject on fetch failure regardless of metrics", () => {
    expect(deriveVerdict("error:timeout", 0, allFalse)).toBe("reject");
    expect(deriveVerdict("error:dns", 10, allTrue)).toBe("reject");
  });

  it("returns defer when total_items is 0 or ALIVE is false", () => {
    expect(deriveVerdict("ok", 0, allTrue)).toBe("defer");
    expect(deriveVerdict("ok", 10, { ...allTrue, ALIVE: false })).toBe(
      "defer",
    );
  });

  it("returns promote_candidate only when all four flags pass", () => {
    expect(deriveVerdict("ok", 10, allTrue)).toBe("promote_candidate");
  });

  it("returns review when ALIVE but some other flag fails", () => {
    expect(deriveVerdict("ok", 10, { ...allTrue, RECENT: false })).toBe(
      "review",
    );
    expect(deriveVerdict("ok", 10, { ...allTrue, SUBSTANTIVE: false })).toBe(
      "review",
    );
    expect(deriveVerdict("ok", 10, { ...allTrue, LOW_PAYWALL: false })).toBe(
      "review",
    );
  });
});

describe("formatAuditTable", () => {
  const baseRow = {
    slug: "test_pub",
    name: "Test Pub",
    feed_url: "https://example.com/feed",
    fetch_status: "ok",
    total_items: 20,
    items_last_90d: 12,
    items_last_30d: 4,
    most_recent: "2026-05-20T10:00:00.000Z",
    avg_content_chars: 8500,
    paywall_hit_rate: 0.1,
    ticker_yield: 0.6,
    date_quality: "ok" as const,
    flags: { ALIVE: true, RECENT: true, SUBSTANTIVE: true, LOW_PAYWALL: true },
    verdict: "promote_candidate" as const,
  };

  it("renders a markdown table with one row per audit row", () => {
    const md = formatAuditTable([baseRow], new Date("2026-05-22T00:00:00Z"));
    expect(md).toContain("# Substack roster audit — 2026-05-22");
    expect(md).toContain(
      "| slug | name | items_90d | items_30d | most_recent | avg_chars | paywall % | ticker % | flags | verdict_auto | verdict_final | notes |",
    );
    expect(md).toContain("test_pub");
    expect(md).toContain("promote_candidate");
    expect(md).toContain("ALIVE,RECENT,SUBSTANTIVE,LOW_PAYWALL");
  });

  it("renders an empty-section message when no rows", () => {
    const md = formatAuditTable([], new Date("2026-05-22T00:00:00Z"));
    expect(md).toContain("# Substack roster audit — 2026-05-22");
    expect(md).toContain("No candidates audited");
  });

  it("includes the threshold legend", () => {
    const md = formatAuditTable([baseRow], new Date("2026-05-22T00:00:00Z"));
    expect(md).toContain("ALIVE = items_last_90d >= 3");
    expect(md).toContain("RECENT = most_recent within 30 days");
    expect(md).toContain("SUBSTANTIVE = avg_content_chars >= 2000");
    expect(md).toContain("LOW_PAYWALL = paywall_hit_rate < 0.5");
  });
});
