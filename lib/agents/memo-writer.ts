import { createMessage, type ToolSpec } from "@/lib/llm/client";
import { MemoSchema, type Memo } from "@/lib/schemas/memo";
import type { Thesis } from "@/lib/schemas/thesis";
import type { ScanResults } from "@/lib/schemas/scan";
import type { DriverValidationResult } from "@/lib/schemas/validation";

export interface WriteMemoInput {
  thesis: Thesis;
  scan: ScanResults | null;
  validation: Record<string, DriverValidationResult> | null;
}

export type WriteMemoResult =
  | {
      ok: true;
      memo: Memo;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    }
  | { ok: false; error: string; raw?: unknown };

const TOOL_NAME = "draft_memo";

const memoTool: ToolSpec = {
  name: TOOL_NAME,
  description:
    "Draft a one-page investment memo summarising the thesis state. Only call this tool. Do not return free-text.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["supports", "breaches", "inconclusive"],
        description:
          "Overall verdict: 'supports' if the bull case is sound and the thesis is intact; 'breaches' if threshold-breach evidence is strong enough to invalidate the thesis; 'inconclusive' if evidence is too thin.",
      },
      bull_summary: {
        type: "string",
        description:
          "One paragraph (2-3 sentences) summarising the bull case across all drivers, citing the strongest supporting evidence and what would keep the thesis intact.",
      },
      bear_summary: {
        type: "string",
        description:
          "One paragraph (2-3 sentences) summarising the bear case, citing the strongest threshold-breach evidence and where the thesis is most exposed.",
      },
      recommendation: {
        type: "string",
        description:
          "One-sentence directive for the analyst: hold the thesis, monitor specific signals, deepen on one driver, or kill the thesis.",
      },
      open_questions: {
        type: "array",
        items: { type: "string" },
        minItems: 0,
        maxItems: 8,
        description:
          "Specific, falsifiable open questions the analyst should resolve next. Each item is one short sentence.",
      },
    },
    required: [
      "verdict",
      "bull_summary",
      "bear_summary",
      "recommendation",
      "open_questions",
    ],
  },
};

const SYSTEM_PROMPT = `You are a buy-side analyst drafting a one-page memo on an investment thesis.

You receive the structured thesis, the latest scan results (price + fundamentals snapshot), and per-driver validation results (supporting and threshold-breach evidence from expert substacks, with synthesis lines).

Write tight, second-person prose. No headings, no bullet padding. Be specific. Reference tickers, regions, sector names, and driver ids where they tighten the argument. Never hedge with "potentially", "may", "could". Either say it or omit it.

Verdict rules:
- 'supports' if bull evidence is concrete AND threshold-breach evidence is weak or absent
- 'breaches' if any driver's threshold-breach evidence credibly puts it below its thesis_breaks_below
- 'inconclusive' if evidence is too thin in either direction

Return the memo via the supplied tool. Do not return free-text.`;

function buildUserMessage(input: WriteMemoInput): string {
  const validationBlock =
    input.validation && Object.keys(input.validation).length > 0
      ? Object.entries(input.validation)
          .map(([driverId, v]) => {
            const bull =
              v.bull_synthesis ??
              (v.bull_evidence.length > 0
                ? `${v.bull_evidence.length} supporting notes`
                : "no supporting evidence");
            const bear =
              v.bear_synthesis ??
              (v.bear_evidence.length > 0
                ? `${v.bear_evidence.length} threshold-breach notes`
                : "no threshold-breach evidence");
            return `${driverId}:
  bull: ${bull}
  bear: ${bear}`;
          })
          .join("\n\n")
      : "(no validation results yet)";

  return `Thesis:
\`\`\`json
${JSON.stringify(input.thesis, null, 2)}
\`\`\`

Scan (price + fundamentals): ${
    input.scan
      ? `${input.scan.history_5y.length} ticker histories, ${input.scan.tickers_snapshot.length} snapshot rows. Descriptive text:\n${input.scan.descriptive_markdown}`
      : "(no scan results)"
  }

Validation:
${validationBlock}`;
}

export async function writeMemo(input: WriteMemoInput): Promise<WriteMemoResult> {
  const result = await createMessage({
    agent: "memo_writer",
    system: SYSTEM_PROMPT,
    tools: [memoTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: buildUserMessage(input) }],
  });

  const toolCall = result.tool_calls.find((tc) => tc.name === TOOL_NAME);
  if (!toolCall) {
    return { ok: false, error: "Model did not produce a draft_memo tool_use block" };
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

  const parsed = MemoSchema.safeParse(toolCall.input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.message,
      raw: toolCall.input,
    };
  }

  return {
    ok: true,
    memo: parsed.data,
    model: result.model,
    usage: result.usage,
  };
}
