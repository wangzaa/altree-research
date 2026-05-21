import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getQuote } from "@/lib/data/yahoo";
import { ScanResultsSchema, type ScanResults } from "@/lib/schemas/scan";
import { ThesisIdSchema, type Thesis } from "@/lib/schemas/thesis";
import type { Universe } from "@/lib/schemas/universe";
import {
  DriverValidationResultSchema,
  type DriverValidationResult,
} from "@/lib/schemas/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PipelineLayout } from "@/components/pipeline-layout";
import { deriveStepStates } from "@/lib/pipeline-steps";
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

  let initialScan: ScanResults | null = null;
  {
    const { data: sRows } = await supabase
      .from("scan_runs")
      .select("results")
      .eq("thesis_id", id)
      .order("run_at", { ascending: false })
      .limit(1);
    const raw = sRows?.[0]?.results;
    if (raw) {
      const parsed = ScanResultsSchema.safeParse(raw);
      if (parsed.success) initialScan = parsed.data;
    }
  }

  let initialValidation: Record<string, DriverValidationResult> | null = null;
  {
    const { data: vRows } = await supabase
      .from("validation_runs")
      .select("results")
      .eq("thesis_id", id)
      .order("run_at", { ascending: false })
      .limit(1);
    const raw = vRows?.[0]?.results;
    if (raw && typeof raw === "object") {
      const acc: Record<string, DriverValidationResult> = {};
      for (const [driverId, value] of Object.entries(
        raw as Record<string, unknown>,
      )) {
        const parsed = DriverValidationResultSchema.safeParse(value);
        if (parsed.success) acc[driverId] = parsed.data;
      }
      initialValidation = Object.keys(acc).length > 0 ? acc : null;
    }
  }

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

  const steps = deriveStepStates({
    thesis,
    universe: initialUniverse,
    scan: initialScan,
    validationResults: initialValidation,
  });

  return (
    <PipelineLayout steps={steps} thesisId={thesis.id}>
      <ThesisDetail
        initial={thesis}
        initialUniverse={initialUniverse}
        initialScan={initialScan}
        initialValidation={initialValidation}
        seedNames={seedNames}
      />
    </PipelineLayout>
  );
}
