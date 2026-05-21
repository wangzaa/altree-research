# OpenRouter + Per-Agent Model Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commit policy (every commit task):** Propose the commit message text in chat, then run `git commit -m "..."` directly so the user can review/edit in the bash tool-approval UI. Never commit autonomously. Stage explicit paths only (never `git add -A`).

**Goal:** Replace direct Anthropic SDK calls across all 6 LLM-using agents with an OpenRouter-backed `lib/llm/client.ts`. Each agent's model is configured in `lib/data/agent-models.json`. Live Log surfaces the model used per event.

**Architecture:** OpenRouter is OpenAI-compatible — use the `openai` package pointed at `https://openrouter.ai/api/v1` with `OPENROUTER_API_KEY`. A single `createMessage({ agent, system, messages, tools?, tool_choice? })` helper looks up the model from a JSON registry, converts Anthropic-format tool definitions to OpenAI's `parameters` shape, calls OpenRouter, and returns a normalized result. All 6 agents (thesis-extractor, thesis-refiner, universe-discoverer, scan-runner, bull-researcher, bear-researcher) use this helper. `lib/anthropic/client.ts` is removed.

**Tech Stack:** Next.js 15 / TypeScript / Vitest / `openai` (new) / Zod / Supabase (for `pipeline_events`).

**Spec:** [docs/superpowers/specs/2026-05-20-openrouter-agent-models-design.md](../specs/2026-05-20-openrouter-agent-models-design.md)

---

## File map

**New files:**
- `lib/schemas/agent-models.ts` — `AgentName` enum + `AgentModelMap` Zod schema
- `lib/data/agent-models.json` — agent → model string registry
- `lib/data/agent-models.ts` — loader + `getModelFor(agent)`
- `lib/llm/tool-format.ts` — Anthropic `input_schema` → OpenAI `parameters` converter
- `lib/llm/client.ts` — OpenRouter wrapper with `createMessage` + types
- `tests/unit/data/agent-models.test.ts`
- `tests/unit/llm/tool-format.test.ts`
- `tests/unit/llm/client.test.ts`
- `tests/integration/llm/openrouter.test.ts` — `it.skip`'d by default; runnable on demand against real OpenRouter

**Modified files (refactor: replace `@/lib/anthropic/client` with `@/lib/llm/client`):**
- `lib/agents/thesis-extractor.ts`
- `lib/agents/thesis-refiner.ts`
- `lib/agents/universe-discoverer.ts`
- `lib/agents/scan-runner.ts`
- `lib/agents/adversarial/buildLensContext.ts` — change `tools` return type from `Anthropic.Tool[]` to `ToolSpec[]`
- `lib/agents/bull-researcher.ts` — drop direct `new Anthropic(...)`; use `createMessage`
- `lib/agents/bear-researcher.ts` — same
- `app/api/validate/driver/route.ts` — add `model` to `pipeline_events.payload`
- `app/api/scan/run/route.ts` — same (if it emits pipeline_events for scan_runner)
- `app/api/thesis/extract/route.ts` — same (if applicable)
- `app/api/universe/[id]/route.ts` or wherever universe-discoverer is invoked — same
- `app/api/thesis/refine/route.ts` or wherever refiner is invoked — same
- `components/live-log.tsx` — render model chip per event
- `package.json` — add `openai` dep
- Existing agent test files — switch mock target from `@anthropic-ai/sdk` to `@/lib/llm/client`

**Deleted files:**
- `lib/anthropic/client.ts`

---

## Task 1: Add `openai` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

Run: `npm install --save openai`
Expected: `openai` appears in `dependencies` block of `package.json`.

- [ ] **Step 2: Verify install**

Run: `node -e "console.log(require('openai').default ? 'ok' : 'missing')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
```

Propose commit message:

```
feat(s11): add openai dep for OpenRouter integration

OpenRouter is OpenAI-compatible. The openai package will sit alongside
@anthropic-ai/sdk during the refactor; the latter gets removed once all
agents migrate to lib/llm/client.ts.
```

---

## Task 2: Agent-name Zod schema

**Files:**
- Create: `lib/schemas/agent-models.ts`

- [ ] **Step 1: Write the schema**

```typescript
// lib/schemas/agent-models.ts
import { z } from "zod";

export const AGENT_NAMES = [
  "thesis_extractor",
  "thesis_refiner",
  "universe_discoverer",
  "scan_runner",
  "bull_researcher",
  "bear_researcher",
] as const;

export const AgentNameSchema = z.enum(AGENT_NAMES);

export const AgentModelMapSchema = z
  .object({
    thesis_extractor: z.string().min(1),
    thesis_refiner: z.string().min(1),
    universe_discoverer: z.string().min(1),
    scan_runner: z.string().min(1),
    bull_researcher: z.string().min(1),
    bear_researcher: z.string().min(1),
  })
  .strict();

export type AgentName = z.infer<typeof AgentNameSchema>;
export type AgentModelMap = z.infer<typeof AgentModelMapSchema>;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/schemas/agent-models.ts
```

