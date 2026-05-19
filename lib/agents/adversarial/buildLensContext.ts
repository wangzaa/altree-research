// The single point through which adversarial separation is enforced.
// Every Bull/Bear API call routes through this. Assertion failures throw —
// fail-closed, never warn.
//
// HITL: the system prompt text below is reviewer-gated. Do not edit without
// spec signoff (recorded as a PR comment on the corpus-Stage-4 ticket).

import type Anthropic from "@anthropic-ai/sdk";
import { disallowFor, findFirstDisallowed } from "./disallow";
import type { IndustryDriver, Thesis } from "@/lib/schemas/thesis";

export type Lens = "bull" | "bear";

export type LensPost = {
  id: string;
  expert_name: string;
  title: string;
  link: string;
  published: string;
  content: string;
};

export type PriorEvidence = {
  lens: Lens;
  thesis_id: string;
  evidence: Array<{ post_id: string; quote: string }>;
};

export type BuildLensContextInput = {
  lens: Lens;
  thesis: Thesis;
  driver: IndustryDriver;
  posts: LensPost[];
  priorEvidence?: PriorEvidence;
};

export type LensRequest = {
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  tool_choice: Anthropic.MessageCreateParams["tool_choice"];
};

export const SUBMIT_EVIDENCE_TOOL: Anthropic.Tool = {
  name: "submit_evidence",
  description:
    "Submit the extracted per-lens evidence items. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      evidence: {
        type: "array",
        items: {
          type: "object",
          properties: {
            expert: { type: "string" },
            post_id: { type: "string" },
            post_url: { type: "string" },
            post_title: { type: "string" },
            quote: {
              type: "string",
              description:
                "Verbatim quote from the supplied post, 1-3 sentences.",
            },
            date: { type: "string", description: "ISO 8601 post date." },
          },
          required: [
            "expert",
            "post_id",
            "post_url",
            "post_title",
            "quote",
            "date",
          ],
        },
      },
    },
    required: ["evidence"],
  },
};

function buildSystemPrompt(input: BuildLensContextInput): string {
  const { lens, thesis, driver } = input;
  if (lens === "bull") {
    return `You are the bull_researcher analyzing independent-expert commentary.

Thesis claim: ${thesis.claim}
Macro premise: ${thesis.macro_premise}
Driver under review: ${driver.claim}
Central estimate: ${driver.central_estimate.value} ${driver.central_estimate.unit}

Your job: extract evidence that SUPPORTS the thesis claim and central estimate.

Rules:
- Only cite passages that materially advance the supporting case.
- Quotes must be verbatim from the supplied post content (1-3 sentences each).
- Cite the post_id and post_url for each quote.
- If no material supporting evidence exists in the supplied posts, return an empty array.

Call the submit_evidence tool exactly once with your findings.`;
  }
  return `You are the bear_researcher analyzing independent-expert commentary.

Thesis claim: ${thesis.claim}
Macro premise: ${thesis.macro_premise}
Driver under review: ${driver.claim}
Falsification threshold: estimate falls below ${driver.thesis_breaks_below} ${driver.central_estimate.unit}

Your job: extract evidence that contradicts the driver's central estimate or signals the threshold is being approached.

Rules:
- Only cite passages that materially advance the contradicting case.
- Quotes must be verbatim from the supplied post content (1-3 sentences each).
- Cite the post_id and post_url for each quote.
- If no material contradicting evidence exists in the supplied posts, return an empty array.

Call the submit_evidence tool exactly once with your findings.`;
}

function buildUserMessage(input: BuildLensContextInput): string {
  const blocks = input.posts
    .map((p, i) => {
      const trimmed =
        p.content.length > 8000
          ? p.content.slice(0, 8000) + "\n[…truncated]"
          : p.content;
      return `# Post ${i + 1}
post_id:   ${p.id}
expert:    ${p.expert_name}
title:     ${p.title}
url:       ${p.link}
date:      ${p.published}

${trimmed}`;
    })
    .join("\n\n---\n\n");
  return `Expert posts to analyze:

${blocks}`;
}

export function buildLensContext(input: BuildLensContextInput): LensRequest {
  const patterns = disallowFor(input.lens);

  // Assertion: priorEvidence isolation
  if (input.priorEvidence) {
    if (input.priorEvidence.lens !== input.lens) {
      throw new Error(
        `buildLensContext: opposite lens in priorEvidence (got ${input.priorEvidence.lens}, expected ${input.lens})`,
      );
    }
    if (input.priorEvidence.thesis_id !== input.thesis.id) {
      throw new Error(
        `buildLensContext: thesis_id mismatch in priorEvidence (got ${input.priorEvidence.thesis_id}, expected ${input.thesis.id})`,
      );
    }
  }

  const system = buildSystemPrompt(input);

  // Assertion: opposite-lens disallow-list absent from system prompt
  {
    const hit = findFirstDisallowed(system, patterns);
    if (hit) {
      throw new Error(
        `buildLensContext: disallowed pattern ${hit} present in system prompt for lens ${input.lens}`,
      );
    }
  }

  const userText = buildUserMessage(input);

  // Defense-in-depth: scan injected post content for the opposite-lens
  // disallow-list. A bull post mentioning "bear case" is not necessarily
  // bad — but we fail closed to surface the issue.
  {
    const hit = findFirstDisallowed(userText, patterns);
    if (hit) {
      throw new Error(
        `buildLensContext: disallowed pattern ${hit} present in injected post content for lens ${input.lens}`,
      );
    }
  }

  return {
    system: [{ type: "text", text: system }],
    messages: [{ role: "user", content: userText }],
    tools: [SUBMIT_EVIDENCE_TOOL],
    tool_choice: { type: "tool", name: "submit_evidence" },
  };
}
