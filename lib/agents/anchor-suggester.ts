import { createMessage, type ToolSpec } from "@/lib/llm/client";
import { REGION_VALUES, getRegionForTicker } from "@/lib/data/regions";
import { getQuote } from "@/lib/data/yahoo";
import { YAHOO_TICKER_REGEX, type Thesis } from "@/lib/schemas/thesis";

export interface AnchorSuggestion {
  ticker: string;
  name: string;
  why: string;
}

export type AnchorSuggestionDropReason =
  | "shape_invalid"
  | "regex_fail"
  | "wrong_region"
  | "duplicate_or_seed"
  | "yahoo_lookup_failed";

export interface AnchorSuggestionDrop {
  ticker: string;
  reason: AnchorSuggestionDropReason;
}

export type AnchorSuggestResult =
  | {
      ok: true;
      suggestions: AnchorSuggestion[];
      model: string;
      usage: { input_tokens: number; output_tokens: number };
      /** Candidates the LLM proposed that didn't survive validation, with
       * the reason each one was dropped. Surfaced in the UI so the user
       * can tell whether the small suggestion list is the LLM being
       * conservative (empty dropped list) or validation being strict
       * (many dropped). */
      dropped: AnchorSuggestionDrop[];
    }
  | {
      ok: false;
      code: "tool_use_missing" | "tool_use_invalid";
      error: string;
      raw?: unknown;
    };

const TOOL_NAME = "suggest_anchor_tickers";
const TICKER_PATTERN_JSON = "^[A-Z0-9\\-]+(\\.[A-Z]+)?$";

const suggestAnchorTool: ToolSpec = {
  name: TOOL_NAME,
  description:
    "Return up to 12 candidate Yahoo Finance tickers that fit the thesis scope. UI-only: these are suggestions for the user to pick an anchor from, not validated facts.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        // Lower bound is intentionally 0 so the model can return only the
        // candidates it has high confidence in, rather than padding to a
        // floor with invented symbols. Server-side we then validate every
        // entry against Yahoo, so quality is enforced after the call too.
        // Upper bound raised to 12 to give the model headroom when the
        // validation step drops some candidates as not Yahoo-quotable.
        minItems: 0,
        maxItems: 12,
        items: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              pattern: TICKER_PATTERN_JSON,
              description:
                "Yahoo Finance ticker with suffix where applicable (RHM.DE, BA.L, 7203.T). Uppercase letters/digits/hyphens, optional .SUFFIX. No spaces, no company names.",
            },
            name: {
              type: "string",
              description:
                "Company name as it commonly appears in filings (e.g. 'Fanuc Corporation').",
            },
            why: {
              type: "string",
              description:
                "Short rationale (max ~12 words) for why this ticker fits the thesis scope. E.g. 'Japanese industrial robot leader' or 'EU prime defense contractor'.",
            },
          },
          required: ["ticker", "name", "why"],
        },
      },
    },
    required: ["suggestions"],
  },
};

const SYSTEM_PROMPT = `You are a buy-side research analyst proposing candidate anchor tickers for an investment thesis.

The user has a thesis with a scope (sectors, regions, claim, macro_premise) but no specific tickers yet — or wants alternative neighbors to the ones already named. Your job: produce 4 to 8 well-known, liquid public-equity candidates whose primary business is squarely inside the thesis scope.

Rules:
- Use the supplied tool to return suggestions. Do not return free-text.
- Every ticker MUST be a valid Yahoo Finance symbol with the correct exchange suffix (e.g. RHM.DE for Germany, BA.L for UK, 7203.T for Japan, 2330.TW for Taiwan, 000660.KS for Korea). Never invent suffixes.
- Every ticker MUST sit inside one of the thesis's regions. Do not propose a US ticker for a Japan-only thesis.
- Region codes: US, CANADA, LATAM, UK, EUROZONE, NORDICS, SWITZERLAND, CEE, MIDDLE_EAST, AFRICA, JAPAN, KOREA, GREATER_CHINA, SOUTH_ASIA, SEA, ANZ. There is no catch-all region.
- Prefer large/mid-cap, liquid, primary listings. Avoid ADRs unless the primary listing is unavailable. Avoid bankrupt or delisted names.
- 'why' must be specific to the thesis (e.g. 'Japanese industrial robot leader, Asia automation exposure') — not generic ('large company in this sector').
- Diversify across the thesis regions when more than one region is in scope. Do not list 8 names from the same exchange unless the thesis is single-region.
- Avoid duplicates of the tickers already in scope.tickers_seed (which will be listed for you in the user message).
- HARD STOP: Never output placeholder strings, examples, or made-up symbols. Every entry must be a real, currently-tradable Yahoo Finance symbol you have high confidence in. Words like 'ROBOTICS', 'AUTOMATION', or 'PLACEHOLDER' as standalone tickers are invented and forbidden — real US tickers are 1–5 uppercase letters (e.g. NVDA, AAPL, TSLA); foreign listings always carry an exchange suffix (e.g. 6954.T, RHM.DE). If you cannot think of 4 real candidates, return fewer — never pad with invented ones.
- Concrete Yahoo suffix examples by region — use these when the thesis spans these regions, rather than skipping them out of caution:
  • Greater China A-shares: .SZ (Shenzhen, e.g. 300024.SZ Siasun Robot, 002230.SZ iFlytek) and .SS (Shanghai, e.g. 600519.SS Kweichow Moutai, 688981.SS SMIC).
  • Greater China Hong Kong: .HK (e.g. 9988.HK Alibaba, 2382.HK Sunny Optical, 1810.HK Xiaomi).
  • Greater China Taiwan: .TW (e.g. 2330.TW TSMC, 2308.TW Delta Electronics).
  • Korea: .KS (e.g. 005930.KS Samsung Electronics, 000660.KS SK Hynix).
  • Japan: .T (e.g. 6954.T Fanuc, 7203.T Toyota).
  • Eurozone: .DE (Germany), .PA (France), .MI (Italy), .MC (Spain), .AS (Netherlands).
  These are exemplars, not a closed list — include any other real tickers in scope.`;