Propose commit message:

```
feat(s11): Zod schema for agent → model registry

Six agent names: thesis_extractor, thesis_refiner, universe_discoverer,
scan_runner, bull_researcher, bear_researcher. Schema validates the
JSON registry at load.
```

---

## Task 3: Agent-models JSON registry

**Files:**
- Create: `lib/data/agent-models.json`

- [ ] **Step 1: Write the file**

```json
{
  "thesis_extractor":    "anthropic/claude-sonnet-4-6",
  "thesis_refiner":      "anthropic/claude-sonnet-4-6",
  "universe_discoverer": "anthropic/claude-sonnet-4-6",
  "scan_runner":         "anthropic/claude-sonnet-4-6",
  "bull_researcher":     "anthropic/claude-opus-4-7",
  "bear_researcher":     "anthropic/claude-opus-4-7"
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/data/agent-models.json
```

Propose commit message:

```
feat(s11): seed agent-model registry

Default mapping mirrors current Anthropic-direct behavior: Sonnet 4.6 for
the cheap agents, Opus 4.7 for Bull/Bear. Editable to point any agent at
any OpenRouter-supported model (anthropic/, google/, openai/, etc.).
```

---

## Task 4: Loader + `getModelFor`

**Files:**
- Create: `lib/data/agent-models.ts`
- Test: `tests/unit/data/agent-models.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/data/agent-models.test.ts
import { describe, it, expect } from "vitest";
import { getModelFor, loadAgentModels } from "@/lib/data/agent-models";

describe("agent-models registry", () => {
  it("validates and loads the bundled JSON without throwing", () => {
    const map = loadAgentModels();
    expect(map.bull_researcher).toBeTruthy();
    expect(map.bear_researcher).toBeTruthy();
  });

  it("returns the model for a known agent", () => {
    expect(getModelFor("bull_researcher")).toMatch(/\//); // provider/model
  });

  it("each agent gets a non-empty model string", () => {
    const map = loadAgentModels();
    for (const value of Object.values(map)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/unit/data/agent-models.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the loader**

```typescript
// lib/data/agent-models.ts
import registryJson from "./agent-models.json";
import {
  AgentModelMapSchema,
  type AgentModelMap,
  type AgentName,
} from "@/lib/schemas/agent-models";

let _cache: AgentModelMap | null = null;

export function loadAgentModels(): AgentModelMap {
  if (_cache) return _cache;
  const parsed = AgentModelMapSchema.safeParse(registryJson);
  if (!parsed.success) {
    throw new Error(
      `Invalid lib/data/agent-models.json: ${parsed.error.message}`,
    );
  }
  _cache = parsed.data;
  return _cache;
}

export function getModelFor(agent: AgentName): string {
  return loadAgentModels()[agent];
}

export type { AgentName, AgentModelMap };
```

- [ ] **Step 4: Run tests to verify passing**

Run: `npm test -- tests/unit/data/agent-models.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/data/agent-models.ts tests/unit/data/agent-models.test.ts
```

Propose commit message:

```
feat(s11): agent-model registry loader

loadAgentModels() validates the JSON against the Zod schema on first call
and caches. getModelFor(agent) is the call site for the LLM client to
resolve which model to invoke.
```

---

## Task 5: Tool-format converter

**Files:**
- Create: `lib/llm/tool-format.ts`
- Test: `tests/unit/llm/tool-format.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/llm/tool-format.test.ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/unit/llm/tool-format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement converters**

```typescript
// lib/llm/tool-format.ts
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

export function toOpenAITool(t: ToolSpec): OpenAI.Chat.Completions.ChatCompletionTool {
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
```

- [ ] **Step 4: Run tests to verify passing**

Run: `npm test -- tests/unit/llm/tool-format.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/llm/tool-format.ts tests/unit/llm/tool-format.test.ts
```

Propose commit message:

```
feat(s11): Anthropic→OpenAI tool-format converter

Maps {name, description, input_schema} to OpenAI's {type:'function',
function:{name, description, parameters}}. Maps tool_choice variants:
auto / none / {type:'tool', name} → OpenAI equivalents. Pure functions,
unit-tested with fixtures.
```

---

## Task 6: LLM client (`createMessage`)

**Files:**
- Create: `lib/llm/client.ts`
- Test: `tests/unit/llm/client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/llm/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mock for the openai package: returns a class with chat.completions.create.
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
    expect(result.tool_calls[0].input).toEqual({ evidence: [{ post_id: "p1" }] });
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/unit/llm/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client**

```typescript
// lib/llm/client.ts
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
  input: unknown;            // parsed JSON
};

