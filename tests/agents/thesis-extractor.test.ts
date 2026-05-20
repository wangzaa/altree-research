import { describe, it, expect, beforeEach, vi } from "vitest";

const createMessageMock = vi.fn();

vi.mock("@/lib/anthropic/client", () => ({
  createMessage: createMessageMock,
}));

const baseToolInput = {
  claim:
    "EU defense capex cycle benefits primes with multi-year backlog visibility",
  macro_premise:
    "EU defense rearmament continues; NATO 3% commitment holds through 2030",
  horizon_years: 5,
  scope: {
    type: "thematic" as const,
    sectors: ["20101010"],
    regions: ["EUROZONE", "UK"],
    market_cap_min_usd: 1_000_000_000,
    tickers_seed: ["RHM.DE", "BA.L", "LDO.MI"],
    tickers_exclude: [],
  },
  drivers: {
    industry: [
      {
        id: "backlog_to_revenue",
        claim: "Sector backlog/revenue >= 2y sustained",
        central_estimate: { value: 3.0, unit: "years" },
        thesis_breaks_below: 1.5,
        classification: "industry" as const,
      },
    ],
  },
  falsification: {
    primary:
      "NATO 3% commitment formally rolled back, OR EU procurement budget cut >20% YoY",
    secondary: "Sector backlog/revenue <1.5y for 2 consecutive quarters",
  },
  universe_id: "eu_defense_global",
};

function mockToolUseResponse(input: unknown) {
  createMessageMock.mockResolvedValueOnce({
    content: [
      {
        type: "tool_use",
        id: "toolu_1",
        name: "extract_thesis",
        input,
      },
    ],
    stop_reason: "tool_use",
    usage: { input_tokens: 100, output_tokens: 50 },
    raw: {},
  });
}

const callerInput = {
  sourceSnippet:
    "EU defense rearmament continues; primes have backlog visibility...",
  id: "eu_defense_rearmament_26_05_01",
  createdBy: "user_abc123",
  createdAt: "2026-05-13",
};

describe("extractThesis", () => {
  beforeEach(() => {
    createMessageMock.mockReset();
  });

  it("returns ok:true with a parsed thesis on happy path", async () => {
    mockToolUseResponse(baseToolInput);
    const { extractThesis } = await import("@/lib/agents/thesis-extractor");
    const result = await extractThesis(callerInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.thesis.id).toBe(callerInput.id);
    expect(result.thesis.createdBy).toBe(callerInput.createdBy);
    expect(result.thesis.createdAt).toBe(callerInput.createdAt);
    expect(result.thesis.version).toBe(1);
    expect(result.thesis.source_snippet).toBe(callerInput.sourceSnippet);
    expect(result.thesis.claim).toBe(baseToolInput.claim);
    expect(result.thesis.drivers.industry).toHaveLength(1);
    expect(result.thesis.drivers.industry[0].evidence).toEqual([]);
    expect(result.thesis.drivers.industry[0].verdict).toBeNull();
    expect(result.thesis.validation.status).toBe("draft");
  });

  it("forces tool use via tool_choice and passes the source snippet as user content", async () => {
    mockToolUseResponse(baseToolInput);
    const { extractThesis } = await import("@/lib/agents/thesis-extractor");
    await extractThesis(callerInput);
    expect(createMessageMock).toHaveBeenCalledTimes(1);
    const call = createMessageMock.mock.calls[0][0];
    expect(call.tool_choice).toEqual({ type: "tool", name: "extract_thesis" });
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].name).toBe("extract_thesis");
    expect(call.messages).toEqual([
      { role: "user", content: callerInput.sourceSnippet },
    ]);
    expect(Array.isArray(call.system)).toBe(true);
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("returns ok:false when no tool_use block exists", async () => {
    createMessageMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "sorry, I cannot help" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
      raw: {},
    });
    const { extractThesis } = await import("@/lib/agents/thesis-extractor");
    const result = await extractThesis(callerInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
  });

  it("returns ok:false with zod error when claim is missing", async () => {
    const bad = { ...baseToolInput } as Record<string, unknown>;
    delete bad.claim;
    mockToolUseResponse(bad);
    const { extractThesis } = await import("@/lib/agents/thesis-extractor");
    const result = await extractThesis(callerInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
    expect(result.raw).toEqual(bad);
  });

  it("returns ok:false on invalid GICS sector code", async () => {
    const bad = {
      ...baseToolInput,
      scope: { ...baseToolInput.scope, sectors: ["999999"] },
    };
    mockToolUseResponse(bad);
    const { extractThesis } = await import("@/lib/agents/thesis-extractor");
    const result = await extractThesis(callerInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toMatch(/sector|gics/);
    expect(result.raw).toEqual(bad);
  });

  it("returns ok:false on unknown region", async () => {
    const bad = {
      ...baseToolInput,
      scope: { ...baseToolInput.scope, regions: ["MARS"] },
    };
    mockToolUseResponse(bad);
    const { extractThesis } = await import("@/lib/agents/thesis-extractor");
    const result = await extractThesis(callerInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toMatch(/region/);
    expect(result.raw).toEqual(bad);
  });

  it("returns ok:false when tool_use.input is not an object", async () => {
    mockToolUseResponse("not an object");
    const { extractThesis } = await import("@/lib/agents/thesis-extractor");
    const result = await extractThesis(callerInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
    expect(result.raw).toBe("not an object");
  });

  it("returns ok:false when the tool_use block has the wrong tool name", async () => {
    createMessageMock.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "extract_thesis_v2",
          input: baseToolInput,
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50 },
      raw: {},
    });
    const { extractThesis } = await import("@/lib/agents/thesis-extractor");
    const result = await extractThesis(callerInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
  });
});
