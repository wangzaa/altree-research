import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";

const getCurrentUserMock = vi.fn();
const getHistoryMock = vi.fn();
const getRatiosMock = vi.fn();
const scanRunnerMock = vi.fn();

const thesisMaybeSingleMock = vi.fn();
const thesisSelectEqMock = vi.fn(() => ({ maybeSingle: thesisMaybeSingleMock }));
const thesisSelectMock = vi.fn(() => ({ eq: thesisSelectEqMock }));

const universeMaybeSingleMock = vi.fn();
const universeSelectEqMock = vi.fn(() => ({ maybeSingle: universeMaybeSingleMock }));
const universeSelectMock = vi.fn(() => ({ eq: universeSelectEqMock }));

const scanDeleteEqMock = vi.fn();
const scanDeleteMock = vi.fn(() => ({ eq: scanDeleteEqMock }));
const scanInsertMock = vi.fn();
const pipelineInsertMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "theses") return { select: thesisSelectMock };
  if (table === "universes") return { select: universeSelectMock };
  if (table === "scan_runs") return { delete: scanDeleteMock, insert: scanInsertMock };
  if (table === "pipeline_events") return { insert: pipelineInsertMock };
  throw new Error(`unexpected table ${table}`);
});

const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/data/yahoo", () => ({
  getHistory: getHistoryMock,
  getRatios: getRatiosMock,
}));
vi.mock("@/lib/agents/scan-runner", () => ({ scanRunner: scanRunnerMock }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

const THESIS_ID = "eu_defense_rearmament_cycle_26_05_01";

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/scan/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function thesisRowFor(universe_id: string) {
  const t = cloneCanonicalThesis();
  t.universe_id = universe_id;
  return { id: t.id, user_id: "alice", version: 1, thesis: t };
}

function universeRow() {
  const u = cloneCanonicalUniverse();
  return { id: u.id, created_by: "alice", universe: u };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getHistoryMock.mockReset();
  getRatiosMock.mockReset();
  scanRunnerMock.mockReset();
  fromMock.mockClear();
  thesisSelectMock.mockClear();
  thesisSelectEqMock.mockClear();
  thesisMaybeSingleMock.mockReset();
  universeSelectMock.mockClear();
  universeSelectEqMock.mockClear();
  universeMaybeSingleMock.mockReset();
  scanDeleteMock.mockClear();
  scanDeleteEqMock.mockReset();
  scanInsertMock.mockReset();
  pipelineInsertMock.mockReset();
  scanDeleteEqMock.mockResolvedValue({ error: null });
  scanInsertMock.mockResolvedValue({ error: null });
  pipelineInsertMock.mockResolvedValue({ error: null });
});

describe("POST /api/scan/run", () => {
  it("returns 400 on invalid JSON body", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest("not json"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when thesis missing or wrong owner", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    thesisMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when universe row is missing", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    thesisMaybeSingleMock.mockResolvedValueOnce({
      data: thesisRowFor("nonexistent_universe_id"),
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(404);
  });

  it("happy path persists scan_runs and emits start + complete pipeline_events", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    const u = cloneCanonicalUniverse();
    thesisMaybeSingleMock.mockResolvedValueOnce({
      data: thesisRowFor(u.id),
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValueOnce({
      data: universeRow(),
      error: null,
    });
    for (let i = 0; i < u.tickers.length; i++) {
      getHistoryMock.mockResolvedValueOnce([
        { date: "2021-05-01", close: 100 },
        { date: "2021-06-01", close: 105 },
        { date: "2021-07-01", close: 110 },
      ]);
      getRatiosMock.mockResolvedValueOnce({
        gross_margin: 0.3, ebit_margin: 0.15, trailing_pe: 18.5,
      });
    }
    scanRunnerMock.mockResolvedValueOnce({
      ok: true,
      markdown:
        "para 1\n\npara 2\n\npara 3",
    });

    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scan.descriptive_markdown).toContain("para 1");
    expect(body.scan.history_5y.length).toBeGreaterThan(0);
    expect(body.scan.fundamentals_snapshot.per_ticker_used).toBeGreaterThan(0);

    expect(scanDeleteMock).toHaveBeenCalledTimes(1);
    expect(scanInsertMock).toHaveBeenCalledTimes(1);

    const pipelineCalls = pipelineInsertMock.mock.calls.map((c) => c[0].event_type);
    expect(pipelineCalls).toEqual(["start", "complete"]);
  });

  it("returns 422 too_few_history when fewer than 3 tickers have history", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    const u = cloneCanonicalUniverse();
    thesisMaybeSingleMock.mockResolvedValueOnce({
      data: thesisRowFor(u.id),
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValueOnce({
      data: universeRow(),
      error: null,
    });
    getHistoryMock.mockResolvedValueOnce([{ date: "2021-05-01", close: 100 }]);
    for (let i = 1; i < u.tickers.length; i++) {
      getHistoryMock.mockResolvedValueOnce(null);
    }
    getRatiosMock.mockResolvedValue({
      gross_margin: 0.3, ebit_margin: 0.15, trailing_pe: 18.5,
    });

    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.detail).toBe("too_few_history");
  });

  it("returns 422 when the LLM agent fails", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    const u = cloneCanonicalUniverse();
    thesisMaybeSingleMock.mockResolvedValueOnce({
      data: thesisRowFor(u.id),
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValueOnce({
      data: universeRow(),
      error: null,
    });
    for (let i = 0; i < u.tickers.length; i++) {
      getHistoryMock.mockResolvedValueOnce([
        { date: "2021-05-01", close: 100 },
        { date: "2021-06-01", close: 105 },
        { date: "2021-07-01", close: 110 },
      ]);
      getRatiosMock.mockResolvedValueOnce({
        gross_margin: 0.3, ebit_margin: 0.15, trailing_pe: 18.5,
      });
    }
    scanRunnerMock.mockResolvedValueOnce({
      ok: false,
      error: "Model did not produce return_scan_description",
    });

    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("scan_failed");
  });

  it("logs a console.warn when descriptive_markdown contains a forbidden word", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    getCurrentUserMock.mockResolvedValue({ id: "alice" });
    const u = cloneCanonicalUniverse();
    thesisMaybeSingleMock.mockResolvedValueOnce({
      data: thesisRowFor(u.id),
      error: null,
    });
    universeMaybeSingleMock.mockResolvedValueOnce({
      data: universeRow(),
      error: null,
    });
    for (let i = 0; i < u.tickers.length; i++) {
      getHistoryMock.mockResolvedValueOnce([
        { date: "2021-05-01", close: 100 },
        { date: "2021-06-01", close: 105 },
        { date: "2021-07-01", close: 110 },
      ]);
      getRatiosMock.mockResolvedValueOnce({
        gross_margin: 0.3, ebit_margin: 0.15, trailing_pe: 18.5,
      });
    }
    scanRunnerMock.mockResolvedValueOnce({
      ok: true,
      markdown:
        "para 1 the universe should outperform the broader index.\n\npara 2 margins look strong.\n\npara 3 RHM.DE rose 110% over the period.",
    });

    const { POST } = await import("@/app/api/scan/run/route");
    const res = await POST(makeRequest({ thesis_id: THESIS_ID }));
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
    const warnArgs = warnSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(warnArgs).toMatch(/should|outperform/i);
    warnSpy.mockRestore();
  });
});
