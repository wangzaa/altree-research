import type { Scope } from "@/lib/schemas/thesis";

/** One filtered ticker from the universe-build pipeline. Mirrors the
 * `dropped` element shape returned by /api/universe/build. */
export interface DroppedTickerForFailure {
  ticker: string;
  reason: string;
}

export interface BuildFailureInput {
  dropped: DroppedTickerForFailure[];
  scope: Scope;
  survivors: number;
  minSurvivors: number;
}

export interface BuildFailureSummary {
  /** Sentence explaining what went wrong, naming the dominant drop reason
   * and the count vs. proposed. Rendered as the first chat bubble. */
  diagnosis: string;
  /** Sentence telling the user what to change to unblock. Rendered as the
   * second chat bubble. */
  fix: string;
}

/** A single reason dominates when it accounts for ≥60% of all drops.
 * Below that threshold the failure spans causes and the advice is the
 * generic "relax filters or try a different anchor" copy. */
const DOMINANCE_THRESHOLD = 0.6;

function tally(dropped: DroppedTickerForFailure[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of dropped) {
    counts[d.reason] = (counts[d.reason] ?? 0) + 1;
  }
  return counts;
}

function formatUsd(amount: number): string {
  if (amount >= 1e9) return `$${(amount / 1e9).toLocaleString()}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toLocaleString()}M`;
  return `$${amount.toLocaleString()}`;
}

function dominantReason(
  counts: Record<string, number>,
  total: number,
): string | null {
  let best: { reason: string; count: number } | null = null;
  for (const [reason, count] of Object.entries(counts)) {
    if (best === null || count > best.count) best = { reason, count };
  }
  if (!best || total === 0) return null;
  return best.count / total >= DOMINANCE_THRESHOLD ? best.reason : null;
}

function totals(input: BuildFailureInput): {
  droppedCount: number;
  proposed: number;
} {
  const droppedCount = input.dropped.length;
  // Anchor always counts toward survivors but never toward proposed/dropped
  // (it's seeded before the discoverer's list is processed). So proposed =
  // dropped + (survivors - 1).
  const proposed = droppedCount + Math.max(0, input.survivors - 1);
  return { droppedCount, proposed };
}

/** Render a count map as a short prose breakdown for the mixed-causes
 * fallback. Example: "11 below the market cap floor, 2 with unknown
 * currency, 3 that Yahoo couldn't find". */
function breakdownProse(counts: Record<string, number>): string {
  const labels: Record<string, string> = {
    below_market_cap_floor: "below the market cap floor",
    yahoo_lookup_failed: "that Yahoo couldn't find",
    unknown_currency: "with unknown currency",
    unknown_suffix: "on unrecognised exchanges",
  };
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries
    .map(([reason, count]) => `${count} ${labels[reason] ?? reason}`)
    .join(", ");
}

export function summariseBuildFailure(
  input: BuildFailureInput,
): BuildFailureSummary {
  const counts = tally(input.dropped);
  const { droppedCount, proposed } = totals(input);
  const survivorsLine = `Only ${input.survivors} survived (need ${input.minSurvivors}).`;

  // Defensive: an empty dropped array means we shouldn't be here, but
  // render a sane fallback rather than an undefined-laden message.
  if (droppedCount === 0) {
    return {
      diagnosis: `The discoverer didn't propose enough tickers for this anchor. ${survivorsLine}`,
      fix: "Pick a different anchor — this one's neighbourhood was too sparse.",
    };
  }

  const dominant = dominantReason(counts, droppedCount);

  switch (dominant) {
    case "below_market_cap_floor": {
      const floor = formatUsd(input.scope.market_cap_min_usd);
      return {
        diagnosis: `Your minimum market cap of ${floor} filtered out ${counts.below_market_cap_floor} of ${proposed} discovered tickers. ${survivorsLine}`,
        fix: "Lower the minimum market cap on the Extract step above — a smaller floor lets mid-caps qualify.",
      };
    }
    case "yahoo_lookup_failed": {
      return {
        diagnosis: `${counts.yahoo_lookup_failed} of ${proposed} discovered tickers couldn't be found on Yahoo Finance. ${survivorsLine}`,
        fix: "Pick a different anchor — the names the discoverer proposed around this one didn't resolve cleanly.",
      };
    }
    case "unknown_currency": {
      return {
        diagnosis: `${counts.unknown_currency} of ${proposed} discovered tickers used currencies we couldn't price in USD. ${survivorsLine}`,
        fix: "Try an anchor in a different region, or narrow regions on the Extract step — some exchanges here aren't FX-covered.",
      };
    }
    case "unknown_suffix": {
      return {
        diagnosis: `${counts.unknown_suffix} of ${proposed} discovered tickers used exchanges we don't recognise. ${survivorsLine}`,
        fix: "Pick a different anchor, or narrow regions on the Extract step.",
      };
    }
    default: {
      return {
        diagnosis: `We dropped ${droppedCount} of ${proposed} discovered tickers across several reasons: ${breakdownProse(counts)}. ${survivorsLine}`,
        fix: "Try a different anchor, or relax filters on the Extract step.",
      };
    }
  }
}
