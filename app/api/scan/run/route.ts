import { NextResponse } from "next/server";
import { z } from "zod";
import { scanRunner } from "@/lib/agents/scan-runner";
import { aggregateFundamentals } from "@/lib/aggregation/fundamentals";
import { getCurrentUser } from "@/lib/auth/session";
import { getHistory, getRatios, type TickerRatios } from "@/lib/data/yahoo";
import { ThesisIdSchema, type Thesis } from "@/lib/schemas/thesis";
import {
  ScanResultsSchema,
  type ScanResults,
  type TickerHistory,
  type TickerSnapshot,
} from "@/lib/schemas/scan";
import type { Universe } from "@/lib/schemas/universe";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getModelFor } from "@/lib/data/agent-models";

const BodySchema = z.object({ thesis_id: ThesisIdSchema });

const MIN_HISTORY_TICKERS = 3;
const JUDGMENT_PATTERN =
  /\b(should|will|expect|likely|believe|outperform|undervalued|overvalued)\b/gi;

interface DroppedTicker {
  ticker: string;
  reason: "history_lookup_failed";
}
interface DroppedRatios {
  ticker: string;
  reason: "ratios_lookup_failed";
}

export async function POST(req: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const { thesis_id } = parsed.data;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();

    const thesisRow = await supabase
      .from("theses")
      .select("*")
      .eq("id", thesis_id)
      .maybeSingle();
    if (
      thesisRow.error ||
      !thesisRow.data ||
      thesisRow.data.user_id !== user.id
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const thesis = thesisRow.data.thesis as Thesis;
    const universeId = thesis.universe_id;

    const universeRow = await supabase
      .from("universes")
      .select("*")
      .eq("id", universeId)
      .maybeSingle();
    if (
      universeRow.error ||
      !universeRow.data ||
      universeRow.data.created_by !== user.id
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const universe = universeRow.data.universe as Universe;

    const scanModel = getModelFor("scan_runner");

    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "scan",
      agent: "scan_runner",
      event_type: "start",
      payload: { thesis_id, universe_id: universeId, model: scanModel },
    });

    const history_5y: TickerHistory[] = [];
    const dropped: DroppedTicker[] = [];
    const ratios: TickerRatios[] = [];
    const tickers_snapshot: TickerSnapshot[] = [];
    const dropped_ratios: DroppedRatios[] = [];

    for (const row of universe.tickers) {
      const points = await getHistory(row.ticker);
      if (points && points.length > 0) {
        history_5y.push({ ticker: row.ticker, points });
      } else {
        dropped.push({ ticker: row.ticker, reason: "history_lookup_failed" });
        continue;
      }
      if (row.exposure_tier !== "etf_proxy") {
        const r = await getRatios(row.ticker);
        if (r) {
          ratios.push(r);
          tickers_snapshot.push({
            ticker: row.ticker,
            name: row.name,
            ebitda: r.ebitda,
            ebitda_margin: r.ebitda_margin,
            revenue_growth_yoy: r.revenue_growth_yoy,
            currency: r.currency,
            quarterly_eps: r.quarterly_eps,
            trailing_pe: r.trailing_pe,
          });
        } else {
          dropped_ratios.push({ ticker: row.ticker, reason: "ratios_lookup_failed" });
        }
      }
    }

    if (history_5y.length < MIN_HISTORY_TICKERS) {
      return NextResponse.json(
        { error: "scan_failed", detail: "too_few_history", dropped },
        { status: 422 },
      );
    }

    const fundamentalsAggregate = aggregateFundamentals(ratios);

    const agentResult = await scanRunner({
      thesis,
      universe,
      history_5y,
      fundamentals_snapshot: fundamentalsAggregate,
    });
    if (!agentResult.ok) {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "scan",
        agent: "scan_runner",
        event_type: "error",
        payload: { error: agentResult.error, model: scanModel },
      });
      return NextResponse.json(
        {
          error: "scan_failed",
          detail: agentResult.error,
          raw: agentResult.raw ?? null,
        },
        { status: 422 },
      );
    }

    const ranAt = new Date().toISOString();
    const scanPayload: ScanResults = {
      thesis_id,
      universe_id: universeId,
      ran_at: ranAt,
      history_5y,
      fundamentals_snapshot: {
        as_of: ranAt,
        mean: fundamentalsAggregate.mean,
        median: fundamentalsAggregate.median,
        per_ticker_used: fundamentalsAggregate.per_ticker_used,
      },
      tickers_snapshot,
      descriptive_markdown: agentResult.markdown,
    };

    const validated = ScanResultsSchema.safeParse(scanPayload);
    if (!validated.success) {
      console.error("[/api/scan/run] invalid_scan:", validated.error.message);
      return NextResponse.json(
        { error: "invalid_scan", detail: validated.error.message },
        { status: 422 },
      );
    }

    const matches = validated.data.descriptive_markdown.match(JUDGMENT_PATTERN);
    if (matches && matches.length > 0) {
      console.warn(
        `[/api/scan/run] judgment-leakage matches in ${thesis_id}:`,
        matches.slice(0, 3),
      );
    }

    const del = await supabase
      .from("scan_runs")
      .delete()
      .eq("thesis_id", thesis_id);
    if (del.error) {
      console.error("[/api/scan/run] persist_failed (delete):", del.error);
      return NextResponse.json(
        { error: "persist_failed", detail: del.error.message },
        { status: 500 },
      );
    }
    const ins = await supabase
      .from("scan_runs")
      .insert({ thesis_id, results: validated.data });
    if (ins.error) {
      console.error("[/api/scan/run] persist_failed (insert):", ins.error);
      return NextResponse.json(
        { error: "persist_failed", detail: ins.error.message },
        { status: 500 },
      );
    }
    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "scan",
      agent: "scan_runner",
      event_type: "complete",
      payload: { ...validated.data, model: scanModel },
    });

    return NextResponse.json(
      { scan: validated.data, dropped, dropped_ratios },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/scan/run] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", detail: message },
      { status: 500 },
    );
  }
}
