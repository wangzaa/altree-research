import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Candidate } from "@/lib/agents/theme-exposure/recall";
import type { Theme } from "@/lib/schemas/themes";

const createMessageMock = vi.fn();
vi.mock("@/lib/llm/client", () => ({
  createMessage: createMessageMock,
}));

const theme: Theme = {
  id: "memory_cycle",
  label: "Memory chip up-cycle",
  description: "DRAM/HBM/NAND pricing recovery and capacity additions.",
  keywords: ["dram", "hbm", "nand", "memory", "semiconductor", "wafer"],
};

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    company: over.company ?? {
      ticker: "6146",
      yahoo_ticker: "6146.T",
      yahoo_verified: true,
      name_en: "Disco Corp",
      sector: "Technology",
      listed_at: null,
      financials: {
        revenue_jpy_mn: null,
        gross_profit_jpy_mn: null,
        operating_profit_jpy_mn: null,
        operating_margin: null,
        revenue_yoy: null,
      },
      description: "Precision cutting/grinding tools for semiconductor wafers.",
      latest_post_interview: null,
    },
    matched: over.matched ?? [
      {
        id: "r1",
        type: "NEWS_UPDATE",
        published_at: "2026-04-12T00:00:00Z",
        title: "New HBM dicing line",
        text: "Announced capacity expansion for HBM wafer dicing.",
      },
    ],
  };
}

function mockTag(input: unknown) {
  createMessageMock.mockResolvedValueOnce({
    text: "",
    tool_calls: [{ id: "c", name: "tag_exposure", input }],
    usage: {
      input_tokens: 300,
      output_tokens: 40,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    model: "claude-sonnet-4-6",
    finish_reason: "tool_calls",
    raw: {},
  });
}

describe("tagCandidate", () => {
  beforeEach(() => createMessageMock.mockReset());

  it("returns an exposed company with the dated rationale when confirmed", async () => {
    mockTag({
      exposed: true,
      rationale: "Expanded HBM dicing capacity (Apr 2026).",
      as_of: "2026-04-12",
    });
    const { tagCandidate } = await import("@/lib/agents/theme-exposure/theme-tagger");
    const res = await tagCandidate(theme, candidate());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.exposed).toBe(true);
    if (!res.exposed) return;
    expect(res.company.ticker).toBe("6146");
    expect(res.company.rationale).toBe("Expanded HBM dicing capacity (Apr 2026).");
    expect(res.company.as_of).toBe("2026-04-12");
  });

  it("drops a false positive when the LLM says not exposed", async () => {
    mockTag({ exposed: false });
    const { tagCandidate } = await import("@/lib/agents/theme-exposure/theme-tagger");
    const res = await tagCandidate(theme, candidate());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.exposed).toBe(false);
  });

  it("drops an exposed verdict that omits a dated rationale (defensive)", async () => {
    mockTag({ exposed: true, rationale: "" });
    const { tagCandidate } = await import("@/lib/agents/theme-exposure/theme-tagger");
    const res = await tagCandidate(theme, candidate());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.exposed).toBe(false);
  });

  it("reports ok:false when the LLM omits the tool call", async () => {
    createMessageMock.mockResolvedValueOnce({
      text: "no",
      tool_calls: [],
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      model: "claude-sonnet-4-6",
      finish_reason: "stop",
      raw: {},
    });
    const { tagCandidate } = await import("@/lib/agents/theme-exposure/theme-tagger");
    const res = await tagCandidate(theme, candidate());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("tool_use_missing");
  });
});
