import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type ThesisListItem = {
  id: string;
  source_snippet: string | null;
  created_at: string;
  status: string | null;
};

/** Returns the authenticated user's most recent theses, newest first. Used
 * by the Live Log panel to power the "previous sessions" carousel — the
 * user can pick a past thesis and review its pipeline events without
 * navigating away from the current one. */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "5");
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 20
      ? Math.floor(limitRaw)
      : 5;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("theses")
    .select("id, source_snippet, created_at, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: "internal_error", detail: error.message },
      { status: 500 },
    );
  }

  const theses: ThesisListItem[] = (data ?? []).map((r) => ({
    id: r.id as string,
    source_snippet: (r.source_snippet as string | null) ?? null,
    created_at: r.created_at as string,
    status: (r.status as string | null) ?? null,
  }));

  return NextResponse.json({ theses }, { status: 200 });
}
