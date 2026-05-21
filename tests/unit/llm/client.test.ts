import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn(async () => ({
  id: "resp_1",
  model: "anthropic/claude-opus-4-7",
  choices: [
    {
      message: {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "submit_evidence",
              arguments: JSON.stringify({ evidence: [{ post_id: "p1" }] }),
            },
          },
        ],
      },
      finish_reason: "tool_calls",
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
}));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

import { createMessage } from "@/lib/llm/client";

beforeEach(() => {
  createMock.mockClear();
});

describe("createMessage", () => {
  it("resolves agent → model from registry and calls OpenRouter", async () => {
    const result = await createMessage({
      agent: "bull_researcher",
      system: "You are bull_researcher.",
      messages: [{ role: "user", content: "Test" }],
    });
    expect(createMock).toHaveBeenCalledOnce();
    const call = createMock.mock.calls[0][0] as { model: string };
    expect(call.model).toMatch(/anthropic\/claude-opus-4-7/);
    expect(result.model).toMatch(/anthropic\/claude-opus-4-7/);
  });

  it("normalizes tool_calls into parsed inputs", async () => {
    const result = await createMessage({
      agent: "bull_researcher",
      system: "test",
      messages: [{ role: "user", content: "x" }],
      tools: [
        {
          name: "submit_evidence",
          input_schema: { type: "object", properties: {} },
        },
      ],
      tool_choice: { type: "tool", name: "submit_evidence" },
    });
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls[0].name).toBe("submit_evidence");
    expect(result.tool_calls[0].input).toEqual({
      evidence: [{ post_id: "p1" }],
    });
  });

  it("returns usage in normalized {input_tokens, output_tokens} shape", async () => {
    const result = await createMessage({
      agent: "bull_researcher",
      system: "test",
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.usage.input_tokens).toBe(100);
    expect(result.usage.output_tokens).toBe(50);
  });
});
