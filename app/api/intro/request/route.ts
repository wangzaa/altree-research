import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { IntroRequestBodySchema } from "@/lib/schemas/intro-request";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/intro/request — capture a lead-gen intro request (ADR-0004).
 * v1 records intent only; partner routing is a later phase.
 */
export async function POST(req: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const parsed = IntroRequestBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const { thesis_id, ticker, memo_id, note } = parsed.data;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();

    // Ownership: the thesis must belong to the requesting user.
    const { data: thesisRow, error: thesisErr } = await supabase
      .from("theses")
      .select("id, user_id")
      .eq("id", thesis_id)
      .maybeSingle();
    if (thesisErr || !thesisRow || thesisRow.user_id !== user.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("intro_requests")
      .insert({
        thesis_id,
        user_id: user.id,
        ticker,
        memo_id: memo_id ?? null,
        note: note ?? null,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: "capture_failed" },
        { status: 502 },
      );
    }

    await supabase.from("pipeline_events").insert({
      thesis_id,
      stage: "execute",
      agent: "lead_gen",
      event_type: "complete",
      payload: { intro_request_id: inserted.id, ticker },
    });

    return NextResponse.json({ ok: true, id: inserted.id }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/intro/request] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", details: message },
      { status: 500 },
    );
  }
}
