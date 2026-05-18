"use client";

import React, { useState } from "react";
import { AnchorPicker } from "@/components/anchor-picker";
import { ThesisEditor } from "@/components/thesis-editor";
import { ThesisJsonView } from "@/components/thesis-json-view";
import { UniverseTable } from "@/components/universe-table";
import type { Thesis } from "@/lib/schemas/thesis";
import type { Universe } from "@/lib/schemas/universe";

interface ThesisDetailProps {
  initial: Thesis;
  initialUniverse: Universe | null;
}

interface DroppedTicker {
  ticker: string;
  reason: string;
}

export function ThesisDetail({ initial, initialUniverse }: ThesisDetailProps) {
  const [thesis, setThesis] = useState<Thesis>(initial);
  const [universe, setUniverse] = useState<Universe | null>(initialUniverse);
  const [picking, setPicking] = useState<boolean>(initialUniverse === null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<DroppedTicker[]>([]);

  async function handleBuild(anchor: string) {
    setBuilding(true);
    setBuildError(null);
    setDropped([]);
    try {
      const res = await fetch("/api/universe/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis_id: thesis.id, anchor_ticker: anchor }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            universe?: Universe;
            dropped?: DroppedTicker[];
            error?: string;
            detail?: string;
          }
        | null;
      if (!res.ok || !body?.universe) {
        setBuildError(body?.detail ?? body?.error ?? `Build failed (${res.status})`);
        setBuilding(false);
        return;
      }
      setUniverse(body.universe);
      setThesis((t) => ({ ...t, universe_id: body.universe!.id }));
      setDropped(body.dropped ?? []);
      setPicking(false);
      setBuilding(false);
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Unexpected error");
      setBuilding(false);
    }
  }

  function handleRefresh() {
    setPicking(true);
    setUniverse(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <ThesisJsonView thesis={thesis} />
      <ThesisEditor thesis={thesis} onApplied={setThesis} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
          Stage 2 — Universe
        </h2>
        {picking || universe === null ? (
          <AnchorPicker
            tickers_seed={thesis.scope.tickers_seed}
            onSubmit={handleBuild}
            disabled={building}
          />
        ) : (
          <UniverseTable
            initial={universe}
            onSaved={setUniverse}
            onRefresh={handleRefresh}
          />
        )}
        {dropped.length > 0 ? (
          <details className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
            <summary className="cursor-pointer font-medium">
              {dropped.length} ticker(s) filtered during build
            </summary>
            <ul className="mt-2 list-disc pl-5">
              {dropped.map((d) => (
                <li key={d.ticker}>
                  <code className="font-mono">{d.ticker}</code> — {d.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {buildError ? (
          <p className="text-sm text-red-600" role="alert">
            {buildError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
