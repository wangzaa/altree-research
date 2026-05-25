import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const getCurrentUserMock = vi.fn();
const writeMemoMock = vi.fn();

const eqMaybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: eqMaybeSingleMock }));
const orderLimitMock = vi.fn();
const orderMock = vi.fn(() => ({ limit: orderLimitMock }));
const eqSelectMock = vi.fn(() => ({
  order: orderMock,
  maybeSingle: eqMaybeSingleMock,
}));
const selectMock = vi.fn(() => ({ eq: eqSelectMock }));
const pipelineInsertMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "pipeline_events") return { insert: pipelineInsertMock };
  return { select: () => ({ eq: () => ({ maybeSingle: eqMaybeSingleMock, order: orderMock }) }) };
});
const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/agents/memo-writer", () => ({
  writeMemo: writeMemoMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/memo/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/memo/generate", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    writeMemoMock.mockReset();
    eqMaybeSingleMock.mockReset();
    orderLimitMock.mockReset();
    pipelineInsertMock.mockReset();
    pipelineInsertMock.mockResolvedValue({ error: null });
    orderLimitMock.mockResolvedValue({ data: [], error: null });
  });

  it("returns 400 when body is invalid JSON", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const { POST } = await import("@/app/api/memo/generate/route");
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/memo/generate/route");
    const res = await POST(
      makeRequest({ thesis_id: "eu_defense_rearmament_cycle_26_05_01" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when thesis not found or owned by another user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: "x", user_id: "other", thesis: cloneCanonicalThesis() },
      error: null,
    });
    const { POST } = await import("@/app/api/memo/generate/route");
    const res = await POST(
      makeRequest({ thesis_id: "eu_defense_rearmament_cycle_26_05_01" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with the memo on happy path", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    writeMemoMock.mockResolvedValue({
      ok: true,
      memo: {
        verdict: "supports",
        bull_summary: "Bull bull bull.",
        bear_summary: "Bear bear bear.",
        recommendation: "Hold.",
        open_questions: ["q1?", "q2?"],
      },
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 800, output_tokens: 240 },
    });

    const { POST } = await import("@/app/api/memo/generate/route");
    const res = await POST(makeRequest({ thesis_id: thesis.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.memo.verdict).toBe("supports");
    expect(body.memo.open_questions).toHaveLength(2);
    // pipeline events: start + complete = 2
    expect(pipelineInsertMock).toHaveBeenCalledTimes(2);
  });

  it("returns 502 when the memo agent throws", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    writeMemoMock.mockRejectedValue(new Error("anthropic 500"));
    const { POST } = await import("@/app/api/memo/generate/route");
    const res = await POST(makeRequest({ thesis_id: thesis.id }));
    expect(res.status).toBe(502);
  });

  it("returns 422 when the memo agent returns ok:false", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    writeMemoMock.mockResolvedValue({
      ok: false,
      error: "verdict was not in enum",
      raw: { verdict: "maybe" },
    });
    const { POST } = await import("@/app/api/memo/generate/route");
    const res = await POST(makeRequest({ thesis_id: thesis.id }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_memo");
  });
});
