"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnchorPicker } from "@/components/anchor-picker";
import { ChatBubble, ChatThread } from "@/components/chat-bubble";
import { ChatInputBinary } from "@/components/chat-input";
import { FundSelectionCards } from "@/components/fund-selection-cards";
import { RichProse } from "@/components/rich-prose";
import { ScanPanel } from "@/components/scan-panel";
import { Spinner } from "@/components/spinner";
import { ThesisChatArtifact } from "@/components/thesis-chat-artifact";
import { UniverseTable } from "@/components/universe-table";
import {
  PipelineSection,
  usePipelineStepState,
} from "@/components/pipeline-layout";
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
  /** Ticker -> company name map. Sourced from universe + Yahoo for any
   * referenced ticker the universe doesn't cover yet. Used by the chat
   * artifact so every ticker can render as `Company (TICKER)`. */
  tickerNames?: Record<string, string>;
  /** Live FX rates fetched server-side at page load. Keyed by uppercase
   * ISO currency code; value is "1 unit of CCY in USD". Threaded into the
   * per-ticker table so EBITDA renders in USD M with current rates. */
  ratesByCurrency?: Record<string, number>;
  /** Pre-formatted "FX as of …" timestamp string (server-side, UTC).
   * Surfaced as a small indicator near the Insights table. Null when no
   * currency in the scan had a live Yahoo timestamp. */
  fxAsOf?: string | null;
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
  tickerNames,
  ratesByCurrency,
  fxAsOf,
}: ThesisDetailProps) {
  const router = useRouter();
  const [thesis, setThesis] = useState<Thesis>(initial);
  const [universe, setUniverse] = useState<Universe | null>(initialUniverse);
  const [picking, setPicking] = useState<boolean>(initialUniverse === null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<DroppedTicker[]>([]);
  // Bumped by ThesisChatArtifact when the user clicks "Continue without
  // refining" — forces the AnchorPicker to refetch suggestions even though
  // thesis_id hasn't changed.
  const [anchorSuggestRefreshKey, setAnchorSuggestRefreshKey] = useState(0);
  // Bumped when the user saves an edited universe — forces ScanPanel to
  // re-run the scan against the new ticker set so chart + table refresh
  // without an explicit "Run scan" button.
  const [scanRerunKey, setScanRerunKey] = useState(0);
  // null = not yet asked, "yes"/"no" = user clicked. Drives whether the
  // Endowus fund cards render and whether step-trade lights up.
  const [tradeChoice, setTradeChoice] = useState<"yes" | "no" | null>(null);
  const { setStepState } = usePipelineStepState();

  function handleTradeChoice(yes: boolean) {
    setTradeChoice(yes ? "yes" : "no");
    if (yes) {
      // Highlight step 4 in the pipeline header now that the user has
      // engaged with the Execute prompt.
      setStepState("step-trade", "active");
    }
  }

  function handleUniverseSaved(next: Universe) {
    setUniverse(next);
    setScanRerunKey((k) => k + 1);
  }
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

  // Auto-fire memo generation the moment validation results are available
  // and we don't already have a memo. Replaces the previous "Generate
  // Bull/Bear/Open-questions" button — the analyst expects the aggregate
  // Thesis / Anti-thesis bubbles to appear without an extra click.
  const autoMemoFired = useRef(false);
  useEffect(() => {
    if (autoMemoFired.current) return;
    if (validation === null) return;
    if (memo !== null) return;
    if (memoLoading) return;
    autoMemoFired.current = true;
    handleDraftMemo();
    // handleDraftMemo is stable for the lifetime of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validation, memo, memoLoading]);

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
      <PipelineSection id="step-thesis" title="Extract">
        <div className="flex flex-col gap-8">
          <ThesisChatArtifact
            thesis={thesis}
            onApplied={setThesis}
            tickerNames={tickerNames}
            onContinue={() => setAnchorSuggestRefreshKey((k) => k + 1)}
          />
          {picking || universe === null ? (
            <div id="anchor-picker" className="flex flex-col gap-3">
              <p
                className="text-sm"
                style={{ color: "var(--color-black)", fontWeight: 500 }}
              >
                Pick a ticker to anchor the scan.
              </p>
              <AnchorPicker
                thesis_id={thesis.id}
                tickers_seed={thesis.scope.tickers_seed}
                tickerNames={seedNames}
                onSubmit={handleBuild}
                disabled={building}
                pending={building}
                refreshKey={anchorSuggestRefreshKey}
              />
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
                        <code className="font-mono">{d.ticker}</code> —{" "}
                        {d.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {buildError ? (
                <p
                  className="text-sm"
                  role="alert"
                  style={{ color: "#a30000" }}
                >
                  {buildError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </PipelineSection>

      <PipelineSection id="step-universe" title="Scan">
        <div className="flex flex-col gap-6">
          {universe ? (
            <>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setScanRerunKey((k) => k + 1)}
                  className="btn btn-primary"
                >
                  Proceed to scan →
                </button>
              </div>
              <UniverseTable
                initial={universe}
                onSaved={handleUniverseSaved}
                onRefresh={handleRefresh}
              />
              <ScanPanel
                thesisId={thesis.id}
                universeId={universe.id}
                initial={initialScan}
                universe={universe}
                ratesByCurrency={ratesByCurrency}
                fxAsOf={fxAsOf}
                runScanKey={scanRerunKey}
              />
            </>
          ) : (
            <p className="text-sm" style={{ color: "#585858" }}>
              Pick an anchor ticker above to build the universe — the scan
              will run from there.
            </p>
          )}
        </div>
      </PipelineSection>

      <PipelineSection id="step-insights" title="Anti/Thesis">
        {universe && initialScan ? (
          <div className="flex flex-col gap-6">
            {validationError ? (
              <p
                className="text-sm"
                role="alert"
                style={{ color: "#a30000" }}
              >
                {validationError}
              </p>
            ) : null}
            {memo ? (
              <>
                <ChatThread>
                  <ChatBubble from="app" label="Thesis">
                    <RichProse text={memo.bull_summary} />
                  </ChatBubble>
                  <ChatBubble from="app" label="Anti-thesis">
                    <RichProse text={memo.bear_summary} />
                  </ChatBubble>
                </ChatThread>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleDraftMemo}
                    disabled={memoLoading}
                    className="btn btn-outline inline-flex items-center gap-2"
                  >
                    {memoLoading ? (
                      <>
                        <Spinner size={14} />
                        Refreshing…
                      </>
                    ) : (
                      "Refresh"
                    )}
                  </button>
                </div>
                {memoError ? (
                  <p className="text-sm" role="alert" style={{ color: "#a30000" }}>
                    {memoError}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="flex flex-col items-start gap-2">
                {validating ? (
                  <p className="text-sm italic" style={{ color: "#585858" }}>
                    Reading the corpus for Thesis / Anti-thesis evidence…
                  </p>
                ) : memoLoading ? (
                  <p className="text-sm italic" style={{ color: "#585858" }}>
                    Drafting Thesis / Anti-thesis from your scan and validation…
                  </p>
                ) : null}
                {memoError ? (
                  <p className="text-sm" role="alert" style={{ color: "#a30000" }}>
                    {memoError}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "#585858" }}>
            Run the scan first — Thesis / Anti-thesis draws on its evidence.
          </p>
        )}
      </PipelineSection>

      <PipelineSection id="step-trade" title="Execute">
        {universe && initialScan ? (
          <ChatThread>
            <ChatBubble from="app">
              Provide a sample of possible financial products that match the
              Anti/thesis?
            </ChatBubble>
            {tradeChoice === null ? (
              <div className="pl-12">
                <ChatInputBinary
                  yesLabel="Yes"
                  noLabel="No"
                  onSelect={handleTradeChoice}
                />
              </div>
            ) : (
              <>
                <ChatBubble from="user">
                  {tradeChoice === "yes" ? "Yes" : "No"}
                </ChatBubble>
                {tradeChoice === "yes" ? (
                  <ChatBubble from="app">
                    <FundSelectionCards thesis_id={thesis.id} />
                  </ChatBubble>
                ) : (
                  <ChatBubble from="app">
                    Skipped — say the word any time and I’ll pull a fund shortlist.
                  </ChatBubble>
                )}
              </>
            )}
          </ChatThread>
        ) : (
          <p className="text-sm" style={{ color: "#585858" }}>
            Run the scan first — Execute matches your thesis to the Endowus
            fund catalogue.
          </p>
        )}
      </PipelineSection>
    </>
  );
}
