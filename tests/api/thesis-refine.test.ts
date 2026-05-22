import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const getCurrentUserMock = vi.fn();
const refineThesisMock = vi.fn();
const narrateDiffMock = vi.fn();

const eqMaybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: eqMaybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const insertMock = vi.fn().mockResolvedValue({ error: null });

const fromMock = vi.fn((table: string) => {
  if (table === "pipeline_events") return { insert: insertMock };
  return { select: selectMock };
});
const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/agents/thesis-refiner", () => ({
  refineThesis: refineThesisMock,
}));
vi.mock("@/lib/agents/diff-narrator", () => ({
  narrateDiff: narrateDiffMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/thesis/refine", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/thesis/refine", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    refineThesisMock.mockReset();
    narrateDiffMock.mockReset();
    fromMock.mockClear();
    selectMock.mockClear();
    eqMock.mockClear();
    eqMaybeSingleMock.mockReset();
    insertMock.mockClear();
    insertMock.mockResolvedValue({ error: null });
    narrateDiffMock.mockResolvedValue({
      narrative: "OK — I tweaked the thesis. This means the universe will widen.",
      model: "anthropic/claude-haiku-4-5",
      usage: { input_tokens: 100, output_tokens: 30 },
    });
  });

  it("returns 400 when body is invalid JSON", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is missing thesis_id or instruction", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(makeRequest({ thesis_id: "x_26_05_01" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({
        thesis_id: "eu_defense_rearmament_cycle_26_05_01",
        instruction: "add JAPAN",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when thesis not found", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    eqMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({
        thesis_id: "eu_defense_rearmament_cycle_26_05_01",
        instruction: "add JAPAN",
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 404 when thesis belongs to a different user", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: current.id, user_id: "other_user", thesis: current },
      error: null,
    });
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({ thesis_id: current.id, instruction: "x" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 when refineThesis fails Zod validation", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: current.id, user_id: current.createdBy, thesis: current },
      error: null,
    });
    refineThesisMock.mockResolvedValue({
      ok: false,
      error: "Invalid scope.regions",
      raw: { scope: { regions: ["MARS"] } },
    });
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({ thesis_id: current.id, instruction: "add Mars" }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_thesis");
    expect(body.detail).toBe("Invalid scope.regions");
  });

  it("returns 502 when refineThesis throws", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: current.id, user_id: current.createdBy, thesis: current },
      error: null,
    });
    refineThesisMock.mockRejectedValue(new Error("anthropic 500"));
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({ thesis_id: current.id, instruction: "x" }),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("refine_failed");
  });

  it("returns 200 with current/proposed/diff/narrative on happy path", async () => {
    const current = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...current.scope.regions, "JAPAN"];

    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: current.id, user_id: current.createdBy, thesis: current },
      error: null,
    });
    refineThesisMock.mockResolvedValue({
      ok: true,
      thesis: proposed,
      model: "anthropic/claude-sonnet-4-6",
      usage: { input_tokens: 800, output_tokens: 240 },
    });

    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({ thesis_id: current.id, instruction: "add JAPAN" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.current).toEqual(current);
    expect(body.proposed).toEqual(proposed);
    expect(body.diff.added).toEqual([
      { path: "scope.regions", after: "JAPAN" },
    ]);
    expect(body.diff.removed).toEqual([]);
    expect(body.diff.changed).toEqual([]);
    expect(body.narrative).toBe(
      "OK — I tweaked the thesis. This means the universe will widen.",
    );

    expect(refineThesisMock).toHaveBeenCalledWith({
      current,
      instruction: "add JAPAN",
    });
    expect(narrateDiffMock).toHaveBeenCalledOnce();
    // pipeline_events inserts: refiner start, refiner complete,
    // narrator start, narrator complete = 4 rows.
    expect(insertMock).toHaveBeenCalledTimes(4);
  });

  it("returns 200 with empty diff when proposed equals current (no-op instruction)", async () => {
    const current = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: current.id, user_id: current.createdBy, thesis: current },
      error: null,
    });
    refineThesisMock.mockResolvedValue({
      ok: true,
      thesis: proposed,
      model: "anthropic/claude-sonnet-4-6",
      usage: { input_tokens: 800, output_tokens: 240 },
    });
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({ thesis_id: current.id, instruction: "no changes" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.diff.added).toEqual([]);
    expect(body.diff.removed).toEqual([]);
    expect(body.diff.changed).toEqual([]);
  });

  it("still returns 200 + diff when the narrator throws (narrative is null)", async () => {
    const current = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...current.scope.regions, "JAPAN"];
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: current.id, user_id: current.createdBy, thesis: current },
      error: null,
    });
    refineThesisMock.mockResolvedValue({
      ok: true,
      thesis: proposed,
      model: "anthropic/claude-sonnet-4-6",
      usage: { input_tokens: 800, output_tokens: 240 },
    });
    narrateDiffMock.mockRejectedValueOnce(new Error("haiku timeout"));

    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({ thesis_id: current.id, instruction: "add JAPAN" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.narrative).toBeNull();
    expect(body.diff.added).toEqual([
      { path: "scope.regions", after: "JAPAN" },
    ]);
  });
});
