import { describe, it, expect, beforeEach, vi } from "vitest";

const getCurrentUserMock = vi.fn();

const maybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));
const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

const VALID_ID = "eu_defense_rearmament_26_05_01";

const storedThesis = {
  id: VALID_ID,
  version: 1,
  createdAt: "2026-05-14T12:00:00.000Z",
  createdBy: "user_abc123",
  source_snippet: "EU defense rearmament cycle.",
  claim:
    "EU defense capex cycle benefits primes with multi-year backlog visibility",
  macro_premise:
    "EU defense rearmament continues; NATO 3% commitment holds through 2030",
  horizon_years: 5,
  scope: {
    type: "thematic" as const,
    sectors: ["20101010"],
    regions: ["EUROZONE"],
    market_cap_min_usd: 1_000_000_000,
    tickers_seed: ["RHM.DE"],
    tickers_exclude: [],
  },
  drivers: { industry: [] },
  falsification: { primary: "primary trigger" },
  universe_id: "eu_defense_global",
  validation: {
    status: "draft" as const,
    verdict: null,
    last_validated_at: null,
    open_tensions: [],
  },
};

function makeRequest(): Request {
  return new Request(`http://test/api/thesis/${VALID_ID}`, { method: "GET" });
}

describe("GET /api/thesis/[id]", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    fromMock.mockClear();
    selectMock.mockClear();
    eqMock.mockClear();
    maybeSingleMock.mockReset();
  });

  it("returns 400 when id does not match pattern", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    const { GET } = await import("@/app/api/thesis/[id]/route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "INVALID-ID" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_id");
  });

  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/thesis/[id]/route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthenticated");
  });

  it("returns 200 when thesis is owned by the requesting user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    maybeSingleMock.mockResolvedValue({
      data: {
        id: VALID_ID,
        user_id: "user_abc123",
        thesis: storedThesis,
      },
      error: null,
    });
    const { GET } = await import("@/app/api/thesis/[id]/route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(VALID_ID);
    expect(body.thesis).toEqual(storedThesis);
  });

  it("returns 404 when thesis exists but belongs to another user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    maybeSingleMock.mockResolvedValue({
      data: {
        id: VALID_ID,
        user_id: "user_other",
        thesis: storedThesis,
      },
      error: null,
    });
    const { GET } = await import("@/app/api/thesis/[id]/route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 404 when no row is found", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { GET } = await import("@/app/api/thesis/[id]/route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 404 when Supabase reports an error fetching the row", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "no rows" },
    });
    const { GET } = await import("@/app/api/thesis/[id]/route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });
});
