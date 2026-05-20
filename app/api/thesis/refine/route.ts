import { NextResponse } from "next/server";
import { z } from "zod";
import { refineThesis } from "@/lib/agents/thesis-refiner";
import { getCurrentUser } from "@/lib/auth/session";
import { diffThesis } from "@/lib/diff/thesis-diff";
import { ThesisIdSchema, type Thesis } from "@/lib/schemas/thesis";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

    let result;
    try {
      result = await refineThesis({ current, instruction });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[/api/thesis/refine] refine_failed:", message);
      return NextResponse.json({ error: "refine_failed" }, { status: 502 });
    }

    if (!result.ok) {
      return NextResponse.json(
        { error: "invalid_thesis", detail: result.error, raw: result.raw ?? null },
        { status: 422 },
      );
    }

    const diff = diffThesis(current, result.thesis);
    return NextResponse.json(
      { current, proposed: result.thesis, diff },
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
