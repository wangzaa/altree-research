import { NextResponse, type NextRequest } from "next/server";
import { refreshCorpus } from "@/lib/ingest/expert-corpus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await refreshCorpus();
    return NextResponse.json(summary, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
