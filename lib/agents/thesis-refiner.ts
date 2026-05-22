import { createMessage, type ToolSpec } from "@/lib/llm/client";
import { REGION_VALUES } from "@/lib/data/regions";
import { ThesisSchema, type Thesis } from "@/lib/schemas/thesis";

export interface RefineThesisInput {
  current: Thesis;
  instruction: string;
}

export type RefineThesisResult =
  | {
      ok: true;
      thesis: Thesis;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    }
  | { ok: false; error: string; raw?: unknown };

const TOOL_NAME = "propose_thesis";

const refineThesisTool: ToolSpec = {
  name: TOOL_NAME,
  description:
    "Return a structured investment thesis that incorporates the analyst's instruction. Only call this tool. Do not return free-text.",
  input_schema: {
    type: "object",
    properties: {
      claim: { type: "string" },
      macro_premise: { type: "string" },
      horizon_years: { type: "integer", minimum: 1, maximum: 30 },
      scope: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["thematic", "single_name"] },
          sectors: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
          regions: {
            type: "array",
            items: { type: "string", enum: [...REGION_VALUES] },
            minItems: 1,
          },
          market_cap_min_usd: { type: "number", minimum: 0 },
          tickers_seed: { type: "array", items: { type: "string" } },
          tickers_exclude: { type: "array", items: { type: "string" } },
        },
        required: [
          "type",
          "sectors",
          "regions",
          "market_cap_min_usd",
          "tickers_seed",
          "tickers_exclude",
        ],
      },
      drivers: {
        type: "object",
        properties: {
          industry: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                claim: { type: "string" },
                central_estimate: {
                  type: "object",
                  properties: {
                    value: { type: "number" },
                    unit: { type: "string" },
                  },
                  required: ["value", "unit"],
                },
                thesis_breaks_below: { type: "number" },
                tickers: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Per-driver ticker scope. Subset of scope.tickers_seed. Preserve unless the instruction asks to change it.",
                },
                classification: { type: "string", enum: ["industry"] },
              },
              required: [
                "id",
                "claim",
                "central_estimate",
                "thesis_breaks_below",
                "classification",
              ],
            },
          },
        },
        required: ["industry"],
      },
      falsification: {
        type: "object",
        properties: {
          primary: { type: "string" },
          secondary: { type: "string" },
        },
        required: ["primary"],
      },
      universe_id: { type: "string" },
    },
    required: [
      "claim",
      "macro_premise",
      "horizon_years",
      "scope",
      "drivers",
      "falsification",
      "universe_id",
    ],
  },
};

const SYSTEM_PROMPT = `You are a research analyst refining an existing investment thesis.

You receive the current thesis as JSON and an instruction from the analyst. Propose a new thesis that applies ONLY the change the instruction asks for. Leave every other field exactly as it was.

Rules:
- Be conservative — only change what the instruction explicitly requests.
- Preserve all driver \`id\` fields. Do not rename, reorder, or replace driver ids.
- GICS sector codes must be 2/4/6/8 digit numerics from the standard taxonomy.
- Region codes are: US, CANADA, LATAM, UK, EUROZONE, NORDICS, SWITZERLAND, CEE, MIDDLE_EAST, AFRICA, JAPAN, KOREA, GREATER_CHINA, SOUTH_ASIA, SEA, ANZ. There is no catch-all region; if a ticker's market doesn't fit any of these, do not include it in the thesis.
- Yahoo tickers use suffixes (RHM.DE = Germany, BA.L = UK, 7203.T = Japan, etc).
- thesis_breaks_below must remain strictly less than the central_estimate value.
- falsification.primary is required; falsification.secondary is optional.
- horizon_years should remain in the existing range unless the instruction asks to change it.
- Per-driver tickers[] is a subset of scope.tickers_seed; preserve it unless the instruction asks to change it (e.g., "add ASML to M1's tickers" or "drop NVDA from M2").
- Return the full new thesis via the supplied tool. Do not return free-text.`;

interface ToolDriverInput {
  id: string;
  claim: string;
  central_estimate: { value: number; unit: string };
  thesis_breaks_below: number;
  tickers?: string[];
  classification: "industry";
}

interface ToolThesisInput {
  claim: string;
  macro_premise: string;
  horizon_years: number;
  scope: unknown;
  drivers: { industry: ToolDriverInput[] };
  falsification: { primary: string; secondary?: string };
  universe_id: string;
}

function buildUserMessage(current: Thesis, instruction: string): string {
  return `Current thesis:
\`\`\`json
${JSON.stringify(current, null, 2)}
\`\`\`

Instruction: ${instruction}`;
}

export async function refineThesis(
  input: RefineThesisInput,
): Promise<RefineThesisResult> {
  const result = await createMessage({
    agent: "thesis_refiner",
    system: SYSTEM_PROMPT,
    tools: [refineThesisTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: buildUserMessage(input.current, input.instruction),
      },
    ],
  });

  const toolCall = result.tool_calls.find((tc) => tc.name === TOOL_NAME);
  if (!toolCall) {
    return {
      ok: false,
      error: "Model did not produce a propose_thesis tool_use block",
    };
  }
  if (
    typeof toolCall.input !== "object" ||
    toolCall.input === null ||
    Array.isArray(toolCall.input)
  ) {
    return {
      ok: false,
      error: "tool_use.input was not an object",
      raw: toolCall.input,
    };
  }

  const toolInput = toolCall.input as ToolThesisInput;
  const driversInput = toolInput.drivers?.industry ?? [];

  // Envelope fields are restored from caller's current — defense in depth.
  const merged = {
    id: input.current.id,
    version: input.current.version,
    createdAt: input.current.createdAt,
    createdBy: input.current.createdBy,
    source_snippet: input.current.source_snippet,
    claim: toolInput.claim,
    macro_premise: toolInput.macro_premise,
    horizon_years: toolInput.horizon_years,
    scope: toolInput.scope,
    drivers: {
      industry: driversInput.map((d) => {
        const existing = input.current.drivers.industry.find(
          (cur) => cur.id === d.id,
        );
        return {
          ...d,
          evidence: existing?.evidence ?? [],
          verdict: existing?.verdict ?? null,
        };
      }),
    },
    falsification: toolInput.falsification,
    universe_id: toolInput.universe_id,
    validation: input.current.validation,
  };

  const parsed = ThesisSchema.safeParse(merged);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.message,
      raw: toolCall.input,
    };
  }
  return {
    ok: true,
    thesis: parsed.data,
    model: result.model,
    usage: result.usage,
  };
}
