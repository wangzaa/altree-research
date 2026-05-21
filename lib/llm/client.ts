import OpenAI from "openai";
import { getModelFor } from "@/lib/data/agent-models";
import type { AgentName } from "@/lib/schemas/agent-models";
import {
  toOpenAITool,
  toOpenAIToolChoice,
  type ToolChoice,
  type ToolSpec,
} from "./tool-format";

export type { ToolSpec, ToolChoice };

const DEFAULT_MAX_TOKENS = 4096;

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  _client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });
  return _client;
}

export type CreateMessageParams = {
  agent: AgentName;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools?: ToolSpec[];
  tool_choice?: ToolChoice;
  max_tokens?: number;
};

export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type CreateMessageResult = {
  text: string;
  tool_calls: ToolCall[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
  finish_reason: string | null;
  raw: unknown;
};

export async function createMessage(
  p: CreateMessageParams,
): Promise<CreateMessageResult> {
  const client = getClient();
  const model = getModelFor(p.agent);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: p.system },
    ...p.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
    {
      model,
      messages,
      max_tokens: p.max_tokens ?? DEFAULT_MAX_TOKENS,
    };
  if (p.tools && p.tools.length) {
    params.tools = p.tools.map(toOpenAITool);
  }
  if (p.tool_choice !== undefined) {
    params.tool_choice = toOpenAIToolChoice(p.tool_choice);
  }

  const res = await client.chat.completions.create(params);

  const choice = res.choices[0];
  const messageText =
    typeof choice.message.content === "string" ? choice.message.content : "";

  const tool_calls: ToolCall[] = [];
  const rawToolCalls = choice.message.tool_calls;
  if (rawToolCalls && Array.isArray(rawToolCalls)) {
    for (const tc of rawToolCalls) {
      if (tc.type !== "function") continue;
      let input: unknown;
      try {
        input = JSON.parse(tc.function.arguments);
      } catch {
        input = tc.function.arguments;
      }
      tool_calls.push({ id: tc.id, name: tc.function.name, input });
    }
  }

  return {
    text: messageText,
    tool_calls,
    usage: {
      input_tokens: res.usage?.prompt_tokens ?? 0,
      output_tokens: res.usage?.completion_tokens ?? 0,
    },
    model: res.model ?? model,
    finish_reason: choice.finish_reason ?? null,
    raw: res,
  };
}
