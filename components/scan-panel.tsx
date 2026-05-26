"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PerTickerTable } from "@/components/per-ticker-table";
import {
  defaultChartSelection,
  ScanChart,
  monthsFor,
  tickerEndValues,
  WINDOWS,
  type WindowKey,
} from "@/components/scan-chart";
import { Spinner } from "@/components/spinner";
import type { ScanResults } from "@/lib/schemas/scan";
import type { Universe } from "@/lib/schemas/universe";

/** Static list of metric column keys rendered in the per-ticker table.
 * Exported so the parent can forward this verbatim to the memo route as
 * `visible_metric_keys`, which constrains the Anti/Thesis prompt to only
 * cite or near-twin-blacklist what the analyst is actually seeing. */
export const TABLE_METRIC_KEYS = [
  "market_cap",
  "pe",
  "revenue_growth_yoy",
  "ebitda",
  "ebitda_margin",
  "return_pct",
] as const;

interface ScanPanelProps {
  thesisId: string;
  universeId: string;
  initial: ScanResults | null;
  universe: Universe | null;
  /** Live FX rates threaded from the server. Keyed by uppercase ISO
   * currency code; value is "1 unit of CCY in USD". */
  ratesByCurrency?: Record<string, number>;
  /** Pre-formatted "FX as of …" timestamp from fx-live, rendered as a
   * small indicator under the Mcap/EBITDA columns. Null when no live
   * timestamp was available (everything came from the static fallback). */
  fxAsOf?: string | null;
  /** Bumped by the parent to force a fresh /api/scan/run call (e.g.
   * after the user saves an edited universe). The first auto-run still
   * fires on mount whenever `initial` is null; this is the explicit
   * re-run handle. */
  runScanKey?: number;
  /** Controlled chart-window selection. Lifted into the parent so the
   * "Proceed to Anti/Thesis" handler can pass it to the memo route. */
  windowKey: WindowKey;
  onWindowKeyChange: (next: WindowKey) => void;
  /** Controlled Show-checkbox selection, paired with toggle. Same
   * reason as windowKey — the parent needs the current set at click
   * time to scope the memo to visible tickers. */
  selectedTickers: Set<string>;
  onToggleTicker: (ticker: string) => void;
  onSelectedTickersChange: (next: Set<string>) => void;
  /** Fires when the user clicks the "Proceed to Anti/Thesis / Refresh →"
   * button below the ticker table. Parent runs validate → memo against
   * the current chart state. The button is disabled while `pending` is
   * true. */
  onProceedToInsights: () => void;
  insightsPending: boolean;
}

interface Dropped {
  ticker: string;
  reason: string;
}

