import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { writeMemo } from "@/lib/agents/memo-writer";
import { getModelFor } from "@/lib/data/agent-models";
import { ScanResultsSchema, type ScanResults } from "@/lib/schemas/scan";
import {
  ThesisIdSchema,
  ThesisSchema,
  type Thesis,
} from "@/lib/schemas/thesis";
import {
  DriverValidationResultSchema,
  type DriverValidationResult,
} from "@/lib/schemas/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    thesis_id: ThesisIdSchema,
    chart_window: z.enum(["3mth", "6mth", "12mth", "3y", "5y"]).optional(),
    visible_metric_keys: z.array(z.string()).optional(),
    selected_tickers: z.array(z.string()).optional(),
  })
  .strict();

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
    const {
      thesis_id,
      chart_window,
      visible_metric_keys,
      selected_tickers,
    } = parsed.data;

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
    const thesisCheck = ThesisSchema.safeParse(thesisRow.data.thesis);
    if (!thesisCheck.success) {
      return NextResponse.json(
        { error: "invalid_thesis", detail: thesisCheck.error.message },
        { status: 500 },
      );
    }
    const thesis: Thesis = thesisCheck.data;

    // Latest scan
    let scan: ScanResults | null = null;
    {
      const { data: sRows } = await supabase
        .from("scan_runs")
        .select("results")
        .eq("thesis_id", thesis_id)
        .order("run_at", { ascending: false })
        .limit(1);
      const raw = sRows?.[0]?.results;
      if (raw) {
        const p = ScanResultsSchema.safeParse(raw);
        if (p.success) scan = p.data;
      }
    }

    // Latest validation results
    let validation: Record<string, DriverValidationResult> | null = null;
    {
      const { data: vRows } = await supabase
        .from("validation_runs")
        .select("results")
        .eq("thesis_id", thesis_id)
        .order("run_at", { ascending: false })
        .limit(1);
      const raw = vRows?.[0]?.results;
      if (raw && typeof raw === "object") {
        const acc: Record<string, DriverValidationResult> = {};
        for (const [driverId, value] of Object.entries(
          raw as Record<string, unknown>,
        )) {
          const p = DriverValidationResultSchema.safeParse(value);
          if (p.success) acc[driverId] = p.data;
        }
        if (Object.keys(acc).length > 0) validation = acc;
      }
    }

    const memoModel = getModelFor("memo_writer");
    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "memo",
      agent: "memo_writer",
      event_type: "start",
      payload: { model: memoModel },
    });

    let result;
    try {
      result = await writeMemo({
        thesis,
        scan,
        validation,
        chartWindow: chart_window,
        visibleMetricKeys: visible_metric_keys,
        selectedTickers: selected_tickers,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[/api/memo/generate] write_failed:", message);
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "memo",
        agent: "memo_writer",
        event_type: "error",
        payload: { error: message, model: memoModel },
      });
      return NextResponse.json(
        { error: "write_failed", detail: message },
        { status: 502 },
      );
    }

    if (!result.ok) {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "memo",
        agent: "memo_writer",
        event_type: "error",
        payload: { error: result.error, model: memoModel },
      });
      return NextResponse.json(
        { error: "invalid_memo", detail: result.error, raw: result.raw ?? null },
        { status: 422 },
      );
    }

    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "memo",
      agent: "memo_writer",
      event_type: "complete",
      payload: {
        model: result.model,
        usage: result.usage,
        verdict: result.memo.verdict,
        open_questions: result.memo.open_questions.length,
      },
    });

    // Cache the synthesised memo (with its inputs) so revisits to
    // /thesis/[id] render the Anti/Thesis bubbles immediately without
    // re-paying the LLM. Append-only — the page reads the latest row by
    // generated_at desc.
    const memoInsert = await supabase.from("memos").insert({
      thesis_id,
      memo: result.memo,
      chart_window: chart_window ?? null,
      visible_metric_keys: visible_metric_keys ?? null,
      selected_tickers: selected_tickers ?? null,
    });
    if (memoInsert.error) {
      console.error(
        "[/api/memo/generate] memo cache insert failed:",
        memoInsert.error,
      );
      // Don't fail the response — the synthesis succeeded; the cache is a
      // perf optimisation. The user still sees the memo this turn.
    }

    return NextResponse.json({ memo: result.memo }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/memo/generate] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", detail: message },
      { status: 500 },
    );
  }
}
