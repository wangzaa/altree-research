import { describe, it, expect } from "vitest";
import { getModelFor, loadAgentModels } from "@/lib/data/agent-models";

describe("agent-models registry", () => {
  it("validates and loads the bundled JSON without throwing", () => {
    const map = loadAgentModels();
    expect(map.bull_researcher).toBeTruthy();
    expect(map.bear_researcher).toBeTruthy();
  });

  it("returns the model for a known agent", () => {
    expect(getModelFor("bull_researcher")).toMatch(/\//);
  });

  it("each agent gets a non-empty model string", () => {
    const map = loadAgentModels();
    for (const value of Object.values(map)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
