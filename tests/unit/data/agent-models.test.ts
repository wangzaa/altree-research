import { describe, it, expect } from "vitest";
import { getModelFor, loadAgentModels } from "@/lib/data/agent-models";

describe("agent-models registry", () => {
  it("validates and loads the bundled JSON without throwing", () => {
    const map = loadAgentModels();
    expect(map.bull_researcher).toBeTruthy();
    expect(map.bear_researcher).toBeTruthy();
  });

  it("returns a bare Anthropic model ID for a known agent (no provider prefix)", () => {
    // Direct Anthropic SDK accepts bare model IDs only — no `anthropic/`
    // prefix like OpenRouter required.
    const id = getModelFor("bull_researcher");
    expect(id).toMatch(/^claude-/);
    expect(id).not.toContain("/");
  });

  it("each agent gets a non-empty model string", () => {
    const map = loadAgentModels();
    for (const value of Object.values(map)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
