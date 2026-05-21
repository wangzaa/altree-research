import { NextResponse } from "next/server";
import { z } from "zod";
import { runBullResearcher } from "@/lib/agents/bull-researcher";
import { runBearResearcher } from "@/lib/agents/bear-researcher";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ThesisIdSchema, ThesisSchema, type Thesis } from "@/lib/schemas/thesis";
import { DriverValidationResultSchema } from "@/lib/schemas/validation";
import { getModelFor } from "@/lib/data/agent-models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    thesis_id: ThesisIdSchema,
    driver_id: z.string().min(1),
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
    const { thesis_id, driver_id } = parsed.data;

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
    const driver = thesis.drivers.industry.find((d) => d.id === driver_id);
    if (!driver) {
      return NextResponse.json(
        { error: "driver_not_found", detail: driver_id },
        { status: 404 },
      );
    }

    const bullModel = getModelFor("bull_researcher");
    const bearModel = getModelFor("bear_researcher");

    await supabase.from("pipeline_events").insert([
      {
        thesis_id,
        stage: "validate",
        agent: "bull_researcher",
        event_type: "start",
        payload: { driver_id, model: bullModel },
      },
      {
        thesis_id,
        stage: "validate",
        agent: "bear_researcher",
        event_type: "start",
        payload: { driver_id, model: bearModel },
      },
    ]);

    // Bull and Bear in genuinely parallel, separate Anthropic client
    // instances. Failures bubble per lens so we can report which side
    // broke without rolling back the other lens's events.
    const [bullSettled, bearSettled] = await Promise.allSettled([
      runBullResearcher({ thesis, driver }),
      runBearResearcher({ thesis, driver }),
    ]);

    if (bullSettled.status === "rejected") {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "validate",
        agent: "bull_researcher",
        event_type: "error",
        payload: { driver_id, message: String(bullSettled.reason) },
      });
      return NextResponse.json(
        { error: "bull_failed", detail: String(bullSettled.reason) },
        { status: 502 },
      );
    }
    if (bearSettled.status === "rejected") {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "validate",
        agent: "bear_researcher",
        event_type: "error",
        payload: { driver_id, message: String(bearSettled.reason) },
      });
      return NextResponse.json(
        { error: "bear_failed", detail: String(bearSettled.reason) },
        { status: 502 },
      );
    }

    const bull = bullSettled.value;
    const bear = bearSettled.value;

    await supabase.from("pipeline_events").insert([
      {
        thesis_id,
        stage: "validate",
        agent: "bull_researcher",
        event_type: "complete",
        payload: {
          driver_id,
          count: bull.evidence.length,
          usage: bull.usage,
          model: bull.model,
        },
      },
      {
        thesis_id,
        stage: "validate",
        agent: "bear_researcher",
        event_type: "complete",
        payload: {
          driver_id,
          count: bear.evidence.length,
          usage: bear.usage,
          model: bear.model,
        },
      },
    ]);

    const partial = DriverValidationResultSchema.parse({
      bull_evidence: bull.evidence,
      bear_evidence: bear.evidence,
    });

    // Merge into the latest validation_runs row for this thesis; create if
    // none exists. Versioning by new row at run_at lands in narrowed S7.
    const { data: latest } = await supabase
      .from("validation_runs")
      .select("id,results")
      .eq("thesis_id", thesis_id)
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const mergedResults = {
      ...((latest?.results as Record<string, unknown>) ?? {}),
      [driver_id]: partial,
    };

    if (latest) {
      const upd = await supabase
        .from("validation_runs")
        .update({ results: mergedResults as never })
        .eq("id", latest.id);
      if (upd.error) {
        return NextResponse.json(
          { error: "persist_failed", detail: upd.error.message },
          { status: 500 },
        );
      }
    } else {
      const ins = await supabase
        .from("validation_runs")
        .insert({ thesis_id, results: mergedResults as never });
      if (ins.error) {
        return NextResponse.json(
          { error: "persist_failed", detail: ins.error.message },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(
      {
        driver_id,
        bull_evidence: bull.evidence,
        bear_evidence: bear.evidence,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/validate/driver] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", detail: message },
      { status: 500 },
    );
  }
}
