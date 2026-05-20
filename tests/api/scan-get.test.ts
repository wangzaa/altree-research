import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalScan } from "@/tests/fixtures/scan";

const getCurrentUserMock = vi.fn();

const thesisMaybeSingleMock = vi.fn();
const thesisSelectEqMock = vi.fn(() => ({ maybeSingle: thesisMaybeSingleMock }));
const thesisSelectMock = vi.fn(() => ({ eq: thesisSelectEqMock }));

const scanLimitMock = vi.fn();
const scanOrderMock = vi.fn(() => ({ limit: scanLimitMock }));
const scanSelectEqMock = vi.fn(() => ({ order: scanOrderMock }));
const scanSelectMock = vi.fn(() => ({ eq: scanSelectEqMock }));

const fromMock = vi.fn((table: string) => {
  if (table === "theses") return { select: thesisSelectMock };
  if (table === "scan_runs") return { select: scanSelectMock };
  throw new Error(`unexpected table ${table}`);
});

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => ({ from: fromMock }),
}));

const THESIS_ID = "eu_defense_rearmament_cycle_26_05_01";

function makeRequest(id: string): Request {
  return new Request(`http://test/api/scan/${id}`, { method: "GET" });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  fromMock.mockClear();
  thesisSelectMock.mockClear();
  thesisSelectEqMock.mockClear();
  thesisMaybeSingleMock.mockReset();
  scanSelectMock.mockClear();
  scanSelectEqMock.mockClear();
  scanOrderMock.mockClear();
  scanLimitMock.mockReset();
});

describe("GET /api/scan/[thesisId]", () => {
  it("returns 401 unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/scan/[thesisId]/route");
    const res = await GET(makeRequest(THESIS_ID), {
      params: Promise.resolve({ thesisId: THESIS_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when thesis missing or wrong owner", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    thesisMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const { GET } = await import("@/app/api/scan/[thesisId]/route");
    const res = await GET(makeRequest(THESIS_ID), {
      params: Promise.resolve({ thesisId: THESIS_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when no scan_runs row exists", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    thesisMaybeSingleMock.mockResolvedValueOnce({
      data: { id: THESIS_ID, user_id: "alice" },
      error: null,
    });
    scanLimitMock.mockResolvedValueOnce({ data: [], error: null });
    const { GET } = await import("@/app/api/scan/[thesisId]/route");
    const res = await GET(makeRequest(THESIS_ID), {
      params: Promise.resolve({ thesisId: THESIS_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 with the most-recent scan_runs.results when present", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    const scan = cloneCanonicalScan();
    thesisMaybeSingleMock.mockResolvedValueOnce({
      data: { id: THESIS_ID, user_id: "alice" },
      error: null,
    });
    scanLimitMock.mockResolvedValueOnce({
      data: [{ results: scan }],
      error: null,
    });
    const { GET } = await import("@/app/api/scan/[thesisId]/route");
    const res = await GET(makeRequest(THESIS_ID), {
      params: Promise.resolve({ thesisId: THESIS_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scan.thesis_id).toBe(scan.thesis_id);
  });
});
