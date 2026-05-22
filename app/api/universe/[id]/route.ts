import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  UniverseSchema,
  type UniverseTicker,
} from "@/lib/schemas/universe";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function thesisIdFromUniverseId(universeId: string): string | null {
  const match = universeId.match(/^(.+)_universe_\d{2}$/);
  return match ? match[1] : null;
}

function diffTickerCounts(
  before: UniverseTicker[] | null,
  after: UniverseTicker[],
) {
  const beforeKeys = new Set((before ?? []).map((t) => t.ticker));
  const afterKeys = new Set(after.map((t) => t.ticker));
  let added = 0;
  let removed = 0;
  for (const k of afterKeys) if (!beforeKeys.has(k)) added += 1;
  for (const k of beforeKeys) if (!afterKeys.has(k)) removed += 1;
  return { added, removed, total: after.length };
}

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

    const priorUniverse = fetched.data.universe as {
      tickers?: UniverseTicker[];
    } | null;
    const counts = diffTickerCounts(
      priorUniverse?.tickers ?? null,
      universe.tickers,
    );
    const thesisId = thesisIdFromUniverseId(id);

    const refreshedAt = new Date().toISOString();
    const update = await supabase
      .from("universes")
      .update({ universe, refreshed_at: refreshedAt })
      .eq("id", id);
    if (update.error) {
      console.error("[/api/universe/[id]:PATCH] persist_failed:", update.error);
      if (thesisId) {
        await supabase.from("pipeline_events").insert({
          thesis_id: thesisId,
          stage: "universe",
          agent: "universe_persistor",
          event_type: "error",
          payload: { universe_id: id, error: update.error.message },
        });
      }
      return NextResponse.json(
        { error: "persist_failed", details: update.error.message },
        { status: 500 },
      );
    }

    if (thesisId) {
      await supabase.from("pipeline_events").insert({
        thesis_id: thesisId,
        stage: "universe",
        agent: "universe_persistor",
        event_type: "complete",
        payload: {
          universe_id: id,
          tickers_total: counts.total,
          tickers_added: counts.added,
          tickers_removed: counts.removed,
        },
      });
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
