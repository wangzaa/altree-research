import { auth } from "@/lib/auth/server";
import { headers as nextHeaders } from "next/headers";

export async function getCurrentUser(): Promise<{ id: string } | null> {
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  return session?.user ? { id: session.user.id } : null;
}
