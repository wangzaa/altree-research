import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ThesisIdSchema, ThesisSchema } from "@/lib/schemas/thesis";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const idCheck = ThesisIdSchema.safeParse(id);
  if (!idCheck.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("theses")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (data.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ id: data.id, thesis: data.thesis }, { status: 200 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const idCheck = ThesisIdSchema.safeParse(id);
    if (!idCheck.success) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const parsed = ThesisSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_thesis", detail: parsed.error.message },
        { status: 422 },
      );
    }
    const proposed = parsed.data;

    if (proposed.id !== id) {
      return NextResponse.json({ error: "id_mismatch" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const fetched = await supabase
      .from("theses")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetched.error || !fetched.data || fetched.data.user_id !== user.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const nextVersion = (fetched.data.version ?? 1) + 1;
    const update = await supabase
      .from("theses")
      .update({ thesis: proposed, version: nextVersion })
      .eq("id", id);

    if (update.error) {
      console.error("[/api/thesis/[id]:PATCH] persist_failed:", update.error);
      return NextResponse.json(
        { error: "persist_failed", details: update.error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { id, thesis: proposed, version: nextVersion },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/thesis/[id]:PATCH] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", details: message },
      { status: 500 },
    );
  }
}
