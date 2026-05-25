import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const createMessageMock = vi.fn();

vi.mock("@/lib/llm/client", () => ({
  createMessage: createMessageMock,
}));

const validMemoInput = {
  verdict: "supports" as const,
  bull_summary:
    "The EU primes you are watching post 24-month backlog visibility across RHM.DE and BA.L, supported by NATO 3% commitments.",
  bear_summary:
    "If procurement is back-loaded to 2028+, the backlog ratio can compress below 1.5y by 2026 H2.",
  recommendation: "Hold the thesis; monitor RHM.DE quarterly book-to-bill.",
  open_questions: [
    "Does German parliament ratify the additional EUR 100B by Q3?",
    "What is LDO.MI's organic backlog growth ex-acquisitions?",
  ],
};

function mockToolUse(input: unknown) {
  createMessageMock.mockResolvedValueOnce({
    text: "",
    tool_calls: [{ id: "call_1", name: "draft_memo", input }],
    usage: { input_tokens: 800, output_tokens: 240 },
    model: "claude-sonnet-4-6",
    finish_reason: "tool_calls",
    raw: {},
  });
}

describe("writeMemo", () => {
  beforeEach(() => {
    createMessageMock.mockReset();
  });

  it("returns ok with parsed memo on a well-formed tool call", async () => {
    mockToolUse(validMemoInput);
    const { writeMemo } = await import("@/lib/agents/memo-writer");
    const result = await writeMemo({
      thesis: cloneCanonicalThesis(),
      scan: null,
      validation: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.memo.verdict).toBe("supports");
      expect(result.memo.open_questions).toHaveLength(2);
      expect(result.model).toBe("claude-sonnet-4-6");
      expect(result.usage.input_tokens).toBe(800);
    }
  });

  it("returns ok with empty open_questions when omitted", async () => {
    mockToolUse({
      verdict: "inconclusive",
      bull_summary: "Thin evidence.",
      bear_summary: "Thin evidence.",
      recommendation: "Wait for more corpus coverage.",
      open_questions: [],
    });
    const { writeMemo } = await import("@/lib/agents/memo-writer");
    const result = await writeMemo({
      thesis: cloneCanonicalThesis(),
      scan: null,
      validation: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.memo.open_questions).toEqual([]);
    }
  });

  it("returns ok:false when the model omits the tool call", async () => {
    createMessageMock.mockResolvedValueOnce({
      text: "I prefer prose to tool calls.",
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 30 },
      model: "claude-sonnet-4-6",
      finish_reason: "stop",
      raw: {},
    });
    const { writeMemo } = await import("@/lib/agents/memo-writer");
    const result = await writeMemo({
      thesis: cloneCanonicalThesis(),
      scan: null,
      validation: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/tool_use/i);
    }
  });

  it("returns ok:false on a verdict outside the enum", async () => {
    mockToolUse({
      ...validMemoInput,
      verdict: "maybe-supports",
    });
    const { writeMemo } = await import("@/lib/agents/memo-writer");
    const result = await writeMemo({
      thesis: cloneCanonicalThesis(),
      scan: null,
      validation: null,
    });
    expect(result.ok).toBe(false);
  });
});
