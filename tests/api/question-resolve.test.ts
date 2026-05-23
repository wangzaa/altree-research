import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";
import type { ScanResults } from "@/lib/schemas/scan";

const getCurrentUserMock = vi.fn();
const thesisMaybeSingleMock = vi.fn();
const universeMaybeSingleMock = vi.fn();
const scanLimitMock = vi.fn();
const pipelineInsertMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "pipeline_events") return { insert: pipelineInsertMock };
  if (table === "theses") {
    return {
      select: () => ({ eq: () => ({ maybeSingle: thesisMaybeSingleMock }) }),
    };
  }
  if (table === "universes") {
    return {
      select: () => ({ eq: () => ({ maybeSingle: universeMaybeSingleMock }) }),
    };
  }
  if (table === "scan_runs") {
    return {
      select: () => ({
        eq: () => ({
          order: () => ({ limit: scanLimitMock }),
        }),
      }),
    };
  }
  throw new Error(`unexpected table ${table}`);
});
const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/question/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// Build fixtures with universe.id matching thesis.universe_id so the
// joined view in resolveDerivable has real rows to work with.
function buildFixtures() {
  const thesis = cloneCanonicalThesis();
  const universe = cloneCanonicalUniverse();
  // Align ids so the resolver join finds matching rows.
  thesis.universe_id = universe.id;
  const scan: ScanResults = {
    thesis_id: thesis.id,
    universe_id: universe.id,
    ran_at: "2026-05-23T00:00:00.000Z",
    history_5y: [
      {
        ticker: universe.tickers[0].ticker,
        points: [{ date: "2026-05-22", close: 100 }],
      },
    ],
    fundamentals_snapshot: {
      as_of: "2026-05-22",
      mean: { gross_margin: 0.4, ebit_margin: 0.18 },
      median: { gross_margin: 0.4, ebit_margin: 0.18 },
      per_ticker_used: universe.tickers.length,
    },
    tickers_snapshot: universe.tickers.map((t, i) => ({
      ticker: t.ticker,
      name: t.name,
      ebitda: 100 + i * 10,
      ebitda_margin: 0.2 + i * 0.05,
      revenue_growth_yoy: 0.1 + i * 0.05,
      currency: "EUR",
      quarterly_eps: [],
    })),
    descriptive_markdown: "scan fixture",
  };
  return { thesis, universe, scan };
}

