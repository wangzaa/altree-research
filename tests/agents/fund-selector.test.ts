import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const createMessageMock = vi.fn();
const loadEndowusFundsMock = vi.fn();

vi.mock("@/lib/llm/client", () => ({
  createMessage: createMessageMock,
}));

vi.mock("@/lib/data/endowus-funds", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/data/endowus-funds")
  >("@/lib/data/endowus-funds");
  return {
    ...actual,
    loadEndowusFunds: loadEndowusFundsMock,
  };
});

function fund(overrides: Partial<{
  isin: string;
  fund_name: string;
  asset_class: string;
  sub_category: string;
  region: string;
  funding_source: string;
  distribution_type: string;
  risk_rating: number;
  fund_fees_pct: number | null;
  return_1y_pct: number | null;
  return_3y_annualised_pct: number | null;
  payout_1y_pct: number | null;
}>) {
  return {
    isin: "TEST0001",
    fund_name: "Test Fund",
    asset_class: "Equity",
    sub_category: "Growth",
    region: "Global",
    funding_source: "USD Cash",
    distribution_type: "Accumulating",
    risk_rating: 6,
    fund_fees_pct: 0.8,
    return_1y_pct: 12,
    return_3y_annualised_pct: 9,
    payout_1y_pct: null,
    ...overrides,
  };
}

function mockToolUse(picks: unknown) {
  createMessageMock.mockResolvedValueOnce({
    text: "",
    tool_calls: [{ id: "c", name: "pick_funds", input: { picks } }],
    usage: { input_tokens: 500, output_tokens: 80 },
    model: "anthropic/claude-sonnet-4-6",
    finish_reason: "tool_calls",
    raw: {},
  });
}

describe("selectFunds", () => {
  beforeEach(() => {
    createMessageMock.mockReset();
    loadEndowusFundsMock.mockReset();
  });

  it("returns picks resolved against the catalogue with LLM rationale attached", async () => {
    loadEndowusFundsMock.mockReturnValue([
      fund({ isin: "AAA", fund_name: "Asia Robotics" }),
      fund({ isin: "BBB", fund_name: "China Growth", region: "China" }),
    ]);
    mockToolUse([
      { isin: "AAA", why: "Direct robotics exposure" },
      { isin: "BBB", why: "Greater China overlap" },
    ]);
    const { selectFunds } = await import("@/lib/agents/fund-selector");
    const result = await selectFunds(cloneCanonicalThesis());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.funds.map((f) => f.isin)).toEqual(["AAA", "BBB"]);
    expect(result.funds[0].why).toBe("Direct robotics exposure");
    expect(result.funds[1].fund_name).toBe("China Growth");
  });

  it("drops picks whose ISIN isn't in the catalogue", async () => {
    loadEndowusFundsMock.mockReturnValue([fund({ isin: "AAA" })]);
    mockToolUse([
      { isin: "AAA", why: "real" },
      { isin: "GHOST", why: "made up" },
    ]);
    const { selectFunds } = await import("@/lib/agents/fund-selector");
    const result = await selectFunds(cloneCanonicalThesis());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.funds.map((f) => f.isin)).toEqual(["AAA"]);
    expect(result.dropped).toEqual(["GHOST"]);
  });

  it("caps at 4 funds even if the LLM returns more", async () => {
    loadEndowusFundsMock.mockReturnValue([
      fund({ isin: "A" }),
      fund({ isin: "B" }),
      fund({ isin: "C" }),
      fund({ isin: "D" }),
      fund({ isin: "E" }),
    ]);
    mockToolUse([
      { isin: "A", why: "1" },
      { isin: "B", why: "2" },
      { isin: "C", why: "3" },
      { isin: "D", why: "4" },
      { isin: "E", why: "5" },
    ]);
    const { selectFunds } = await import("@/lib/agents/fund-selector");
    const result = await selectFunds(cloneCanonicalThesis());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.funds).toHaveLength(4);
  });

  it("returns ok:false when the LLM omits the tool call", async () => {
    loadEndowusFundsMock.mockReturnValue([fund({})]);
    createMessageMock.mockResolvedValueOnce({
      text: "no",
      tool_calls: [],
      usage: { input_tokens: 1, output_tokens: 1 },
      model: "anthropic/claude-sonnet-4-6",
      finish_reason: "stop",
      raw: {},
    });
    const { selectFunds } = await import("@/lib/agents/fund-selector");
    const result = await selectFunds(cloneCanonicalThesis());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("tool_use_missing");
  });
});
