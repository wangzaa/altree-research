import type { ScanResults, TickerSnapshot } from "@/lib/schemas/scan";
import type { Universe, UniverseTicker } from "@/lib/schemas/universe";
import type {
  DerivableAnswer,
  DerivableHint,
  GroupFilter,
  ScanMetric,
} from "@/lib/schemas/question";

export type DerivableResult =
  | { ok: true; answer: DerivableAnswer }
  | { ok: false; reason: string };

type JoinedRow = {
  ticker: string;
  name: string;
  universe: UniverseTicker;
  scan: TickerSnapshot;
};

function joinScanUniverse(scan: ScanResults, universe: Universe): JoinedRow[] {
  const byTicker = new Map(scan.tickers_snapshot.map((s) => [s.ticker, s]));
  const rows: JoinedRow[] = [];
  for (const u of universe.tickers) {
    const s = byTicker.get(u.ticker);
    if (!s) continue;
    rows.push({ ticker: u.ticker, name: u.name, universe: u, scan: s });
  }
  return rows;
}

function applyFilter(rows: JoinedRow[], filter?: GroupFilter): JoinedRow[] {
  if (!filter) return rows;
  return rows.filter((r) => {
    if (filter.region && r.universe.region !== filter.region) return false;
    if (filter.exposure_tier != null && r.universe.exposure_tier !== filter.exposure_tier) {
      return false;
    }
    return true;
  });
}

function metricValue(row: JoinedRow, metric: ScanMetric): number | null {
  const raw =
    metric === "market_cap_usd_b" ? row.universe.market_cap_usd_b : row.scan[metric];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatMetric(metric: ScanMetric, n: number): string {
  if (metric === "market_cap_usd_b") return `$${n.toFixed(1)}B`;
  return formatPct(n);
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[Math.floor(mid)];
}

function describeFilter(filter?: GroupFilter): string {
  if (!filter) return "the universe";
  const parts: string[] = [];
  if (filter.region) parts.push(`region=${filter.region}`);
  if (filter.exposure_tier != null) parts.push(`tier=${filter.exposure_tier}`);
  return parts.length ? `tickers where ${parts.join(", ")}` : "the universe";
}

export function resolveDerivable(
  hint: DerivableHint,
  scan: ScanResults,
  universe: Universe,
): DerivableResult {
  const filter = "filter" in hint ? hint.filter : undefined;
  const joined = applyFilter(joinScanUniverse(scan, universe), filter);
  if (joined.length === 0) {
    return { ok: false, reason: `No tickers match ${describeFilter(filter)}.` };
  }

  if (hint.op === "filter_count") {
    const tickers = joined.map((r) => r.ticker);
    return {
      ok: true,
      answer: {
        text: `${tickers.length} ticker${tickers.length === 1 ? "" : "s"} match ${describeFilter(hint.filter)}: ${tickers.join(", ")}.`,
        sources: { tickers, scan_column: "n/a", op: "filter_count" },
      },
    };
  }

  const withValues = joined
    .map((r) => ({ row: r, value: metricValue(r, hint.metric) }))
    .filter((x): x is { row: JoinedRow; value: number } => x.value != null);

  if (withValues.length === 0) {
    return {
      ok: false,
      reason: `No numeric values available for ${hint.metric} on the filtered tickers.`,
    };
  }

  if (hint.op === "rank_by_metric") {
    const sorted = [...withValues].sort((a, b) =>
      hint.direction === "desc" ? b.value - a.value : a.value - b.value,
    );
    const top = sorted.slice(0, hint.limit);
    const tickers = top.map((x) => x.row.ticker);
    const lines = top
      .map((x) => `${x.row.name} (${x.row.ticker}) — ${formatMetric(hint.metric, x.value)}`)
      .join("; ");
    const directionWord = hint.direction === "desc" ? "highest" : "lowest";
    return {
      ok: true,
      answer: {
        text: `Top ${top.length} by ${hint.metric} (${directionWord} first) in ${describeFilter(hint.filter)}: ${lines}.`,
        sources: { tickers, scan_column: hint.metric, op: "rank_by_metric" },
      },
    };
  }

  // hint.op === "aggregate_by_group"
  const values = withValues.map((x) => x.value);
  const tickers = withValues.map((x) => x.row.ticker);
  let agg: number;
  switch (hint.aggregator) {
    case "median":
      agg = median(values);
      break;
    case "mean":
      agg = values.reduce((s, v) => s + v, 0) / values.length;
      break;
    case "max":
      agg = Math.max(...values);
      break;
    case "min":
      agg = Math.min(...values);
      break;
  }
  return {
    ok: true,
    answer: {
      text: `${hint.aggregator} ${hint.metric} across ${describeFilter(hint.filter)} (n=${values.length}): ${formatMetric(hint.metric, agg)}.`,
      sources: { tickers, scan_column: hint.metric, op: "aggregate_by_group" },
    },
  };
}
