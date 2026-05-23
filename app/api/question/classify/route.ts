import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { classifyQuestions } from "@/lib/agents/question-classifier";
import { getModelFor } from "@/lib/data/agent-models";
import {
  ThesisIdSchema,
  ThesisSchema,
  type Thesis,
} from "@/lib/schemas/thesis";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    thesis_id: ThesisIdSchema,
    questions: z.array(z.string().min(1)).max(20),
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
    const { thesis_id, questions } = parsed.data;

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

    // Short-circuit empty input — skip the agent and the pipeline events.
    if (questions.length === 0) {
      return NextResponse.json({ classifications: [] }, { status: 200 });
    }

    const model = getModelFor("question_classifier");

    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "question",
      agent: "question_classifier",
      event_type: "start",
      payload: { model, question_count: questions.length },
    });

    let result;
    try {
      result = await classifyQuestions({ thesis, questions });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[/api/question/classify] classify_failed:", message);
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "question",
        agent: "question_classifier",
        event_type: "error",
        payload: { error: message, model },
      });
      return NextResponse.json(
        { error: "classify_failed", detail: message },
        { status: 502 },
      );
    }

    if (!result.ok) {
      await supabase.from("pipeline_events").insert({
        thesis_id,
        stage: "question",
        agent: "question_classifier",
        event_type: "error",
        payload: { error: result.error, model },
      });
      return NextResponse.json(
        { error: "classify_failed", detail: result.error },
        { status: 502 },
      );
    }

    const counts: Record<string, number> = {};
    for (const c of result.classifications) {
      counts[c.category] = (counts[c.category] ?? 0) + 1;
    }

    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "question",
      agent: "question_classifier",
      event_type: "complete",
      payload: { model: result.model, counts, usage: result.usage },
    });

    return NextResponse.json(
      { classifications: result.classifications },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/question/classify] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", detail: message },
      { status: 500 },
    );
  }
}
