import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK at the module boundary. The default export is the
// `Anthropic` class; constructing it returns an object exposing
// `messages.create()` — that's what our LLM client wraps.
const createMock = vi.fn(async () => ({
  id: "msg_1",
  type: "message" as const,
  role: "assistant" as const,
  model: "claude-opus-4-7",
  content: [
    {
      type: "tool_use" as const,
      id: "toolu_1",
      name: "submit_evidence",
      input: { evidence: [{ post_id: "p1" }] },
    },
  ],
  stop_reason: "tool_use" as const,
  stop_sequence: null,
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
  },
}));

import { createMessage } from "@/lib/llm/client";

beforeEach(() => {
  createMock.mockClear();
});

describe("createMessage", () => {
  it("resolves agent → model from registry and calls Anthropic with bare model IDs", async () => {
    const result = await createMessage({
      agent: "bull_researcher",
      system: "You are bull_researcher.",
      messages: [{ role: "user", content: "Test" }],
    });
    expect(createMock).toHaveBeenCalledOnce();
    const call = createMock.mock.calls[0][0] as {
      model: string;
      system: Array<{ type: string; text: string; cache_control?: unknown }>;
    };
    // Bare ID — no provider prefix. System prompt threads as a top-level
    // block array (not a string) so the last block can carry a
    // `cache_control` breakpoint enabling prompt caching for the tools +
    // system prefix.
    expect(call.model).toBe("claude-opus-4-7");
    expect(call.system).toEqual([
      {
        type: "text",
        text: "You are bull_researcher.",
        cache_control: { type: "ephemeral" },
      },
    ]);
    expect(result.model).toBe("claude-opus-4-7");
  });

  it("collects tool_use blocks from the content array into typed ToolCall objects", async () => {
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
    expect(result.tool_calls[0].id).toBe("toolu_1");
    expect(result.tool_calls[0].name).toBe("submit_evidence");
    // `input` is already a parsed object in the Anthropic SDK response —
    // no JSON.parse needed (and the wrapper must not re-stringify it).
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

  it("surfaces Anthropic prompt-cache token counts in usage", async () => {
    createMock.mockResolvedValueOnce({
      id: "msg_cached",
      type: "message" as const,
      role: "assistant" as const,
      model: "claude-opus-4-7",
      content: [{ type: "text" as const, text: "ok" }],
      stop_reason: "end_turn" as const,
      stop_sequence: null,
      usage: {
        input_tokens: 5,
        output_tokens: 1,
        cache_creation_input_tokens: 1200,
        cache_read_input_tokens: 4400,
      },
    });
    const result = await createMessage({
      agent: "bull_researcher",
      system: "test",
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.usage.cache_creation_input_tokens).toBe(1200);
    expect(result.usage.cache_read_input_tokens).toBe(4400);
  });

  it("concatenates text blocks across the content array", async () => {
    createMock.mockResolvedValueOnce({
      id: "msg_2",
      type: "message" as const,
      role: "assistant" as const,
      model: "claude-haiku-4-5",
      content: [
        { type: "text" as const, text: "Hello " },
        { type: "text" as const, text: "world." },
      ],
      stop_reason: "end_turn" as const,
      stop_sequence: null,
      usage: {
        input_tokens: 5,
        output_tokens: 2,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    });
    const result = await createMessage({
      agent: "diff_narrator",
      system: "test",
      messages: [{ role: "user", content: "say hi" }],
    });
    expect(result.text).toBe("Hello world.");
    expect(result.tool_calls).toEqual([]);
    expect(result.finish_reason).toBe("end_turn");
  });
});
