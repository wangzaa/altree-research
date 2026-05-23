import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveDerivable } from "@/lib/resolvers/derivable";
import { ClassifiedQuestionSchema } from "@/lib/schemas/question";
import {
  ThesisIdSchema,
  ThesisSchema,
  type Thesis,
} from "@/lib/schemas/thesis";
import { ScanResultsSchema } from "@/lib/schemas/scan";
import { UniverseSchema, type Universe } from "@/lib/schemas/universe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compose body schema by AND-ing the thesis_id wrapper with the classified
// question discriminated union — preserves discriminated narrowing on
// `category` while requiring a valid `thesis_id`.
const BodySchema = z
  .object({ thesis_id: ThesisIdSchema })
  .and(ClassifiedQuestionSchema);

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
      return NextResponse.json(
        { error: "invalid_body", detail: parsed.error.message },
        { status: 400 },
      );
    }
    const { thesis_id, question, category, hint } = parsed.data;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    // Early reject for needs_analyst — the UI shouldn't even call this route.
    if (category === "needs_analyst") {
      return NextResponse.json(
        {
          error: "needs_analyst",
          detail: "category requires a human analyst",
        },
        { status: 400 },
      );
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

    const agentLabel = `question_${category}`;
    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "question",
      agent: agentLabel,
      event_type: "start",
      payload: { category, question },
    });

    // Categories that the UI can render as placeholders for now.
    if (
      category === "corpus" ||
      category === "web" ||
      category === "fundamentals_extra"
    ) {
      const message =
        category === "fundamentals_extra"
          ? "Out of scope for cycle 3 — extra fundamentals not yet wired up."
          : category === "corpus"
            ? "Phase 2 — corpus resolver not built yet."
            : "Phase 3 — web resolver not built yet.";
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "question",
        agent: agentLabel,
        event_type: "complete",
        payload: { category, status: "not_implemented" },
      });
      return NextResponse.json(
        { status: "not_implemented", category, message },
        { status: 200 },
      );
    }

    // category === "derivable" from here on.
    const universeRow = await supabase
      .from("universes")
      .select("*")
      .eq("id", thesis.universe_id)
      .maybeSingle();
    if (
      universeRow.error ||
      !universeRow.data ||
      universeRow.data.created_by !== user.id
    ) {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "question",
        agent: agentLabel,
        event_type: "error",
        payload: { category, message: "universe not available" },
      });
      return NextResponse.json(
        { error: "missing_data", detail: "no universe available for this thesis" },
        { status: 409 },
      );
    }
    const universeCheck = UniverseSchema.safeParse(universeRow.data.universe);
    if (!universeCheck.success) {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "question",
        agent: agentLabel,
        event_type: "error",
        payload: {
          category,
          message: "invalid_state",
          detail: universeCheck.error.message,
        },
      });
      return NextResponse.json(
        { error: "invalid_state", detail: "stored universe failed validation" },
        { status: 500 },
      );
    }
    const universe: Universe = universeCheck.data;

    const { data: scanRows } = await supabase
      .from("scan_runs")
      .select("results")
      .eq("thesis_id", thesis_id)
      .order("run_at", { ascending: false })
      .limit(1);
    if (!scanRows?.length) {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "question",
        agent: agentLabel,
        event_type: "error",
        payload: { category, message: "scan not available" },
      });
      return NextResponse.json(
        { error: "missing_data", detail: "no scan available for this thesis" },
        { status: 409 },
      );
    }
    const scanCheck = ScanResultsSchema.safeParse(scanRows[0].results);
    if (!scanCheck.success) {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "question",
        agent: agentLabel,
        event_type: "error",
        payload: {
          category,
          message: "invalid_state",
          detail: scanCheck.error.message,
        },
      });
      return NextResponse.json(
        { error: "invalid_state", detail: "stored scan failed validation" },
        { status: 500 },
      );
    }

    const result = resolveDerivable(hint, scanCheck.data, universe);
    if (!result.ok) {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "question",
        agent: agentLabel,
        event_type: "complete",
        payload: { category, status: "unresolvable", reason: result.reason },
      });
      return NextResponse.json(
        { status: "unresolvable", category, message: result.reason },
        { status: 200 },
      );
    }

    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "question",
      agent: agentLabel,
      event_type: "complete",
      payload: {
        category,
        status: "resolved",
        ticker_count: result.answer.sources.tickers.length,
      },
    });

    return NextResponse.json(
      { status: "resolved", category, answer: result.answer },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/question/resolve] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", detail: message },
      { status: 500 },
    );
  }
}
