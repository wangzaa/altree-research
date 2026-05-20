import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";
import { cloneCanonicalScan } from "@/tests/fixtures/scan";

const createMessageMock = vi.fn();

vi.mock("@/lib/anthropic/client", () => ({
  createMessage: createMessageMock,
}));

function mockToolUse(input: unknown) {
  createMessageMock.mockResolvedValueOnce({
    content: [
      { type: "tool_use", id: "toolu_1", name: "return_scan_description", input },
    ],
    stop_reason: "tool_use",
    usage: { input_tokens: 100, output_tokens: 50 },
    raw: {},
  });
}

const validMarkdown =
  "The universe rose roughly 25% over the period, concentrated in 2024-2025.\n\nMean gross margin 35%, median 34%. EBIT margin averages 15%.\n\nRheinmetall rose ~110% over the period; Leonardo moved in line; BAE compounded ~75%.";

function buildInput() {
  const scan = cloneCanonicalScan();
  return {
    thesis: cloneCanonicalThesis(),
    universe: cloneCanonicalUniverse(),
    history_5y: scan.history_5y,
    fundamentals_snapshot: {
      mean: scan.fundamentals_snapshot.mean,
      median: scan.fundamentals_snapshot.median,
      per_ticker_used: scan.fundamentals_snapshot.per_ticker_used,
    },
  };
}

describe("scanRunner", () => {
  beforeEach(() => {
    createMessageMock.mockReset();
  });

  it("returns ok:true with markdown on happy path", async () => {
    mockToolUse({ markdown: validMarkdown });
    const { scanRunner } = await import("@/lib/agents/scan-runner");
    const result = await scanRunner(buildInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toBe(validMarkdown);
  });

  it("wires return_scan_description with forced tool_choice", async () => {
    mockToolUse({ markdown: validMarkdown });
    const { scanRunner } = await import("@/lib/agents/scan-runner");
    await scanRunner(buildInput());
    const call = createMessageMock.mock.calls[0][0];
    expect(call.tool_choice).toEqual({ type: "tool", name: "return_scan_description" });
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].name).toBe("return_scan_description");
    expect(Array.isArray(call.system)).toBe(true);
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("system prompt mentions descriptive + forbidden words", async () => {
    mockToolUse({ markdown: validMarkdown });
    const { scanRunner } = await import("@/lib/agents/scan-runner");
    await scanRunner(buildInput());
    const sys = (createMessageMock.mock.calls[0][0].system[0].text as string).toLowerCase();
    expect(sys).toContain("descriptive");
    expect(sys).toContain("forbidden");
    expect(sys).toContain("should");
    expect(sys).toContain("expect");
    expect(sys).toContain("outperform");
  });

  it("user message carries thesis claim + universe ticker list + snapshot fundamentals", async () => {
    mockToolUse({ markdown: validMarkdown });
    const { scanRunner } = await import("@/lib/agents/scan-runner");
    const input = buildInput();
    await scanRunner(input);
    const content = createMessageMock.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain(input.thesis.claim);
    expect(content).toContain("RHM.DE");
    expect(content).toContain("BA.L");
    expect(content).toContain("gross_margin");
  });

  it("returns ok:false when no tool_use block is present", async () => {
    createMessageMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "oops" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
      raw: {},
    });
    const { scanRunner } = await import("@/lib/agents/scan-runner");
    const result = await scanRunner(buildInput());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use|return_scan_description/i);
  });

  it("returns ok:false when markdown is empty", async () => {
    mockToolUse({ markdown: "" });
    const { scanRunner } = await import("@/lib/agents/scan-runner");
    const result = await scanRunner(buildInput());
    expect(result.ok).toBe(false);
  });
});
