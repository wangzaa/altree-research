// The single point through which adversarial separation is enforced.
// Every Bull/Bear API call routes through this. Assertion failures throw —
// fail-closed, never warn.
//
// HITL: the system prompt text below is reviewer-gated. Do not edit without
// spec signoff (recorded as a PR comment on the corpus-Stage-4 ticket).

import type { ToolSpec } from "@/lib/llm/client";
import {
  systemDisallowFor,
  corpusDisallowFor,
  findFirstDisallowed,
} from "./disallow";
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
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools: ToolSpec[];
  tool_choice: { type: "tool"; name: string };
};

export const SUBMIT_EVIDENCE_TOOL: ToolSpec = {
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

  // Assertion: broad opposite-lens disallow-list absent from system prompt.
  // The check is meant to catch authoring mistakes in OUR template only —
  // not legitimate use of words like "support" inside user-authored claim
  // text. Redact the user-supplied substitutions before checking so a
  // claim like "demographic tailwinds support household robotics" doesn't
  // trip the bear lens's `/\bsupports?\b/i` disallow rule.
  {
    let templateOnly = system;
    const userSubs = [
      input.thesis.claim,
      input.thesis.macro_premise,
      input.driver.claim,
      input.driver.central_estimate.unit,
    ];
    for (const sub of userSubs) {
      if (sub && sub.length > 0) {
        templateOnly = templateOnly.split(sub).join("");
      }
    }
    const hit = findFirstDisallowed(
      templateOnly,
      systemDisallowFor(input.lens),
    );
    if (hit) {
      throw new Error(
        `buildLensContext: disallowed pattern ${hit} present in system prompt for lens ${input.lens}`,
      );
    }
  }

  const userText = buildUserMessage(input);

  // Assertion: opposite-lens AGENT IDENTIFIER absent from injected corpus
  // content. Narrow scope — real financial commentary uses "bear case" /
  // "downside" / "bullish" etc routinely, so the broad patterns would
  // false-positive on legitimate input. Only the agent identifiers should
  // never appear in corpus content; if they do, something has gone wrong
  // (e.g. an event log got mistakenly injected as a post).
  {
    const hit = findFirstDisallowed(userText, corpusDisallowFor(input.lens));
    if (hit) {
      throw new Error(
        `buildLensContext: disallowed pattern ${hit} present in injected post content for lens ${input.lens}`,
      );
    }
  }

  return {
    system,
    messages: [{ role: "user", content: userText }],
    tools: [SUBMIT_EVIDENCE_TOOL],
    tool_choice: { type: "tool", name: "submit_evidence" },
  };
}
