"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AnchorPicker } from "@/components/anchor-picker";
import { ScanPanel } from "@/components/scan-panel";
import { ThesisChatArtifact } from "@/components/thesis-chat-artifact";
import { UniverseTable } from "@/components/universe-table";
import { DriverEvidencePanel } from "@/components/driver-evidence-panel";
import { PipelineSection } from "@/components/pipeline-layout";
import type { ScanResults } from "@/lib/schemas/scan";
import type { Thesis } from "@/lib/schemas/thesis";
import type { Universe } from "@/lib/schemas/universe";
import type { DriverValidationResult } from "@/lib/schemas/validation";

interface ThesisDetailProps {
  initial: Thesis;
  initialUniverse: Universe | null;
  initialScan: ScanResults | null;
  initialValidation: Record<string, DriverValidationResult> | null;
  seedNames?: Record<string, string>;
}

interface DroppedTicker {
  ticker: string;
  reason: string;
}

export function ThesisDetail({
  initial,
  initialUniverse,
  initialScan,
  initialValidation,
  seedNames,
}: ThesisDetailProps) {
  const router = useRouter();
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
        setBuildError(
          body?.detail ?? body?.error ?? `Build failed (${res.status})`,
        );
        setBuilding(false);
        return;
      }
      setUniverse(body.universe);
      setThesis((t) => ({ ...t, universe_id: body.universe!.id }));
      setDropped(body.dropped ?? []);
      setPicking(false);
      setBuilding(false);
      router.refresh();
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
    <>
      <PipelineSection id="step-thesis" title="Thesis extraction">
        <ThesisChatArtifact thesis={thesis} onApplied={setThesis} />
      </PipelineSection>

      <PipelineSection id="step-universe" title="Universe construction">
        <div className="flex flex-col gap-4">
          {picking || universe === null ? (
            <AnchorPicker
              tickers_seed={thesis.scope.tickers_seed}
              tickerNames={seedNames}
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
            <details
              className="rounded-md p-3 text-xs"
              style={{
                background: "#F5F4F2",
                border: "1px solid #E5E5E5",
                color: "#585858",
              }}
            >
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
            <p className="text-sm" role="alert" style={{ color: "#a30000" }}>
              {buildError}
            </p>
          ) : null}
        </div>
      </PipelineSection>

      <PipelineSection id="step-insights" title="Gather insights">
        {universe ? (
          <div className="flex flex-col gap-8">
            <ScanPanel
              thesisId={thesis.id}
              universeId={universe.id}
              initial={initialScan}
            />
            {initialValidation ? (
              <div className="flex flex-col gap-6">
                {thesis.drivers.industry.map((driver) => {
                  const v = initialValidation[driver.id];
                  if (!v) return null;
                  return (
                    <DriverEvidencePanel
                      key={driver.id}
                      driver_id={driver.id}
                      driver_claim={driver.claim}
                      bull_evidence={v.bull_evidence}
                      bear_evidence={v.bear_evidence}
                      bull_synthesis={v.bull_synthesis ?? null}
                      bear_synthesis={v.bear_synthesis ?? null}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "#585858" }}>
            Build the universe to enable insights.
          </p>
        )}
      </PipelineSection>

      <PipelineSection id="step-memo" title="Memo">
        <div
          className="bg-white"
          style={{
            borderRadius: 18.75,
            padding: 30,
            border: "1px solid #E5E5E5",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-playfair)",
              fontWeight: 500,
              fontSize: 24,
            }}
          >
            Memo coming soon
          </h3>
          <p className="mt-2 text-sm" style={{ color: "#585858" }}>
            Once validation completes, the memo fills in here.
          </p>
        </div>
      </PipelineSection>
    </>
  );
}
