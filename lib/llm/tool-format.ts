import type OpenAI from "openai";

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

export function toOpenAITool(
  t: ToolSpec,
): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      parameters: t.input_schema as Record<string, unknown>,
    },
  };
}

export function toOpenAIToolChoice(
  c: ToolChoice,
): OpenAI.Chat.Completions.ChatCompletionToolChoiceOption {
  if (c === "auto" || c === "none") return c;
  return { type: "function", function: { name: c.name } };
}
