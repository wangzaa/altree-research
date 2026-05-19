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
