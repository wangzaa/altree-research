import { describe, it, expect } from "vitest";
import { thesisBubbles } from "@/lib/thesis-bubbles";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

describe("thesisBubbles", () => {
  it("opens with a reflective playback line, not a parser readback", () => {
    const out = thesisBubbles(cloneCanonicalThesis());
    expect(out[0].id).toBe("opener");
    expect(out[0].body).toMatch(/play this back|got it/i);
    expect(out[0].body).not.toMatch(/extracted/i);
    expect(out[0].body).not.toMatch(/I have/i);
  });

  it("weaves scope (regions, sectors, cap, horizon, macro) into one setup paragraph", () => {
    const out = thesisBubbles(cloneCanonicalThesis());
    const setup = out.find((b) => b.id === "setup")!;
    expect(setup.body).toMatch(/the Eurozone/);
    expect(setup.body).toMatch(/the UK/);
    expect(setup.body).not.toMatch(/EUROZONE|GREATER_CHINA|SEA/);
    expect(setup.body).toMatch(/over the next 5 years/i);
    expect(setup.body).toContain("$1B");
    expect(setup.body).toMatch(/NATO 3% commitment/i);
    expect(setup.body).not.toMatch(/Macro premise:/);
    expect(setup.body).not.toMatch(/Horizon:/);
  });

  it("renders one thesis bubble per driver, labelled Thesis N (anchor), with no targets or thresholds (v5)", () => {
    const out = thesisBubbles(cloneCanonicalThesis());
    const t1 = out.find((b) => b.id === "thesis-backlog_to_revenue")!;
    expect(t1).toBeDefined();
    // Single-driver thesis uses `**Thesis (anchor):**` without the number.
    expect(t1.body).toMatch(/\*\*Thesis \(backlog\):\*\*/);
    // Never the raw driver id, never the old "Driver N" or "leg" framing.
    expect(t1.body).not.toMatch(/backlog_to_revenue/);
    expect(t1.body).not.toMatch(/Driver \d/);
    expect(t1.body).not.toMatch(/\bleg\b/);
    // Per tone-of-voice v5: target returns and break thresholds stay out
    // of the readback entirely. They live in JSON / show-details.
    expect(t1.body).not.toMatch(/penciling in/);
    expect(t1.body).not.toMatch(/broken below/);
    expect(t1.body).not.toMatch(/3 years/);
    expect(t1.body).not.toMatch(/1\.5 years/);
  });

  it("strips legal suffixes from inlined company names (v5)", () => {
    const t = cloneCanonicalThesis();
    t.drivers.industry[0].tickers = ["RHM.DE", "BA.L", "6954.T"];
    const out = thesisBubbles(t, {
      tickerNames: {
        "RHM.DE": "Rheinmetall AG",
        "BA.L": "BAE Systems plc",
        "6954.T": "Fanuc Corporation",
      },
    });
    const thesis = out.find((b) => b.id === "thesis-backlog_to_revenue")!;
    expect(thesis.body).toContain("Rheinmetall (RHM.DE)");
    expect(thesis.body).toContain("BAE Systems (BA.L)");
    expect(thesis.body).toContain("Fanuc (6954.T)");
    // Legal suffixes must not bleed into prose.
    expect(thesis.body).not.toMatch(/Corporation/);
    expect(thesis.body).not.toMatch(/\bAG\b/);
    expect(thesis.body).not.toMatch(/\bplc\b/);
  });

  it("falls back to bare ticker when no name is available", () => {
    const t = cloneCanonicalThesis();
    t.drivers.industry[0].tickers = ["RHM.DE"];
    const out = thesisBubbles(t);
    const thesis = out.find((b) => b.id === "thesis-backlog_to_revenue")!;
    expect(thesis.body).toContain("RHM.DE");
    expect(thesis.body).not.toContain("(RHM.DE)");
  });

  it("uses just the ticker when the company name is effectively the same (AMD, IBM)", () => {
    const t = cloneCanonicalThesis();
    t.drivers.industry[0].tickers = ["AMD", "IBM"];
    const out = thesisBubbles(t, { tickerNames: { AMD: "AMD", IBM: "IBM" } });
    const thesis = out.find((b) => b.id === "thesis-backlog_to_revenue")!;
    expect(thesis.body).toContain("AMD");
    expect(thesis.body).toContain("IBM");
    expect(thesis.body).not.toContain("(AMD)");
    expect(thesis.body).not.toContain("(IBM)");
  });

  it("renders 'What would kill it' as a bold header + bullet list (v5)", () => {
    const out = thesisBubbles(cloneCanonicalThesis());
    const kill = out.find((b) => b.id === "kill")!;
    // Bold header on its own line, bullets follow.
    expect(kill.body).toMatch(/^\*\*What would kill it:\*\*\n/);
    expect(kill.body).toContain("- NATO 3% commitment formally rolled back");
    expect(kill.body).toContain("- Sector backlog/revenue <1.5y");
    // Anti-patterns from v4 / earlier formats.
    expect(kill.body).not.toMatch(/Secondary signal:/);
    expect(kill.body).not.toMatch(/^Primary:/m);
    expect(kill.body).not.toMatch(/Negate:/);
  });

  it("renders a single bullet when falsification.secondary is undefined", () => {
    const t = cloneCanonicalThesis();
    delete t.falsification.secondary;
    const out = thesisBubbles(t);
    const kill = out.find((b) => b.id === "kill")!;
    expect(kill.body).toMatch(/^\*\*What would kill it:\*\*\n/);
    const bulletLines = kill.body
      .split("\n")
      .filter((l) => /^\s*-\s+/.test(l));
    expect(bulletLines).toHaveLength(1);
    expect(kill.body).not.toContain("undefined");
  });

  it("closes with a scoping-phase invitation, not validation-register vocabulary", () => {
    const out = thesisBubbles(cloneCanonicalThesis());
    const close = out.find((b) => b.id === "close")!;
    expect(close.body).toMatch(/Does that match the shape/);
    expect(close.body).toMatch(/widen/);
    expect(close.body).toMatch(/tighten/);
    expect(close.body).toMatch(/another region|another angle|more names/);
    expect(close.body).not.toMatch(/pressure-test/i);
    expect(close.body).not.toMatch(/load-bearing/i);
    expect(close.body).not.toMatch(/stress/i);
    expect(close.body).not.toMatch(/Anything you'd like to change\?/i);
  });

  it("introduces multiple theses with a 'Two theses here' bubble and numbers them — no targets in prose (v5)", () => {
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
    expect(out.find((b) => b.id === "theses-intro")?.body).toMatch(/Two theses/);
    const t2 = out.find((b) => b.id === "thesis-memory_cycle_pricing")!;
    expect(t2.body).toMatch(/\*\*Thesis 2 \(memory\):\*\*/);
    // Numbers stay out of the readback per v5.
    expect(t2.body).not.toMatch(/around 20%/);
    expect(t2.body).not.toMatch(/broken below 5%/);
    expect(t2.body).not.toMatch(/20 pct/);
  });

  it("strips the drv_ prefix from driver ids in the anchor label (v5)", () => {
    const t = cloneCanonicalThesis();
    t.drivers.industry[0] = {
      ...t.drivers.industry[0],
      id: "drv_aging_demographics",
      claim: "Aging demographics drives household robotics demand",
    };
    const out = thesisBubbles(t);
    const thesis = out.find((b) => b.id === "thesis-drv_aging_demographics")!;
    expect(thesis).toBeDefined();
    // Anchor label must not contain the raw `drv_` slug prefix.
    expect(thesis.body).not.toMatch(/\bdrv\b/);
    expect(thesis.body).not.toMatch(/drv_/);
    expect(thesis.body).toMatch(/\*\*Thesis \(aging demographics\):\*\*/);
  });
});
