import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const getCurrentUserMock = vi.fn();
const discoverUniverseMock = vi.fn();
const getQuoteMock = vi.fn();
const getFundamentalsMock = vi.fn();
const generateUniverseIdMock = vi.fn();

// supabase client mocks
const eqMaybeSingleThesisMock = vi.fn();
const eqThesisSelectMock = vi.fn(() => ({ maybeSingle: eqMaybeSingleThesisMock }));
const thesisSelectMock = vi.fn(() => ({ eq: eqThesisSelectMock }));

const likeUniversesLimitMock = vi.fn();
const universesSelectMock = vi.fn(() => ({
  like: () => ({ limit: likeUniversesLimitMock }),
}));

const universesInsertMock = vi.fn();
const thesesUpdateEqMock = vi.fn();
const thesesUpdateMock = vi.fn(() => ({ eq: thesesUpdateEqMock }));
const pipelineInsertMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "theses") {
    return {
      select: thesisSelectMock,
      update: thesesUpdateMock,
    };
  }
  if (table === "universes") {
    return {
      select: universesSelectMock,
      insert: universesInsertMock,
    };
  }
  if (table === "pipeline_events") {
    return { insert: pipelineInsertMock };
  }
  throw new Error(`unexpected table ${table}`);
});

const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/agents/universe-discoverer", () => ({
  discoverUniverse: discoverUniverseMock,
}));
vi.mock("@/lib/data/yahoo", () => ({
  getQuote: getQuoteMock,
  getFundamentals: getFundamentalsMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));
vi.mock("@/lib/schemas/universe-id", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/schemas/universe-id")
  >();
  return {
    ...actual,
    generateUniverseId: generateUniverseIdMock,
  };
});

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/universe/build", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const THESIS_ID = "eu_defense_rearmament_cycle_26_05_01";

beforeEach(() => {
  getCurrentUserMock.mockReset();
  discoverUniverseMock.mockReset();
  getQuoteMock.mockReset();
  getFundamentalsMock.mockReset();
  generateUniverseIdMock.mockReset();
  fromMock.mockClear();
  thesisSelectMock.mockClear();
  eqThesisSelectMock.mockClear();
  eqMaybeSingleThesisMock.mockReset();
  universesSelectMock.mockClear();
  likeUniversesLimitMock.mockReset();
  universesInsertMock.mockReset();
  thesesUpdateMock.mockClear();
  thesesUpdateEqMock.mockReset();
  pipelineInsertMock.mockReset();

  likeUniversesLimitMock.mockResolvedValue({ data: [], error: null });
  universesInsertMock.mockResolvedValue({ error: null });
  thesesUpdateEqMock.mockResolvedValue({ error: null });
  pipelineInsertMock.mockResolvedValue({ error: null });
  generateUniverseIdMock.mockReturnValue(`${THESIS_ID}_universe_01`);
});

