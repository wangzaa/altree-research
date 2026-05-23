import { createMessage, type ToolSpec } from "@/lib/llm/client";
import {
  ClassifiedQuestionSchema,
  type ClassifiedQuestion,
} from "@/lib/schemas/question";
import type { Thesis } from "@/lib/schemas/thesis";
import { z } from "zod";

export interface ClassifyQuestionsInput {
  thesis: Thesis;
  questions: string[];
}

export type ClassifyQuestionsResult =
  | {
      ok: true;
      classifications: ClassifiedQuestion[];
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    }
  | { ok: false; error: string; raw?: unknown };

const TOOL_NAME = "classify_questions";

const classifierTool: ToolSpec = {
  name: TOOL_NAME,
  description:
    "Classify each open question into one of five resolution categories with a structured hint.",
  input_schema: {
    type: "object",
    properties: {
      classifications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            category: {
              type: "string",
              enum: [
                "derivable",
                "fundamentals_extra",
                "corpus",
                "web",
                "needs_analyst",
              ],
            },
            hint: {},
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["question", "category", "hint", "confidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["classifications"],
    additionalProperties: false,
  },
};

const ToolInputSchema = z.object({
  classifications: z.array(ClassifiedQuestionSchema),
});

const SYSTEM_PROMPT = `You classify analyst open-questions into one of five resolution categories so a downstream system can route each question to the right resolver.

Categories:
- derivable: answerable purely from scan + universe data already in hand. Use ONLY when the question is about ranking, aggregating, or counting universe tickers on a metric we already have. Supported metrics: revenue_growth_yoy, ebitda_margin, market_cap_usd_b. Supported filters: region (canonical codes — US, KOREA, JAPAN, GREATER_CHINA, EUROZONE, NORDICS, ANZ, etc.), exposure_tier (pure_play, diversified, etf_proxy). Supported ops: rank_by_metric (top/bottom N), aggregate_by_group (median/mean/max/min), filter_count.
- fundamentals_extra: a fundamentals field Yahoo could provide that isn't in the current scan (segment revenue, share count, balance-sheet items). Out of scope for now.
- corpus: answerable from the expert substack corpus (covered analysts, sectors). Anything about analyst commentary, expert outlook, qualitative views from named publications.
- web: external research needed. Industry analyst reports, regulatory developments, forward roadmap claims, anything requiring fresh public sources.
- needs_analyst: proprietary intel (sell-side mean estimates, internal forecasts) the system has no feed for. Use this when no credible automated source could answer.

Output rules:
- Return exactly one classification per input question, in the SAME ORDER as the input list.
- For derivable: hint MUST be a structured object: { op, metric?, filter?, direction?, limit?, aggregator? }. NEVER free text. Use only the enum values listed above.
- For corpus / web / fundamentals_extra: hint is a short string (≤ 80 chars) summarising the search angle, or null if you can't suggest one.
- For needs_analyst: hint MUST be null.
- confidence is a float 0..1. Use < 0.5 only when you genuinely can't tell.
- Bias toward needs_analyst when in doubt — false positives in derivable / corpus / web waste compute and erode trust.

Return the classifications via the classify_questions tool. Do not return free-text.`;

function buildUserMessage(input: ClassifyQuestionsInput): string {
  const lines = input.questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  return `Thesis claim:
${input.thesis.claim}

Macro premise:
${input.thesis.macro_premise}

Sectors (GICS codes): ${input.thesis.scope.sectors.join(", ")}
Regions: ${input.thesis.scope.regions.join(", ")}

Open questions to classify (preserve order):
${lines}`;
}

export async function classifyQuestions(
  input: ClassifyQuestionsInput,
): Promise<ClassifyQuestionsResult> {
  if (input.questions.length === 0) {
    return {
      ok: true,
      classifications: [],
      model: "",
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  const result = await createMessage({
    agent: "question_classifier",
    system: SYSTEM_PROMPT,
    tools: [classifierTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: buildUserMessage(input) }],
  });

  const toolCall = result.tool_calls.find((tc) => tc.name === TOOL_NAME);
  if (!toolCall) {
    return {
      ok: false,
      error: "Model did not produce a classify_questions tool_use block",
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

  const parsed = ToolInputSchema.safeParse(toolCall.input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.message,
      raw: toolCall.input,
    };
  }

  if (parsed.data.classifications.length !== input.questions.length) {
    return {
      ok: false,
      error: `classifier returned ${parsed.data.classifications.length} classifications for ${input.questions.length} questions (length mismatch)`,
    };
  }

  return {
    ok: true,
    classifications: parsed.data.classifications,
    model: result.model,
    usage: result.usage,
  };
}
