import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getQuote } from "@/lib/data/yahoo";
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

  // Pre-fetch names for each seed ticker so the AnchorPicker chips can show
  // "TICKER — Name" instead of just the symbol. Parallel; Yahoo errors absorbed
  // silently (chip just shows the symbol if the lookup fails).
  const seedNames: Record<string, string> = {};
  if (!initialUniverse && thesis.scope.tickers_seed.length > 0) {
    const results = await Promise.all(
      thesis.scope.tickers_seed.map(async (t) => {
        const quote = await getQuote(t);
        return [t, quote?.name ?? null] as const;
      }),
    );
    for (const [ticker, name] of results) {
      if (name) seedNames[ticker] = name;
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
      artifact={
        <ThesisDetail
          initial={thesis}
          initialUniverse={initialUniverse}
          seedNames={seedNames}
        />
      }
    />
  );
}
