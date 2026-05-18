import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { ThesisIdSchema, type Thesis } from "@/lib/schemas/thesis";
import type { Universe } from "@/lib/schemas/universe";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ThreePanelLayout } from "@/components/three-panel-layout";
import type { Stage } from "@/components/stage-list";
import { ThesisDetail } from "./thesis-detail.client";

export default async function ThesisViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const idCheck = ThesisIdSchema.safeParse(id);
  if (!idCheck.success) {
    notFound();
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("theses")
    .select("id, user_id, thesis")
    .eq("id", id)
    .maybeSingle();

  if (error || !data || data.user_id !== user.id || !data.thesis) {
    notFound();
  }

  const thesis = data.thesis as unknown as Thesis;

  // Pre-load the universe if one is attached (owner-scoped via created_by).
  let initialUniverse: Universe | null = null;
  if (thesis.universe_id) {
    const { data: uRow } = await supabase
      .from("universes")
      .select("id, created_by, universe")
      .eq("id", thesis.universe_id)
      .maybeSingle();
    if (uRow && uRow.created_by === user.id && uRow.universe) {
      initialUniverse = uRow.universe as unknown as Universe;
    }
  }

  const stages: Stage[] = [
    { name: "Thesis extraction", status: "completed" },
    {
      name: "Universe construction",
      status: initialUniverse ? "completed" : "pending",
    },
    { name: "Screener", status: "pending" },
    { name: "Scanner", status: "pending" },
    { name: "Validator", status: "pending" },
    { name: "Memo", status: "pending" },
  ];

  return (
    <ThreePanelLayout
      stages={stages}
      artifact={<ThesisDetail initial={thesis} initialUniverse={initialUniverse} />}
    />
  );
}
