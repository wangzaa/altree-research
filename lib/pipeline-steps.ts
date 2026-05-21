import type { Thesis } from "@/lib/schemas/thesis";
import type { Universe } from "@/lib/schemas/universe";
import type { ScanResults } from "@/lib/schemas/scan";
import type { DriverValidationResult } from "@/lib/schemas/validation";

export type PipelineStepState = "pending" | "active" | "completed";

export type PipelineStep = {
  id: string;
  label: string;
  state: PipelineStepState;
};

export type DeriveStepStatesInputs = {
  thesis: Thesis | null;
  universe: Universe | null;
  scan: ScanResults | null;
  validationResults: Record<string, DriverValidationResult> | null;
};

function hasAnyBullEvidence(
  results: Record<string, DriverValidationResult> | null,
): boolean {
  if (!results) return false;
  return Object.values(results).some(
    (r) => Array.isArray(r.bull_evidence) && r.bull_evidence.length > 0,
  );
}

export function deriveStepStates(
  inputs: DeriveStepStatesInputs,
): PipelineStep[] {
  const thesisDone = inputs.thesis !== null;
  const universeDone =
    inputs.universe !== null && inputs.universe.tickers.length > 0;
  const insightsDone = hasAnyBullEvidence(inputs.validationResults);
  const memoDone = false;

  const completion = [thesisDone, universeDone, insightsDone, memoDone];
  let activeIdx = completion.findIndex((c) => !c);
  if (activeIdx === -1) activeIdx = completion.length - 1;

  const labels: Array<{ id: string; label: string }> = [
    { id: "step-thesis", label: "Thesis extraction" },
    { id: "step-universe", label: "Universe construction" },
    { id: "step-insights", label: "Gather insights" },
    { id: "step-memo", label: "Memo" },
  ];

  return labels.map((l, i) => ({
    id: l.id,
    label: l.label,
    state: completion[i]
      ? "completed"
      : i === activeIdx
        ? "active"
        : "pending",
  }));
}
