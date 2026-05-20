import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const messagesCreate = vi.fn();
const AnthropicCtor = vi.fn(() => ({
  messages: { create: messagesCreate },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: AnthropicCtor,
}));

function resetGlobals() {
  const g = globalThis as unknown as { __anthropicClient?: unknown };
  delete g.__anthropicClient;
}

describe("anthropic/client module import", () => {
  beforeEach(() => {
    vi.resetModules();
    messagesCreate.mockReset();
    AnthropicCtor.mockClear();
    resetGlobals();
  });

  it("imports without throwing when ANTHROPIC_API_KEY is unset", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const mod = await import("@/lib/anthropic/client");
      expect(typeof mod.createMessage).toBe("function");
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });
});

describe("createMessage", () => {
  const cannedResponse = {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content: [{ type: "text", text: "hi" }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 5, output_tokens: 3 },
  };

  beforeEach(() => {
    vi.resetModules();
    messagesCreate.mockReset();
    AnthropicCtor.mockClear();
    resetGlobals();
    process.env.ANTHROPIC_API_KEY = "test-key";
    messagesCreate.mockResolvedValue(cannedResponse);
  });

  afterEach(() => {
    resetGlobals();
  });

  it("calls the SDK with default model, max_tokens, temperature", async () => {
    const { createMessage } = await import("@/lib/anthropic/client");
    await createMessage({
      system: "you are a bot",
      messages: [{ role: "user", content: "hello" }],
    });
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    const call = messagesCreate.mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.max_tokens).toBe(4096);
    expect(call.temperature).toBe(0);
    expect(call.system).toBe("you are a bot");
    expect(call.messages).toEqual([{ role: "user", content: "hello" }]);
  });

  it("passes through model, tools, tool_choice, temperature, max_tokens overrides", async () => {
    const { createMessage } = await import("@/lib/anthropic/client");
    const tool = {
      name: "echo",
      description: "echo",
      input_schema: { type: "object" as const, properties: {} },
    };
    await createMessage({
      model: "claude-opus-4-7",
      system: [{ type: "text", text: "rules" }],
      messages: [{ role: "user", content: "x" }],
      tools: [tool],
      tool_choice: { type: "tool", name: "echo" },
      max_tokens: 1024,
      temperature: 0.5,
    });
    const call = messagesCreate.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-4-7");
    expect(call.max_tokens).toBe(1024);
    expect(call.temperature).toBe(0.5);
    expect(call.tools).toEqual([tool]);
    expect(call.tool_choice).toEqual({ type: "tool", name: "echo" });
    expect(call.system).toEqual([{ type: "text", text: "rules" }]);
  });

  it("returns the structured result shape", async () => {
    const { createMessage } = await import("@/lib/anthropic/client");
    const result = await createMessage({
      system: "s",
      messages: [{ role: "user", content: "u" }],
    });
    expect(result.content).toEqual(cannedResponse.content);
    expect(result.stop_reason).toBe("end_turn");
    expect(result.usage).toEqual(cannedResponse.usage);
    expect(result.raw).toBe(cannedResponse);
  });

  it("does not include tools or tool_choice when omitted", async () => {
    const { createMessage } = await import("@/lib/anthropic/client");
    await createMessage({
      system: "s",
      messages: [{ role: "user", content: "u" }],
    });
    const call = messagesCreate.mock.calls[0][0];
    expect(call.tools).toBeUndefined();
    expect(call.tool_choice).toBeUndefined();
  });

  it("throws lazily when ANTHROPIC_API_KEY is unset and createMessage is called", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { createMessage } = await import("@/lib/anthropic/client");
    await expect(
      createMessage({
        system: "s",
        messages: [{ role: "user", content: "u" }],
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(messagesCreate).not.toHaveBeenCalled();
  });
});