export function ScanPanel({
  thesisId,
  initial,
  universe,
  ratesByCurrency,
  fxAsOf,
  runScanKey,
  windowKey,
  onWindowKeyChange,
  selectedTickers,
  onToggleTicker,
  onSelectedTickersChange,
  onProceedToInsights,
  insightsPending,
}: ScanPanelProps) {
  const router = useRouter();
  const [scan, setScan] = useState<ScanResults | null>(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<Dropped[]>([]);
  // Default-selection seeding is gated behind the user not having touched
  // the Show checkboxes yet — once they have, we never auto-replace their
  // selection on subsequent universe rebuilds.
  const userTouchedSelectionRef = useRef(false);

  async function runScan() {
    setRunning(true);
    setError(null);
    setDropped([]);
    try {
      const res = await fetch("/api/scan/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis_id: thesisId }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            scan?: ScanResults;
            dropped?: Dropped[];
            dropped_ratios?: Dropped[];
            error?: string;
            detail?: string;
          }
        | null;
      if (!res.ok || !body?.scan) {
        setError(body?.detail ?? body?.error ?? `Scan failed (${res.status})`);
        setRunning(false);
        return;
      }
      setScan(body.scan);
      setDropped([...(body.dropped ?? []), ...(body.dropped_ratios ?? [])]);
      setRunning(false);
      // Re-render the server tree so the PipelineHeader re-derives its step
      // state and downstream sections (Anti/Thesis, Execute) pick up the new
      // scan.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setRunning(false);
    }
  }

  // Scan runs are explicitly triggered by the user via "Proceed to scan"
  // at the top of the section (or "Refresh" inside the universe table —
  // both bump `runScanKey`). No auto-run on mount: the user controls when
  // the chart + ticker table refresh.
  const firstKeyRef = useRef(true);
  useEffect(() => {
    if (firstKeyRef.current) {
      firstKeyRef.current = false;
      return;
    }
    if (!universe) return;
    runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runScanKey]);

  // All hooks must run on every render — keep them above the early return
  // for the null-scan case. Visible* arrays default to empty when scan
  // hasn't landed yet, which is fine for the downstream memos.
  const universeTickers = useMemo(
    () =>
      universe ? new Set(universe.tickers.map((t) => t.ticker)) : null,
    [universe],
  );
  const visibleHistory: ScanResults["history_5y"] = useMemo(() => {
    if (scan === null) return [];
    return universeTickers
      ? scan.history_5y.filter((h) => universeTickers.has(h.ticker))
      : scan.history_5y;
  }, [scan, universeTickers]);
  const visibleSnapshots: ScanResults["tickers_snapshot"] = useMemo(() => {
    if (scan === null) return [];
    return universeTickers
      ? scan.tickers_snapshot.filter((s) => universeTickers.has(s.ticker))
      : scan.tickers_snapshot;
  }, [scan, universeTickers]);

  const windowMonths = monthsFor(windowKey);
  const endValuesByTicker = useMemo(
    () => tickerEndValues(visibleHistory, windowMonths),
    [visibleHistory, windowMonths],
  );
  const windowLabel =
    WINDOWS.find((w) => w.key === windowKey)?.label ?? windowKey;
  const returnLabel = `${windowLabel} return`;
  const marketCapByTicker: Record<string, number> = useMemo(() => {
    const out: Record<string, number> = {};
    if (universe) {
      for (const t of universe.tickers) out[t.ticker] = t.market_cap_usd_b;
    }
    return out;
  }, [universe]);

  // Auto-default selection on first scan + whenever the universe membership
  // changes meaningfully (rerun / new tickers). Skipped once the user has
  // touched the selection so explicit choices aren't clobbered.
  const universeFingerprint = visibleHistory
    .map((h) => h.ticker)
    .sort()
    .join(",");
  useEffect(() => {
    if (userTouchedSelectionRef.current) return;
    if (visibleHistory.length === 0) return;
    const next = defaultChartSelection(
      visibleHistory,
      marketCapByTicker,
      windowMonths,
    );
    onSelectedTickersChange(new Set(next));
    // marketCapByTicker is memoized; windowMonths is a number. Re-derive
    // only when the underlying ticker set changes. onSelectedTickersChange
    // is stable enough at the parent — re-running this on identity change
    // would re-seed selection every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeFingerprint]);

  const orderedSelected = useMemo(() => {
    // Preserve the default-selection order so chart colors stay stable
    // when the user toggles tickers in/out — top-by-mcap first, then any
    // user-added tickers appended in history order.
    const seed = defaultChartSelection(
      visibleHistory,
      marketCapByTicker,
      windowMonths,
    );
    const inSeed = seed.filter((t) => selectedTickers.has(t));
    const extras = visibleHistory
      .map((h) => h.ticker)
      .filter((t) => selectedTickers.has(t) && !seed.includes(t));
    return [...inSeed, ...extras];
  }, [selectedTickers, visibleHistory, marketCapByTicker, windowMonths]);

  if (scan === null) {
    return (
      <div className="flex flex-col gap-2">
        {running ? (
          <p
            className="inline-flex items-center gap-2 text-sm italic"
            style={{ color: "#585858" }}
          >
            <Spinner size={14} />
            Running price + fundamentals scan across the universe…
          </p>
        ) : (
          <p className="text-sm" style={{ color: "#585858" }}>
            No scan yet — click <strong>Proceed to scan</strong> above to
            generate the chart and ticker table.
          </p>
        )}
        {error ? (
          <p className="text-sm" role="alert" style={{ color: "#a30000" }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  function handleToggleTicker(ticker: string) {
    userTouchedSelectionRef.current = true;
    onToggleTicker(ticker);
  }

  return (
    <div className="flex flex-col gap-3">
      <ScanChart
        history={visibleHistory}
        windowKey={windowKey}
        onWindowChange={onWindowKeyChange}
        selectedTickers={orderedSelected}
      />
      <PerTickerTable
        snapshots={visibleSnapshots}
        history={visibleHistory}
        marketCapByTicker={marketCapByTicker}
        endValuesByTicker={endValuesByTicker}
        returnLabel={returnLabel}
        ratesByCurrency={ratesByCurrency}
        selectedTickers={selectedTickers}
        onToggleTicker={handleToggleTicker}
      />
      {fxAsOf ? (
        <p className="text-xs" style={{ color: "#9a9a9a" }}>
          Mcap and EBITDA in USD millions — FX as of {fxAsOf}.
        </p>
      ) : null}
      <p className="text-xs" style={{ color: "#585858" }}>
        Tickers in history:{" "}
        {scan.history_5y.map((h) => h.ticker).join(", ")}
        {running ? " · re-running scan…" : null}
      </p>
      {dropped.length > 0 ? (
        <details
          className="rounded-md p-3 text-xs"
          style={{
            background: "#F5F4F2",
            border: "1px solid #E5E5E5",
            color: "#585858",
          }}
        >
          <summary className="cursor-pointer font-medium">
            {dropped.length} ticker(s) filtered during scan
          </summary>
          <ul className="mt-2 list-disc pl-5">
            {dropped.map((d) => (
              <li key={`${d.ticker}-${d.reason}`}>
                <code className="font-mono">{d.ticker}</code> — {d.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onProceedToInsights}
          disabled={insightsPending || running}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          {insightsPending ? (
            <>
              <Spinner size={14} />
              Working…
            </>
          ) : (
            "Proceed to Anti/Thesis / Refresh →"
          )}
        </button>
      </div>
      {error ? (
        <p className="text-sm" role="alert" style={{ color: "#a30000" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
