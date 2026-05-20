import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth/server";

export async function POST(req: Request) {
  try {
    await auth.api.signOut({ headers: await nextHeaders() });
  } catch {
    // Swallow sign-out errors; we still want to redirect to /sign-in.
  }
  return NextResponse.redirect(new URL("/sign-in", req.url), { status: 303 });
}