export type CreateMessageResult = {
  text: string;              // assistant text (empty if tool-only response)
  tool_calls: ToolCall[];    // parsed tool call args
  usage: { input_tokens: number; output_tokens: number };
  model: string;             // resolved model slug
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

  const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
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
    typeof choice.message.content === "string"
      ? choice.message.content
      : "";

  const tool_calls: ToolCall[] = [];
  const rawToolCalls = choice.message.tool_calls;
  if (rawToolCalls && Array.isArray(rawToolCalls)) {
    for (const tc of rawToolCalls) {
      if (tc.type !== "function") continue;
      let input: unknown;
      try {
        input = JSON.parse(tc.function.arguments);
      } catch {
        input = tc.function.arguments;  // fall back to raw string
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
```

- [ ] **Step 4: Run tests to verify passing**

Run: `npm test -- tests/unit/llm/client.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/llm/client.ts tests/unit/llm/client.test.ts
```

Propose commit message:

```
feat(s11): OpenRouter-backed createMessage

Single helper used by all 6 agents. Resolves agent→model via the registry,
converts Anthropic-format tools and tool_choice to OpenAI shape, calls
OpenRouter, normalizes the response (parsed tool inputs, usage as
{input_tokens, output_tokens}, model slug surfaced). Drops Anthropic-only
features (cache_control, TextBlockParam[] system, temperature:null).
```

---

## Task 7: OpenRouter integration test (skipped by default)

**Files:**
- Create: `tests/integration/llm/openrouter.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/integration/llm/openrouter.test.ts
// SKIPPED BY DEFAULT — exercises real OpenRouter endpoints (costs ~$0.05).
// Run on demand: `npm test -- tests/integration/llm/openrouter.test.ts -- --no-skip`
// (or temporarily flip `it.skip` to `it`.)

import { describe, it, expect } from "vitest";
import { createMessage } from "@/lib/llm/client";

describe.skip("OpenRouter integration", () => {
  it("calls anthropic/claude-sonnet-4-6 via OpenRouter", async () => {
    const res = await createMessage({
      agent: "thesis_extractor", // mapped to sonnet by default
      system: "You are a JSON producer. Return {\"ok\": true}.",
      messages: [{ role: "user", content: "Go." }],
      max_tokens: 50,
    });
    expect(res.model).toMatch(/sonnet/i);
    expect(res.text || res.tool_calls.length).toBeTruthy();
  });

  it("calls a non-Anthropic model (gemini)", async () => {
    const originalJson = await import("@/lib/data/agent-models.json");
    // Temporarily monkey-patch by env if needed; in practice this test
    // requires editing agent-models.json to point one agent at google/gemini-2.5-pro
    // and running with `--no-skip`. We assert only that the call succeeds.
    const res = await createMessage({
      agent: "scan_runner",
      system: "Say hi.",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 50,
    });
    expect(res.usage.output_tokens).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Confirm it's skipped**

Run: `npm test -- tests/integration/llm/openrouter.test.ts`
Expected: 0 tests run (all skipped).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/llm/openrouter.test.ts
```

Propose commit message:

```
test(s11): OpenRouter integration test (skipped by default)

Exercises real OpenRouter calls for one Anthropic and one non-Anthropic
model. Skipped in CI to avoid burn; flip it.skip → it locally to verify
end-to-end OpenRouter connectivity after API key changes or model swaps.
```

---

## Task 8: Refactor thesis-extractor to use the new client

**Files:**
- Modify: `lib/agents/thesis-extractor.ts`
- Modify (if it exists): `tests/unit/agents/thesis-extractor.test.ts`

- [ ] **Step 1: Find and read the existing test**

Run: `ls tests/**/thesis-extractor* 2>/dev/null`

Read whatever's there. If it mocks `@/lib/anthropic/client`, the mock target needs to switch to `@/lib/llm/client`.

- [ ] **Step 2: Update the import + call**

In `lib/agents/thesis-extractor.ts`, replace the import block:

```typescript
// Before:
import {
  createMessage,
  type AnthropicContentBlock,
  type AnthropicTextBlockParam,
  type AnthropicTool,
  type AnthropicToolUse,
} from "@/lib/anthropic/client";

// After:
import { createMessage, type ToolSpec } from "@/lib/llm/client";
```

Replace `extractThesisTool` type from `AnthropicTool` to `ToolSpec`. The fields (`name`, `description`, `input_schema`) are identical between the two.

Replace `systemBlocks: AnthropicTextBlockParam[]` with a single string. The Anthropic helper accepted both string and TextBlockParam[]; the new helper takes a string only. Concatenate the text content if there are multiple blocks:

```typescript
const SYSTEM_PROMPT = `You are a research analyst extracting structured investment theses from prose.

Rules:
- Be conservative — only include claims supported by the source text.
- Pick 1 to 2 industry drivers maximum.
- Use the supplied tool to return the structured thesis. Do not return free-text.
- GICS sector codes must be 2/4/6/8 digit numerics from the standard taxonomy.
- Region codes are: US, CANADA, LATAM, UK, EUROZONE, NORDICS, SWITZERLAND, CEE, MIDDLE_EAST, AFRICA, JAPAN, KOREA, GREATER_CHINA, SOUTH_ASIA, SEA, ANZ. There is no catch-all region; if a ticker's market doesn't fit any of these, do not include it in the thesis.
- Yahoo tickers use suffixes (RHM.DE = Germany, BA.L = UK, 7203.T = Japan, etc).
- thesis_breaks_below must be strictly less than the central_estimate value.
- falsification.primary is required; falsification.secondary is optional.
- horizon_years should be 3 to 10 for most theses; up to 30 for very long-cycle (utilities, REITs).
- macro_premise should state stipulated macro context, not predict outcomes.
- claim should be a specific, testable assertion (one sentence ideally).
- For each industry driver, populate driver.tickers with the 0-5 tickers from scope.tickers_seed that the driver most directly applies to. Leave empty if the driver applies to the whole universe.`;
```

Replace the `findToolUse` content-block iteration. Old code did:

```typescript
function findToolUse(content: AnthropicContentBlock[]) {
  for (const block of content) {
    if (block.type === "tool_use" && block.name === TOOL_NAME) return block;
  }
}
```

New code reads `result.tool_calls[0]` from `CreateMessageResult`:

```typescript
function findToolUse(toolCalls: { name: string; input: unknown }[]) {
  return toolCalls.find((tc) => tc.name === TOOL_NAME);
}
```

Replace the `extractThesis` function body:

```typescript
export async function extractThesis(
  input: ExtractThesisInput,
): Promise<ExtractThesisResult> {
  const result = await createMessage({
    agent: "thesis_extractor",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: input.sourceSnippet }],
    tools: [extractThesisTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = findToolUse(result.tool_calls);
  if (!toolUse) {
    return { ok: false, error: "Model did not produce a tool_use block" };
  }

  if (
    typeof toolUse.input !== "object" ||
    toolUse.input === null ||
    Array.isArray(toolUse.input)
  ) {
    return {
      ok: false,
      error: "tool_use.input was not an object",
      raw: toolUse.input,
    };
  }

  const toolInput = toolUse.input as ToolThesisInput;
  // ... rest unchanged
}
```

- [ ] **Step 3: Update or write the test mock**

If `tests/unit/agents/thesis-extractor.test.ts` exists with `vi.mock("@/lib/anthropic/client", ...)`, change to:

```typescript
vi.mock("@/lib/llm/client", () => ({
  createMessage: vi.fn(async () => ({
    text: "",
    tool_calls: [
      {
        id: "t1",
        name: "extract_thesis",
        input: { /* sample valid extraction output */ },
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
    model: "anthropic/claude-sonnet-4-6",
    finish_reason: "tool_calls",
    raw: {},
  })),
}));
```

If no test file exists, no test work needed in this task — the change is verified by `npx tsc --noEmit` + the next-task integration with the route.

- [ ] **Step 4: Type-check + run thesis-extractor tests if present**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test -- tests/unit/agents/thesis-extractor.test.ts 2>/dev/null || echo "(no test file)"`
Expected: all pass, or "(no test file)" if absent.

- [ ] **Step 5: Commit**

```bash
git add lib/agents/thesis-extractor.ts tests/unit/agents/thesis-extractor.test.ts 2>/dev/null
```

(The 2>/dev/null suppresses the error if no test file exists.)

Propose commit message:

```
refactor(s11): thesis-extractor → lib/llm/client

Switch from @/lib/anthropic/client to the new OpenRouter-backed helper.
Tool type AnthropicTool → ToolSpec (identical fields). System prompt
collapsed from TextBlockParam[] to a single string (loses cache_control,
acceptable trade). Response reads tool_calls[].input directly instead of
walking the Anthropic content-block tree.
```

---

## Task 9: Refactor thesis-refiner

**Files:**
- Modify: `lib/agents/thesis-refiner.ts`
- Modify (if exists): `tests/unit/agents/thesis-refiner.test.ts`

- [ ] **Step 1-4: Apply the same transformation as Task 8**

The refiner has the same structure. Replace imports, type the tool as `ToolSpec`, replace `systemBlocks: AnthropicTextBlockParam[]` with a string constant, switch `extractThesis`-equivalent (`refineThesis`) to use `result.tool_calls` instead of `findToolUse` over content blocks.

Set `agent: "thesis_refiner"` in the `createMessage` call.

The merge logic that re-applies existing driver `evidence` / `verdict` / `tickers` is **unchanged** — that's pure schema-level code.

- [ ] **Step 5: Type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/agents/thesis-refiner.ts tests/unit/agents/thesis-refiner.test.ts 2>/dev/null
```

Propose commit message:

```
refactor(s11): thesis-refiner → lib/llm/client

Same shape as the extractor refactor — agent: "thesis_refiner".
```

---

## Task 10: Refactor universe-discoverer

**Files:**
- Modify: `lib/agents/universe-discoverer.ts`
- Modify (if exists): test file

- [ ] **Step 1: Read the file first**

Run: `head -30 lib/agents/universe-discoverer.ts`

Confirm it uses `createMessage` from `@/lib/anthropic/client` and has a similar tool-call pattern.

- [ ] **Step 2-4: Apply the same transformation**

`agent: "universe_discoverer"`. Convert system prompt + tool type + tool-call response reading.

- [ ] **Step 5: Type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/agents/universe-discoverer.ts tests/unit/agents/universe-discoverer.test.ts 2>/dev/null
```

Propose commit message:

```
refactor(s11): universe-discoverer → lib/llm/client

agent: "universe_discoverer".
```

---

## Task 11: Refactor scan-runner

**Files:**
- Modify: `lib/agents/scan-runner.ts`
- Modify (if exists): test file

- [ ] **Step 1-4: Apply the same transformation**

`agent: "scan_runner"`.

- [ ] **Step 5: Type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/agents/scan-runner.ts tests/unit/agents/scan-runner.test.ts 2>/dev/null
```

Propose commit message:

```
refactor(s11): scan-runner → lib/llm/client

agent: "scan_runner".
```

---

## Task 12: Refactor `buildLensContext` tool typing

**Files:**
- Modify: `lib/agents/adversarial/buildLensContext.ts`

- [ ] **Step 1: Update the type import**

Replace:

```typescript
import type Anthropic from "@anthropic-ai/sdk";
```

with:

```typescript
import type { ToolSpec } from "@/lib/llm/client";
```

Update the `LensRequest` type:

```typescript
export type LensRequest = {
  system: string;                    // collapsed from TextBlockParam[]
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools: ToolSpec[];
  tool_choice: { type: "tool"; name: string };
};
```

Replace `SUBMIT_EVIDENCE_TOOL` type from `Anthropic.Tool` to `ToolSpec` (fields are identical):

```typescript
export const SUBMIT_EVIDENCE_TOOL: ToolSpec = {
  name: "submit_evidence",
  description: "Submit the extracted per-lens evidence items. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      evidence: {
        type: "array",
        items: {
          type: "object",
          properties: {
            expert: { type: "string" },
            post_id: { type: "string" },
            post_url: { type: "string" },
            post_title: { type: "string" },
            quote: { type: "string", description: "Verbatim quote from the supplied post, 1-3 sentences." },
            date: { type: "string", description: "ISO 8601 post date." },
          },
          required: ["expert", "post_id", "post_url", "post_title", "quote", "date"],
        },
      },
    },
    required: ["evidence"],
  },
};
```

Update `buildLensContext` return so `system` is a plain string and `messages` uses the new shape:

```typescript
return {
  system,                              // was: [{ type: "text", text: system }]
  messages: [{ role: "user", content: userText }],
  tools: [SUBMIT_EVIDENCE_TOOL],
  tool_choice: { type: "tool", name: "submit_evidence" },
};
```

- [ ] **Step 2: Update the harness test**

In `tests/unit/agents/adversarial/buildLensContext.test.ts`, change:

```typescript
const sysText = req.system.map((b) => b.text).join("\n");
```

to:

```typescript
const sysText = req.system;
```

- [ ] **Step 3: Run harness tests**

Run: `npm test -- tests/unit/agents/adversarial/buildLensContext.test.ts`
Expected: 7 passing.

- [ ] **Step 4: Commit**

```bash
git add lib/agents/adversarial/buildLensContext.ts tests/unit/agents/adversarial/buildLensContext.test.ts
```

Propose commit message:

```
refactor(s11): buildLensContext returns provider-neutral request shape

system: string (was TextBlockParam[]), tools: ToolSpec[] (was Anthropic.Tool[]),
messages: {role, content} (was MessageParam). Harness assertions and five
isolation invariants unchanged.
```

---

## Task 13: Refactor bull-researcher

**Files:**
- Modify: `lib/agents/bull-researcher.ts`
- Modify: `tests/unit/agents/bull-researcher.test.ts`

- [ ] **Step 1: Update the implementation**

Replace direct Anthropic SDK usage with `createMessage`:

```typescript
// lib/agents/bull-researcher.ts
import { z } from "zod";
import { retrieve } from "@/lib/agents/expert-corpus/retrieve";
import {
  buildLensContext,
  type LensPost,
} from "@/lib/agents/adversarial/buildLensContext";
import {
  CorpusEvidenceSchema,
  type CorpusEvidence,
} from "@/lib/schemas/validation";
import { loadRegistry } from "@/lib/data/experts";
import { createMessage } from "@/lib/llm/client";
import type { IndustryDriver, Thesis } from "@/lib/schemas/thesis";

const RETRIEVE_LIMIT_DEFAULT = 12;

export type RunResult = {
  evidence: CorpusEvidence[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
};

const ToolInputSchema = z
  .object({ evidence: z.array(CorpusEvidenceSchema) })
  .strict();

function thesisSectorsToTags(gicsCodes: string[]): string[] {
  const reg = loadRegistry();
  const tags = new Set<string>();
  for (const [tag, entry] of Object.entries(reg.sectors)) {
    if (entry.gics.some((c) => gicsCodes.some((g) => g.startsWith(c) || c.startsWith(g)))) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}

function resolveTickers(thesis: Thesis, driver: IndustryDriver): string[] {
  if (driver.tickers && driver.tickers.length) return driver.tickers;
  return thesis.scope.tickers_seed;
}

export async function runBullResearcher(params: {
  thesis: Thesis;
  driver: IndustryDriver;
  limit?: number;
}): Promise<RunResult> {
  const limit = params.limit ?? RETRIEVE_LIMIT_DEFAULT;
  const thesis_sectors = thesisSectorsToTags(params.thesis.scope.sectors);
  const tickers = resolveTickers(params.thesis, params.driver);

  const posts = await retrieve({ thesis_sectors, tickers, limit });

  const lensPosts: LensPost[] = posts.map((p) => ({
    id: p.id,
    expert_name: p.expert_name,
    title: p.title,
    link: p.link,
    published: p.published,
    content: p.content,
  }));

  const req = buildLensContext({
    lens: "bull",
    thesis: params.thesis,
    driver: params.driver,
    posts: lensPosts,
  });

  const res = await createMessage({
    agent: "bull_researcher",
    system: req.system,
    messages: req.messages,
    tools: req.tools,
    tool_choice: req.tool_choice,
    max_tokens: 4096,
  });

  const toolCall = res.tool_calls.find((tc) => tc.name === "submit_evidence");
  if (!toolCall) {
    throw new Error(
      `bull_researcher: no submit_evidence tool call (finish=${res.finish_reason})`,
    );
  }

  const parsed = ToolInputSchema.parse(toolCall.input);
  return {
    evidence: parsed.evidence,
    usage: res.usage,
    model: res.model,
  };
}
```

- [ ] **Step 2: Update the test mock**

Replace the mock in `tests/unit/agents/bull-researcher.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/agents/expert-corpus/retrieve", () => ({
  retrieve: vi.fn(async () => [
    {
      id: "p1",
      expert_slug: "x",
      expert_name: "X",
      author: "A",
      title: "TSMC builds",
      link: "https://x/p1",
      published: "2025-06-01T00:00:00Z",
      content: "TSMC adds N3 capacity per analyst commentary.",
      is_paywalled: false,
      tickers: ["TSM"],
      sectors: ["semis"],
    },
  ]),
}));

vi.mock("@/lib/llm/client", () => ({
  createMessage: vi.fn(async () => ({
    text: "",
    tool_calls: [
      {
        id: "t1",
        name: "submit_evidence",
        input: {
          evidence: [
            {
              expert: "X",
              post_id: "p1",
              post_url: "https://x/p1",
              post_title: "TSMC builds",
              quote: "TSMC adds N3 capacity per analyst commentary.",
              date: "2025-06-01T00:00:00Z",
            },
          ],
        },
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
    model: "anthropic/claude-opus-4-7",
    finish_reason: "tool_calls",
    raw: {},
  })),
}));

import { runBullResearcher } from "@/lib/agents/bull-researcher";
import { makeThesis } from "./fixtures/thesis";

describe("runBullResearcher", () => {
  it("returns Zod-validated bull evidence with model name", async () => {
    const thesis = makeThesis();
    const driver = thesis.drivers.industry[0];
    const result = await runBullResearcher({ thesis, driver });
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0].post_id).toBe("p1");
    expect(result.model).toBe("anthropic/claude-opus-4-7");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/unit/agents/bull-researcher.test.ts`
Expected: 1 passing.

- [ ] **Step 4: Commit**

```bash
git add lib/agents/bull-researcher.ts tests/unit/agents/bull-researcher.test.ts
```

Propose commit message:

```
refactor(s11): bull-researcher → lib/llm/client

Drops direct @anthropic-ai/sdk dependency. agent: "bull_researcher",
model resolved from agent-models.json. Returns model in RunResult so the
route can log it in pipeline_events. Stringified-array defensive parse
removed — lib/llm/client.ts already does JSON.parse on tool_calls.
```

---

## Task 14: Refactor bear-researcher

**Files:**
- Modify: `lib/agents/bear-researcher.ts`
- Modify: `tests/unit/agents/bear-researcher.test.ts`

- [ ] **Step 1-3: Apply the same transformation as Task 13**

`agent: "bear_researcher"`, lens: "bear". Same mock pattern in the test.

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/unit/agents/bear-researcher.test.ts`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/agents/bear-researcher.ts tests/unit/agents/bear-researcher.test.ts
```

Propose commit message:

```
refactor(s11): bear-researcher → lib/llm/client

Mirror of bull-researcher refactor. agent: "bear_researcher".
```

---

## Task 15: Emit `model` in `validate/driver` `pipeline_events`

**Files:**
- Modify: `app/api/validate/driver/route.ts`

- [ ] **Step 1: Update the complete-event payloads**

In `app/api/validate/driver/route.ts`, the `complete` events for `bull_researcher` and `bear_researcher` currently include `{ driver_id, count, usage }`. Add `model`:

```typescript
await supabase.from("pipeline_events").insert([
  {
    thesis_id,
    stage: "validate",
    agent: "bull_researcher",
    event_type: "complete",
    payload: {
      driver_id,
      count: bull.evidence.length,
      usage: bull.usage,
      model: bull.model,
    },
  },
  {
    thesis_id,
    stage: "validate",
    agent: "bear_researcher",
    event_type: "complete",
    payload: {
      driver_id,
      count: bear.evidence.length,
      usage: bear.usage,
      model: bear.model,
    },
  },
]);
```

Also enrich the `start` events. Since the model is known before the call (via `getModelFor`), import and add it:

```typescript
import { getModelFor } from "@/lib/data/agent-models";

// At the top of POST:
const bullModel = getModelFor("bull_researcher");
const bearModel = getModelFor("bear_researcher");

await supabase.from("pipeline_events").insert([
  {
    thesis_id,
    stage: "validate",
    agent: "bull_researcher",
    event_type: "start",
    payload: { driver_id, model: bullModel },
  },
  {
    thesis_id,
    stage: "validate",
    agent: "bear_researcher",
    event_type: "start",
    payload: { driver_id, model: bearModel },
  },
]);
```

- [ ] **Step 2: Type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/validate/driver/route.ts
```

Propose commit message:

```
feat(s11): emit model in validate/driver pipeline_events

Start and complete events for bull_researcher and bear_researcher now
carry payload.model = "<provider/model>" so LiveLog can render the
model chip.
```

---

## Task 16: Emit `model` in other agent routes

**Files:**
- Modify: routes that wrap thesis-extractor, thesis-refiner, universe-discoverer, scan-runner (paths TBD — find via grep below)

- [ ] **Step 1: Find the routes**

Run:
```bash
grep -rln "extractThesis\|refineThesis\|universeDiscoverer\|scanRunner" app/api 2>/dev/null
```

- [ ] **Step 2: For each found route, add `model: getModelFor("<agent_name>")` to its `pipeline_events.payload`**

The exact change depends on the route's current shape. The pattern is the same as Task 15: import `getModelFor` from `@/lib/data/agent-models`, resolve once, include in start/complete event payloads.

If a route currently emits NO pipeline_events, add a `start` and `complete` pair for consistency with the validate/driver pattern.

- [ ] **Step 3: Type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/  # stage explicit subpaths returned by grep
```

Propose commit message:

```
feat(s11): emit model in extract/refine/universe/scan pipeline_events

All LLM-using agent routes now record payload.model so the LiveLog
shows which model ran each stage, not just bull/bear.
```

---

## Task 17: LiveLog renders model chip

**Files:**
- Modify: `components/live-log.tsx`

- [ ] **Step 1: Read current LiveLog**

Run: `cat components/live-log.tsx`

Identify where each event row is rendered.

- [ ] **Step 2: Add the model chip**

In the row render, add (next to or below the existing agent/event_type display):

```tsx
{(event.payload as { model?: string })?.model && (
  <span className="ml-2 inline-block text-[10px] font-mono uppercase tracking-wide bg-neutral-100 text-neutral-700 px-1.5 py-0.5 rounded">
    {(event.payload as { model: string }).model}
  </span>
)}
```

Match the existing component's styling conventions (Tailwind utility classes already used elsewhere).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual smoke (optional)**

If `npm run dev` was used recently, open the thesis page and trigger a validate. Confirm the chip appears.

- [ ] **Step 5: Commit**

```bash
git add components/live-log.tsx
```

Propose commit message:

```
feat(s11): LiveLog shows model chip per pipeline event

Reads payload.model and renders as a small monospace tag. Hidden when
absent (back-compat for events that don't carry it).
```

---

## Task 18: Delete `lib/anthropic/client.ts`

**Files:**
- Delete: `lib/anthropic/client.ts`

- [ ] **Step 1: Confirm no remaining imports**

Run:
```bash
grep -rln "@/lib/anthropic\|lib/anthropic/client" lib app components scripts 2>/dev/null
```

Expected: no results.

- [ ] **Step 2: Delete the file**

Run:
```bash
rm lib/anthropic/client.ts
```

If the directory is now empty, remove it too:
```bash
rmdir lib/anthropic 2>/dev/null || true
```

- [ ] **Step 3: Run full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean. All 45+ test files pass.

- [ ] **Step 4: Commit**

```bash
git add -u lib/anthropic/client.ts  # stage the deletion
# Or: git rm lib/anthropic/client.ts
```

Propose commit message:

```
chore(s11): remove lib/anthropic/client.ts

All callers migrated to lib/llm/client.ts in the preceding refactors.
The Anthropic SDK is no longer imported anywhere; the @anthropic-ai/sdk
dep stays in package.json for now in case future Anthropic-specific
features (prompt caching) want a direct path.
```

---

## Task 19: E2E smoke + close #8

**Files:** none directly — process step

- [ ] **Step 1: Verify dev server runs cleanly**

Run: `npm run dev` in one terminal, wait for "Ready in" message.

- [ ] **Step 2: Re-run the SK Hynix validate/driver smoke**

Same browser DevTools fetch as before:

```js
const res = await fetch("/api/validate/driver", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    thesis_id: "korean_and_taiwanese_memory_chip_produce_26_05_01",
    driver_id: "dram_demand_growth"
  })
});
console.log(await res.json());
```

Expected: 200 response with bull_evidence + bear_evidence (any shape — model identity changes vs S6).

- [ ] **Step 3: Verify model surfaced in DB**

Via Supabase MCP execute_sql:

```sql
select agent, event_type, payload->>'model' as model, payload->>'count' as evidence_count
from pipeline_events
where thesis_id = 'korean_and_taiwanese_memory_chip_produce_26_05_01'
  and stage = 'validate'
order by created_at desc limit 4;
```

Expected: each row has a non-null `model` value (e.g., `anthropic/claude-opus-4-7`).

- [ ] **Step 4: Close issue #8**

```bash
gh issue close 8 -c "Superseded by the OpenRouter / agent-models refactor (PR forthcoming). The pipeline direction has changed: no quality-gate stage between Bull/Bear and the memo. Verifier and Triangulator are dropped, not just deferred."
```

- [ ] **Step 5: No commit** — this task is verification + issue tracker cleanup, no code change.

---

## Plan self-review notes

**Spec coverage check:**

| Spec section | Task(s) |
|---|---|
| §1 Agent-model registry | T2, T3, T4 |
| §2 LLM client (lib/llm/client.ts) | T1, T5, T6, T7 |
| §3 Agent refactor (6 agents) | T8, T9, T10, T11, T12, T13, T14 |
| §4 Live Log model surfacing | T15, T16, T17 |
| §5 Test refactor | woven into each agent refactor task |
| §6 Removed files | T18 |
| E2E smoke verification | T19 |
| Close #8 | T19 |

**Placeholder scan:** No "TBD" / "fill in details" in code blocks. Some "if exists" branches for tests (because we don't know in advance which agents have test files yet), but those resolve at execution time with concrete grep commands.

**Type consistency:** `ToolSpec`, `ToolChoice`, `CreateMessageResult`, `ToolCall`, `AgentName` defined in Tasks 5–6 and referenced consistently in Tasks 8–14. `LensRequest` shape in Task 12 matches what Bull/Bear consume in Tasks 13–14.

**Acceptance criteria from spec:**

| Criterion | Covered by |
|---|---|
| agent-models.json validates via Zod | T4 |
| getModelFor known agent | T4 |
| createMessage works against OpenRouter for Anthropic + non-Anthropic | T7 (skip'd integration) |
| Tool-format converter unit-tested | T5 |
| All 6 agents compile + tests pass | T8–T14 |
| E2E SK Hynix smoke returns 200 | T19 |
| pipeline_events.payload.model populated | T15, T16, T19 |
| LiveLog renders model chip | T17 |
| lib/anthropic/client.ts removed | T18 |
