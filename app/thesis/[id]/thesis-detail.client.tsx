"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AnchorPicker } from "@/components/anchor-picker";
import { ChatBubble, ChatThread } from "@/components/chat-bubble";
import { ChatInputBinary } from "@/components/chat-input";
import { FundSelectionCards } from "@/components/fund-selection-cards";
import { RichProse } from "@/components/rich-prose";
import { ScanPanel, TABLE_METRIC_KEYS } from "@/components/scan-panel";
import { type WindowKey } from "@/components/scan-chart";
import { ThesisChatArtifact } from "@/components/thesis-chat-artifact";
import { UniverseTable } from "@/components/universe-table";
import { formatCompactDateTime } from "@/lib/format-date";
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
  /** Cached memo from the last user-triggered Anti/Thesis refresh, hydrated
   * server-side by /thesis/[id]/page.tsx. When non-null, the section
   * renders immediately instead of showing the click-to-generate empty
   * state. Refresh re-runs validate + memo as usual. */
  initialMemo?: Memo | null;
  /** ISO timestamp the cached memo was generated. Drives the small grey
   * "Last refreshed …" caption above the bubbles. */
  memoGeneratedAt?: string | null;
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
  initialMemo = null,
  memoGeneratedAt = null,
  seedNames,
  tickerNames,
  ratesByCurrency,
  fxAsOf,
}: ThesisDetailProps) {
  const router = useRouter();
  const [thesis, setThesis] = useState<Thesis>(initial);
  const [universe, setUniverse] = useState<Universe | null>(initialUniverse);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<DroppedTicker[]>([]);
  // The anchor-picker section is gated behind "Ready for next step" — the
  // dialogue stays focused on refinement until the user explicitly signals
  // they want to move on. Auto-true on return visits where the universe is
  // already built (no point re-asking) and on initial mount when no
  // universe exists yet but we somehow lost session state.
  const [showAnchorStep, setShowAnchorStep] = useState<boolean>(
    initialUniverse !== null,
  );
  // Bumped by ThesisChatArtifact when the user clicks "Continue without
  // refining" — forces the AnchorPicker to refetch suggestions even though
  // thesis_id hasn't changed.
  const [anchorSuggestRefreshKey, setAnchorSuggestRefreshKey] = useState(0);
  // Bumped when the user saves an edited universe — forces ScanPanel to
  // re-run the scan against the new ticker set so chart + table refresh
  // without an explicit "Run scan" button.
  const [scanRerunKey, setScanRerunKey] = useState(0);
  // Chart state lifted from ScanPanel so handleProceedToInsights can pass
  // it to the memo route. selectedTickers seeds empty; the panel's own
  // auto-default effect populates it (top-by-mcap + worst-by-window).
  const [windowKey, setWindowKey] = useState<WindowKey>("6mth");
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(
    new Set(),
  );
  function handleToggleTicker(ticker: string) {
    setSelectedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }
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
  const [memo, setMemo] = useState<Memo | null>(initialMemo);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);
  // Mirrors the server-hydrated `memoGeneratedAt` and gets reset to "now"
  // when the user successfully re-clicks Proceed, so the caption updates
  // without a page reload.
  const [memoRefreshedAt, setMemoRefreshedAt] = useState<string | null>(
    memoGeneratedAt,
  );
  // True while validate → memo is sequencing. Drives the Spinner state on
  // the "Proceed to Anti/Thesis / Refresh →" button in ScanPanel and
  // prevents double-clicks during the in-flight period.
  const [insightsPending, setInsightsPending] = useState(false);

  async function handleDraftMemo(): Promise<boolean> {
    setMemoLoading(true);
    setMemoError(null);
    try {
      const res = await fetch("/api/memo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thesis_id: thesis.id,
          chart_window: windowKey,
          visible_metric_keys: [...TABLE_METRIC_KEYS],
          selected_tickers: [...selectedTickers],
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { memo?: Memo; error?: string; detail?: string }
        | null;
      if (!res.ok || !body?.memo) {
        setMemoError(
          body?.detail ?? body?.error ?? `Draft failed (${res.status})`,
        );
        setMemoLoading(false);
        return false;
      }
      setMemo(body.memo);
      setMemoRefreshedAt(new Date().toISOString());
      setMemoLoading(false);
      return true;
    } catch (err) {
      setMemoError(err instanceof Error ? err.message : "Unexpected error");
      setMemoLoading(false);
      return false;
    }
  }

  async function handleValidateAll(): Promise<boolean> {
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
    // Soft success: even if some drivers errored, we still have partial
    // results and the memo writer can synthesise from what landed. Hard
    // failure (all drivers errored, nothing in `next`) returns false so
    // the caller skips the memo step.
    return Object.keys(next).length > 0;
  }

  // Validation + memo are user-triggered via "Proceed to Anti/Thesis /
  // Refresh →" in ScanPanel. The handler sequences validate → memo so
  // the synthesis always reflects the chart state (windowKey +
  // selectedTickers) at click time.
  async function handleProceedToInsights() {
    if (insightsPending) return;
    setInsightsPending(true);
    try {
      const validated = await handleValidateAll();
      if (!validated) return;
      await handleDraftMemo();
    } finally {
      setInsightsPending(false);
    }
  }

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
      setBuilding(false);
      router.refresh();
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Unexpected error");
      setBuilding(false);
    }
  }

  return (
    <>
      <PipelineSection id="step-thesis" title="Extract">
        <div className="flex flex-col gap-8">
          <ThesisChatArtifact
            thesis={thesis}
            onApplied={setThesis}
            tickerNames={tickerNames}
            onContinue={() => {
              setShowAnchorStep(true);
              setAnchorSuggestRefreshKey((k) => k + 1);
            }}
          />
          {showAnchorStep && universe === null ? (
            <ChatThread>
              <ChatBubble from="app">
                Pick a ticker to anchor the scan.
              </ChatBubble>
              <div id="anchor-picker" className="flex flex-col gap-3 pl-12">
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
            </ChatThread>
          ) : null}
        </div>
      </PipelineSection>

      <PipelineSection id="step-universe" title="Scan">
        <div className="flex flex-col gap-6">
          {universe ? (
            <>
              <UniverseTable
                initial={universe}
                onSaved={handleUniverseSaved}
              />
              <ScanPanel
                thesisId={thesis.id}
                universeId={universe.id}
                initial={initialScan}
                universe={universe}
                ratesByCurrency={ratesByCurrency}
                fxAsOf={fxAsOf}
                runScanKey={scanRerunKey}
                windowKey={windowKey}
                onWindowKeyChange={setWindowKey}
                selectedTickers={selectedTickers}
                onToggleTicker={handleToggleTicker}
                onSelectedTickersChange={setSelectedTickers}
                onProceedToInsights={handleProceedToInsights}
                insightsPending={insightsPending}
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
                {memoRefreshedAt ? (
                  <p
                    className="text-xs"
                    style={{ color: "#9a9a9a" }}
                  >
                    Last refreshed {formatCompactDateTime(memoRefreshedAt)}
                  </p>
                ) : null}
                <ChatThread>
                  <ChatBubble from="app" label="Thesis">
                    <RichProse text={memo.bull_summary} />
                  </ChatBubble>
                  <ChatBubble from="app" label="Anti-thesis">
                    <RichProse text={memo.bear_summary} />
                  </ChatBubble>
                </ChatThread>
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
                ) : (
                  <p className="text-sm" style={{ color: "#585858" }}>
                    Click <strong>Proceed to Anti/Thesis</strong> below the
                    ticker table to generate.
                  </p>
                )}
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
