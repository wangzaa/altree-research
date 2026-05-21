import { describe, it, expect } from "vitest";
import { summariseThesis } from "@/lib/thesis-summary";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

describe("summariseThesis", () => {
  it("renders the claim, horizon, and macro premise", () => {
    const out = summariseThesis(cloneCanonicalThesis());
    expect(out).toContain(
      "EU defense capex cycle benefits primes with multi-year backlog visibility",
    );
    expect(out).toContain("5 years");
    expect(out).toContain("NATO 3% commitment holds through 2030");
  });

  it("joins scope regions and sectors with friendly names", () => {
    const out = summariseThesis(cloneCanonicalThesis());
    expect(out).toMatch(/EUROZONE.*UK|UK.*EUROZONE/);
    expect(out).toMatch(/Industrials|Capital Goods|Aerospace/i);
  });

  it("formats market cap minimum in $B", () => {
    const out = summariseThesis(cloneCanonicalThesis());
    expect(out).toContain("$1B");
  });

  it("lists each driver with central estimate, unit, and breaks-below", () => {
    const out = summariseThesis(cloneCanonicalThesis());
    expect(out).toContain("backlog_to_revenue");
    expect(out).toContain("3");
    expect(out).toContain("years");
    expect(out).toContain("1.5");
  });

  it("includes primary falsification and secondary when present", () => {
    const out = summariseThesis(cloneCanonicalThesis());
    expect(out).toContain("NATO 3% commitment formally rolled back");
    expect(out).toContain("Sector backlog/revenue <1.5y");
  });

  it("omits secondary falsification when undefined", () => {
    const t = cloneCanonicalThesis();
    delete t.falsification.secondary;
    const out = summariseThesis(t);
    expect(out).toContain("NATO 3% commitment formally rolled back");
    expect(out).not.toContain("undefined");
  });

  it("includes ticker list for a driver when tickers are present", () => {
    const t = cloneCanonicalThesis();
    t.drivers.industry[0].tickers = ["RHM.DE", "BA.L"];
    const out = summariseThesis(t);
    expect(out).toContain("RHM.DE");
    expect(out).toContain("BA.L");
  });
});
