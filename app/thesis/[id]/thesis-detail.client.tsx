"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnchorPicker } from "@/components/anchor-picker";
import { ChatBubble, ChatThread } from "@/components/chat-bubble";
import { ChatInputAction } from "@/components/chat-input";
import { ScanPanel } from "@/components/scan-panel";
import { ThesisChatArtifact } from "@/components/thesis-chat-artifact";
import { UniverseTable } from "@/components/universe-table";
import { DriverEvidencePanel } from "@/components/driver-evidence-panel";
import { PipelineSection } from "@/components/pipeline-layout";
import type { Memo } from "@/lib/schemas/memo";
import type { ScanResults } from "@/lib/schemas/scan";
import type { Thesis } from "@/lib/schemas/thesis";
import type { Universe } from "@/lib/schemas/universe";
import type {
  CorpusEvidence,
  DriverValidationResult,
} from "@/lib/schemas/validation";

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
  const [validation, setValidation] = useState<
    Record<string, DriverValidationResult> | null
  >(initialValidation);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const autoValidateFired = useRef(false);
  const [memo, setMemo] = useState<Memo | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);

  async function handleDraftMemo() {
    setMemoLoading(true);
    setMemoError(null);
    try {
      const res = await fetch("/api/memo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis_id: thesis.id }),
      });
      const body = (await res.json().catch(() => null)) as
        | { memo?: Memo; error?: string; detail?: string }
        | null;
      if (!res.ok || !body?.memo) {
        setMemoError(
          body?.detail ?? body?.error ?? `Draft failed (${res.status})`,
        );
        setMemoLoading(false);
        return;
      }
      setMemo(body.memo);
      setMemoLoading(false);
    } catch (err) {
      setMemoError(err instanceof Error ? err.message : "Unexpected error");
      setMemoLoading(false);
    }
  }

  async function handleValidateAll() {
    setValidating(true);
    setValidationError(null);
    const driversToRun = thesis.drivers.industry;

    type Body = {
      bull_evidence?: CorpusEvidence[];
      bear_evidence?: CorpusEvidence[];
      bull_synthesis?: string | null;
      bear_synthesis?: string | null;
      error?: string;
      detail?: string;
    };

    const settled = await Promise.allSettled(
      driversToRun.map(async (driver) => {
        const res = await fetch("/api/validate/driver", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thesis_id: thesis.id,
            driver_id: driver.id,
          }),
        });
        const body = (await res.json().catch(() => null)) as Body | null;
        if (!res.ok || !body || body.error) {
          throw new Error(
            body?.detail ?? body?.error ?? `Validate failed (${res.status})`,
          );
        }
        return { driver_id: driver.id, body };
      }),
    );

    const next: Record<string, DriverValidationResult> = { ...(validation ?? {}) };
    const errors: string[] = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled") {
        next[r.value.driver_id] = {
          bull_evidence: r.value.body.bull_evidence ?? [],
          bear_evidence: r.value.body.bear_evidence ?? [],
          bull_synthesis: r.value.body.bull_synthesis ?? null,
          bear_synthesis: r.value.body.bear_synthesis ?? null,
        };
      } else {
        const msg =
          r.reason instanceof Error ? r.reason.message : String(r.reason);
        errors.push(`${driversToRun[i].id}: ${msg}`);
      }
    }
    setValidation(Object.keys(next).length > 0 ? next : null);
    if (errors.length > 0) setValidationError(errors.join(" • "));
    setValidating(false);
    router.refresh();
  }

  // Auto-fire validation the first time we land on the page with a scan but
  // no validation results. Subsequent re-validation is manual via the
  // outline button next to the bubbles.
  useEffect(() => {
    if (autoValidateFired.current) return;
    if (!initialScan) return;
    if (validation !== null) return;
    if (thesis.drivers.industry.length === 0) return;
    autoValidateFired.current = true;
    handleValidateAll();
    // handleValidateAll is stable for the lifetime of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScan, validation, thesis.drivers.industry.length]);

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

      <PipelineSection id="step-insights" title="Insights">
        {universe ? (
          <div className="flex flex-col gap-8">
            <ScanPanel
              thesisId={thesis.id}
              universeId={universe.id}
              initial={initialScan}
            />
            {initialScan ? (
              <div className="flex flex-col gap-6">
                {thesis.drivers.industry.map((driver) => {
                  const v = validation?.[driver.id];
                  return (
                    <DriverEvidencePanel
                      key={driver.id}
                      driver_id={driver.id}
                      driver_claim={driver.claim}
                      bull_evidence={v?.bull_evidence ?? []}
                      bear_evidence={v?.bear_evidence ?? []}
                      bull_synthesis={v?.bull_synthesis ?? null}
                      bear_synthesis={v?.bear_synthesis ?? null}
                      loading={validating && !v}
                    />
                  );
                })}
                {validation ? (
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleValidateAll}
                      disabled={validating}
                      className="btn btn-outline"
                    >
                      {validating ? "Re-validating..." : "Re-validate drivers"}
                    </button>
                  </div>
                ) : null}
                {validationError ? (
                  <p
                    className="text-sm"
                    role="alert"
                    style={{ color: "#a30000" }}
                  >
                    {validationError}
                  </p>
                ) : null}
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
        {validation ? (
          memo ? (
            <ChatThread>
              <ChatBubble from="app" label={`Verdict: ${memo.verdict}`}>
                <div style={{ whiteSpace: "pre-line" }}>{memo.recommendation}</div>
              </ChatBubble>
              <ChatBubble from="app" label="Bull">
                <div style={{ whiteSpace: "pre-line" }}>{memo.bull_summary}</div>
              </ChatBubble>
              <ChatBubble from="app" label="Bear">
                <div style={{ whiteSpace: "pre-line" }}>{memo.bear_summary}</div>
              </ChatBubble>
              {memo.open_questions.length > 0 ? (
                <ChatBubble from="app" label="Open questions">
                  <ul className="list-disc pl-5">
                    {memo.open_questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </ChatBubble>
              ) : null}
              <div className="flex items-center justify-end pl-12">
                <button
                  type="button"
                  onClick={handleDraftMemo}
                  disabled={memoLoading}
                  className="btn btn-outline"
                >
                  {memoLoading ? "Re-drafting..." : "Re-draft memo"}
                </button>
              </div>
              {memoError ? (
                <p className="text-sm" role="alert" style={{ color: "#a30000" }}>
                  {memoError}
                </p>
              ) : null}
            </ChatThread>
          ) : (
            <ChatThread>
              <ChatBubble from="app">
                I can draft a memo from your thesis, scan, and validation
                {memoLoading ? " — working on it now..." : "."}
              </ChatBubble>
              {!memoLoading ? (
                <div className="pl-12">
                  <ChatInputAction
                    label="Draft memo"
                    loadingLabel="Drafting..."
                    loading={memoLoading}
                    onAction={handleDraftMemo}
                  />
                </div>
              ) : null}
              {memoError ? (
                <p
                  className="pl-12 text-sm"
                  role="alert"
                  style={{ color: "#a30000" }}
                >
                  {memoError}
                </p>
              ) : null}
            </ChatThread>
          )
        ) : (
          <p className="text-sm" style={{ color: "#585858" }}>
            Validate your drivers first — the memo draws on Bull/Bear evidence.
          </p>
        )}
      </PipelineSection>
    </>
  );
}
