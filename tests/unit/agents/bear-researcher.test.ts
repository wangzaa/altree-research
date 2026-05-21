import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/agents/expert-corpus/retrieve", () => ({
  retrieve: vi.fn(async () => [
    {
      id: "p2",
      expert_slug: "y",
      expert_name: "Y",
      author: "B",
      title: "Demand cools",
      link: "https://y/p2",
      published: "2025-07-01T00:00:00Z",
      content: "Capex commitments are showing strain.",
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
              expert: "Y",
              post_id: "p2",
              post_url: "https://y/p2",
              post_title: "Demand cools",
              quote: "Capex commitments are showing strain.",
              date: "2025-07-01T00:00:00Z",
            },
          ],
        },
      },
    ],
    usage: { input_tokens: 90, output_tokens: 40 },
    model: "anthropic/claude-opus-4-7",
    finish_reason: "tool_calls",
    raw: {},
  })),
}));

import { runBearResearcher } from "@/lib/agents/bear-researcher";
import { makeThesis } from "./fixtures/thesis";

describe("runBearResearcher", () => {
  it("returns Zod-validated bear evidence with model name", async () => {
    const thesis = makeThesis();
    const driver = thesis.drivers.industry[0];
    const result = await runBearResearcher({ thesis, driver });
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0].post_id).toBe("p2");
    expect(result.model).toBe("anthropic/claude-opus-4-7");
  });
});
