import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";

const getCurrentUserMock = vi.fn();
const eqMaybeSingleMock = vi.fn();
const eqSelectMock = vi.fn(() => ({ maybeSingle: eqMaybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqSelectMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));
const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  fromMock.mockClear();
  selectMock.mockClear();
  eqSelectMock.mockClear();
  eqMaybeSingleMock.mockReset();
});

describe("GET /api/universe/[id]", () => {
  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const universe = cloneCanonicalUniverse();
    const { GET } = await import("@/app/api/universe/[id]/route");
    const res = await GET(
      new Request(`http://test/api/universe/${universe.id}`),
      paramsFor(universe.id),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when universe not found", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    eqMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const universe = cloneCanonicalUniverse();
    const { GET } = await import("@/app/api/universe/[id]/route");
    const res = await GET(
      new Request(`http://test/api/universe/${universe.id}`),
      paramsFor(universe.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when universe belongs to a different user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: "other_user", universe },
      error: null,
    });
    const { GET } = await import("@/app/api/universe/[id]/route");
    const res = await GET(
      new Request(`http://test/api/universe/${universe.id}`),
      paramsFor(universe.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with universe on happy path", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const universe = cloneCanonicalUniverse();
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: "u", universe },
      error: null,
    });
    const { GET } = await import("@/app/api/universe/[id]/route");
    const res = await GET(
      new Request(`http://test/api/universe/${universe.id}`),
      paramsFor(universe.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.universe).toEqual(universe);
  });
});
