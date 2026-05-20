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

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages = {
        create: vi.fn(async () => ({
          stop_reason: "tool_use",
          usage: { input_tokens: 90, output_tokens: 40 },
          content: [
            {
              type: "tool_use",
              name: "submit_evidence",
              id: "t1",
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
        })),
      };
    },
  };
});

import { runBearResearcher } from "@/lib/agents/bear-researcher";
import { makeThesis } from "./fixtures/thesis";

describe("runBearResearcher", () => {
  it("returns Zod-validated bear evidence", async () => {
    const thesis = makeThesis();
    const driver = thesis.drivers.industry[0];
    const result = await runBearResearcher({ thesis, driver });
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0].post_id).toBe("p2");
  });
});
