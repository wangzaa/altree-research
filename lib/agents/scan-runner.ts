import { z } from "zod";
import { createMessage, type ToolSpec } from "@/lib/llm/client";
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

const returnScanDescriptionTool: ToolSpec = {
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

const SYSTEM_PROMPT = `You are writing the Stage-3 scan context for a retail-investor research note. Be punchy. Use plain English. Short sentences.

You are given: the thesis claim, the universe of tickers, 5 years of monthly closing prices per ticker, and a snapshot of universe-aggregate fundamentals (mean and median gross margin, EBIT margin).

Write exactly three short paragraphs, ~60-90 words each. Purely descriptive — say what the numbers are, not what they mean.

Paragraph 1 — how this basket of stocks moved over the period. Lead with the headline magnitude (e.g. "The basket roughly doubled" or "Up about 35%"). Mention when the biggest moves happened. Plain talk; no jargon.

Paragraph 2 — what the fundamentals look like today. Cover mean and median for gross margin and EBIT margin. Translate decimals naturally ("around 35%", not "0.354"). Note where mean and median diverge — that signals a few outliers pulling the average.

Paragraph 3 — names that stood out. Pick 1-3 tickers with the biggest moves up or down. Use rough numbers ("up ~110%", "down ~30%"). No more than 3 names.

FORBIDDEN words: "should", "will", "expect", "likely", "believe", "outperform", "undervalued", "overvalued". State the numbers — don't predict or recommend.

Return the markdown via the return_scan_description tool. Do not return free-text alone.`;

function summarisePoints(history: TickerHistory): string {
  if (history.points.length === 0) return `${history.ticker}: no data`;
  const first = history.points[0];
  const last = history.points[history.points.length - 1];
  return `${history.ticker}: ${history.points.length} pts, ${first.date} ${first.close.toFixed(2)} → ${last.date} ${last.close.toFixed(2)}`;
}

function buildUserMessage(input: ScanRunnerInput): string {
  const { thesis, universe, history_5y, fundamentals_snapshot } = input;
  const tickerList = universe.tickers
    .map((t) => `${t.ticker} (${t.name})`)
    .join(", ");
  const histLines = history_5y.map(summarisePoints).join("\n");
  const fund = fundamentals_snapshot;
  return `Thesis claim: ${thesis.claim}

Universe (${universe.tickers.length} tickers): ${tickerList}

5y monthly history summary:
${histLines}

Fundamentals snapshot (${fund.per_ticker_used} tickers contributing):
gross_margin: mean=${fund.mean.gross_margin ?? "n/a"} median=${fund.median.gross_margin ?? "n/a"}
ebit_margin: mean=${fund.mean.ebit_margin ?? "n/a"} median=${fund.median.ebit_margin ?? "n/a"}

Write the three-paragraph descriptive markdown via the return_scan_description tool.`;
}

export async function scanRunner(
  input: ScanRunnerInput,
): Promise<ScanRunnerResult> {
  const result = await createMessage({
    agent: "scan_runner",
    system: SYSTEM_PROMPT,
    tools: [returnScanDescriptionTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: buildUserMessage(input) }],
    max_tokens: 1024,
  });

  const toolCall = result.tool_calls.find((tc) => tc.name === TOOL_NAME);
  if (!toolCall) {
    return {
      ok: false,
      error: "Model did not produce a return_scan_description tool_use block",
    };
  }
  if (
    typeof toolCall.input !== "object" ||
    toolCall.input === null ||
    Array.isArray(toolCall.input)
  ) {
    return {
      ok: false,
      error: "tool_use.input was not an object",
      raw: toolCall.input,
    };
  }
  const parsed = ToolInputSchema.safeParse(toolCall.input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message, raw: toolCall.input };
  }
  return { ok: true, markdown: parsed.data.markdown };
}
