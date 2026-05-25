import { NextResponse } from "next/server";
import { z } from "zod";
import { selectFunds } from "@/lib/agents/fund-selector";
import { getCurrentUser } from "@/lib/auth/session";
import { ThesisIdSchema, type Thesis } from "@/lib/schemas/thesis";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getModelFor } from "@/lib/data/agent-models";

const BodySchema = z.object({
  thesis_id: ThesisIdSchema,
});

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
    const { data, error } = await supabase
      .from("theses")
      .select("*")
      .eq("id", thesis_id)
      .maybeSingle();

    if (error || !data || data.user_id !== user.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const thesis = data.thesis as Thesis;
    const selectorModel = getModelFor("fund_selector");

    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "execute",
      agent: "fund_selector",
      event_type: "start",
      payload: {
        regions: thesis.scope.regions,
        sectors: thesis.scope.sectors,
        model: selectorModel,
      },
    });

    let result;
    try {
      result = await selectFunds(thesis);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[/api/fund/select] select_failed:", message);
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "execute",
        agent: "fund_selector",
        event_type: "error",
        payload: { error: message, model: selectorModel },
      });
      return NextResponse.json({ error: "select_failed" }, { status: 502 });
    }

    if (!result.ok) {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "execute",
        agent: "fund_selector",
        event_type: "error",
        payload: {
          code: result.code,
          error: result.error,
          model: selectorModel,
        },
      });
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: 422 },
      );
    }

    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "execute",
      agent: "fund_selector",
      event_type: "complete",
      payload: {
        model: result.model,
        usage: result.usage,
        funds: result.funds.length,
        dropped: result.dropped.length,
      },
    });

    return NextResponse.json({ funds: result.funds }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/fund/select] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", details: message },
      { status: 500 },
    );
  }
}
