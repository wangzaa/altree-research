import { describe, it, expect } from "vitest";
import { thesisBubbles } from "@/lib/thesis-bubbles";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

describe("thesisBubbles", () => {
  it("opens with a reflective playback line, not a parser readback", () => {
    const out = thesisBubbles(cloneCanonicalThesis());
    expect(out[0].id).toBe("opener");
    expect(out[0].body).toMatch(/play this back|got it/i);
    // Never the parser voice.
    expect(out[0].body).not.toMatch(/extracted/i);
    expect(out[0].body).not.toMatch(/I have/i);
  });

  it("weaves scope (regions, sectors, cap, horizon, macro) into one setup paragraph", () => {
    const out = thesisBubbles(cloneCanonicalThesis());
    const setup = out.find((b) => b.id === "setup")!;
    // Friendly region labels, not raw enums.
    expect(setup.body).toMatch(/the Eurozone/);
    expect(setup.body).toMatch(/the UK/);
    expect(setup.body).not.toMatch(/EUROZONE|GREATER_CHINA|SEA/);
    // Horizon as prose, cap as $B.
    expect(setup.body).toMatch(/5 years/);
    expect(setup.body).toContain("$1B");
    // Macro premise present but not as a labelled row.
    expect(setup.body).toMatch(/NATO 3% commitment/i);
    expect(setup.body).not.toMatch(/Macro premise:/);
    expect(setup.body).not.toMatch(/Horizon:/);
    expect(setup.body).not.toMatch(/Scope:/);
  });

  it("renders one leg bubble per driver with the driver id transformed to a friendly handle", () => {
    const out = thesisBubbles(cloneCanonicalThesis());
    const leg = out.find((b) => b.id === "leg-backlog_to_revenue")!;
    expect(leg).toBeDefined();
    // The handle should be bolded and friendly; never the raw id.
    expect(leg.body).toMatch(/\*\*backlog\*\*/);
    expect(leg.body).not.toMatch(/backlog_to_revenue/);
    // Numbers in prose, never label:value rows.
    expect(leg.body).toMatch(/penciling in around 3 years/);
    expect(leg.body).toMatch(/broken below 1\.5 years/);
    expect(leg.body).not.toMatch(/Central estimate:/);
    expect(leg.body).not.toMatch(/Thesis breaks below:/);
  });

  it("places tickers inline with the leg, not in a standalone list", () => {
    const t = cloneCanonicalThesis();
    t.drivers.industry[0].tickers = ["RHM.DE", "BA.L"];
    const out = thesisBubbles(t);
    const leg = out.find((b) => b.id === "leg-backlog_to_revenue")!;
    expect(leg.body).toContain("RHM.DE");
    expect(leg.body).toContain("BA.L");
    expect(leg.body).toMatch(/Names expressing this/);
  });

  it("uses 'what would kill it' for falsification, never 'Primary:' / 'Negate:'", () => {
    const out = thesisBubbles(cloneCanonicalThesis());
    const kill = out.find((b) => b.id === "kill")!;
    expect(kill.body).toMatch(/^What would kill it: /);
    expect(kill.body).toContain("NATO 3% commitment formally rolled back");
    expect(kill.body).toMatch(/Secondary signal:/);
    expect(kill.body).not.toMatch(/^Primary:/);
    expect(kill.body).not.toMatch(/Negate:/);
  });

  it("omits the secondary signal when falsification.secondary is undefined", () => {
    const t = cloneCanonicalThesis();
    delete t.falsification.secondary;
    const out = thesisBubbles(t);
    const kill = out.find((b) => b.id === "kill")!;
    expect(kill.body).toMatch(/^What would kill it: /);
    expect(kill.body).not.toMatch(/Secondary signal:/);
    expect(kill.body).not.toContain("undefined");
  });

  it("closes with a targeted question naming the load-bearing numbers", () => {
    const out = thesisBubbles(cloneCanonicalThesis());
    const close = out.find((b) => b.id === "close")!;
    // For a single driver we point at THE number; for two we list both.
    expect(close.body).toMatch(/Does that match the shape/);
    expect(close.body).toMatch(/pressure-test/);
    expect(close.body).toMatch(/load-bearing/);
    // Never the generic catch-all.
    expect(close.body).not.toMatch(/Anything you'd like to change\?/i);
  });

  it("introduces multiple legs with a 'Two legs to the story' bubble", () => {
    const t = cloneCanonicalThesis();
    t.drivers.industry.push({
      id: "memory_cycle_pricing",
      claim: "DRAM and NAND ASPs sustain a multi-quarter upcycle",
      central_estimate: { value: 20, unit: "pct" },
      thesis_breaks_below: 5,
      evidence: [],
      verdict: null,
      classification: "industry",
    });
    const out = thesisBubbles(t);
    expect(out.find((b) => b.id === "legs-intro")?.body).toMatch(/Two legs/);
    expect(out.find((b) => b.id === "leg-memory_cycle_pricing")).toBeDefined();
    const memoryLeg = out.find((b) => b.id === "leg-memory_cycle_pricing")!;
    // memory_cycle_pricing → "memory" handle
    expect(memoryLeg.body).toMatch(/\*\*memory\*\*/);
    expect(memoryLeg.body).toMatch(/around 20%/);
    expect(memoryLeg.body).toMatch(/broken below 5%/);
  });

  it("formats percentage units as N% not 'N pct'", () => {
    const t = cloneCanonicalThesis();
    t.drivers.industry[0].central_estimate = { value: 15, unit: "pct" };
    t.drivers.industry[0].thesis_breaks_below = 5;
    const out = thesisBubbles(t);
    const leg = out.find((b) => b.id === "leg-backlog_to_revenue")!;
    expect(leg.body).toMatch(/around 15%/);
    expect(leg.body).toMatch(/broken below 5%/);
    expect(leg.body).not.toMatch(/15 pct/);
  });
});
