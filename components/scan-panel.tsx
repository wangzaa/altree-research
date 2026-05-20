"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { PerTickerTable } from "@/components/per-ticker-table";
import { ScanChart, type WindowKey } from "@/components/scan-chart";
import type { ScanResults } from "@/lib/schemas/scan";

interface ScanPanelProps {
  thesisId: string;
  universeId: string;
  initial: ScanResults | null;
}

interface Dropped {
  ticker: string;
  reason: string;
}

export function ScanPanel({ thesisId, initial }: ScanPanelProps) {
  const router = useRouter();
  const [scan, setScan] = useState<ScanResults | null>(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<Dropped[]>([]);
  const [windowKey, setWindowKey] = useState<WindowKey>("5y");

  async function handleRun() {
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
      // Re-render the server tree so the left-panel StageList picks up the
      // new scan_runs row and flips Scanner from pending to completed.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setRunning(false);
    }
  }

  if (scan === null) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-dashed border-neutral-300 p-4">
        <p className="text-sm text-neutral-600">
          No scan has been run for this thesis yet.
        </p>
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {running ? "Running..." : "Run scan"}
        </button>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ScanChart
        history={scan.history_5y}
        windowKey={windowKey}
        onWindowChange={setWindowKey}
      />
      <PerTickerTable
        snapshots={scan.tickers_snapshot}
        history={scan.history_5y}
      />
      <article className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-800">
        {scan.descriptive_markdown}
      </article>
      <p className="text-xs text-neutral-500">
        Tickers in history:{" "}
        {scan.history_5y.map((h) => h.ticker).join(", ")}
      </p>
      {dropped.length > 0 ? (
        <details className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
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
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:bg-neutral-100"
        >
          {running ? "Re-running..." : "Re-run scan"}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
