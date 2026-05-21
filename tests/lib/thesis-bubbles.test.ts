import { describe, it, expect } from "vitest";
import { thesisBubbles } from "@/lib/thesis-bubbles";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

describe("thesisBubbles", () => {
  it("returns an intro, claim, macro, scope, drivers, and negate in order", () => {
    const out = thesisBubbles(cloneCanonicalThesis());
    const ids = out.map((b) => b.id);
    expect(ids[0]).toBe("intro");
    expect(ids).toContain("claim");
    expect(ids).toContain("macro");
    expect(ids).toContain("scope");
    expect(ids).toContain("driver-backlog_to_revenue");
    expect(ids[ids.length - 1]).toBe("negate");
  });

  it("scope bubble carries horizon, regions, sectors and cap floor", () => {
    const out = thesisBubbles(cloneCanonicalThesis());
    const scope = out.find((b) => b.id === "scope")!;
    expect(scope.body).toContain("Horizon: 5 years");
    expect(scope.body).toMatch(/EUROZONE.*UK|UK.*EUROZONE/);
    expect(scope.body).toContain("$1B");
  });

  it("driver bubble carries claim, central estimate, breaks-below and tickers when present", () => {
    const t = cloneCanonicalThesis();
    t.drivers.industry[0].tickers = ["RHM.DE", "BA.L"];
    const out = thesisBubbles(t);
    const driver = out.find((b) => b.id === "driver-backlog_to_revenue")!;
    expect(driver.body).toContain("Sector backlog/revenue >= 2y sustained");
    expect(driver.body).toContain("Central estimate: 3 years");
    expect(driver.body).toContain("Thesis breaks below: 1.5");
    expect(driver.body).toContain("RHM.DE");
    expect(driver.body).toContain("BA.L");
  });

  it("negate bubble carries primary and secondary falsification when both are set", () => {
    const out = thesisBubbles(cloneCanonicalThesis());
    const negate = out.find((b) => b.id === "negate")!;
    expect(negate.body).toContain("Primary: NATO 3% commitment formally rolled back");
    expect(negate.body).toContain("Secondary: Sector backlog/revenue <1.5y");
  });

  it("negate bubble omits secondary when undefined", () => {
    const t = cloneCanonicalThesis();
    delete t.falsification.secondary;
    const out = thesisBubbles(t);
    const negate = out.find((b) => b.id === "negate")!;
    expect(negate.body).toContain("Primary: NATO 3% commitment");
    expect(negate.body).not.toContain("Secondary:");
    expect(negate.body).not.toContain("undefined");
  });

  it("produces one driver bubble per industry driver", () => {
    const t = cloneCanonicalThesis();
    t.drivers.industry.push({
      id: "second_driver",
      claim: "Another claim",
      central_estimate: { value: 2, unit: "x" },
      thesis_breaks_below: 1,
      evidence: [],
      verdict: null,
      classification: "industry",
    });
    const out = thesisBubbles(t);
    expect(out.find((b) => b.id === "driver-backlog_to_revenue")).toBeDefined();
    expect(out.find((b) => b.id === "driver-second_driver")).toBeDefined();
    expect(out.find((b) => b.id === "driver-second_driver")!.label).toBe(
      "Driver 2: second_driver",
    );
  });
});
