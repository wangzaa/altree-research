import { describe, it, expect } from "vitest";
import { deriveStepStates, type PipelineStep } from "@/lib/pipeline-steps";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";
import type { Universe } from "@/lib/schemas/universe";
import type { ScanResults } from "@/lib/schemas/scan";

const sampleUniverse: Universe = {
  id: "eu_defense_global",
  tickers: [
    {
      ticker: "RHM.DE",
      name: "Rheinmetall",
      region: "EUROZONE",
      market_cap_usd_b: 30,
      exposure_tier: "pure_play",
    },
  ],
};

const sampleScan: ScanResults = {
  history_5y: [],
  tickers_snapshot: [],
  descriptive_markdown: "",
};

describe("deriveStepStates", () => {
  it("returns four steps in the documented order", () => {
    const steps: PipelineStep[] = deriveStepStates({
      thesis: cloneCanonicalThesis(),
      universe: null,
      scan: null,
      validationResults: null,
    });
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.id)).toEqual([
      "step-thesis",
      "step-universe",
      "step-insights",
      "step-memo",
    ]);
    expect(steps.map((s) => s.label)).toEqual([
      "Thesis extraction",
      "Universe construction",
      "Insights",
      "Memo",
    ]);
  });

  it("marks thesis completed and universe active with no universe/scan", () => {
    const steps = deriveStepStates({
      thesis: cloneCanonicalThesis(),
      universe: null,
      scan: null,
      validationResults: null,
    });
    expect(steps[0].state).toBe("completed");
    expect(steps[1].state).toBe("active");
    expect(steps[2].state).toBe("pending");
    expect(steps[3].state).toBe("pending");
  });

  it("marks universe completed when a universe with tickers is present", () => {
    const steps = deriveStepStates({
      thesis: cloneCanonicalThesis(),
      universe: sampleUniverse,
      scan: null,
      validationResults: null,
    });
    expect(steps[1].state).toBe("completed");
    expect(steps[2].state).toBe("active");
  });

  it("marks insights completed once any driver has bull_evidence", () => {
    const steps = deriveStepStates({
      thesis: cloneCanonicalThesis(),
      universe: sampleUniverse,
      scan: sampleScan,
      validationResults: {
        backlog_to_revenue: {
          bull_evidence: [
            {
              expert: "x",
              post_id: "1",
              post_url: "https://example.com",
              post_title: "t",
              quote: "q",
              date: "2026-01-01",
            },
          ],
          bear_evidence: [],
        },
      },
    });
    expect(steps[2].state).toBe("completed");
    expect(steps[3].state).toBe("active");
  });

  it("keeps memo active when all earlier steps are complete (memo is the lowest-incomplete)", () => {
    const steps = deriveStepStates({
      thesis: cloneCanonicalThesis(),
      universe: sampleUniverse,
      scan: sampleScan,
      validationResults: {
        backlog_to_revenue: {
          bull_evidence: [
            {
              expert: "x",
              post_id: "1",
              post_url: "https://example.com",
              post_title: "t",
              quote: "q",
              date: "2026-01-01",
            },
          ],
          bear_evidence: [],
        },
      },
    });
    expect(steps[3].state).toBe("active");
  });
});
