import { describe, it, expect } from "vitest";
import {
  toAnthropicTool,
  toAnthropicToolChoice,
} from "@/lib/llm/tool-format";

describe("toAnthropicTool", () => {
  it("passes through name + input_schema (project shape already matches Anthropic's)", () => {
    const tool = {
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
    expect(toAnthropicTool(tool)).toEqual({
      name: "submit_evidence",
      description: "Submit per-lens evidence.",
      input_schema: {
        type: "object",
        properties: {
          evidence: { type: "array", items: { type: "object" } },
        },
        required: ["evidence"],
      },
    });
  });

  it("omits description when absent", () => {
    const out = toAnthropicTool({
      name: "x",
      input_schema: { type: "object" as const, properties: {} },
    });
    expect(out.description).toBeUndefined();
  });
});

describe("toAnthropicToolChoice", () => {
  it("maps 'auto' to Anthropic's {type: 'auto'}", () => {
    expect(toAnthropicToolChoice("auto")).toEqual({ type: "auto" });
  });

  it("maps 'none' to Anthropic's {type: 'none'}", () => {
    expect(toAnthropicToolChoice("none")).toEqual({ type: "none" });
  });

  it("forwards {type:'tool', name} unchanged (already matches Anthropic's shape)", () => {
    expect(
      toAnthropicToolChoice({ type: "tool", name: "submit_evidence" }),
    ).toEqual({
      type: "tool",
      name: "submit_evidence",
    });
  });
});
