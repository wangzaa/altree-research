import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ thesisId: string }> },
) {
  try {
    const { thesisId } = await params;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();

    const thesisRow = await supabase
      .from("theses")
      .select("*")
      .eq("id", thesisId)
      .maybeSingle();
    if (
      thesisRow.error ||
      !thesisRow.data ||
      thesisRow.data.user_id !== user.id
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const rows = await supabase
      .from("scan_runs")
      .select("results, run_at")
      .eq("thesis_id", thesisId)
      .order("run_at", { ascending: false })
      .limit(1);

    if (rows.error) {
      return NextResponse.json(
        { error: "internal_error", detail: rows.error.message },
        { status: 500 },
      );
    }
    if (!rows.data || rows.data.length === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ scan: rows.data[0].results }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/scan/[thesisId]:GET] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", detail: message },
      { status: 500 },
    );
  }
}
