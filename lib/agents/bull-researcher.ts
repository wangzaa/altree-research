import { z } from "zod";
import { retrieve } from "@/lib/agents/expert-corpus/retrieve";
import {
  buildLensContext,
  type LensPost,
} from "@/lib/agents/adversarial/buildLensContext";
import {
  CorpusEvidenceSchema,
  type CorpusEvidence,
} from "@/lib/schemas/validation";
import { loadRegistry } from "@/lib/data/experts";
import { createMessage } from "@/lib/llm/client";
import type { IndustryDriver, Thesis } from "@/lib/schemas/thesis";

const RETRIEVE_LIMIT_DEFAULT = 12;

export type RunResult = {
  evidence: CorpusEvidence[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
};

const ToolInputSchema = z
  .object({ evidence: z.array(CorpusEvidenceSchema) })
  .strict();

function thesisSectorsToTags(gicsCodes: string[]): string[] {
  const reg = loadRegistry();
  const tags = new Set<string>();
  for (const [tag, entry] of Object.entries(reg.sectors)) {
    if (
      entry.gics.some((c) =>
        gicsCodes.some((g) => g.startsWith(c) || c.startsWith(g)),
      )
    ) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}

function resolveTickers(thesis: Thesis, driver: IndustryDriver): string[] {
  if (driver.tickers && driver.tickers.length) return driver.tickers;
  return thesis.scope.tickers_seed;
}

export async function runBullResearcher(params: {
  thesis: Thesis;
  driver: IndustryDriver;
  limit?: number;
}): Promise<RunResult> {
  const limit = params.limit ?? RETRIEVE_LIMIT_DEFAULT;
  const thesis_sectors = thesisSectorsToTags(params.thesis.scope.sectors);
  const tickers = resolveTickers(params.thesis, params.driver);

  const posts = await retrieve({ thesis_sectors, tickers, limit });

  const lensPosts: LensPost[] = posts.map((p) => ({
    id: p.id,
    expert_name: p.expert_name,
    title: p.title,
    link: p.link,
    published: p.published,
    content: p.content,
  }));

  const req = buildLensContext({
    lens: "bull",
    thesis: params.thesis,
    driver: params.driver,
    posts: lensPosts,
  });

  const res = await createMessage({
    agent: "bull_researcher",
    system: req.system,
    messages: req.messages,
    tools: req.tools,
    tool_choice: req.tool_choice,
    max_tokens: 4096,
  });

  const toolCall = res.tool_calls.find((tc) => tc.name === "submit_evidence");
  if (!toolCall) {
    throw new Error(
      `bull_researcher: no submit_evidence tool call (finish=${res.finish_reason})`,
    );
  }

  const parsed = ToolInputSchema.parse(toolCall.input);
  return {
    evidence: parsed.evidence,
    usage: res.usage,
    model: res.model,
  };
}
