# OpenRouter LLM Backend + Per-Agent Model Config — Design

**Date:** 2026-05-20
**Closes:** GitHub issue #8 (S7 Verifier + Triangulator) — superseded; quality-gate stage dropped from the pipeline direction.
**Defers:** GitHub issue #11 (S10 Screener), GitHub issue #12 (S11 LLM notes / cost cap / live log) — replaced by this leaner scope.
**Parent:** GitHub issue #1.
**Predecessor in same direction:** PR #19 (S6 Expert-corpus Stage 4).

## Why this exists

S6 wired Bull and Bear to `claude-opus-4-7` exclusively. Two motivations to broaden:

1. **Adversarial diversity.** Running Bull on Gemini 2.5 Pro and Bear on Claude Opus 4.7 (or any combination) gets meaningful model heterogeneity. Same-model adversarial setups can converge to similar reasoning patterns; cross-model setups can't.
2. **Cost / capability tuning per agent.** The cheap stages (thesis-extractor, universe-discoverer, scan-runner) don't need Opus. Pinning each agent to its own model lets us pick the cheapest model that still gets the job done.

OpenRouter is the cheapest path to multi-provider access: one API, OpenAI-compatible, supports Anthropic / Google / OpenAI / Llama under provider-prefixed model strings. `OPENROUTER_API_KEY` is already present in `.env`.

## Scope

**In:**
- `lib/data/agent-models.json` registry mapping agent → OpenRouter model string.
- `lib/llm/client.ts` — new OpenRouter wrapper with provider-agnostic `createMessage` interface.
- Tool-format conversion helper (Anthropic `input_schema` → OpenAI `parameters`).
- Refactor of all 6 LLM-using agents to use the new client.
- Removal of `lib/anthropic/client.ts` and the direct `@anthropic-ai/sdk` calls in `bull-researcher.ts` / `bear-researcher.ts`.
- `pipeline_events.payload.model` populated on every LLM-event row.
- `components/live-log.tsx` renders the model chip per event.

