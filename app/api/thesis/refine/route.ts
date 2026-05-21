import { NextResponse } from "next/server";
import { z } from "zod";
import { refineThesis } from "@/lib/agents/thesis-refiner";
import { narrateDiff } from "@/lib/agents/diff-narrator";
import { getCurrentUser } from "@/lib/auth/session";
import { diffThesis } from "@/lib/diff/thesis-diff";
import { ThesisIdSchema, type Thesis } from "@/lib/schemas/thesis";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getModelFor } from "@/lib/data/agent-models";

const BodySchema = z.object({
  thesis_id: ThesisIdSchema,
  instruction: z.string().min(1).max(2_000),
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
    const { thesis_id, instruction } = parsed.data;

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

    const current = data.thesis as Thesis;

    const refinerModel = getModelFor("thesis_refiner");
    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "extract",
      agent: "thesis_refiner",
      event_type: "start",
      payload: {
        instruction_chars: instruction.length,
        model: refinerModel,
      },
    });

    let result;
    try {
      result = await refineThesis({ current, instruction });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[/api/thesis/refine] refine_failed:", message);
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "extract",
        agent: "thesis_refiner",
        event_type: "error",
        payload: { error: message, model: refinerModel },
      });
      return NextResponse.json({ error: "refine_failed" }, { status: 502 });
    }

    if (!result.ok) {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "extract",
        agent: "thesis_refiner",
        event_type: "error",
        payload: { error: result.error, model: refinerModel },
      });
      return NextResponse.json(
        { error: "invalid_thesis", detail: result.error, raw: result.raw ?? null },
        { status: 422 },
      );
    }

    const diff = diffThesis(current, result.thesis);

    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "extract",
      agent: "thesis_refiner",
      event_type: "complete",
      payload: {
        model: result.model,
        usage: result.usage,
        diff_added: diff.added.length,
        diff_removed: diff.removed.length,
        diff_changed: diff.changed.length,
      },
    });

    // Narrate the diff for the chat-style preview. Best-effort: if the
    // narrator call fails for any reason, we still return the diff so the
    // analyst can confirm/cancel; the UI falls back to raw diff lines.
    let narrative: string | null = null;
    const narratorModel = getModelFor("diff_narrator");
    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "extract",
      agent: "diff_narrator",
      event_type: "start",
      payload: { model: narratorModel },
    });
    try {
      const n = await narrateDiff({
        current,
        proposed: result.thesis,
        diff,
        instruction,
      });
      narrative = n.narrative;
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "extract",
        agent: "diff_narrator",
        event_type: "complete",
        payload: {
          model: n.model,
          usage: n.usage,
          chars: n.narrative.length,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[/api/thesis/refine] narrate_failed:", message);
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "extract",
        agent: "diff_narrator",
        event_type: "error",
        payload: { error: message, model: narratorModel },
      });
    }

    return NextResponse.json(
      { current, proposed: result.thesis, diff, narrative },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/thesis/refine] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", details: message },
      { status: 500 },
    );
  }
}
