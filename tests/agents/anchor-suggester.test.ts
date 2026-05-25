import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const createMessageMock = vi.fn();
const getQuoteMock = vi.fn();

vi.mock("@/lib/llm/client", () => ({
  createMessage: createMessageMock,
}));

vi.mock("@/lib/data/yahoo", () => ({
  getQuote: getQuoteMock,
}));

function mockToolUse(suggestions: unknown) {
  createMessageMock.mockResolvedValueOnce({
    text: "",
    tool_calls: [
      { id: "call_1", name: "suggest_anchor_tickers", input: { suggestions } },
    ],
    usage: { input_tokens: 400, output_tokens: 120 },
    model: "claude-sonnet-4-6",
    finish_reason: "tool_calls",
    raw: {},
  });
}

function jpyThesis() {
  // Canonical fixture is EU-defense; rewrite scope so JPY suggestions are
  // region-valid in these tests.
  const t = cloneCanonicalThesis();
  t.scope.regions = ["JAPAN"];
  t.scope.tickers_seed = [];
  return t;
}

describe("suggestAnchors", () => {
  beforeEach(() => {
    createMessageMock.mockReset();
    getQuoteMock.mockReset();
  });

  it("drops invented tickers that Yahoo cannot quote", async () => {
    mockToolUse([
      { ticker: "6954.T", name: "Fanuc", why: "Robotics leader" },
      { ticker: "ROBOTICS", name: "iRobot", why: "Made up symbol" },
    ]);
    const t = jpyThesis();
    t.scope.regions = ["JAPAN", "US"];
    getQuoteMock.mockImplementation(async (ticker: string) => {
      if (ticker === "6954.T")
        return { name: "Fanuc Corporation", market_cap_local: 0, currency: "JPY" };
      return null;
    });
    const { suggestAnchors } = await import("@/lib/agents/anchor-suggester");
    const result = await suggestAnchors(t);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestions.map((s) => s.ticker)).toEqual(["6954.T"]);
    expect(result.dropped).toEqual([
      { ticker: "ROBOTICS", reason: "yahoo_lookup_failed" },
    ]);
  });

  it("replaces LLM-supplied names with Yahoo's authoritative name", async () => {
    mockToolUse([
      { ticker: "6954.T", name: "placeholder", why: "Robotics leader" },
    ]);
    getQuoteMock.mockResolvedValue({
      name: "Fanuc Corporation",
      market_cap_local: 0,
      currency: "JPY",
    });
    const { suggestAnchors } = await import("@/lib/agents/anchor-suggester");
    const result = await suggestAnchors(jpyThesis());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestions[0].name).toBe("Fanuc Corporation");
  });

  it("returns an empty array (no minimum) when the LLM proposes nothing usable", async () => {
    mockToolUse([
      { ticker: "ROBOTICS", name: "placeholder", why: "placeholder" },
    ]);
    getQuoteMock.mockResolvedValue(null);
    const t = jpyThesis();
    t.scope.regions = ["JAPAN", "US"];
    const { suggestAnchors } = await import("@/lib/agents/anchor-suggester");
    const result = await suggestAnchors(t);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestions).toEqual([]);
    expect(result.dropped).toEqual([
      { ticker: "ROBOTICS", reason: "yahoo_lookup_failed" },
    ]);
  });

  it("drops candidates outside the thesis regions before hitting Yahoo", async () => {
    mockToolUse([
      { ticker: "6954.T", name: "Fanuc", why: "JPN" },
      // RHM.DE is EUROZONE; the JPY-only thesis below should reject it
      // without spending a Yahoo lookup on it.
      { ticker: "RHM.DE", name: "Rheinmetall", why: "EU" },
    ]);
    getQuoteMock.mockResolvedValue({
      name: "Fanuc Corporation",
      market_cap_local: 0,
      currency: "JPY",
    });
    const { suggestAnchors } = await import("@/lib/agents/anchor-suggester");
    const result = await suggestAnchors(jpyThesis());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestions.map((s) => s.ticker)).toEqual(["6954.T"]);
    // RHM.DE must be dropped in pass 1 (region) — Yahoo only called for 6954.T.
    expect(getQuoteMock).toHaveBeenCalledTimes(1);
    expect(getQuoteMock).toHaveBeenCalledWith("6954.T");
    expect(result.dropped).toEqual([
      { ticker: "RHM.DE", reason: "wrong_region" },
    ]);
  });

  it("returns ok:false when the LLM omits the tool call", async () => {
    createMessageMock.mockResolvedValueOnce({
      text: "no",
      tool_calls: [],
      usage: { input_tokens: 1, output_tokens: 1 },
      model: "claude-sonnet-4-6",
      finish_reason: "stop",
      raw: {},
    });
    const { suggestAnchors } = await import("@/lib/agents/anchor-suggester");
    const result = await suggestAnchors(jpyThesis());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("tool_use_missing");
  });
});