**Out (deferred or dropped):**
- Model-selection UI (the user explicitly chose JSON config over a dropdown).
- Cost cap / cost instrumentation (no `cost_usd` field; not in this cycle).
- S10 screener.
- LLM notes column.
- Pear design system retrofit + top-pipeline layout (Cycle 2).
- Verifier + Triangulator (issue #8 closed as superseded — no quality-gate stage).
- Anthropic prompt-caching (`cache_control: { type: "ephemeral" }`) — does not translate across providers; dropped. Cost impact negligible at current volume.

## Components

### 1. Agent-model registry

`lib/data/agent-models.json`:

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

Zod schema in `lib/schemas/agent-models.ts`:

```typescript
export const AgentNameSchema = z.enum([
  "thesis_extractor",
  "thesis_refiner",
  "universe_discoverer",
  "scan_runner",
  "bull_researcher",
  "bear_researcher",
]);
export const AgentModelMapSchema = z.record(AgentNameSchema, z.string().min(1));
```

Loader `lib/data/agent-models.ts`:

```typescript
export function getModelFor(agent: AgentName): string;
```

Loads + validates JSON on first call, caches. Throws if an agent is missing from the JSON.

### 2. LLM client — `lib/llm/client.ts`

Replaces `lib/anthropic/client.ts`. Uses the official `openai` package pointed at OpenRouter's base URL.

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

export type ToolSpec = {
  name: string;
  description?: string;
  // Anthropic-format input_schema; converted internally.
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type CreateMessageParams = {
  agent: AgentName;                          // model lookup key
  system: string;                            // single-string system prompt (drops cache_control)
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools?: ToolSpec[];
  tool_choice?: { type: "tool"; name: string };  // forces this tool
  max_tokens?: number;
};

export type CreateMessageResult = {
  text: string;                              // assistant text content (empty if tool-only)
  tool_calls: Array<{ name: string; input: unknown }>;  // parsed args
  usage: { input_tokens: number; output_tokens: number };
  model: string;                             // resolved model slug
  raw: unknown;                              // full OpenAI response
};

export async function createMessage(p: CreateMessageParams): Promise<CreateMessageResult>;
```

Internally:
1. `model = getModelFor(p.agent)`
2. Convert tools: `{ name, description, input_schema } → { type: "function", function: { name, description, parameters: input_schema } }`
3. Convert tool_choice: `{ type: "tool", name } → { type: "function", function: { name } }`
4. Build OpenAI-format messages: `[{ role: "system", content: p.system }, ...p.messages]`
5. Call `client.chat.completions.create({ model, messages, tools, tool_choice, max_tokens })`
6. Normalize response: extract text from `choices[0].message.content`; parse each `tool_calls[].function.arguments` string with `JSON.parse`; package into a stable shape.

**Anthropic-only features explicitly dropped:**
- Ephemeral prompt caching (cache_control).
- TextBlockParam array system prompts. System is a single string only.
- `temperature: null` quirk (OpenAI accepts temperature for all models).

### 3. Agent refactor

Six agents, each switches from `lib/anthropic/client.ts` (or direct SDK) to `lib/llm/client.ts`:

| Agent | Pre-refactor | Post-refactor |
|---|---|---|
| `thesis-extractor.ts` | `createMessage` from anthropic helper | `createMessage` from llm helper, `agent: "thesis_extractor"` |
| `thesis-refiner.ts` | same | `agent: "thesis_refiner"` |
| `universe-discoverer.ts` | same | `agent: "universe_discoverer"` |
| `scan-runner.ts` | same | `agent: "scan_runner"` |
| `bull-researcher.ts` | direct `new Anthropic(...)` | `createMessage`, `agent: "bull_researcher"` |
| `bear-researcher.ts` | direct `new Anthropic(...)` | `createMessage`, `agent: "bear_researcher"` |

Each agent updates its tool-call response handling: where it previously inspected `content[].type === "tool_use"`, it now reads `result.tool_calls[0].input` from the normalized helper.

**`buildLensContext` (Bull/Bear harness) requires a small interface change** — it returns `{ system, messages, tools, tool_choice }`. The `tools` field today is `Anthropic.Tool[]`. After this refactor it returns the `ToolSpec[]` defined above, which is Anthropic-format internally and gets converted by the helper. **The harness assertions are unchanged** (system-prompt disallow check, corpus-content disallow check, priorEvidence lens-match, thesis_id match).

### 4. Live Log model surfacing

Every LLM-emitting agent currently writes `pipeline_events` rows with `event_type: "start" | "complete" | "error"`. Extend the `payload` for LLM events:

- `start` event: include `payload.model = "<provider/model>"` and `payload.agent` (already there).
- `complete` event: include `payload.model`, `payload.usage`, `payload.elapsed_ms`.

The route currently emits these for `bull_researcher` and `bear_researcher`. We extend the pattern to thesis-extractor, refiner, universe-discoverer, scan-runner where they don't already emit. (For the existing emitters, just add `model` to the payload.)

`components/live-log.tsx` already subscribes to `pipeline_events` via Realtime. Add a model chip render:

```tsx
{event.payload.model && (
  <span className="text-xs font-mono bg-neutral-100 px-1.5 py-0.5 rounded">
    {event.payload.model}
  </span>
)}
```

No new tables, no new RLS — the publication is already enabled in `0001_init.sql`.

### 5. Test refactor

Existing tests mock `@anthropic-ai/sdk` directly (Bull/Bear) or pass through `createMessage` (extractor/refiner). After refactor:

- Bull/Bear tests: replace `vi.mock("@anthropic-ai/sdk", ...)` with `vi.mock("@/lib/llm/client", ...)` returning a normalized `{ tool_calls: [...] }` shape.
- Extractor/refiner tests: same — mock at `@/lib/llm/client` module boundary.
- `buildLensContext` tests: unchanged (don't touch the LLM layer).

### 6. Removed files

- `lib/anthropic/client.ts` — deleted.
- `@anthropic-ai/sdk` dep — can stay in `package.json` (used by 0 files after refactor; removing it is optional but recommended for cleanliness).

## Acceptance criteria

- [ ] `lib/data/agent-models.json` validates against the Zod schema. All 6 agent names present.
- [ ] `getModelFor("bull_researcher")` returns the JSON value; throws for an unknown agent name.
- [ ] `lib/llm/client.ts` `createMessage` produces a working response against OpenRouter for each of: `anthropic/claude-sonnet-4-6`, `anthropic/claude-opus-4-7`, plus one non-Anthropic model (e.g. `google/gemini-2.5-pro`) — proven via a small integration test that's `it.skip`'d by default and runnable on demand.
- [ ] Tool-format converter: given a sample Anthropic-format `input_schema`, returns the equivalent OpenAI `parameters` object. Unit-tested with 3 fixtures.
- [ ] All 6 agents compile + their existing unit tests pass with the new client.
- [ ] Re-running the SK Hynix e2e smoke (the same call from the S6-new T22 step) returns 200 with bull + bear evidence; `validation_runs.results.dram_demand_growth` is populated.
- [ ] `pipeline_events.payload.model` populated on every LLM `start` and `complete` event written by the 6 agents.
- [ ] LiveLog renders the model chip on each event when streaming.
- [ ] `lib/anthropic/client.ts` is removed from the tree; no file imports `@anthropic-ai/sdk` anymore.

## Out-of-scope (deferred)

- **Pear design system + top-pipeline layout** — Cycle 2 (separate spec).
- **Model-selection UI** — explicitly traded for JSON config.
- **Cost cap / spend instrumentation** — defer until needed.
- **S10 screener / S11 LLM notes** — deferred indefinitely; pipeline direction has shifted away from a numerical screener stage.
- **Verifier + Triangulator** — issue #8 closed as superseded; the new pipeline ends Stage 4 with raw Bull + Bear evidence and proceeds to the memo (eventual Cycle 2 work).

## References

- Predecessor PR (S6 Expert-corpus Stage 4): #19
- OpenRouter API docs: https://openrouter.ai/docs (OpenAI-compatible)
- Pear design system (Cycle 2 input): `/Users/neo/Desktop/design/pear-design-system/SKILL.md`
