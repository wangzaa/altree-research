import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const createMessageMock = vi.fn();

vi.mock("@/lib/llm/client", () => ({
  createMessage: createMessageMock,
}));

function toolInputFromThesis(t: ReturnType<typeof cloneCanonicalThesis>) {
  return {
    claim: t.claim,
    macro_premise: t.macro_premise,
    horizon_years: t.horizon_years,
    scope: t.scope,
    drivers: {
      industry: t.drivers.industry.map((d) => ({
        id: d.id,
        claim: d.claim,
        central_estimate: d.central_estimate,
        thesis_breaks_below: d.thesis_breaks_below,
        classification: d.classification,
      })),
    },
    falsification: t.falsification,
    universe_id: t.universe_id,
  };
}

function mockToolUse(input: unknown) {
  createMessageMock.mockResolvedValueOnce({
    text: "",
    tool_calls: [{ id: "call_1", name: "propose_thesis", input }],
    usage: { input_tokens: 100, output_tokens: 50 },
    model: "claude-sonnet-4-6",
    finish_reason: "tool_calls",
    raw: {},
  });
}

describe("refineThesis", () => {
  beforeEach(() => {
    createMessageMock.mockReset();
  });

  it("returns ok:true with parsed proposed thesis on happy path", async () => {
    const current = cloneCanonicalThesis();
    const toolInput = toolInputFromThesis(current);
    toolInput.scope.regions = [...current.scope.regions, "JAPAN"];
    mockToolUse(toolInput);

    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({
      current,
      instruction: "add Japan to regions",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.thesis.scope.regions).toContain("JAPAN");
    expect(result.thesis.id).toBe(current.id);
    expect(result.thesis.version).toBe(current.version);
    expect(result.thesis.createdAt).toBe(current.createdAt);
    expect(result.thesis.createdBy).toBe(current.createdBy);
    expect(result.thesis.source_snippet).toBe(current.source_snippet);
  });

  it("forces tool use via tool_choice and includes current thesis + instruction in user content", async () => {
    const current = cloneCanonicalThesis();
    mockToolUse(toolInputFromThesis(current));

    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    await refineThesis({ current, instruction: "tighten the M1 break to 1.5" });

    expect(createMessageMock).toHaveBeenCalledTimes(1);
    const call = createMessageMock.mock.calls[0][0];
    expect(call.tool_choice).toEqual({ type: "tool", name: "propose_thesis" });
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].name).toBe("propose_thesis");
    expect(typeof call.system).toBe("string");
    expect(call.agent).toBe("thesis_refiner");
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0].role).toBe("user");
    const userContent = call.messages[0].content as string;
    expect(userContent).toContain("tighten the M1 break to 1.5");
    expect(userContent).toContain(current.claim);
    expect(userContent).toContain(current.id);
  });

  it("preserves envelope fields from caller's current even when model hallucinates them", async () => {
    const current = cloneCanonicalThesis();
    const toolInput = toolInputFromThesis(current);
    mockToolUse({
      ...toolInput,
      id: "WRONG_ID_99_99_99",
      version: 999,
      createdAt: "1999-01-01T00:00:00.000Z",
      createdBy: "imposter",
      source_snippet: "different snippet",
    } as unknown);

    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({ current, instruction: "noop" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.thesis.id).toBe(current.id);
    expect(result.thesis.version).toBe(current.version);
    expect(result.thesis.createdAt).toBe(current.createdAt);
    expect(result.thesis.createdBy).toBe(current.createdBy);
    expect(result.thesis.source_snippet).toBe(current.source_snippet);
  });

  it("returns ok:false when no tool_use block exists", async () => {
    createMessageMock.mockResolvedValueOnce({
      text: "sorry, I cannot help",
      tool_calls: [],
      usage: { input_tokens: 10, output_tokens: 5 },
      model: "claude-sonnet-4-6",
      finish_reason: "stop",
      raw: {},
    });
    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({
      current: cloneCanonicalThesis(),
      instruction: "x",
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
          input: toolInputFromThesis(cloneCanonicalThesis()),
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
      model: "claude-sonnet-4-6",
      finish_reason: "tool_calls",
      raw: {},
    });
    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({
      current: cloneCanonicalThesis(),
      instruction: "x",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
  });

  it("returns ok:false when tool_use.input is not an object", async () => {
    mockToolUse("not an object");
    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({
      current: cloneCanonicalThesis(),
      instruction: "x",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
    expect(result.raw).toBe("not an object");
  });

  it("returns ok:false with zod error when proposed thesis violates schema", async () => {
    const current = cloneCanonicalThesis();
    const bad = toolInputFromThesis(current) as Record<string, unknown>;
    delete bad.claim;
    mockToolUse(bad);
    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({ current, instruction: "drop the claim" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
    expect(result.raw).toEqual(bad);
  });

  it("returns ok:false on unknown region in proposed thesis", async () => {
    const current = cloneCanonicalThesis();
    const bad = toolInputFromThesis(current);
    bad.scope.regions = ["MARS"] as unknown as typeof bad.scope.regions;
    mockToolUse(bad);
    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({ current, instruction: "add Mars" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toMatch(/region/);
  });
});
