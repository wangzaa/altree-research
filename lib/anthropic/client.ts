import Anthropic from "@anthropic-ai/sdk";

export type AnthropicMessage = Anthropic.MessageParam;
export type AnthropicTool = Anthropic.Tool;
export type AnthropicToolUse = Anthropic.ToolUseBlock;
export type AnthropicTextBlockParam = Anthropic.TextBlockParam;
export type AnthropicContentBlock = Anthropic.ContentBlock;
export type AnthropicToolChoice = Anthropic.MessageCreateParams["tool_choice"];

export interface CreateMessageParams {
  model?: string;
  system: string | Anthropic.TextBlockParam[];
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  tool_choice?: Anthropic.MessageCreateParams["tool_choice"];
  max_tokens?: number;
  // Pass `null` to omit the param entirely. Required for models like
  // claude-opus-4-7 that reject any temperature value.
  temperature?: number | null;
}

export interface CreateMessageResult {
  content: Anthropic.ContentBlock[];
  stop_reason: Anthropic.Message["stop_reason"];
  usage: Anthropic.Message["usage"];
  raw: Anthropic.Message;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;

const globalForAnthropic = globalThis as unknown as {
  __anthropicClient?: Anthropic;
};

function getClient(): Anthropic {
  if (globalForAnthropic.__anthropicClient) {
    return globalForAnthropic.__anthropicClient;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  if (process.env.NODE_ENV !== "production") {
    globalForAnthropic.__anthropicClient = client;
  }
  return client;
}

export async function createMessage(
  params: CreateMessageParams,
): Promise<CreateMessageResult> {
  const client = getClient();
  const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
    model: params.model ?? DEFAULT_MODEL,
    max_tokens: params.max_tokens ?? DEFAULT_MAX_TOKENS,
    system: params.system,
    messages: params.messages,
  };
  // Pass temperature only when not explicitly nulled. Models like
  // claude-opus-4-7 reject any temperature value.
  const temp =
    params.temperature === undefined ? DEFAULT_TEMPERATURE : params.temperature;
  if (temp !== null) requestParams.temperature = temp;
  if (params.tools !== undefined) requestParams.tools = params.tools;
  if (params.tool_choice !== undefined) {
    requestParams.tool_choice = params.tool_choice;
  }
  const message = await client.messages.create(requestParams);
  return {
    content: message.content,
    stop_reason: message.stop_reason,
    usage: message.usage,
    raw: message,
  };
}
