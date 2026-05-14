import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ThesisIdSchema } from "@/lib/schemas/thesis";
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
