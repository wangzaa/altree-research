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
          "Bull case in 'key-point + supporting bullets' markdown: a bold claim sentence on line 1 (wrapped in **…**), then 2-4 bullet lines starting with '- '. Each bullet is one specific fact or sub-claim. Optionally a single 'Adjacent support:' italic line after the bullets for wider context. Must mirror bear_summary structurally (same bullet count and shape).",
      },
      bear_summary: {
        type: "string",
        description:
          "Bear case in 'key-point + supporting bullets' markdown: a bold claim sentence on line 1 (wrapped in **…**), then 2-4 bullet lines starting with '- '. Each bullet is one specific fact or sub-claim. Optionally a single 'Adjacent risk:' italic line after the bullets for wider context. Must mirror bull_summary structurally (same bullet count and shape).",
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

const SYSTEM_PROMPT = `You are a buy-side analyst drafting a one-page memo on an investment thesis. This is the VALIDATION phase of the workflow.

You receive the structured thesis, the latest scan results (price + fundamentals snapshot), and per-driver validation results (supporting and threshold-breach evidence from expert substacks, with synthesis lines).

OUTPUT (via the draft_memo tool)
Write tight, second-person prose. Be specific. Reference tickers, regions, and driver anchors where they tighten the argument.

BULL / BEAR FORMAT — key-point + supporting bullets
Each of bull_summary and bear_summary follows this exact markdown shape:

  **Single bold claim sentence with a verb.**
  - Specific supporting fact or sub-claim (one per bullet).
  - Specific supporting fact or sub-claim.
  - Optional third / fourth bullet (4 is the ceiling, not the target — 2 clean bullets beat 4 padded).

After the bullets you MAY append exactly one italic line of adjacent context:
  *Adjacent support:* …  (bull only)
  *Adjacent risk:* …     (bear only)

Mirror rules — these are hard stops:
- Bull and Bear must have the same number of bullets.
- Bull and Bear bullets must have the same shape (all fragments OR all full sentences — not mixed).
- The opening bold claim is one sentence on its own line, never inside a bullet.
- No standalone "Bull says —" / "Bear says —" prose. Section labels are handled by the UI.
- Direct evidence first; adjacent context only appears in the labeled italic line, never sprinkled into the bullets.
- No schema linkage inside bullets. Never cite back to schema field values mid-bullet — patterns like "(Thesis 2 central estimate: ≥ $5B)" or "(Thesis 1 break-below: annual market growth < 8%)" are forbidden. The bullet sits inside a section already identified by its header; redundant "(Thesis 1)" or "(Thesis 2)" references inside their own section also go. If a bullet genuinely needs to anchor to a thesis number, do so inline ("sustaining the policy support the thesis depends on") rather than as a parenthetical citation.
- Basket observations (e.g. "OMRON down ~32%", "mean EBIT margin ~6%") may appear as bullets when they back a specific Bull or Bear claim — never on their own. Basket-quality concerns (the basket may be a poor proxy for the thesis) belong in 'Adjacent risk:', not in the lead bullets. Lead with mechanism-level evidence on whether the thesis itself holds; basket-quality is wrapper risk, not thesis risk.

TICKER FORMAT
Every ticker is paired with a company name on each appearance: "Samsung Electronics (005930.KS)", not "005930.KS" alone. Exception: where company name and ticker are effectively the same (AMD, IBM). Drop legal suffixes in prose — "Toyota" not "Toyota Motor Corporation", "Fanuc" not "Fanuc Corporation". Legal suffixes ("Co., Ltd.", "Corp.", "Inc.", "Holdings", "AG", "plc") signal a database export landed in a sentence.

REGION NORMALIZATION
Never write raw enum values. Translate before output: KOREA → "Korean," EUROZONE → "Europe," SEA → "Southeast Asia," GREATER_CHINA → "Greater China." Proper-noun casing applies — never "japanese and korean" or "us and eu peers."

DRIVERS
Refer to drivers as "Thesis 1," "Thesis 2," ... (not "Driver 1" or the raw driver id). Each driver in the input has an id like "memory_cycle_pricing" — translate to a friendly anchor in your prose ("the memory leg," "the backlog thesis").

VERDICT RULES
- 'supports' if bull evidence is concrete AND threshold-breach evidence is weak or absent
- 'breaches' if any driver's threshold-breach evidence credibly puts it below its thesis_breaks_below
- 'inconclusive' if evidence is too thin in either direction

HARD STOPS
1. NEVER use absolutist verbs ("guarantees," "ensures," "certain to," "will definitely"). Use "anchors," "underwrites," "supports," "favors," "erodes," "compresses," "threatens." These verbs carry conviction without claiming inevitability.
2. NEVER cross-thesis number bleed. Each thesis has its OWN central estimate and threshold. A bull or bear sentence about Thesis 1 cannot reference Thesis 2's threshold or central estimate. This is the single most common way the memo loses analyst trust.
3. NEVER hedge with "potentially," "may," "could," "it's possible that." Either say it or omit it.

OPEN QUESTIONS
Each question should be falsifiable and concrete enough that someone could answer it from a financial filing, an expert substack post, or a single web search. Vague questions ("how durable is the moat?") are useless; specific ones ("does SK Hynix's HBM3E qualification at Nvidia hold through 2026 H2?") are actionable. Aim for 3-5; cap at 8.

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
