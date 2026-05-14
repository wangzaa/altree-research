import {
  createMessage,
  type AnthropicContentBlock,
  type AnthropicTextBlockParam,
  type AnthropicTool,
  type AnthropicToolUse,
} from "@/lib/anthropic/client";
import { ThesisSchema, type Thesis } from "@/lib/schemas/thesis";

export interface ExtractThesisInput {
  sourceSnippet: string;
  id: string;
  createdBy: string;
  createdAt: string;
}

export type ExtractThesisResult =
  | { ok: true; thesis: Thesis }
  | { ok: false; error: string; raw?: unknown };

const REGION_VALUES = [
  "US",
  "UK",
  "EUROZONE",
  "NON_EZ_DM_EU",
  "JAPAN",
  "ASIA_DM",
  "ASIA_EM",
  "AMERICAS_NON_US",
  "ANZ_DM",
] as const;

const TOOL_NAME = "extract_thesis";

const extractThesisTool: AnthropicTool = {
  name: TOOL_NAME,
  description:
    "Return a structured investment thesis extracted from the supplied prose. Only call this tool. Do not return free-text.",
  input_schema: {
    type: "object",
    properties: {
      claim: {
        type: "string",
        description: "Specific, testable assertion (one sentence ideally).",
      },
      macro_premise: {
        type: "string",
        description:
          "Stipulated macro context the thesis sits inside. Not a prediction.",
      },
      horizon_years: {
        type: "integer",
        minimum: 1,
        maximum: 30,
        description:
          "Investment horizon in years. 3-10 for most theses; up to 30 for long-cycle (utilities, REITs).",
      },
      scope: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["thematic", "single_name"] },
          sectors: {
            type: "array",
            items: {
              type: "string",
              description:
                "GICS sector code: 2/4/6/8 digit numeric string from the standard taxonomy.",
            },
            minItems: 1,
          },
          regions: {
            type: "array",
            items: { type: "string", enum: [...REGION_VALUES] },
            minItems: 1,
          },
          market_cap_min_usd: { type: "number", minimum: 0 },
          tickers_seed: {
            type: "array",
            items: {
              type: "string",
              description:
                "Yahoo Finance ticker with suffix where applicable (RHM.DE, BA.L, 7203.T).",
            },
          },
          tickers_exclude: {
            type: "array",
            items: { type: "string" },
          },
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
                    unit: {
                      type: "string",
                      description:
                        "Free-form unit: 'years', 'pct', 'bps', 'x', 'usd_bn', etc.",
                    },
                  },
                  required: ["value", "unit"],
                },
                thesis_breaks_below: {
                  type: "number",
                  description:
                    "Strictly less than central_estimate.value. Drives the falsification trigger.",
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
      universe_id: {
        type: "string",
        description:
          "Slug for the investable universe, typically '<slug>_global'.",
      },
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

const systemBlocks: AnthropicTextBlockParam[] = [
  {
    type: "text",
    text: `You are a research analyst extracting structured investment theses from prose.

Rules:
- Be conservative — only include claims supported by the source text.
- Pick 1 to 2 industry drivers maximum.
- Use the supplied tool to return the structured thesis. Do not return free-text.
- GICS sector codes must be 2/4/6/8 digit numerics from the standard taxonomy.
- Region codes are: US, UK, EUROZONE, NON_EZ_DM_EU, JAPAN, ASIA_DM, ASIA_EM, AMERICAS_NON_US, ANZ_DM.
- Yahoo tickers use suffixes (RHM.DE = Germany, BA.L = UK, 7203.T = Japan, etc).
- thesis_breaks_below must be strictly less than the central_estimate value.
- falsification.primary is required; falsification.secondary is optional.
- horizon_years should be 3 to 10 for most theses; up to 30 for very long-cycle (utilities, REITs).
- macro_premise should state stipulated macro context, not predict outcomes.
- claim should be a specific, testable assertion (one sentence ideally).`,
    cache_control: { type: "ephemeral" },
  },
];

interface ToolDriverInput {
  id: string;
  claim: string;
  central_estimate: { value: number; unit: string };
  thesis_breaks_below: number;
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

function findToolUse(
  content: AnthropicContentBlock[],
): AnthropicToolUse | undefined {
  for (const block of content) {
    if (block.type === "tool_use" && block.name === TOOL_NAME) {
      return block;
    }
  }
  return undefined;
}

export async function extractThesis(
  input: ExtractThesisInput,
): Promise<ExtractThesisResult> {
  const result = await createMessage({
    system: systemBlocks,
    tools: [extractThesisTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: input.sourceSnippet,
      },
    ],
  });

  const toolUse = findToolUse(result.content);
  if (!toolUse) {
    return { ok: false, error: "Model did not produce a tool_use block" };
  }

  const toolInput = toolUse.input as ToolThesisInput;
  const driversInput = toolInput.drivers?.industry ?? [];
  const merged = {
    id: input.id,
    version: 1,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    source_snippet: input.sourceSnippet,
    claim: toolInput.claim,
    macro_premise: toolInput.macro_premise,
    horizon_years: toolInput.horizon_years,
    scope: toolInput.scope,
    drivers: {
      industry: driversInput.map((d) => ({
        ...d,
        evidence: [],
        verdict: null,
      })),
    },
    falsification: toolInput.falsification,
    universe_id: toolInput.universe_id,
    validation: {
      status: "draft" as const,
      verdict: null,
      last_validated_at: null,
      open_tensions: [],
    },
  };

  const parsed = ThesisSchema.safeParse(merged);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.message,
      raw: toolUse.input,
    };
  }
  return { ok: true, thesis: parsed.data };
}
