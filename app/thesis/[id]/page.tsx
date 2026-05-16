import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { ThesisIdSchema, type Thesis } from "@/lib/schemas/thesis";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ThreePanelLayout } from "@/components/three-panel-layout";
import type { Stage } from "@/components/stage-list";
import { ThesisDetail } from "./thesis-detail.client";

const STAGE_1_COMPLETED_STAGES: Stage[] = [
  { name: "Thesis extraction", status: "completed" },
  { name: "Universe construction", status: "pending" },
  { name: "Screener", status: "pending" },
  { name: "Scanner", status: "pending" },
  { name: "Validator", status: "pending" },
  { name: "Memo", status: "pending" },
];

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

  return (
    <ThreePanelLayout
      stages={STAGE_1_COMPLETED_STAGES}
      artifact={<ThesisDetail initial={thesis} />}
    />
  );
}
