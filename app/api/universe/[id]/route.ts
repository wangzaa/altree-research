import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { UniverseSchema } from "@/lib/schemas/universe";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("universes")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data || data.created_by !== user.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ universe: data.universe }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/universe/[id]:GET] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", details: message },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

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

    const parsed = UniverseSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_universe", detail: parsed.error.message },
        { status: 422 },
      );
    }
    const universe = parsed.data;

    if (universe.id !== id) {
      return NextResponse.json({ error: "id_mismatch" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const fetched = await supabase
      .from("universes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (
      fetched.error ||
      !fetched.data ||
      fetched.data.created_by !== user.id
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const refreshedAt = new Date().toISOString();
    const update = await supabase
      .from("universes")
      .update({ universe, refreshed_at: refreshedAt })
      .eq("id", id);
    if (update.error) {
      console.error("[/api/universe/[id]:PATCH] persist_failed:", update.error);
      return NextResponse.json(
        { error: "persist_failed", details: update.error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ universe }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/universe/[id]:PATCH] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", details: message },
      { status: 500 },
    );
  }
}
