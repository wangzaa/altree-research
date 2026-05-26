import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getQuote } from "@/lib/data/yahoo";
import { getRatesUsd, formatFxAsOf } from "@/lib/data/fx-live";
import { MemoSchema, type Memo } from "@/lib/schemas/memo";
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

  // Latest cached memo + when it was generated. When present, ThesisDetail
  // seeds its memo state from this instead of rendering the click-to-
  // generate empty state — revisits to a thesis pick up where the last
  // session left off without re-paying LLM tokens.
  let initialMemo: Memo | null = null;
  let memoGeneratedAt: string | null = null;
  {
    const { data: mRows } = await supabase
      .from("memos")
      .select("memo, generated_at")
      .eq("thesis_id", id)
      .order("generated_at", { ascending: false })
      .limit(1);
    const raw = mRows?.[0]?.memo;
    if (raw) {
      const parsed = MemoSchema.safeParse(raw);
      if (parsed.success) {
        initialMemo = parsed.data;
        memoGeneratedAt = (mRows?.[0]?.generated_at as string) ?? null;
      }
    }
  }

  // Build a single ticker -> company name map for everything the page
  // surfaces. Universe takes precedence (already enriched), then fall back
  // to live Yahoo lookups for any seed or per-driver ticker that's not in
  // the universe yet. Used by the chat-style thesis playback so every
  // ticker can render as `Company (TICKER)` per the tone-of-voice rules.
  const tickerNames: Record<string, string> = {};
  if (initialUniverse) {
    for (const t of initialUniverse.tickers) {
      tickerNames[t.ticker] = t.name;
    }
  }
  const allReferencedTickers = new Set<string>([
    ...thesis.scope.tickers_seed,
    ...thesis.drivers.industry.flatMap((d) => d.tickers ?? []),
  ]);
  const missing = Array.from(allReferencedTickers).filter(
    (t) => !tickerNames[t],
  );
  if (missing.length > 0) {
    const results = await Promise.all(
      missing.map(async (t) => {
        const quote = await getQuote(t);
        return [t, quote?.name ?? null] as const;
      }),
    );
    for (const [ticker, name] of results) {
      if (name) tickerNames[ticker] = name;
    }
  }
  // The AnchorPicker still expects a seed-only subset; build it from the
  // larger map so we don't double-fetch.
  const seedNames: Record<string, string> = {};
  for (const t of thesis.scope.tickers_seed) {
    if (tickerNames[t]) seedNames[t] = tickerNames[t];
  }

  // Pre-fetch FX rates for every currency present in the scan so the
  // client-rendered EBITDA column converts to USD M without doing its own
  // network lookups. The fx-live module caches in-process for 30 min, so
  // repeated page loads share the same rates batch.
  const fxCurrencies = new Set<string>();
  if (initialScan) {
    for (const s of initialScan.tickers_snapshot) {
      if (s.currency) fxCurrencies.add(s.currency);
    }
  }
  const { rates: ratesByCurrency, as_of_ms: fxAsOfMs } = await getRatesUsd(
    Array.from(fxCurrencies),
  );
  const fxAsOf = formatFxAsOf(fxAsOfMs);

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
        initialMemo={initialMemo}
        memoGeneratedAt={memoGeneratedAt}
        seedNames={seedNames}
        tickerNames={tickerNames}
        ratesByCurrency={ratesByCurrency}
        fxAsOf={fxAsOf}
      />
    </PipelineLayout>
  );
}
