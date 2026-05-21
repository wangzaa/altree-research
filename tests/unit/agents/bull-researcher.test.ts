import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/agents/expert-corpus/retrieve", () => ({
  retrieve: vi.fn(async () => [
    {
      id: "p1",
      expert_slug: "x",
      expert_name: "X",
      author: "A",
      title: "TSMC builds",
      link: "https://x/p1",
      published: "2025-06-01T00:00:00Z",
      content: "TSMC adds N3 capacity per analyst commentary.",
      is_paywalled: false,
      tickers: ["TSM"],
      sectors: ["semis"],
    },
  ]),
}));

vi.mock("@/lib/llm/client", () => ({
  createMessage: vi.fn(async () => ({
    text: "",
    tool_calls: [
      {
        id: "t1",
        name: "submit_evidence",
        input: {
          evidence: [
            {
              expert: "X",
              post_id: "p1",
              post_url: "https://x/p1",
              post_title: "TSMC builds",
              quote: "TSMC adds N3 capacity per analyst commentary.",
              date: "2025-06-01T00:00:00Z",
            },
          ],
        },
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
    model: "anthropic/claude-opus-4-7",
    finish_reason: "tool_calls",
    raw: {},
  })),
}));

import { runBullResearcher } from "@/lib/agents/bull-researcher";
import { makeThesis } from "./fixtures/thesis";

describe("runBullResearcher", () => {
  it("returns Zod-validated bull evidence with model name", async () => {
    const thesis = makeThesis();
    const driver = thesis.drivers.industry[0];
    const result = await runBullResearcher({ thesis, driver });
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0].post_id).toBe("p1");
    expect(result.model).toBe("anthropic/claude-opus-4-7");
  });
});
