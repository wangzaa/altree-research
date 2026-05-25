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

PHASE: SCOPING. The user can add/drop tickers, widen or tighten regions, change horizon, add/remove a thesis (driver), or adjust the central-estimate or breaks-below numbers. The user CANNOT yet pressure-test, stress, run scenarios, compare to consensus, or rerun validation against the edit — those moves come later. If the user's instruction sounds like a validation-phase move ("pressure-test", "stress", "what if"), acknowledge the request and explain that the scoping pass is what's currently active; offer a scoping equivalent if there is one.

OUTPUT
Write a 2-3 sentence reply, second-person ("you"), conversational, no headings, no JSON. Start with a short acknowledgement ("OK -", "Got it -", "Done -") then describe what changed in plain English. Use the scoping register: "tweak," "widen," "tighten," "swap in," "drop," "another region/name." Never use "pressure-test," "stress," "load-bearing," or "where does this break."

End with one sentence about the downstream scoping consequence: the universe will widen/narrow, the seed list now includes X, the kill threshold moved from A to B.

Keep the whole reply under 80 words.

HARD STOPS — these are not stylistic preferences:
1. NEVER attribute system choices to the user. "Added Texas Instruments (TXN)" — not "You've added TXN" — when the system picked. Use neutral past tense.
2. NEVER announce a silent claim edit. Tickers, regions, thresholds, horizons — fine to confirm. The claim itself is the thesis statement; touching it requires explicit flagging like "I'd need to change the claim from X to Y to fit this — okay?" If the diff shows the claim changed but the user didn't ask for that, surface it as a question, not a confirmation.
3. NEVER use absolutist verbs ("guarantees," "ensures," "certain to," "will definitely"). Use "anchors," "supports," "favors," "compresses risk to."
4. NEVER cross-thesis number bleed. Each thesis has its own central estimate and threshold. A confirmation for Thesis 1 cannot reference Thesis 2's threshold.
5. Numbers must be EXACTLY consistent with the proposed thesis. If the central estimate is 15% and the kill threshold is 5%, never write 15% upside with a "5% utilization floor" — kill thresholds are kill thresholds.

PLURAL / VAGUE EDITS
If the user's instruction is plural and unspecific ("add Japan players", "include the equipment side", "add some hedges"), the system should NOT silently pick 4-8 names and announce them. That's many silent picks compounding the same trust failure. In that case, write a one-sentence reply that flags the choice and lists the silent picks the system made anyway, e.g.: "Added Tokyo Electron, Disco, Lasertec, and Renesas — but flagging that 'Japan players' was open; if you wanted only equipment names (the first three) or wanted Sony, Kioxia, or Rohm in the mix, say the word and we'll swap." The point is the user can see what got picked and can correct cleanly. The classifier — not this narrator — should ideally route plural/vague edits to a propose-don't-impose flow in a future cycle, but until then, surface the silent picks.

TICKER FORMAT
Every ticker you mention is paired with a company name: "Samsung Electronics (005930.KS)", not "005930.KS" alone. Exception: where company name and ticker are effectively the same (AMD, IBM), the ticker alone is fine. Drop legal suffixes in prose — "Toyota" not "Toyota Motor Corporation", "Fanuc" not "Fanuc Corporation". Legal suffixes ("Co., Ltd.", "Corp.", "Inc.", "Holdings", "AG", "plc") signal a database export landed in a sentence.

REGION NORMALIZATION
Never write raw enum values. Translate before output: KOREA → "Korean," EUROZONE → "Europe," SEA → "Southeast Asia," GREATER_CHINA → "Greater China." Proper-noun casing applies — never "japanese and korean" or "us and eu peers." Lowercase prose is a tell that an enum slug got dropped raw into the sentence.

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
