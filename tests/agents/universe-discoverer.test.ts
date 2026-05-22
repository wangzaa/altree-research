import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const createMessageMock = vi.fn();

vi.mock("@/lib/llm/client", () => ({
  createMessage: createMessageMock,
}));

function mockToolUse(input: unknown) {
  createMessageMock.mockResolvedValueOnce({
    text: "",
    tool_calls: [{ id: "call_1", name: "propose_universe", input }],
    usage: { input_tokens: 100, output_tokens: 50 },
    model: "anthropic/claude-sonnet-4-6",
    finish_reason: "tool_calls",
    raw: {},
  });
}

const validToolInput = {
  tickers: [
    {
      ticker: "RHM.DE",
      exposure_tier: "pure_play",
      notes: "anchor",
      exposure_rationale: "Defence revenue >90% of group",
    },
    {
      ticker: "BA.L",
      exposure_tier: "pure_play",
      notes: "UK defence prime",
      exposure_rationale: "Pure UK defence prime",
    },
    {
      ticker: "LDO.MI",
      exposure_tier: "pure_play",
      notes: "Italian defence",
      exposure_rationale: "Italian defence single-segment",
    },
    {
      ticker: "SAAB-B.ST",
      exposure_tier: "pure_play",
      notes: "Swedish defence",
      exposure_rationale: "Swedish defence pure-play",
    },
    {
      ticker: "ITA",
      exposure_tier: "etf_proxy",
      notes: "US A&D ETF",
      exposure_rationale: "Tracks US Aerospace & Defense index",
    },
  ],
};

const anchor = {
  ticker: "RHM.DE",
  name: "Rheinmetall AG",
  sector: "Industrials",
  industry: "Aerospace & Defense",
  market_cap_usd: 38_000_000_000,
};

describe("discoverUniverse", () => {
  beforeEach(() => {
    createMessageMock.mockReset();
  });

  it("returns ok:true with parsed tickers on happy path", async () => {
    mockToolUse(validToolInput);
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tickers).toHaveLength(5);
    expect(result.tickers[0]).toEqual({
      ticker: "RHM.DE",
      exposure_tier: "pure_play",
      notes: "anchor",
      exposure_rationale: "Defence revenue >90% of group",
    });
  });

  it("forces tool use via tool_choice and includes thesis + anchor in user content", async () => {
    mockToolUse(validToolInput);
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(createMessageMock).toHaveBeenCalledTimes(1);
    const call = createMessageMock.mock.calls[0][0];
    expect(call.tool_choice).toEqual({ type: "tool", name: "propose_universe" });
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].name).toBe("propose_universe");
    expect(typeof call.system).toBe("string");
    expect(call.agent).toBe("universe_discoverer");
    expect(call.messages).toHaveLength(1);
    const content = call.messages[0].content as string;
    expect(content).toContain("Rheinmetall AG");
    expect(content).toContain("RHM.DE");
    expect(content).toContain("Aerospace & Defense");
  });

  it("system prompt enumerates the three exposure tiers and comps-style rules", async () => {
    mockToolUse(validToolInput);
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    const call = createMessageMock.mock.calls[0][0];
    const systemText = (call.system as string).toLowerCase();
    expect(systemText).toContain("pure_play");
    expect(systemText).toContain("diversified");
    expect(systemText).toContain("etf_proxy");
    expect(systemText).toContain("anchor");
    expect(systemText).toContain("region");
  });

  it("returns ok:false when no tool_use block exists", async () => {
    createMessageMock.mockResolvedValueOnce({
      text: "sorry",
      tool_calls: [],
      usage: { input_tokens: 1, output_tokens: 1 },
      model: "anthropic/claude-sonnet-4-6",
      finish_reason: "stop",
      raw: {},
    });
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
  });

  it("returns ok:false when tool_use has the wrong tool name", async () => {
    createMessageMock.mockResolvedValueOnce({
      text: "",
      tool_calls: [
        {
          id: "call_1",
          name: "extract_thesis",
          input: validToolInput,
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
      model: "anthropic/claude-sonnet-4-6",
      finish_reason: "tool_calls",
      raw: {},
    });
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
  });

  it("returns ok:false when tool_use.input is not an object", async () => {
    mockToolUse("not an object");
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
    expect(result.raw).toBe("not an object");
  });

  it("returns ok:false when an entry has unknown exposure_tier", async () => {
    mockToolUse({
      tickers: [
        ...validToolInput.tickers.slice(0, 4),
        { ticker: "X.L", exposure_tier: "speculative", notes: "n/a" },
      ],
    });
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toMatch(/exposure_tier|enum|tier/);
  });

  it("returns ok:false when tickers array is empty", async () => {
    mockToolUse({ tickers: [] });
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it("returns ok:false when more than 30 tickers proposed", async () => {
    const tooMany = Array.from({ length: 31 }, (_, i) => ({
      ticker: `STUB${i}.L`,
      exposure_tier: "pure_play",
      notes: "n",
    }));
    mockToolUse({ tickers: tooMany });
    const { discoverUniverse } = await import(
      "@/lib/agents/universe-discoverer"
    );
    const result = await discoverUniverse({
      thesis: cloneCanonicalThesis(),
      anchor,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toMatch(/max|too many|30|big/);
  });
});
