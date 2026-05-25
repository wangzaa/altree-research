import Anthropic from "@anthropic-ai/sdk";
import { getModelFor } from "@/lib/data/agent-models";
import type { AgentName } from "@/lib/schemas/agent-models";
import {
  toAnthropicTool,
  toAnthropicToolChoice,
  type ToolChoice,
  type ToolSpec,
} from "./tool-format";

export type { ToolSpec, ToolChoice };

const DEFAULT_MAX_TOKENS = 4096;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  _client = new Anthropic({ apiKey });
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

/**
 * Single entry point for every agent call. Resolves the agent → model
 * mapping from `lib/data/agent-models.json` and dispatches to the
 * Anthropic Messages API. Returns a small, lens-agnostic result shape so
 * agent code doesn't need to know about content-block unions.
 */
export async function createMessage(
  p: CreateMessageParams,
): Promise<CreateMessageResult> {
  const client = getClient();
  const model = getModelFor(p.agent);

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: p.max_tokens ?? DEFAULT_MAX_TOKENS,
    system: p.system,
    messages: p.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (p.tools && p.tools.length) {
    params.tools = p.tools.map(toAnthropicTool);
  }
  if (p.tool_choice !== undefined) {
    params.tool_choice = toAnthropicToolChoice(p.tool_choice);
  }

  const res = await client.messages.create(params);

  // Concatenate every text block; aggregate every tool_use block. The SDK
  // already parses tool_use.input as an object, so no JSON.parse here.
  let text = "";
  const tool_calls: ToolCall[] = [];
  for (const block of res.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use") {
      tool_calls.push({ id: block.id, name: block.name, input: block.input });
    }
  }

  return {
    text,
    tool_calls,
    usage: {
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
    },
    model: res.model,
    finish_reason: res.stop_reason,
    raw: res,
  };
}
