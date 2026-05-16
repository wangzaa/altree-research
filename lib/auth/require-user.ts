import { redirect } from "next/navigation";
import { getCurrentUser } from "./session";

export async function requireUser(): Promise<{ id: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
