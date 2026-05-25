import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const getCurrentUserMock = vi.fn();
const classifyQuestionsMock = vi.fn();
const eqMaybeSingleMock = vi.fn();
const pipelineInsertMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "pipeline_events") return { insert: pipelineInsertMock };
  return { select: () => ({ eq: () => ({ maybeSingle: eqMaybeSingleMock }) }) };
});
const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/agents/question-classifier", () => ({
  classifyQuestions: classifyQuestionsMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/question/classify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_THESIS_ID = "memory_cycle_26_05_22";

describe("POST /api/question/classify", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    classifyQuestionsMock.mockReset();
    eqMaybeSingleMock.mockReset();
    pipelineInsertMock.mockReset().mockResolvedValue({ error: null });
  });

  it("returns 400 when body is invalid JSON", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body fails schema validation", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(makeRequest({ thesis_id: 123 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(
      makeRequest({ thesis_id: VALID_THESIS_ID, questions: ["q1?"] }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when thesis row is missing", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    eqMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(
      makeRequest({ thesis_id: VALID_THESIS_ID, questions: ["q1?"] }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when thesis belongs to another user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    eqMaybeSingleMock.mockResolvedValue({
      data: {
        id: VALID_THESIS_ID,
        user_id: "other_user",
        thesis: cloneCanonicalThesis(),
      },
      error: null,
    });
    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(
      makeRequest({ thesis_id: VALID_THESIS_ID, questions: ["q1?"] }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with classifications on happy path", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    classifyQuestionsMock.mockResolvedValue({
      ok: true,
      classifications: [
        {
          question: "Which 3 EU primes have the highest revenue growth YoY?",
          category: "derivable",
          hint: {
            op: "rank_by_metric",
            metric: "revenue_growth_yoy",
            direction: "desc",
            limit: 3,
          },
          confidence: 0.9,
        },
      ],
      model: "claude-haiku-4-5",
      usage: { input_tokens: 400, output_tokens: 120 },
    });

    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(
      makeRequest({
        thesis_id: thesis.id,
        questions: ["Which 3 EU primes have the highest revenue growth YoY?"],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.classifications)).toBe(true);
    expect(body.classifications).toHaveLength(1);
    expect(body.classifications[0].category).toBe("derivable");
    // start + complete = 2
    expect(pipelineInsertMock).toHaveBeenCalledTimes(2);
  });

  it("returns 502 when classifier returns ok:false", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    classifyQuestionsMock.mockResolvedValue({
      ok: false,
      error: "tool_use.input was not an object",
    });

    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, questions: ["q1?"] }),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("classify_failed");
    expect(body.detail).toContain("tool_use.input");
    // start + error
    expect(pipelineInsertMock).toHaveBeenCalledTimes(2);
    const errorCall = pipelineInsertMock.mock.calls.find(
      ([row]) => row.event_type === "error",
    );
    expect(errorCall).toBeDefined();
  });

  it("returns 200 with empty classifications for empty questions array", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });

    const { POST } = await import("@/app/api/question/classify/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, questions: [] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.classifications).toEqual([]);
    expect(classifyQuestionsMock).not.toHaveBeenCalled();
  });
});
