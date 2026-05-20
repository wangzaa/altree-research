import { NextResponse } from "next/server";
import { z } from "zod";
import { extractThesis } from "@/lib/agents/thesis-extractor";
import { getCurrentUser } from "@/lib/auth/session";
import { generateThesisId } from "@/lib/schemas/thesis-id";
import { sluggifyForThesis } from "@/lib/schemas/slug";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  source_snippet: z.string().min(20).max(10_000),
});

export async function POST(req: Request) {
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

  const { source_snippet } = parsed.data;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const createdAt = now.toISOString();

  const slug = sluggifyForThesis(source_snippet);

  const yy = String(year % 100).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const idPrefix = `${slug}_${yy}_${mm}_`;

  const supabase = getSupabaseServerClient();

  const existing = await supabase
    .from("theses")
    .select("id")
    .like("id", `${idPrefix}%`)
    .limit(100);

  if (existing.error) {
    return NextResponse.json(
      { error: "persist_failed", details: existing.error.message },
      { status: 500 },
    );
  }

  const existingIds = (existing.data ?? []).map((row) => row.id);
  const id = generateThesisId({ slug, year, month, existingIds });

  const result = await extractThesis({
    sourceSnippet: source_snippet,
    id,
    createdBy: user.id,
    createdAt,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, raw: result.raw ?? null },
      { status: 422 },
    );
  }

  const insert = await supabase.from("theses").insert({
    id,
    user_id: user.id,
    version: 1,
    source_snippet,
    thesis: result.thesis,
    status: "draft",
    verdict: null,
    last_validated_at: null,
  });

  if (insert.error) {
    return NextResponse.json(
      { error: "persist_failed", details: insert.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ id, thesis: result.thesis }, { status: 200 });
}
