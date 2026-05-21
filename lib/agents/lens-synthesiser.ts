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

const SYSTEM_PROMPT_BULL = `You speak to a research analyst about the bull case for a specific thesis driver.

You receive the thesis, the driver, and a list of supporting evidence quotes from expert substack writers.

Write a 2-3 sentence synthesis, second person ("you"), conversational, no headings, no bullet lists. Start with "Bull says -" then paraphrase what the experts collectively argue, naming specific points and the experts only where genuinely useful. End with one sentence about why this supports the driver staying above its breaks-below threshold.

Keep under 90 words. No hedging language. Do not quote verbatim; synthesise.

If the evidence list is empty, return exactly: "Bull says - no supporting evidence found in the corpus yet."`;

const SYSTEM_PROMPT_BEAR = `You speak to a research analyst about the bear case for a specific thesis driver.

You receive the thesis, the driver, and a list of threshold-breach evidence quotes from expert substack writers.

Write a 2-3 sentence synthesis, second person ("you"), conversational, no headings, no bullet lists. Start with "Bear says -" then paraphrase what the experts collectively argue, naming specific points and the experts only where genuinely useful. End with one sentence about how this could push the driver below its breaks-below threshold.

Keep under 90 words. No hedging language. Do not quote verbatim; synthesise.

If the evidence list is empty, return exactly: "Bear says - no threshold-breach evidence found in the corpus yet."`;

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
