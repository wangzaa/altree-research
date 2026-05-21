import { describe, it, expect } from "vitest";
import { toOpenAITool, toOpenAIToolChoice } from "@/lib/llm/tool-format";

describe("toOpenAITool", () => {
  it("converts an Anthropic-format tool to OpenAI format", () => {
    const anthropic = {
      name: "submit_evidence",
      description: "Submit per-lens evidence.",
      input_schema: {
        type: "object" as const,
        properties: {
          evidence: { type: "array", items: { type: "object" } },
        },
        required: ["evidence"],
      },
    };
    expect(toOpenAITool(anthropic)).toEqual({
      type: "function",
      function: {
        name: "submit_evidence",
        description: "Submit per-lens evidence.",
        parameters: {
          type: "object",
          properties: {
            evidence: { type: "array", items: { type: "object" } },
          },
          required: ["evidence"],
        },
      },
    });
  });

  it("omits description when absent", () => {
    const out = toOpenAITool({
      name: "x",
      input_schema: { type: "object" as const, properties: {} },
    });
    expect(out.function.description).toBeUndefined();
  });
});

describe("toOpenAIToolChoice", () => {
  it("forwards 'auto'", () => {
    expect(toOpenAIToolChoice("auto")).toBe("auto");
  });

  it("forwards 'none'", () => {
    expect(toOpenAIToolChoice("none")).toBe("none");
  });

  it("converts {type:'tool', name} to OpenAI function-choice form", () => {
    expect(toOpenAIToolChoice({ type: "tool", name: "submit_evidence" })).toEqual({
      type: "function",
      function: { name: "submit_evidence" },
    });
  });
});
