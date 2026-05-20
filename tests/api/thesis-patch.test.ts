import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const getCurrentUserMock = vi.fn();

const eqUpdateMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: eqUpdateMock }));
const eqMaybeSingleMock = vi.fn();
const eqSelectMock = vi.fn(() => ({ maybeSingle: eqMaybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqSelectMock }));
const fromMock = vi.fn(() => ({ select: selectMock, update: updateMock }));
const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

function makeRequest(id: string, body: unknown): Request {
  return new Request(`http://test/api/thesis/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/thesis/[id]", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    fromMock.mockClear();
    selectMock.mockClear();
    eqSelectMock.mockClear();
    eqMaybeSingleMock.mockReset();
    updateMock.mockClear();
    eqUpdateMock.mockReset();
    eqUpdateMock.mockResolvedValue({ error: null });
  });

  it("returns 400 when path id is malformed", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(
      makeRequest("bad-id", cloneCanonicalThesis()),
      paramsFor("bad-id"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const current = cloneCanonicalThesis();
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(makeRequest(current.id, current), paramsFor(current.id));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body id does not match path id", async () => {
    const current = cloneCanonicalThesis();
    const wrongPath = "different_thesis_26_05_01";
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(makeRequest(wrongPath, current), paramsFor(wrongPath));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("id_mismatch");
  });

  it("returns 422 when body fails Zod", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    const bad = { ...current, claim: "" };
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(makeRequest(current.id, bad), paramsFor(current.id));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_thesis");
  });

  it("returns 404 when thesis does not exist", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(
      makeRequest(current.id, current),
      paramsFor(current.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when thesis belongs to a different user", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: current.id, user_id: "other_user", version: 1, thesis: current },
      error: null,
    });
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(
      makeRequest(current.id, current),
      paramsFor(current.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 500 when update fails", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: {
        id: current.id,
        user_id: current.createdBy,
        version: 1,
        thesis: current,
      },
      error: null,
    });
    eqUpdateMock.mockResolvedValue({ error: { message: "db down" } });
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(
      makeRequest(current.id, current),
      paramsFor(current.id),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("persist_failed");
  });

  it("returns 200, persists new thesis, and bumps version", async () => {
    const current = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...current.scope.regions, "JAPAN"];

    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: {
        id: current.id,
        user_id: current.createdBy,
        version: 1,
        thesis: current,
      },
      error: null,
    });

    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(
      makeRequest(current.id, proposed),
      paramsFor(current.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.thesis).toEqual(proposed);
    expect(body.version).toBe(2);

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updateArg = updateMock.mock.calls[0][0];
    expect(updateArg.version).toBe(2);
    expect(updateArg.thesis).toEqual(proposed);

    expect(eqUpdateMock).toHaveBeenCalledWith("id", current.id);
  });
});
