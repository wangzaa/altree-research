// PROTOTYPE — Bull/Bear LLM calls.
// NOTE: no adversarial harness here. Bull and Bear are two plain calls with
// lens-flipped system prompts. The real isolation harness (buildLensContext +
// disallow-list regex + fail-closed assertions) lands in the real impl.
// This prototype only tests whether retrieval + LLM extraction produces
// useful per-lens evidence at all.

import Anthropic from "@anthropic-ai/sdk";
import type { Post } from "./retrieve";

// Bypassing lib/anthropic/client.ts because the helper applies a default
// temperature of 0, and claude-opus-4-7 errors on any temperature param.
// Direct SDK use also keeps the prototype's dependency surface visible.
const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-opus-4-7";

export type EvidenceItem = {
  expert: string;
  post_title: string;
  post_url: string;
  quote: string;
  date: string;
};

export type LensResult = {
  evidence: EvidenceItem[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};

function buildSystemPrompt(lens: "bull" | "bear"): string {
  const opposite = lens === "bull" ? "bear" : "bull";
  const goal =
    lens === "bull"
      ? "evidence that SUPPORTS the thesis or the central estimate"
      : "evidence that BREACHES the falsification threshold or contradicts the central estimate";
  return `You are a ${lens}_researcher analyzing independent-expert commentary on the semiconductor industry.

Your job: extract ${goal} from the supplied expert posts.

Rules:
- Only cite passages that materially advance the ${lens} case. Do not cherry-pick incidental mentions.
- Do NOT extract ${opposite}-case evidence. A separate ${opposite}_researcher handles that side.
- Quotes must be verbatim from the supplied post content (1-3 sentences each).
- If no material ${lens} evidence exists in the supplied posts, return an empty array.

Call the submit_evidence tool exactly once with your findings.`;
}

const EVIDENCE_TOOL: Anthropic.Tool = {
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
            post_title: { type: "string" },
            post_url: { type: "string" },
            quote: {
              type: "string",
              description: "Verbatim quote from the supplied post, 1-3 sentences.",
            },
            date: { type: "string", description: "ISO 8601 post date." },
          },
          required: ["expert", "post_title", "post_url", "quote", "date"],
        },
      },
    },
    required: ["evidence"],
  },
};

function buildUserMessage(driverQuery: string, posts: Post[]): string {
  const blocks = posts
    .map((p, i) => {
      const trimmed =
        p.content.length > 8000
          ? p.content.slice(0, 8000) + "\n[…truncated]"
          : p.content;
      return `# Post ${i + 1}
expert:     ${p.expert_name}
title:      ${p.title}
url:        ${p.link}
date:       ${p.published}
paywalled:  ${p.is_paywalled}

${trimmed}`;
    })
    .join("\n\n---\n\n");
  return `Thesis driver / question:
${driverQuery}

Expert posts to analyze:

${blocks}`;
}

export async function runLens(
  lens: "bull" | "bear",
  driverQuery: string,
  posts: Post[],
): Promise<LensResult> {
  const system = buildSystemPrompt(lens);
  const user = buildUserMessage(driverQuery, posts);
  const res = await anthropicClient.messages.create({
    model: MODEL,
    system,
    messages: [{ role: "user", content: user }],
    tools: [EVIDENCE_TOOL],
    tool_choice: { type: "tool", name: "submit_evidence" },
    max_tokens: 4096,
  });
  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    console.error(
      `[${lens}] No tool_use block in response. Stop reason: ${res.stop_reason}\n` +
        `Content:\n${JSON.stringify(res.content, null, 2)}`,
    );
    throw new Error(`[${lens}] expected submit_evidence tool call`);
  }
  const rawInput = toolUse.input as { evidence?: EvidenceItem[] | string };
  let evidence: EvidenceItem[] = [];
  if (Array.isArray(rawInput.evidence)) {
    evidence = rawInput.evidence;
  } else if (typeof rawInput.evidence === "string") {
    // Defensive: some model responses stringify the array. Parse it.
    try {
      const parsed = JSON.parse(rawInput.evidence);
      if (Array.isArray(parsed)) evidence = parsed;
    } catch (e) {
      console.error(
        `[${lens}] evidence was a string but not valid JSON:\n${rawInput.evidence.slice(0, 500)}...\n`,
      );
      throw e;
    }
  } else {
    console.error(
      `[${lens}] unexpected evidence shape:\n${JSON.stringify(rawInput, null, 2).slice(0, 1000)}\n`,
    );
  }
  return {
    evidence,
    usage: {
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
    },
  };
}