interface ToolSuggestionInput {
  ticker: unknown;
  name: unknown;
  why: unknown;
}

function buildUserMessage(thesis: Thesis): string {
  const scope = thesis.scope;
  const seedLine =
    scope.tickers_seed.length > 0
      ? scope.tickers_seed.join(", ")
      : "(none — the user named no specific companies)";
  return `Thesis claim:
${thesis.claim}

Macro premise:
${thesis.macro_premise}

Horizon: ${thesis.horizon_years} years
Sectors (GICS): ${scope.sectors.join(", ")}
Regions: ${scope.regions.join(", ")}
Already in scope.tickers_seed: ${seedLine}

Suggest 4 to 8 anchor candidates that fit this scope.`;
}

export async function suggestAnchors(thesis: Thesis): Promise<AnchorSuggestResult> {
  const result = await createMessage({
    agent: "anchor_suggester",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(thesis) }],
    tools: [suggestAnchorTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolCall = result.tool_calls.find((tc) => tc.name === TOOL_NAME);
  if (!toolCall) {
    return {
      ok: false,
      code: "tool_use_missing",
      error: "Model did not produce a tool_use block",
    };
  }
  if (
    typeof toolCall.input !== "object" ||
    toolCall.input === null ||
    Array.isArray(toolCall.input)
  ) {
    return {
      ok: false,
      code: "tool_use_invalid",
      error: "tool_use.input was not an object",
      raw: toolCall.input,
    };
  }

  const rawSuggestions = (toolCall.input as { suggestions?: unknown })
    .suggestions;
  const allowedRegions = new Set<string>(thesis.scope.regions);
  const seedSet = new Set(thesis.scope.tickers_seed);

  const dropped: AnchorSuggestionDrop[] = [];
  // First pass: shape + regex + region + dedupe + seed filter. Anything
  // that survives this is at least a plausible candidate to send to Yahoo.
  const candidates: { ticker: string; why: string }[] = [];
  const seen = new Set<string>();
  if (Array.isArray(rawSuggestions)) {
    for (const entry of rawSuggestions as ToolSuggestionInput[]) {
      if (
        typeof entry?.ticker !== "string" ||
        typeof entry?.name !== "string" ||
        typeof entry?.why !== "string"
      ) {
        dropped.push({
          ticker:
            typeof entry?.ticker === "string" ? entry.ticker : "(unknown)",
          reason: "shape_invalid",
        });
        continue;
      }
      const ticker = entry.ticker.toUpperCase();
      if (!YAHOO_TICKER_REGEX.test(ticker)) {
        dropped.push({ ticker, reason: "regex_fail" });
        continue;
      }
      if (seedSet.has(ticker) || seen.has(ticker)) {
        dropped.push({ ticker, reason: "duplicate_or_seed" });
        continue;
      }
      const region = getRegionForTicker(ticker);
      if (region === null || !allowedRegions.has(region)) {
        dropped.push({ ticker, reason: "wrong_region" });
        continue;
      }
      seen.add(ticker);
      candidates.push({ ticker, why: entry.why.trim() });
    }
  }

  // Second pass: validate each candidate against Yahoo. Drop anything Yahoo
  // can't quote (invented symbols like "ROBOTICS", placeholders, delisted
  // names). Use Yahoo's authoritative `name` rather than the LLM's, so
  // "placeholder" or stale company-name strings never reach the picker.
  const validated = await Promise.allSettled(
    candidates.map(async ({ ticker, why }) => {
      const quote = await getQuote(ticker);
      if (!quote || !quote.name) return { ticker, ok: false as const };
      return { ticker, ok: true as const, name: quote.name, why };
    }),
  );

  const cleaned: AnchorSuggestion[] = [];
  for (let i = 0; i < validated.length; i++) {
    const settled = validated[i];
    const candidate = candidates[i];
    if (settled.status === "fulfilled" && settled.value.ok) {
      cleaned.push({
        ticker: settled.value.ticker,
        name: settled.value.name,
        why: settled.value.why,
      });
    } else {
      dropped.push({
        ticker: candidate.ticker,
        reason: "yahoo_lookup_failed",
      });
    }
  }

  return {
    ok: true,
    suggestions: cleaned,
    model: result.model,
    usage: result.usage,
    dropped,
  };
}

// Re-exported for tests / consumers that want to introspect what the agent
// would accept without instantiating the LLM client.
export const _ANCHOR_SUGGESTER_REGIONS = REGION_VALUES;
