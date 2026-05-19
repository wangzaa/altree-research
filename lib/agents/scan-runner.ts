import { z } from "zod";
import {
  createMessage,
  type AnthropicContentBlock,
  type AnthropicTextBlockParam,
  type AnthropicTool,
  type AnthropicToolUse,
} from "@/lib/anthropic/client";
import type { Thesis } from "@/lib/schemas/thesis";
import type { Universe } from "@/lib/schemas/universe";
import type { FundamentalsAggregate } from "@/lib/aggregation/fundamentals";
import type { TickerHistory } from "@/lib/schemas/scan";

export interface ScanRunnerInput {
  thesis: Thesis;
  universe: Universe;
  history_5y: TickerHistory[];
  fundamentals_snapshot: FundamentalsAggregate;
}

export type ScanRunnerResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string; raw?: unknown };

const TOOL_NAME = "return_scan_description";

const ToolInputSchema = z
  .object({
    markdown: z.string().min(1),
  })
  .strict();

const returnScanDescriptionTool: AnthropicTool = {
  name: TOOL_NAME,
  description:
    "Return the three-paragraph descriptive markdown for the Stage-3 scan. Do not return free-text.",
  input_schema: {
    type: "object",
    properties: {
      markdown: {
        type: "string",
        description:
          "Exactly three short markdown paragraphs separated by blank lines.",
      },
    },
    required: ["markdown"],
  },
};

const systemBlocks: AnthropicTextBlockParam[] = [
  {
    type: "text",
    text: `You are writing the descriptive Stage-3 context for an investment research artifact.

You are given: the thesis claim, the universe of tickers being investigated, 5 years of monthly closing prices per ticker, and a single snapshot of universe-aggregate fundamentals (mean and median gross margin, EBIT margin, FCF yield).

Your job: write exactly three short paragraphs (~80-120 words each) of purely descriptive prose summarising what the data shows.

Paragraph 1 — universe price-history trajectory: aggregate trends across the universe. No predictions.

Paragraph 2 — fundamentals snapshot: report mean and median for gross margin, EBIT margin, FCF yield as observed today. Note the spread between mean and median where notable.

Paragraph 3 — dispersion / outliers: name 1-3 tickers whose 5y trajectory diverges sharply from the universe (top performer, bottom performer, or notable shape). Cite the rough magnitude.

FORBIDDEN: judgment, prediction, valuation language. Do NOT use the words: "should", "will", "expect", "likely", "believe", "outperform", "undervalued", "overvalued". State only what the numbers are. Do NOT recommend action.

Return the markdown via the return_scan_description tool. Do not return free-text alone.`,
    cache_control: { type: "ephemeral" },
  },
];

function findToolUse(
  content: AnthropicContentBlock[],
): AnthropicToolUse | undefined {
  for (const block of content) {
    if (block.type === "tool_use" && block.name === TOOL_NAME) {
      return block;
    }
  }
  return undefined;
}

function summarisePoints(history: TickerHistory): string {
  if (history.points.length === 0) return `${history.ticker}: no data`;
  const first = history.points[0];
  const last = history.points[history.points.length - 1];
  return `${history.ticker}: ${history.points.length} pts, ${first.date} ${first.close.toFixed(2)} → ${last.date} ${last.close.toFixed(2)}`;
}

function buildUserMessage(input: ScanRunnerInput): string {
  const { thesis, universe, history_5y, fundamentals_snapshot } = input;
  const tickerList = universe.tickers.map((t) => `${t.ticker} (${t.name})`).join(", ");
  const histLines = history_5y.map(summarisePoints).join("\n");
  const fund = fundamentals_snapshot;
  return `Thesis claim: ${thesis.claim}

Universe (${universe.tickers.length} tickers): ${tickerList}

5y monthly history summary:
${histLines}

Fundamentals snapshot (${fund.per_ticker_used} tickers contributing):
gross_margin: mean=${fund.mean.gross_margin ?? "n/a"} median=${fund.median.gross_margin ?? "n/a"}
ebit_margin: mean=${fund.mean.ebit_margin ?? "n/a"} median=${fund.median.ebit_margin ?? "n/a"}
fcf_yield: mean=${fund.mean.fcf_yield ?? "n/a"} median=${fund.median.fcf_yield ?? "n/a"}

Write the three-paragraph descriptive markdown via the return_scan_description tool.`;
}

export async function scanRunner(
  input: ScanRunnerInput,
): Promise<ScanRunnerResult> {
  const result = await createMessage({
    system: systemBlocks,
    tools: [returnScanDescriptionTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: buildUserMessage(input) }],
    max_tokens: 1024,
  });

  const toolUse = findToolUse(result.content);
  if (!toolUse) {
    return {
      ok: false,
      error: "Model did not produce a return_scan_description tool_use block",
    };
  }
  if (
    typeof toolUse.input !== "object" ||
    toolUse.input === null ||
    Array.isArray(toolUse.input)
  ) {
    return { ok: false, error: "tool_use.input was not an object", raw: toolUse.input };
  }
  const parsed = ToolInputSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message, raw: toolUse.input };
  }
  return { ok: true, markdown: parsed.data.markdown };
}
