import { createMessage, type ToolSpec } from "@/lib/llm/client";
import type { Theme } from "@/lib/schemas/themes";
import {
  ThemeTagSchema,
  type ExposedCompany,
} from "@/lib/schemas/theme-exposure";
import type { Candidate } from "./recall";

export type TagResult =
  | { ok: true; exposed: true; company: ExposedCompany; model: string; usage: Usage }
  | { ok: true; exposed: false; model: string; usage: Usage }
  | {
      ok: false;
      code: "tool_use_missing" | "tool_use_invalid";
      error: string;
      raw?: unknown;
    };

type Usage = { input_tokens: number; output_tokens: number };

const TOOL_NAME = "tag_exposure";

const tagExposureTool: ToolSpec = {
  name: TOOL_NAME,
  description:
    "Record whether this company has GENUINE recent topic-relevant activity. Only call this tool. Do not return free-text.",
  input_schema: {
    type: "object",
    properties: {
      exposed: {
        type: "boolean",
        description:
          "true ONLY if the matched reports show a real recent announcement or strategic pivot relevant to the topic — not an incidental keyword mention or boilerplate.",
      },
      rationale: {
        type: "string",
        description:
          "Required when exposed. One sentence (≤20 words) naming the specific announcement/pivot and tying it to the topic. Include the month/year.",
      },
      as_of: {
        type: "string",
        description:
          "Required when exposed. ISO date (YYYY-MM-DD) of the announcement/pivot — the published_at of the report the rationale rests on.",
      },
    },
    required: ["exposed"],
  },
};

const SYSTEM_PROMPT = `You confirm whether a Japanese company has GENUINE recent exposure to a global hot topic.

Exposure here is ACTIVITY-BASED, not static classification. A company is exposed only if its recent reports show a real recent announcement or strategic pivot relevant to the topic (new product/capacity, a partnership, a guidance change, an M&A move, a stated strategic shift). A company that merely operates in the broad space, or where the keyword appears incidentally (boilerplate, a passing mention, a risk-factor list), is NOT exposed — drop it.

You receive the topic (label + description) and the company's matched recent reports plus its business summary. Be strict: false positives pollute the opportunity set. When in doubt, set exposed=false.

When exposed, emit a dated one-line rationale naming the specific announcement and the ISO date it was published. Output via the tag_exposure tool only.`;

function reportsDigest(candidate: Candidate): string {
  return candidate.matched
    .map(
      (r) =>
        `- [${r.published_at}] (${r.type}) ${r.title}\n  ${r.text}`.trim(),
    )
    .join("\n");
}

function buildUserMessage(theme: Theme, candidate: Candidate): string {
  const c = candidate.company;
  return `Topic: ${theme.label}
Topic description: ${theme.description}

Company: ${c.name_en} (${c.ticker})
Business summary: ${c.description ?? "(none)"}

Matched recent reports:
${reportsDigest(candidate)}

Is this GENUINE recent activity-based exposure to the topic? Answer via the tag_exposure tool.`;
}

export async function tagCandidate(
  theme: Theme,
  candidate: Candidate,
): Promise<TagResult> {
  const result = await createMessage({
    agent: "theme_tagger",
    system: SYSTEM_PROMPT,
    tools: [tagExposureTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      { role: "user", content: buildUserMessage(theme, candidate) },
    ],
  });

  const toolCall = result.tool_calls.find((tc) => tc.name === TOOL_NAME);
  if (!toolCall) {
    return {
      ok: false,
      code: "tool_use_missing",
      error: "Model did not produce a tag_exposure tool_use block",
    };
  }

  const parsed = ThemeTagSchema.safeParse(toolCall.input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "tool_use_invalid",
      error: parsed.error.message,
      raw: toolCall.input,
    };
  }

  const tag = parsed.data;
  const rationale = tag.rationale?.trim();
  const asOf = tag.as_of?.trim();

  // Defensive: an "exposed" verdict with no dated rationale isn't actionable —
  // never surface a company without a why. Drop it as not exposed.
  if (!tag.exposed || !rationale || !asOf) {
    return { ok: true, exposed: false, model: result.model, usage: result.usage };
  }

  const c = candidate.company;
  return {
    ok: true,
    exposed: true,
    company: {
      ticker: c.ticker,
      yahoo_ticker: c.yahoo_ticker,
      name_en: c.name_en,
      rationale,
      as_of: asOf,
    },
    model: result.model,
    usage: result.usage,
  };
}
