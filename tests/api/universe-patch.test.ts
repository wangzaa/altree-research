import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";

const getCurrentUserMock = vi.fn();

const eqMaybeSingleMock = vi.fn();
const eqSelectMock = vi.fn(() => ({ maybeSingle: eqMaybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqSelectMock }));

const eqUpdateMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: eqUpdateMock }));

const fromMock = vi.fn(() => ({ select: selectMock, update: updateMock }));
const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(id: string, body: unknown): Request {
  return new Request(`http://test/api/universe/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

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

describe("PATCH /api/universe/[id]", () => {
  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const universe = cloneCanonicalUniverse();
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(
      makeRequest(universe.id, universe),
      paramsFor(universe.id),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 invalid_body on bad JSON", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(makeRequest(universe.id, "not-json"), paramsFor(universe.id));
    expect(res.status).toBe(400);
  });

  it("returns 422 invalid_universe when body fails Zod", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    universe.tickers[0].exposure_tier = "speculative" as never;
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(makeRequest(universe.id, universe), paramsFor(universe.id));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_universe");
  });

  it("returns 400 id_mismatch when body id doesn't match path id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(
      makeRequest("different_id_universe_01", universe),
      paramsFor("different_id_universe_01"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("id_mismatch");
  });

  it("returns 404 when universe not found", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    eqMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const universe = cloneCanonicalUniverse();
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(makeRequest(universe.id, universe), paramsFor(universe.id));
    expect(res.status).toBe(404);
  });

  it("returns 404 when universe belongs to a different user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: "other_user" },
      error: null,
    });
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(makeRequest(universe.id, universe), paramsFor(universe.id));
    expect(res.status).toBe(404);
  });

  it("returns 200, replaces universe and bumps refreshed_at", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: "u" },
      error: null,
    });
    universe.tickers[0].notes = "edited";

    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(
      makeRequest(universe.id, universe),
      paramsFor(universe.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.universe).toEqual(universe);

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updateArg = updateMock.mock.calls[0][0];
    expect(updateArg.universe).toEqual(universe);
    expect(typeof updateArg.refreshed_at).toBe("string");
    expect(eqUpdateMock).toHaveBeenCalledWith("id", universe.id);
  });

  it("returns 500 persist_failed when update errors", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: "u" },
      error: null,
    });
    eqUpdateMock.mockResolvedValue({ error: { message: "db down" } });
    const { PATCH } = await import("@/app/api/universe/[id]/route");
    const res = await PATCH(makeRequest(universe.id, universe), paramsFor(universe.id));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("persist_failed");
  });
});
