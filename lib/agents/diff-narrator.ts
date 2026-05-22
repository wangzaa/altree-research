import { createMessage } from "@/lib/llm/client";
import type { Thesis } from "@/lib/schemas/thesis";
import type { ThesisDiff } from "@/lib/diff/thesis-diff";

export interface NarrateDiffInput {
  current: Thesis;
  proposed: Thesis;
  diff: ThesisDiff;
  instruction: string;
}

export type NarrateDiffResult = {
  narrative: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

const SYSTEM_PROMPT = `You speak to a research analyst about a thesis edit they just requested.

You receive the analyst's original instruction, the diff between the previous and proposed thesis, and the full current + proposed thesis for context.

You are in the SCOPING phase of the workflow. The user can add/drop tickers, widen or tighten regions, change horizon, add/remove a driver, or adjust the central-estimate or breaks-below numbers. The user CANNOT yet pressure-test, stress, run scenarios, compare to consensus, or rerun validation against the edit — those moves come later in the Insights phase. Do not promise or imply those moves; if the user's instruction sounds like they want one (e.g. "pressure-test", "stress against", "what if"), acknowledge the request and explain that the scoping pass is what's currently active; offer a scoping equivalent if there is one (e.g. tighten a threshold, drop a leg).

Write a 2-3 sentence reply, second-person ("you"), conversational, no headings, no bullet lists, no JSON. Start with a short acknowledgement ("OK -", "Got it -", "Done -") then describe what changed in plain English, naming specific tickers, regions, or values where useful. Use the scoping register: "tweak," "widen," "tighten," "swap in," "drop," "another region/name." Do not use "pressure-test," "stress," "load-bearing," or "where does this break."

End with one sentence (or short clause) about the downstream scoping consequence: the universe will widen/narrow, the seed list now includes X, the kill threshold moved from A to B. Keep the whole reply under 80 words. No hedging language.

Numbers must be exactly consistent with what's in the proposed thesis. If the central estimate is 15% and the kill threshold is 5%, never write 15% upside with a "5% utilization floor" — kill thresholds are kill thresholds, not anything else.

Do not mention field names like 'scope.regions' or 'drivers.industry[0].claim'. Translate them into natural language.`;

function buildUserMessage(input: NarrateDiffInput): string {
  return `Analyst instruction: ${input.instruction}

Diff (paths and values that changed):
\`\`\`json
${JSON.stringify(input.diff, null, 2)}
\`\`\`

Current thesis:
\`\`\`json
${JSON.stringify(input.current, null, 2)}
\`\`\`

Proposed thesis:
\`\`\`json
${JSON.stringify(input.proposed, null, 2)}
\`\`\``;
}

export async function narrateDiff(
  input: NarrateDiffInput,
): Promise<NarrateDiffResult> {
  const result = await createMessage({
    agent: "diff_narrator",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input) }],
    max_tokens: 400,
  });

  const narrative = result.text.trim();
  return {
    narrative,
    model: result.model,
    usage: result.usage,
  };
}