describe("POST /api/universe/build", () => {
  it("returns 400 when body is invalid JSON", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is missing fields", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: THESIS_ID, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when thesis not found", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleThesisMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when thesis belongs to a different user", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    eqMaybeSingleThesisMock.mockResolvedValue({
      data: { id: thesis.id, user_id: "other_user", thesis },
      error: null,
    });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 unknown_suffix when anchor suffix is not in REGION_BY_SUFFIX", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleThesisMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "STUB.ZZ" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("unknown_suffix");
  });

  it("returns 502 when Yahoo getQuote returns null on the anchor", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleThesisMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    getQuoteMock.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("anchor_lookup_failed");
  });

  it("returns 422 discovery_failed when the agent returns ok:false", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleThesisMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    getQuoteMock.mockResolvedValueOnce({ name: "Rheinmetall AG", market_cap_usd: 38e9 });
    getFundamentalsMock.mockResolvedValueOnce({
      sector: "Industrials",
      industry: "Aerospace & Defense",
    });
    discoverUniverseMock.mockResolvedValueOnce({
      ok: false,
      error: "bad tool output",
      raw: { tickers: [] },
    });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("discovery_failed");
    expect(body.detail).toBe("bad tool output");
  });

  it("returns 422 too_few_survivors when filtering leaves <5 tickers", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleThesisMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    getQuoteMock.mockResolvedValueOnce({ name: "Rheinmetall AG", market_cap_usd: 38e9 });
    getFundamentalsMock.mockResolvedValueOnce({});
    discoverUniverseMock.mockResolvedValueOnce({
      ok: true,
      tickers: [
        { ticker: "BA.L", exposure_tier: "pure_play", notes: "p1" },
        { ticker: "LDO.MI", exposure_tier: "pure_play", notes: "p2" },
      ],
    });
    // All peers fall below market_cap_min_usd
    getQuoteMock.mockResolvedValue({ name: "Tiny Co", market_cap_usd: 100 });
    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("discovery_failed");
    expect(body.detail).toBe("too_few_survivors");
  });

  it("returns 200, persists universe row, updates thesis.universe_id + version, reports dropped", async () => {
    const thesis = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    eqMaybeSingleThesisMock.mockResolvedValue({
      data: {
        id: thesis.id,
        user_id: thesis.createdBy,
        version: thesis.version,
        thesis,
      },
      error: null,
    });

    // anchor enrichment
    getQuoteMock.mockResolvedValueOnce({
      name: "Rheinmetall AG",
      market_cap_usd: 38e9,
    });
    getFundamentalsMock.mockResolvedValueOnce({
      sector: "Industrials",
      industry: "Aerospace & Defense",
    });

    discoverUniverseMock.mockResolvedValueOnce({
      ok: true,
      tickers: [
        { ticker: "BA.L", exposure_tier: "pure_play", notes: "UK prime" },
        { ticker: "LDO.MI", exposure_tier: "pure_play", notes: "Italian prime" },
        { ticker: "SAAB-B.ST", exposure_tier: "pure_play", notes: "Swedish prime" },
        { ticker: "DASF.PA", exposure_tier: "pure_play", notes: "Dassault Aviation" },
        { ticker: "STUB.ZZ", exposure_tier: "pure_play", notes: "junk" },
        { ticker: "TINY.L", exposure_tier: "diversified", notes: "below cap" },
        { ticker: "DEAD.MI", exposure_tier: "pure_play", notes: "yahoo error" },
      ],
    });
    // peer enrichment, in order
    getQuoteMock.mockResolvedValueOnce({ name: "BAE Systems plc", market_cap_usd: 52e9 });
    getQuoteMock.mockResolvedValueOnce({ name: "Leonardo S.p.A.", market_cap_usd: 18e9 });
    getQuoteMock.mockResolvedValueOnce({ name: "Saab AB", market_cap_usd: 14e9 });
    getQuoteMock.mockResolvedValueOnce({ name: "Dassault Aviation SA", market_cap_usd: 25e9 });
    // STUB.ZZ never hits getQuote — unknown suffix drops first
    getQuoteMock.mockResolvedValueOnce({ name: "Tiny Co", market_cap_usd: 100_000 });
    getQuoteMock.mockResolvedValueOnce(null); // DEAD.MI

    const { POST } = await import("@/app/api/universe/build/route");
    const res = await POST(
      makeRequest({ thesis_id: thesis.id, anchor_ticker: "RHM.DE" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.universe).toBeDefined();
    expect(body.universe.id).toBe(`${thesis.id}_universe_01`);
    expect(body.universe.regions).toEqual(thesis.scope.regions);
    expect(body.universe.gics_codes).toEqual(thesis.scope.sectors);
    expect(body.universe.market_cap_min_usd).toBe(thesis.scope.market_cap_min_usd);

    const tickers = body.universe.tickers as Array<{
      ticker: string;
      region: string;
      market_cap_usd_b: number;
      exposure_tier: string;
    }>;
    // Anchor (RHM.DE) plus 4 surviving peers (BA.L, LDO.MI, SAAB-B.ST, DASF.PA) = 5
    expect(tickers.map((t) => t.ticker).sort()).toEqual(
      ["BA.L", "DASF.PA", "LDO.MI", "RHM.DE", "SAAB-B.ST"],
    );
    expect(tickers.find((t) => t.ticker === "RHM.DE")?.market_cap_usd_b).toBe(38);
    expect(tickers.find((t) => t.ticker === "BA.L")?.region).toBe("UK");
    expect(tickers.find((t) => t.ticker === "SAAB-B.ST")?.region).toBe("NORDICS");

    expect(body.dropped).toBeDefined();
    const drops = body.dropped as Array<{ ticker: string; reason: string }>;
    expect(drops.find((d) => d.ticker === "STUB.ZZ")?.reason).toBe(
      "unknown_suffix",
    );
    expect(drops.find((d) => d.ticker === "TINY.L")?.reason).toBe(
      "below_market_cap_floor",
    );
    expect(drops.find((d) => d.ticker === "DEAD.MI")?.reason).toBe(
      "yahoo_lookup_failed",
    );

    expect(universesInsertMock).toHaveBeenCalledTimes(1);
    const inserted = universesInsertMock.mock.calls[0][0];
    expect(inserted.id).toBe(`${thesis.id}_universe_01`);
    expect(inserted.created_by).toBe(thesis.createdBy);

    expect(thesesUpdateMock).toHaveBeenCalledTimes(1);
    const updateArg = thesesUpdateMock.mock.calls[0][0];
    expect(updateArg.version).toBe(thesis.version + 1);
    expect(updateArg.thesis.universe_id).toBe(`${thesis.id}_universe_01`);
    expect(thesesUpdateEqMock).toHaveBeenCalledWith("id", thesis.id);
  });
});
