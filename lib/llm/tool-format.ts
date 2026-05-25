import type Anthropic from "@anthropic-ai/sdk";

/**
 * Project-local tool spec. The shape matches Anthropic's Messages API tool
 * format ({name, description, input_schema}) — when the project was on
 * OpenRouter via the OpenAI SDK there was a conversion layer here. Now that
 * we call Anthropic directly the conversion collapses to a pass-through,
 * but the helpers are kept so the call sites in client.ts stay symmetric
 * with Anthropic's stricter SDK types.
 */
export type ToolSpec = {
  name: string;
  description?: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type ToolChoice =
  | "auto"
  | "none"
  | { type: "tool"; name: string };

/** Narrow our project-local `ToolSpec` to the Anthropic SDK's `Tool` type. */
export function toAnthropicTool(t: ToolSpec): Anthropic.Tool {
  return {
    name: t.name,
    ...(t.description ? { description: t.description } : {}),
    input_schema: t.input_schema,
  };
}

/** Map our string-or-object `ToolChoice` to the Anthropic SDK union. */
export function toAnthropicToolChoice(
  c: ToolChoice,
): Anthropic.ToolChoice {
  if (c === "auto") return { type: "auto" };
  if (c === "none") return { type: "none" };
  return { type: "tool", name: c.name };
}
