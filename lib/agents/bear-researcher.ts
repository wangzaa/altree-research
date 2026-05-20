import Anthropic from "@anthropic-ai/sdk";
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
import type { IndustryDriver, Thesis } from "@/lib/schemas/thesis";

const BEAR_MODEL = "claude-opus-4-7";
const RETRIEVE_LIMIT_DEFAULT = 12;

export type RunResult = {
  evidence: CorpusEvidence[];
  usage: { input_tokens: number; output_tokens: number };
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

export async function runBearResearcher(params: {
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
    lens: "bear",
    thesis: params.thesis,
    driver: params.driver,
    posts: lensPosts,
  });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: BEAR_MODEL,
    max_tokens: 4096,
    system: req.system,
    messages: req.messages,
    tools: req.tools,
    tool_choice: req.tool_choice,
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      `bear_researcher: no tool_use block (stop=${res.stop_reason})`,
    );
  }

  let raw: unknown = toolUse.input;
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    typeof (raw as { evidence?: unknown }).evidence === "string"
  ) {
    raw = { evidence: JSON.parse((raw as { evidence: string }).evidence) };
  }

  const parsed = ToolInputSchema.parse(raw);
  return {
    evidence: parsed.evidence,
    usage: {
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
    },
  };
}
