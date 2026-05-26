import { describe, it, expect, beforeEach, vi } from "vitest";

const getCurrentUserMock = vi.fn();
const limitMock = vi.fn();
const orderMock = vi.fn(() => ({ limit: limitMock }));
const eqMock = vi.fn(() => ({ order: orderMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => ({ from: fromMock }),
}));

function makeRequest(url = "http://test/api/thesis/list"): Request {
  return new Request(url);
}

describe("GET /api/thesis/list", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    limitMock.mockReset();
    selectMock.mockClear();
  });

  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/thesis/list/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns each thesis with verdict in the response", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc" });
    limitMock.mockResolvedValue({
      data: [
        {
          id: "japan_smallcaps_26_05",
          source_snippet: "Japanese small-caps re-rating…",
          created_at: "2026-04-20T14:32:00Z",
          status: "validated",
          verdict: "supports",
        },
        {
          id: "eu_defense_26_03",
          source_snippet: null,
          created_at: "2026-03-18T09:11:00Z",
          status: "draft",
          verdict: null,
        },
      ],
      error: null,
    });
    const { GET } = await import("@/app/api/thesis/list/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.theses).toHaveLength(2);
    expect(body.theses[0]).toMatchObject({
      id: "japan_smallcaps_26_05",
      verdict: "supports",
    });
    expect(body.theses[1].verdict).toBeNull();
    // Confirm the SELECT asked for verdict.
    expect(selectMock).toHaveBeenCalledWith(
      "id, source_snippet, created_at, status, verdict",
    );
  });

  it("honors the limit query param within bounds", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    limitMock.mockResolvedValue({ data: [], error: null });
    const { GET } = await import("@/app/api/thesis/list/route");
    await GET(makeRequest("http://test/api/thesis/list?limit=8"));
    expect(limitMock).toHaveBeenCalledWith(8);
  });

  it("clamps invalid limit to default of 5", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    limitMock.mockResolvedValue({ data: [], error: null });
    const { GET } = await import("@/app/api/thesis/list/route");
    await GET(makeRequest("http://test/api/thesis/list?limit=9999"));
    expect(limitMock).toHaveBeenCalledWith(5);
  });
});