describe("POST /api/question/resolve", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    thesisMaybeSingleMock.mockReset();
    universeMaybeSingleMock.mockReset();
    scanLimitMock.mockReset();
    pipelineInsertMock.mockReset().mockResolvedValue({ error: null });
  });

  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: "eu_defense_rearmament_cycle_26_05_01",
        question: "How many tickers are in EUROZONE?",
        category: "derivable",
        hint: { op: "filter_count", filter: { region: "EUROZONE" } },
        confidence: 0.9,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when body schema invalid (derivable with string hint)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: "eu_defense_rearmament_cycle_26_05_01",
        question: "what is the median margin?",
        category: "derivable",
        hint: "free text",
        confidence: 0.7,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("returns 400 immediately for needs_analyst (no DB calls)", async () => {
    const { thesis } = buildFixtures();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: thesis.id,
        question: "Will management deliver?",
        category: "needs_analyst",
        hint: null,
        confidence: 0.5,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("needs_analyst");
    expect(thesisMaybeSingleMock).not.toHaveBeenCalled();
  });

  it("returns 404 when thesis row is missing", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    thesisMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: "eu_defense_rearmament_cycle_26_05_01",
        question: "q?",
        category: "corpus",
        hint: null,
        confidence: 0.6,
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when thesis owned by another user", async () => {
    const { thesis } = buildFixtures();
    getCurrentUserMock.mockResolvedValue({ id: "other_user" });
    thesisMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: thesis.id,
        question: "q?",
        category: "corpus",
        hint: null,
        confidence: 0.6,
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 not_implemented for corpus", async () => {
    const { thesis } = buildFixtures();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    thesisMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: thesis.id,
        question: "What do experts think?",
        category: "corpus",
        hint: "expert opinions on EU defense",
        confidence: 0.8,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("not_implemented");
    expect(body.category).toBe("corpus");
    expect(typeof body.message).toBe("string");
    // Universe + scan reads should NOT have happened for non-derivable paths.
    expect(universeMaybeSingleMock).not.toHaveBeenCalled();
    expect(scanLimitMock).not.toHaveBeenCalled();
    // start + complete = 2 pipeline_events
    expect(pipelineInsertMock).toHaveBeenCalledTimes(2);
  });

  it("returns 200 not_implemented for web", async () => {
    const { thesis } = buildFixtures();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    thesisMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: thesis.id,
        question: "What did the news say last week?",
        category: "web",
        hint: "news on defense procurement",
        confidence: 0.7,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("not_implemented");
    expect(body.category).toBe("web");
  });

  it("returns 200 not_implemented for fundamentals_extra", async () => {
    const { thesis } = buildFixtures();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    thesisMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: thesis.id,
        question: "What is the dividend yield?",
        category: "fundamentals_extra",
        hint: "dividend yield",
        confidence: 0.6,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("not_implemented");
    expect(body.category).toBe("fundamentals_extra");
  });

  it("returns 200 resolved on derivable happy path", async () => {
    const { thesis, universe, scan } = buildFixtures();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    thesisMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: thesis.createdBy, universe },
      error: null,
    });
    scanLimitMock.mockResolvedValue({
      data: [{ results: scan }],
      error: null,
    });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: thesis.id,
        question: "Top 3 by revenue growth?",
        category: "derivable",
        hint: {
          op: "rank_by_metric",
          metric: "revenue_growth_yoy",
          direction: "desc",
          limit: 3,
        },
        confidence: 0.9,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("resolved");
    expect(body.category).toBe("derivable");
    expect(Array.isArray(body.answer.sources.tickers)).toBe(true);
    expect(body.answer.sources.tickers.length).toBeGreaterThan(0);
    // start + complete = 2 events
    expect(pipelineInsertMock).toHaveBeenCalledTimes(2);
    expect(pipelineInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "complete",
        payload: expect.objectContaining({
          category: "derivable",
          status: "resolved",
          ticker_count: expect.any(Number),
        }),
      }),
    );
  });

  it("returns 200 unresolvable when filter matches no tickers", async () => {
    const { thesis, universe, scan } = buildFixtures();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    thesisMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: thesis.createdBy, universe },
      error: null,
    });
    scanLimitMock.mockResolvedValue({
      data: [{ results: scan }],
      error: null,
    });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: thesis.id,
        question: "JAPAN tickers?",
        category: "derivable",
        hint: { op: "filter_count", filter: { region: "JAPAN" } },
        confidence: 0.8,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("unresolvable");
    expect(body.category).toBe("derivable");
    expect(typeof body.message).toBe("string");
    expect(pipelineInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "complete",
        payload: expect.objectContaining({
          category: "derivable",
          status: "unresolvable",
          reason: expect.any(String),
        }),
      }),
    );
  });

  it("returns 500 invalid_state when stored universe fails validation", async () => {
    const { thesis } = buildFixtures();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    thesisMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValue({
      data: {
        id: "u_corrupt",
        created_by: thesis.createdBy,
        universe: { not_a_universe: true },
      },
      error: null,
    });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: thesis.id,
        question: "median margin?",
        category: "derivable",
        hint: {
          op: "aggregate_by_group",
          metric: "ebitda_margin",
          aggregator: "median",
        },
        confidence: 0.85,
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("invalid_state");
    // start + error = 2 events; the start must be paired with an error.
    expect(pipelineInsertMock).toHaveBeenCalledTimes(2);
    expect(pipelineInsertMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        event_type: "error",
        payload: expect.objectContaining({ message: "invalid_state" }),
      }),
    );
  });

  it("returns 500 invalid_state when stored scan fails validation", async () => {
    const { thesis, universe } = buildFixtures();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    thesisMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: thesis.createdBy, universe },
      error: null,
    });
    scanLimitMock.mockResolvedValue({
      data: [{ results: { not_a_scan: true } }],
      error: null,
    });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: thesis.id,
        question: "median margin?",
        category: "derivable",
        hint: {
          op: "aggregate_by_group",
          metric: "ebitda_margin",
          aggregator: "median",
        },
        confidence: 0.85,
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("invalid_state");
    expect(pipelineInsertMock).toHaveBeenCalledTimes(2);
    expect(pipelineInsertMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        event_type: "error",
        payload: expect.objectContaining({ message: "invalid_state" }),
      }),
    );
  });

  it("returns 409 missing_data when scan is missing", async () => {
    const { thesis, universe } = buildFixtures();
    getCurrentUserMock.mockResolvedValue({ id: thesis.createdBy });
    thesisMaybeSingleMock.mockResolvedValue({
      data: { id: thesis.id, user_id: thesis.createdBy, thesis },
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValue({
      data: { id: universe.id, created_by: thesis.createdBy, universe },
      error: null,
    });
    scanLimitMock.mockResolvedValue({ data: [], error: null });
    const { POST } = await import("@/app/api/question/resolve/route");
    const res = await POST(
      makeRequest({
        thesis_id: thesis.id,
        question: "median margin?",
        category: "derivable",
        hint: {
          op: "aggregate_by_group",
          metric: "ebitda_margin",
          aggregator: "median",
        },
        confidence: 0.85,
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("missing_data");
  });
});
