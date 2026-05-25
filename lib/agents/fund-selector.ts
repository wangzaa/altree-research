import { createMessage, type ToolSpec } from "@/lib/llm/client";
import { loadEndowusFunds, type EndowusFund } from "@/lib/data/endowus-funds";
import type { Thesis } from "@/lib/schemas/thesis";

export interface FundPick {
  isin: string;
  why: string;
}

export interface SelectedFund extends EndowusFund {
  /** LLM rationale tying this fund to the thesis. One sentence (~12-20 words). */
  why: string;
}

export type SelectFundsResult =
  | {
      ok: true;
      funds: SelectedFund[];
      model: string;
      usage: { input_tokens: number; output_tokens: number };
      /** ISINs the LLM picked that we couldn't find in the catalogue
       * (shouldn't normally happen — caught at the validation step). */
      dropped: string[];
    }
  | {
      ok: false;
      code: "tool_use_missing" | "tool_use_invalid";
      error: string;
      raw?: unknown;
    };

const TOOL_NAME = "pick_funds";

const pickFundsTool: ToolSpec = {
  name: TOOL_NAME,
  description:
    "Pick up to 4 Endowus funds that best express the user's investment thesis. Only call this tool. Do not return free-text.",
  input_schema: {
    type: "object",
    properties: {
      picks: {
        type: "array",
        minItems: 0,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            isin: {
              type: "string",
              description:
                "ISIN of a fund from the supplied catalogue. Must match exactly (case-sensitive).",
            },
            why: {
              type: "string",
              description:
                "One sentence (≤20 words) tying THIS fund to THIS thesis. Be specific about the overlap: regions, themes, or sub-categories. Avoid generic phrasing like 'good fund' or 'fits the thesis'.",
            },
          },
          required: ["isin", "why"],
        },
      },
    },
    required: ["picks"],
  },
};

const SYSTEM_PROMPT = `You match an investment thesis to a curated catalogue of Endowus funds.

You receive:
- The user's thesis (claim + macro premise + scope: sectors, regions, horizon).
- A shortlisted catalogue of funds with name, ISIN, asset class, sub-category, region, risk rating (1-7), 1Y and 3Y annualised returns.

Pick UP TO 4 funds. Quality > quantity — if only 2 funds genuinely fit, return 2. Never pad with funds that don't match the thesis.

Selection rules:
- Prefer funds whose Region overlaps with the thesis regions.
- Prefer funds whose Sub-Category aligns with the thesis sectors / theme (e.g. a robotics thesis pairs naturally with 'Disruptive Tech' or 'AI/Robotics' sub-categories; a defense thesis pairs with 'Defense' or 'Aerospace').
- Within matching funds, balance: 1-2 thematic pure-plays + 1-2 diversified regional or sector funds for breadth.
- Diversify across asset class only when the thesis is multi-asset; equity theses stay equity.
- Use the 3Y annualised return as a tiebreaker; never as the primary criterion.

Output via the pick_funds tool. Each pick must include the ISIN exactly as in the catalogue, and a one-sentence rationale tying that fund to this thesis.`;

function shortlistFunds(funds: EndowusFund[], thesis: Thesis): EndowusFund[] {
  // Heuristic pre-filter to keep the LLM input tight: keep funds whose
  // Region overlaps the thesis regions (mapped loosely below), plus any
  // global funds (always plausible). Drop fixed-income unless thesis
  // claim mentions bonds/credit/yield. Sort by 3Y return as a stable
  // ordering — the LLM still gets to choose.
  const regionTokens = new Set<string>();
  for (const r of thesis.scope.regions) {
    if (r === "US") regionTokens.add("us");
    if (r === "UK") regionTokens.add("uk");
    if (r === "EUROZONE" || r === "NORDICS" || r === "SWITZERLAND" || r === "CEE") {
      regionTokens.add("europe");
      regionTokens.add("eurozone");
    }
    if (r === "JAPAN") regionTokens.add("japan");
    if (r === "KOREA") regionTokens.add("korea");
    if (r === "GREATER_CHINA") {
      regionTokens.add("china");
      regionTokens.add("asia");
    }
    if (r === "SEA" || r === "SOUTH_ASIA") {
      regionTokens.add("asia");
    }
    if (r === "ANZ") regionTokens.add("asia pacific");
    if (r === "LATAM") regionTokens.add("emerging markets");
    if (r === "AFRICA" || r === "MIDDLE_EAST") regionTokens.add("emerging markets");
  }
  const claimLc = thesis.claim.toLowerCase();
  const isFixedIncomeRelevant =
    /bond|credit|yield|fixed[- ]income|treasur|duration/.test(claimLc);

  function matches(fund: EndowusFund): boolean {
    const region = fund.region.toLowerCase();
    const isGlobal = region.includes("global") || region.includes("developed");
    const regionMatch =
      isGlobal ||
      Array.from(regionTokens).some((t) => region.includes(t));
    if (!regionMatch) return false;
    if (fund.asset_class.toLowerCase() === "fixed income" && !isFixedIncomeRelevant) {
      return false;
    }
    return true;
  }

  const filtered = funds.filter(matches);
  filtered.sort(
    (a, b) =>
      (b.return_3y_annualised_pct ?? -Infinity) -
      (a.return_3y_annualised_pct ?? -Infinity),
  );
  // Cap to keep prompt size sane. ~60 funds + columns sits well under any
  // context limit while giving the LLM enough breadth.
  return filtered.slice(0, 60);
}

