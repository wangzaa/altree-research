"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChatBubble, ChatThread } from "@/components/chat-bubble";
import { ChatInputAction } from "@/components/chat-input";
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
      // Re-render the server tree so the PipelineHeader re-derives its step
      // state and lights up "Gather insights" once a scan exists.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setRunning(false);
    }
  }

  if (scan === null) {
    return (
      <ChatThread>
        <ChatBubble from="app">
          No scan has been run for this thesis yet. Want me to run one?
        </ChatBubble>
        <div className="pl-12">
          <ChatInputAction
            label="Run scan"
            loadingLabel="Running..."
            loading={running}
            onAction={handleRun}
          />
          {error ? (
            <p className="mt-2 text-sm" role="alert" style={{ color: "#a30000" }}>
              {error}
            </p>
          ) : null}
        </div>
      </ChatThread>
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
      <article
        className="whitespace-pre-wrap p-4 text-sm"
        style={{
          background: "white",
          border: "1px solid #E5E5E5",
          color: "var(--color-black)",
          borderRadius: 18.75,
        }}
      >
        {scan.descriptive_markdown}
      </article>
      <p className="text-xs" style={{ color: "#585858" }}>
        Tickers in history:{" "}
        {scan.history_5y.map((h) => h.ticker).join(", ")}
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
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="btn btn-outline"
        >
          {running ? "Re-running..." : "Re-run scan"}
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
