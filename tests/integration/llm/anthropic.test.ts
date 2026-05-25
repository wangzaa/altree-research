// SKIPPED BY DEFAULT — exercises the real Anthropic Messages API (costs $$).
// Run on demand: temporarily flip `describe.skip` → `describe` and rerun.

import { describe, it, expect } from "vitest";
import { createMessage } from "@/lib/llm/client";

describe.skip("Anthropic Messages API integration", () => {
  it("calls the configured model end-to-end", async () => {
    const res = await createMessage({
      agent: "thesis_extractor",
      system: 'You are a JSON producer. Return {"ok": true}.',
      messages: [{ role: "user", content: "Go." }],
      max_tokens: 50,
    });
    expect(res.model).toBeTruthy();
    expect(res.text || res.tool_calls.length).toBeTruthy();
  });

  it("returns non-zero output token usage", async () => {
    const res = await createMessage({
      agent: "scan_runner",
      system: "Say hi.",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 50,
    });
    expect(res.usage.output_tokens).toBeGreaterThan(0);
  });
});
