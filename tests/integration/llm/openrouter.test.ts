// SKIPPED BY DEFAULT — exercises real OpenRouter endpoints (costs ~$0.05).
// Run on demand: temporarily flip `describe.skip` → `describe` and rerun.

import { describe, it, expect } from "vitest";
import { createMessage } from "@/lib/llm/client";

describe.skip("OpenRouter integration", () => {
  it("calls the default Anthropic model via OpenRouter", async () => {
    const res = await createMessage({
      agent: "thesis_extractor",
      system: 'You are a JSON producer. Return {"ok": true}.',
      messages: [{ role: "user", content: "Go." }],
      max_tokens: 50,
    });
    expect(res.model).toBeTruthy();
    expect(res.text || res.tool_calls.length).toBeTruthy();
  });

  it("calls a non-Anthropic model (manual setup required)", async () => {
    // To exercise this, edit lib/data/agent-models.json to point one agent
    // at e.g. google/gemini-2.5-pro, then flip describe.skip → describe.
    const res = await createMessage({
      agent: "scan_runner",
      system: "Say hi.",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 50,
    });
    expect(res.usage.output_tokens).toBeGreaterThan(0);
  });
});