function fundDigest(funds: EndowusFund[]): string {
  // Compact tab-separated table. Including only the fields the model needs
  // to make the call — funding-source / distribution / payout aren't useful
  // for thesis-fit selection and just inflate tokens.
  const header =
    "ISIN\tName\tAsset Class\tSub-Category\tRegion\tRisk(1-7)\t1Y%\t3Y_ann%";
  const rows = funds.map((f) => {
    const r1 = f.return_1y_pct === null ? "" : f.return_1y_pct.toFixed(1);
    const r3 =
      f.return_3y_annualised_pct === null
        ? ""
        : f.return_3y_annualised_pct.toFixed(1);
    return [
      f.isin,
      f.fund_name,
      f.asset_class,
      f.sub_category,
      f.region,
      f.risk_rating,
      r1,
      r3,
    ].join("\t");
  });
  return [header, ...rows].join("\n");
}

function buildUserMessage(thesis: Thesis, funds: EndowusFund[]): string {
  return `Thesis:
- claim: ${thesis.claim}
- macro premise: ${thesis.macro_premise}
- horizon: ${thesis.horizon_years} years
- sectors (GICS): ${thesis.scope.sectors.join(", ")}
- regions: ${thesis.scope.regions.join(", ")}

Candidate fund catalogue (${funds.length} shortlisted from the full list):

${fundDigest(funds)}

Pick up to 4 funds via the pick_funds tool. Each pick: exact ISIN + one-sentence rationale.`;
}

export async function selectFunds(
  thesis: Thesis,
): Promise<SelectFundsResult> {
  const allFunds = loadEndowusFunds();
  const shortlist = shortlistFunds(allFunds, thesis);
  const byIsin = new Map(allFunds.map((f) => [f.isin, f]));

  const result = await createMessage({
    agent: "fund_selector",
    system: SYSTEM_PROMPT,
    tools: [pickFundsTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: buildUserMessage(thesis, shortlist) }],
  });

  const toolCall = result.tool_calls.find((tc) => tc.name === TOOL_NAME);
  if (!toolCall) {
    return {
      ok: false,
      code: "tool_use_missing",
      error: "Model did not produce a pick_funds tool_use block",
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

  const rawPicks = (toolCall.input as { picks?: unknown }).picks;
  const dropped: string[] = [];
  const selected: SelectedFund[] = [];
  const seen = new Set<string>();
  if (Array.isArray(rawPicks)) {
    for (const entry of rawPicks as Array<{ isin?: unknown; why?: unknown }>) {
      if (typeof entry?.isin !== "string" || typeof entry?.why !== "string") {
        dropped.push(typeof entry?.isin === "string" ? entry.isin : "(unknown)");
        continue;
      }
      const isin = entry.isin.trim();
      if (seen.has(isin)) {
        dropped.push(isin);
        continue;
      }
      const fund = byIsin.get(isin);
      if (!fund) {
        dropped.push(isin);
        continue;
      }
      seen.add(isin);
      selected.push({ ...fund, why: entry.why.trim() });
    }
  }

  return {
    ok: true,
    funds: selected.slice(0, 4),
    model: result.model,
    usage: result.usage,
    dropped,
  };
}
