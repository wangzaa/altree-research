"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PerTickerTable } from "@/components/per-ticker-table";
import {
  ScanChart,
  monthsFor,
  rankTickersByWindow,
  tickerEndValues,
  WINDOWS,
  type WindowKey,
} from "@/components/scan-chart";
import type { ScanResults } from "@/lib/schemas/scan";
import type { Universe } from "@/lib/schemas/universe";

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
}: ScanPanelProps) {
  const router = useRouter();
  const [scan, setScan] = useState<ScanResults | null>(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<Dropped[]>([]);
  const [windowKey, setWindowKey] = useState<WindowKey>("6mth");
  // Track whether the auto-run on mount has fired so we don't double-run
  // when React re-renders before the request resolves.
  const autoRanRef = useRef(false);

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

  // Auto-run on mount when no scan exists yet. The "Run scan" button is
  // gone — first render fires the request, the spinner state below stands
  // in until results arrive.
  useEffect(() => {
    if (autoRanRef.current) return;
    if (scan !== null) return;
    if (!universe) return;
    autoRanRef.current = true;
    runScan();
    // runScan is stable for the lifetime of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, universe]);

  // Re-run whenever the parent bumps runScanKey (e.g. user saved an edited
  // universe). Skip the very first render — the auto-run effect above
  // handles initial mount.
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

  if (scan === null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm italic" style={{ color: "#585858" }}>
          {running
            ? "Running price + fundamentals scan across the universe…"
            : "Preparing scan…"}
        </p>
        {error ? (
          <p className="text-sm" role="alert" style={{ color: "#a30000" }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // Filter scan data to current universe membership so removing rows in the
  // universe table immediately drops them from chart + per-ticker table,
  // without requiring a server re-scan.
  const universeTickers = universe
    ? new Set(universe.tickers.map((t) => t.ticker))
    : null;
  const visibleHistory = universeTickers
    ? scan.history_5y.filter((h) => universeTickers.has(h.ticker))
    : scan.history_5y;
  const visibleSnapshots = universeTickers
    ? scan.tickers_snapshot.filter((s) => universeTickers.has(s.ticker))
    : scan.tickers_snapshot;

  const windowMonths = monthsFor(windowKey);
  const endValuesByTicker = tickerEndValues(visibleHistory, windowMonths);
  const { best: bestTicker, worst: worstTicker } = rankTickersByWindow(
    visibleHistory,
    windowMonths,
  );
  const windowLabel =
    WINDOWS.find((w) => w.key === windowKey)?.label ?? windowKey;
  const returnLabel = `${windowLabel} return`;
  const marketCapByTicker: Record<string, number> = {};
  if (universe) {
    for (const t of universe.tickers) {
      marketCapByTicker[t.ticker] = t.market_cap_usd_b;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ScanChart
        history={visibleHistory}
        windowKey={windowKey}
        onWindowChange={setWindowKey}
      />
      <PerTickerTable
        snapshots={visibleSnapshots}
        history={visibleHistory}
        marketCapByTicker={marketCapByTicker}
        bestTicker={bestTicker}
        worstTicker={worstTicker}
        endValuesByTicker={endValuesByTicker}
        returnLabel={returnLabel}
        ratesByCurrency={ratesByCurrency}
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
      {error ? (
        <p className="text-sm" role="alert" style={{ color: "#a30000" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
