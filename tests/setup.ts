import "@testing-library/jest-dom/vitest";

// recharts' ResponsiveContainer uses ResizeObserver, which jsdom doesn't ship.
// Stub it so component smoke tests can render without crashing. The chart
// dimensions in tests will be zero, but the SVG is still mounted.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// LLM client construction reads ANTHROPIC_API_KEY at import time. Provide
// a dummy value in tests; real network calls are mocked at the
// @anthropic-ai/sdk module boundary so this key is never used.
if (!process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
}

// jsdom doesn't implement Element.prototype.scrollIntoView. PipelineHeader
// click-to-scroll relies on it; the no-op stub lets handler tests run.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}
