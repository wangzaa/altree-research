import { z } from "zod";
import { createMessage, type ToolSpec } from "@/lib/llm/client";
import { ExposureTierSchema } from "@/lib/schemas/universe";
import type { Thesis } from "@/lib/schemas/thesis";

export interface DiscoverAnchor {
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  market_cap_usd: number | null;
}

export interface DiscoverUniverseInput {
  thesis: Thesis;
  anchor: DiscoverAnchor;
}

export interface ProposedTicker {
  ticker: string;
  exposure_tier: "pure_play" | "diversified" | "etf_proxy";
  notes: string;
  exposure_rationale: string;
}

export type DiscoverUniverseResult =
  | {
      ok: true;
      tickers: ProposedTicker[];
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    }
  | { ok: false; error: string; raw?: unknown };

const TOOL_NAME = "propose_universe";

const ProposedTickerSchema = z
  .object({
    ticker: z.string().min(1),
    exposure_tier: ExposureTierSchema,
    notes: z.string().default(""),
    exposure_rationale: z.string().default(""),
  })
  .strict();

const ToolInputSchema = z
  .object({
    tickers: z.array(ProposedTickerSchema).min(5).max(30),
  })
  .strict();

const proposeUniverseTool: ToolSpec = {
  name: TOOL_NAME,
  description:
    "Return a 10–25 ticker candidate universe for the supplied thesis anchored on the given company. Only call this tool. Do not return free-text.",
  input_schema: {
    type: "object",
    properties: {
      tickers: {
        type: "array",
        minItems: 5,
        maxItems: 30,
        items: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              description: "Yahoo Finance ticker with suffix (e.g. RHM.DE).",
            },
            exposure_tier: {
              type: "string",
              enum: ["pure_play", "diversified", "etf_proxy"],
            },
            notes: {
              type: "string",
              description:
                "One-line note explaining what makes this ticker a comparable peer to the anchor for THIS thesis. Be specific about the business model overlap. Examples: 'Korean DRAM/NAND maker, direct peer to anchor', 'US analog/embedded semis, secondary exposure to AI capex cycle', 'Broad US semis ETF, sector proxy'. DO NOT echo the company name — that is redundant with the Name column. Keep under 80 chars.",
            },
            exposure_rationale: {
              type: "string",
              description:
                "One-line justification for the exposure_tier classification. pure_play means the thesis driver is the company's single dominant business; diversified means the exposure is present but is one of several segments; etf_proxy means a basket. Examples: 'Memory chips are >80% of revenue', 'Strong AI capex exposure but also legacy industrial automation', 'Tracks SOX index'. Keep under 80 chars.",
            },
          },
          required: [
            "ticker",
            "exposure_tier",
            "notes",
            "exposure_rationale",
          ],
        },
      },
    },
    required: ["tickers"],
  },
};

const SYSTEM_PROMPT = `You are building a comparable-company universe for an investment thesis.

Inputs:
- The thesis claim and scope (sectors, regions, market_cap_min_usd).
- An anchor ticker the analyst has identified as embodying the thesis, with its name, sector, industry, and market cap.

Your job: propose 10–25 ticker candidates that are TRULY comparable to the anchor for the purpose of evaluating this thesis.

Peer-selection rules:
- Same business model as the anchor (pure-play preferred; diversified conglomerates only when no pure-play exists in a region).
- Comparable scale (within ~10x of the anchor's market cap; exclude micro-caps below market_cap_min_usd).
- Comparable geography (prefer companies in the thesis's regions; cross-region peers only when they are clear market leaders).
- Avoid: distressed/bankrupt names, pre-revenue startups, holding companies, pure-financial wrappers (BDCs, REITs unless the thesis IS about REITs).
- Include 1–2 ETF proxies (broad-sector ETFs that approximate the thesis exposure) tagged etf_proxy.
- Each non-ETF ticker is classified as pure_play (single-business primary exposure) or diversified (the company has the exposure but it's part of a larger mix).

Yahoo ticker conventions (suffix -> region):
- US (no suffix). UK: .L. EUROZONE: .DE/.F/.PA/.MI/.MC/.AS/.BR/.LS/.I/.VI/.HE/.AT/.RG/.TL/.VS. NORDICS: .ST/.OL/.CO/.IC. SWITZERLAND: .SW/.VX. CEE: .WA/.BD/.PR/.RO/.IS. JAPAN: .T. KOREA: .KS/.KQ. GREATER_CHINA: .SS/.SZ/.HK/.TW/.TWO. SOUTH_ASIA: .NS/.BO/.KA/.DH/.CM. SEA: .SI/.JK/.KL/.BK/.PS/.VN. ANZ: .AX/.NZ. CANADA: .TO/.V/.NE/.CN. LATAM: .SA/.MX/.SN/.BA/.CL/.LM. MIDDLE_EAST: .TA/.AE/.SR/.QA/.KW. AFRICA: .JO/.CA/.LG/.MA.
- There is no catch-all region; if a ticker's market doesn't fit any of these, do not include it.

Return the full candidate list via the supplied tool. Do not return free-text.`;

function buildUserMessage(input: DiscoverUniverseInput): string {
  const { thesis, anchor } = input;
  const marketCapLine =
    anchor.market_cap_usd !== null
      ? `Market cap: USD ${(anchor.market_cap_usd / 1e9).toFixed(2)}B`
      : "Market cap: unknown";
  return `Thesis claim: ${thesis.claim}

Thesis scope:
- sectors (GICS): ${thesis.scope.sectors.join(", ")}
- regions: ${thesis.scope.regions.join(", ")}
- market_cap_min_usd: ${thesis.scope.market_cap_min_usd}

Anchor company:
- ticker: ${anchor.ticker}
- name: ${anchor.name}
- sector: ${anchor.sector ?? "unknown"}
- industry: ${anchor.industry ?? "unknown"}
- ${marketCapLine}

Propose the comparable universe via the propose_universe tool.`;
}

export async function discoverUniverse(
  input: DiscoverUniverseInput,
): Promise<DiscoverUniverseResult> {
  const result = await createMessage({
    agent: "universe_discoverer",
    system: SYSTEM_PROMPT,
    tools: [proposeUniverseTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: buildUserMessage(input) }],
  });

  const toolCall = result.tool_calls.find((tc) => tc.name === TOOL_NAME);
  if (!toolCall) {
    return {
      ok: false,
      error: "Model did not produce a propose_universe tool_use block",
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
    return {
      ok: false,
      error: parsed.error.message,
      raw: toolCall.input,
    };
  }
  return {
    ok: true,
    tickers: parsed.data.tickers,
    model: result.model,
    usage: result.usage,
  };
}
