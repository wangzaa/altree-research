import { createMessage } from "@/lib/llm/client";
import type { IndustryDriver, Thesis } from "@/lib/schemas/thesis";
import type { CorpusEvidence } from "@/lib/schemas/validation";
import type { AgentName } from "@/lib/schemas/agent-models";

export type LensKind = "bull" | "bear";

export interface SynthesiseLensInput {
  lens: LensKind;
  thesis: Thesis;
  driver: IndustryDriver;
  evidence: CorpusEvidence[];
}

export type SynthesiseLensResult = {
  synthesis: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

// Per docs/tone/conversational-thesis (validation phase):
// - No "Bull says -" / "Bear says -" framing. The UI label already says it.
// - Lead with DIRECT evidence on the SPECIFIC claim; adjacent context comes
//   second under an "Adjacent support:" / "Adjacent risk:" italicised label.
// - Multi-claim cases as bullets, each independently sourceable.
// - No absolutist verbs ("guarantees," "ensures," "certain to," "will
//   definitely"). Use "anchors," "underwrites," "supports," "compresses,"
//   "erodes," "favors."
// - No cross-thesis number bleed: stay inside THIS driver's claim and
//   thresholds; never reach for another driver's numbers.
// - Bull and Bear must mirror in structure (same opener style, same
//   bullet-vs-paragraph shape, same level of detail).
// - Empty evidence: a single short interpretive line, no theatre.

const SYSTEM_PROMPT_BULL = `You synthesise the bull case for a specific thesis driver from expert substack quotes.

You receive the thesis, the driver, and a list of supporting evidence quotes.

OUTPUT FORMAT
- Do NOT start with "Bull says -" or any speaker frame. The UI labels the bubble.
- If the evidence supports a SINGLE distinct claim: write one tight paragraph (2-3 sentences) that engages directly with the driver's claim, names specific entities/values from the corpus, and closes with one clause about why this supports staying above the breaks-below threshold.
- If the evidence supports TWO OR MORE distinct claims: write them as a bulleted list, one bullet per claim. Each bullet is one sentence, source-checkable on its own, and engages with a specific aspect of the driver's claim. Format: "- **Anchor phrase.** Specific claim, naming entities + values."
- If some evidence is ADJACENT (strengthens the broader story but doesn't directly test the driver's claim), put it last, in italics, under "*Adjacent support:* ..." — never let adjacent material lead.

If the evidence list is empty, return exactly: "No evidence found in the corpus to support this claim."

RULES
- Direct evidence leads. If the claim is relative ("Korea beats US/EU peers"), the bull case must engage with the US/EU peers specifically. Smoothing absolute evidence into a relative-claim defense is dishonest — say so out loud if the corpus only supports absolute arguments.
- No absolutist verbs: never "guarantees," "ensures," "certain to," "will definitely." Use "anchors," "underwrites," "supports," "favors," "compresses risk to."
- Stay inside THIS driver. Never reach for another driver's threshold or central estimate.
- No hedging language ("might," "perhaps," "it could be argued"). Either say it or omit it.
- Do not quote verbatim; synthesise. Use **bold** sparingly on entity names or key anchors.
- Keep total length under 110 words.`;

const SYSTEM_PROMPT_BEAR = `You synthesise the bear case for a specific thesis driver from expert substack quotes.

You receive the thesis, the driver, and a list of threshold-breach evidence quotes.

OUTPUT FORMAT
- Do NOT start with "Bear says -" or any speaker frame. The UI labels the bubble.
- If the evidence supports a SINGLE distinct claim: write one tight paragraph (2-3 sentences) that engages directly with the driver's claim, names specific entities/values from the corpus, and closes with one clause about how this could push the driver below the breaks-below threshold.
- If the evidence supports TWO OR MORE distinct claims: write them as a bulleted list, one bullet per claim. Each bullet is one sentence, source-checkable on its own, and engages with a specific aspect of the driver's claim. Format: "- **Anchor phrase.** Specific claim, naming entities + values."
- If some evidence is ADJACENT (wider thematic risk that hits this leg only indirectly), put it last, in italics, under "*Adjacent risk:* ..." — never let adjacent material lead.

If the evidence list is empty, return exactly: "No evidence found in the corpus to challenge this claim."

RULES
- Direct evidence leads. If the claim is relative ("Korea beats US/EU peers"), the bear case must engage with the US/EU peers specifically.
- No absolutist verbs: never "guarantees," "ensures," "certain to," "will definitely." Use "erodes," "compresses," "weakens," "threatens," "exposes."
- Stay inside THIS driver. Never reach for another driver's threshold or central estimate.
- No hedging language ("might," "perhaps," "it could be argued"). Either say it or omit it.
- Do not quote verbatim; synthesise. Use **bold** sparingly on entity names or key anchors.
- Mirror the bull case's structure for this driver (if bull was bullets, bear is bullets; if bull was a paragraph, bear is a paragraph) — asymmetry signals one side got more care than the other.
- Keep total length under 110 words.`;

function buildUserMessage(input: SynthesiseLensInput): string {
  return `Driver: ${input.driver.id}
Driver claim: ${input.driver.claim}
Central estimate: ${input.driver.central_estimate.value} ${input.driver.central_estimate.unit}
Thesis breaks below: ${input.driver.thesis_breaks_below}

Thesis claim: ${input.thesis.claim}

Evidence (${input.evidence.length} item${input.evidence.length === 1 ? "" : "s"}):
${
  input.evidence.length === 0
    ? "(none)"
    : input.evidence
        .map(
          (e, i) =>
            `${i + 1}. [${e.expert}, ${e.date.slice(0, 10)}] "${e.quote}"`,
        )
        .join("\n")
}`;
}

export async function synthesiseLens(
  input: SynthesiseLensInput,
): Promise<SynthesiseLensResult> {
  const agent: AgentName =
    input.lens === "bull" ? "bull_synthesiser" : "bear_synthesiser";
  const system =
    input.lens === "bull" ? SYSTEM_PROMPT_BULL : SYSTEM_PROMPT_BEAR;

  const result = await createMessage({
    agent,
    system,
    messages: [{ role: "user", content: buildUserMessage(input) }],
    max_tokens: 400,
  });

  return {
    synthesis: result.text.trim(),
    model: result.model,
    usage: result.usage,
  };
}
