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

Write a 2-3 sentence reply, second-person ("you"), conversational, no headings, no bullet lists, no JSON. Start with a short acknowledgement ("OK -", "Got it -", "Done -") then describe what changed in plain English, naming specific tickers/regions/values where useful.

End with one sentence beginning "This means" that explains the downstream implication for the universe, scan, or validation. Keep the whole reply under 80 words. No hedging language.

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
