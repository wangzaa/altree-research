import { describe, it, expect, beforeEach, vi } from "vitest";

const getCurrentUserMock = vi.fn();
const extractThesisMock = vi.fn();
const generateThesisIdMock = vi.fn();

const likeLimitMock = vi.fn();
const selectMock = vi.fn(() => ({ like: () => ({ limit: likeLimitMock }) }));
const insertMock = vi.fn();
const fromMock = vi.fn(() => ({
  select: selectMock,
  insert: insertMock,
}));
const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/agents/thesis-extractor", () => ({
  extractThesis: extractThesisMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

vi.mock("@/lib/schemas/thesis-id", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/schemas/thesis-id")
  >();
  return {
    ...actual,
    generateThesisId: generateThesisIdMock,
  };
});

const SOURCE_SNIPPET = "EU defense rearmament cycle.";
const EXPECTED_SLUG = "eu_defense_rearmament_cycle";

const FIXED_NOW = new Date("2026-05-14T12:00:00.000Z");

const canonicalThesis = {
  id: "eu_defense_rearmament_cycle_26_05_01",
  version: 1,
  createdAt: FIXED_NOW.toISOString(),
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
    regions: ["EUROZONE", "UK"],
    market_cap_min_usd: 1_000_000_000,
    tickers_seed: ["RHM.DE", "BA.L", "LDO.MI"],
    tickers_exclude: [],
  },
  drivers: {
    industry: [
      {
        id: "backlog_to_revenue",
        claim: "Sector backlog/revenue >= 2y sustained",
        central_estimate: { value: 3.0, unit: "years" },
        thesis_breaks_below: 1.5,
        evidence: [],
        verdict: null,
        classification: "industry" as const,
      },
    ],
  },
  falsification: {
    primary:
      "NATO 3% commitment formally rolled back, OR EU procurement budget cut >20% YoY",
    secondary: "Sector backlog/revenue <1.5y for 2 consecutive quarters",
  },
  universe_id: "eu_defense_global",
  validation: {
    status: "draft" as const,
    verdict: null,
    last_validated_at: null,
    open_tensions: [],
  },
};

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/thesis/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/thesis/extract", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    getCurrentUserMock.mockReset();
    extractThesisMock.mockReset();
    generateThesisIdMock.mockReset();
    fromMock.mockClear();
    selectMock.mockClear();
    likeLimitMock.mockReset();
    insertMock.mockReset();

    likeLimitMock.mockResolvedValue({ data: [], error: null });
    insertMock.mockResolvedValue({ error: null });
    generateThesisIdMock.mockReturnValue(canonicalThesis.id);
  });

  it("returns 400 when body is missing source_snippet", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    const { POST } = await import("@/app/api/thesis/extract/route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("returns 400 when source_snippet is shorter than 20 chars", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    const { POST } = await import("@/app/api/thesis/extract/route");
    const res = await POST(makeRequest({ source_snippet: "too short" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/thesis/extract/route");
    const res = await POST(makeRequest({ source_snippet: SOURCE_SNIPPET }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthenticated");
  });

  it("returns 200 with id and thesis on happy path", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    extractThesisMock.mockResolvedValue({ ok: true, thesis: canonicalThesis });

    const { POST } = await import("@/app/api/thesis/extract/route");
    const res = await POST(makeRequest({ source_snippet: SOURCE_SNIPPET }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(canonicalThesis.id);
    expect(body.thesis).toEqual(canonicalThesis);

    expect(generateThesisIdMock).toHaveBeenCalledTimes(1);
    const idCall = generateThesisIdMock.mock.calls[0][0];
    expect(idCall.year).toBe(2026);
    expect(idCall.month).toBe(5);
    expect(idCall.slug).toBe(EXPECTED_SLUG);
    expect(idCall.existingIds).toEqual([]);

    expect(extractThesisMock).toHaveBeenCalledTimes(1);
    expect(extractThesisMock).toHaveBeenCalledWith({
      sourceSnippet: SOURCE_SNIPPET,
      id: canonicalThesis.id,
      createdBy: "user_abc123",
      createdAt: FIXED_NOW.toISOString(),
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const inserted = insertMock.mock.calls[0][0];
    expect(inserted).toMatchObject({
      id: canonicalThesis.id,
      user_id: "user_abc123",
      version: 1,
      source_snippet: SOURCE_SNIPPET,
      status: "draft",
      verdict: null,
      last_validated_at: null,
    });
    expect(inserted.thesis).toEqual(canonicalThesis);
  });

  it("returns 422 when extractor returns ok: false", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    extractThesisMock.mockResolvedValue({
      ok: false,
      error: "tool_use.input was not an object",
      raw: "not an object",
    });

    const { POST } = await import("@/app/api/thesis/extract/route");
    const res = await POST(makeRequest({ source_snippet: SOURCE_SNIPPET }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("tool_use.input was not an object");
    expect(body.raw).toBe("not an object");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 500 when Supabase insert errors", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    extractThesisMock.mockResolvedValue({ ok: true, thesis: canonicalThesis });
    insertMock.mockResolvedValue({ error: { message: "duplicate key" } });

    const { POST } = await import("@/app/api/thesis/extract/route");
    const res = await POST(makeRequest({ source_snippet: SOURCE_SNIPPET }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("persist_failed");
    expect(body.details).toBe("duplicate key");
  });

  it("returns 400 when body is not valid JSON", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    const { POST } = await import("@/app/api/thesis/extract/route");
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
  });

  it("passes existing ids from Supabase to generateThesisId", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    likeLimitMock.mockResolvedValue({
      data: [
        { id: "eu_defense_rearmament_cycle_26_05_01" },
        { id: "eu_defense_rearmament_cycle_26_05_02" },
      ],
      error: null,
    });
    generateThesisIdMock.mockReturnValue(
      "eu_defense_rearmament_cycle_26_05_03",
    );
    extractThesisMock.mockResolvedValue({
      ok: true,
      thesis: {
        ...canonicalThesis,
        id: "eu_defense_rearmament_cycle_26_05_03",
      },
    });

    const { POST } = await import("@/app/api/thesis/extract/route");
    const res = await POST(makeRequest({ source_snippet: SOURCE_SNIPPET }));
    expect(res.status).toBe(200);
    const idCall = generateThesisIdMock.mock.calls[0][0];
    expect(idCall.existingIds).toEqual([
      "eu_defense_rearmament_cycle_26_05_01",
      "eu_defense_rearmament_cycle_26_05_02",
    ]);
  });
});
