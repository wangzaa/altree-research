import { describe, it, expect } from "vitest";
import { buildLensContext } from "@/lib/agents/adversarial/buildLensContext";
import type { IndustryDriver, Thesis } from "@/lib/schemas/thesis";

function makeThesis(): Thesis {
  return {
    id: "test_26_05_01",
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: "u1",
    source_snippet: "test prose",
    claim: "AI accelerator demand sustains through 2026.",
    macro_premise: "Hyperscaler capex remains elevated.",
    horizon_years: 3,
    scope: {
      type: "thematic",
      sectors: ["45301010"],
      regions: ["US"],
      market_cap_min_usd: 0,
      tickers_seed: ["NVDA"],
      tickers_exclude: [],
    },
    drivers: {
      industry: [
        {
          id: "M1",
          claim: "TSMC capacity catches up to demand",
          central_estimate: { value: 3, unit: "years" },
          thesis_breaks_below: 2,
          evidence: [],
          tickers: ["TSM"],
          verdict: null,
          classification: "industry",
        },
      ],
    },
    falsification: { primary: "Capex collapses by >40%" },
    universe_id: "test_global",
    validation: {
      status: "draft",
      verdict: null,
      last_validated_at: null,
      open_tensions: [],
    },
  };
}

const fakePosts = [
  {
    id: "p1",
    expert_name: "Test Expert",
    title: "TSMC builds more",
    link: "https://example.com/p1",
    published: "2025-06-01T00:00:00Z",
    content: "TSMC adds N3 capacity per analyst commentary.",
  },
];

describe("buildLensContext", () => {
  it("produces a valid bull request with no bear strings in system prompt", () => {
    const thesis = makeThesis();
    const req = buildLensContext({
      lens: "bull",
      thesis,
      driver: thesis.drivers.industry[0],
      posts: fakePosts,
    });
    const sysText = req.system.map((b) => b.text).join("\n");
    expect(/\bbear\b/i.test(sysText)).toBe(false);
    expect(/\bdownside\b/i.test(sysText)).toBe(false);
    expect(/counter[- ]evidence/i.test(sysText)).toBe(false);
    expect(sysText.includes("bear_researcher")).toBe(false);
  });

  it("produces a valid bear request with no bull strings in system prompt", () => {
    const thesis = makeThesis();
    const req = buildLensContext({
      lens: "bear",
      thesis,
      driver: thesis.drivers.industry[0],
      posts: fakePosts,
    });
    const sysText = req.system.map((b) => b.text).join("\n");
    expect(/\bbull\b/i.test(sysText)).toBe(false);
    expect(/\bsupporting evidence\b/i.test(sysText)).toBe(false);
    expect(/\bsupports?\b/i.test(sysText)).toBe(false);
    expect(sysText.includes("bull_researcher")).toBe(false);
  });

  it("throws when priorEvidence has the opposite lens", () => {
    const thesis = makeThesis();
    expect(() =>
      buildLensContext({
        lens: "bull",
        thesis,
        driver: thesis.drivers.industry[0],
        posts: fakePosts,
        priorEvidence: {
          lens: "bear",
          thesis_id: "test_26_05_01",
          evidence: [],
        },
      }),
    ).toThrow(/opposite lens/i);
  });

  it("throws when priorEvidence has a different thesis_id", () => {
    const thesis = makeThesis();
    expect(() =>
      buildLensContext({
        lens: "bull",
        thesis,
        driver: thesis.drivers.industry[0],
        posts: fakePosts,
        priorEvidence: {
          lens: "bull",
          thesis_id: "wrong_id_26_05_01",
          evidence: [],
        },
      }),
    ).toThrow(/thesis_id mismatch/i);
  });

  it("allows posts content with neutral financial vocabulary (bear case, downside)", () => {
    // Real corpus posts contain phrases like "bear case", "downside risk",
    // "bullish outlook" routinely. Only the AGENT IDENTIFIER bear_researcher
    // is treated as a leakage sentinel in corpus content (see next test).
    const thesis = makeThesis();
    expect(() =>
      buildLensContext({
        lens: "bull",
        thesis,
        driver: thesis.drivers.industry[0],
        posts: [
          {
            ...fakePosts[0],
            content: "The bear case for ASML is China export controls; the bullish view is full backlog.",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("throws when posts content contains an opposite-agent identifier", () => {
    const thesis = makeThesis();
    expect(() =>
      buildLensContext({
        lens: "bull",
        thesis,
        driver: thesis.drivers.industry[0],
        posts: [
          {
            ...fakePosts[0],
            content: "bear_researcher wrote: hyperscalers are slowing.",
          },
        ],
      }),
    ).toThrow(/disallowed/i);
  });

  it("returns the submit_evidence tool with forced tool_choice", () => {
    const thesis = makeThesis();
    const req = buildLensContext({
      lens: "bull",
      thesis,
      driver: thesis.drivers.industry[0],
      posts: fakePosts,
    });
    expect(req.tools.length).toBe(1);
    expect(req.tools[0].name).toBe("submit_evidence");
    expect(req.tool_choice).toEqual({ type: "tool", name: "submit_evidence" });
  });
});
