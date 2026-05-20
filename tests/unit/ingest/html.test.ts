import { describe, it, expect } from "vitest";
import { htmlToText, extractTickers } from "@/lib/ingest/html";

describe("htmlToText", () => {
  it("strips tags and decodes common entities", () => {
    const html = "<p>Hello &amp; <strong>welcome</strong>&nbsp;back.</p>";
    expect(htmlToText(html)).toBe("Hello & welcome back.");
  });

  it("converts block-tag closings into newlines", () => {
    const html = "<p>Line one.</p><p>Line two.</p>";
    expect(htmlToText(html)).toBe("Line one.\nLine two.");
  });

  it("removes script and style blocks", () => {
    const html = "<p>visible</p><script>alert(1)</script><style>.x{}</style>";
    expect(htmlToText(html)).toBe("visible");
  });

  it("collapses 3+ blank lines to 2", () => {
    const html = "<p>a</p><p></p><p></p><p></p><p>b</p>";
    expect(htmlToText(html)).toBe("a\n\nb");
  });
});

describe("extractTickers", () => {
  it("picks up $TICKER convention", () => {
    expect(extractTickers("Bought $NVDA and $AAPL.")).toContain("NVDA");
  });

  it("matches dictionary names case-insensitively", () => {
    expect(extractTickers("ASML is the only EUV supplier.")).toContain("ASML");
    expect(extractTickers("TSMC capacity is constrained.")).toContain("TSM");
    expect(extractTickers("Lam Research and KLA both beat.")).toContain("LRCX");
    expect(extractTickers("Lam Research and KLA both beat.")).toContain("KLAC");
  });

  it("respects word boundaries for single tokens", () => {
    expect(extractTickers("Intelligence is rising.")).not.toContain("INTC");
  });

  it("returns sorted unique tickers", () => {
    const t = extractTickers("NVDA $NVDA nvidia $AMD AMD.");
    expect(t).toEqual([...new Set(t)].sort());
  });
});
