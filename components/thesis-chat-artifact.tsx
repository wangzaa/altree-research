"use client";

import React, { useState, type ReactNode } from "react";
import { ChatBubble, ChatThread } from "@/components/chat-bubble";
import { ChatInputText } from "@/components/chat-input";
import { RichProse } from "@/components/rich-prose";
import { Spinner } from "@/components/spinner";
import { thesisBubbles } from "@/lib/thesis-bubbles";
import type { Thesis } from "@/lib/schemas/thesis";
import type { ThesisDiff } from "@/lib/diff/thesis-diff";

export interface ThesisChatArtifactProps {
  thesis: Thesis;
  onApplied: (next: Thesis) => void;
  /** Ticker -> company name lookup so the chat artifact can render every
   * ticker as `Company (TICKER)` per docs/tone/conversational-thesis. */
  tickerNames?: Record<string, string>;
  /** Fired when the user clicks "Continue without refining" / "Done
   * refining, continue". Parent uses this to trigger downstream refreshes
   * (e.g. refetching anchor suggestions). */
  onContinue?: () => void;
}

type Status = "idle" | "refining" | "previewing" | "applying" | "error";

interface RefineResponse {
  current: Thesis;
  proposed: Thesis;
  diff: ThesisDiff;
  narrative: string | null;
}

/** A committed refine turn — kept in client-side history so the thread
 * survives across multiple refinements within a session. Persistence to a
 * thesis_messages table is still out of scope (see cycle 2 spec). */
interface RefineTurn {
  instruction: string;
  narrative: string | null;
  diff: ThesisDiff;
}

function isDiffEmpty(diff: ThesisDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0
  );
}

function Stagger({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  return (
    <div
      className="bubble-enter"
      style={{ ["--bubble-index" as string]: index } as React.CSSProperties}
    >
      {children}
    </div>
  );
}


function DiffLines({ diff }: { diff: ThesisDiff }) {
  if (isDiffEmpty(diff)) {
    return (
      <p className="text-sm" style={{ color: "#585858" }}>
        No changes proposed.
      </p>
    );
  }
  return (
    <ul className="space-y-1 font-mono text-xs">
      {diff.added.map((c, i) => (
        <li key={`a-${i}`} style={{ color: "#0a7a30" }}>
          + {c.path}: {JSON.stringify(c.after)}
        </li>
      ))}
      {diff.removed.map((c, i) => (
        <li key={`r-${i}`} style={{ color: "#a30000" }}>
          − {c.path}: {JSON.stringify(c.before)}
        </li>
      ))}
      {diff.changed.map((c, i) => (
        <li key={`c-${i}`} style={{ color: "#8a5a00" }}>
          ~ {c.path}: {JSON.stringify(c.before)} → {JSON.stringify(c.after)}
        </li>
      ))}
    </ul>
  );
}

export function ThesisChatArtifact({
  thesis,
  onApplied,
  tickerNames,
  onContinue,
}: ThesisChatArtifactProps) {
  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [proposed, setProposed] = useState<Thesis | null>(null);
  const [diff, setDiff] = useState<ThesisDiff | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [history, setHistory] = useState<RefineTurn[]>([]);

  const bubbles = thesisBubbles(thesis, { tickerNames });
  const previewing = status === "previewing" && diff !== null;
  const refining = status === "refining";
  const applying = status === "applying";
  // Keep the user echo + narrator reply on-screen while the confirm fetch
  // is in flight. The history push that promotes them to permanent bubbles
  // only fires on success — without this gate they vanish mid-apply and
  // re-appear after the round trip completes.
  const showingPreviewBlock = previewing || (applying && diff !== null);

  const submitDisabled =
    refining || applying || previewing || instruction.trim().length === 0;
  const confirmDisabled = !diff || isDiffEmpty(diff) || applying;

  async function onRefineSubmit(submittedValue: string) {
    if (submitDisabled) return;
    setStatus("refining");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/thesis/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis_id: thesis.id, instruction: submittedValue }),
      });
      const body = (await res.json().catch(() => null)) as
        | (RefineResponse & { error?: string; detail?: string })
        | null;
      if (!res.ok || !body || ("error" in body && body.error)) {
        setErrorMessage(
          body?.detail ?? body?.error ?? `Request failed (${res.status})`,
        );
        setStatus("error");
        return;
      }
      setProposed(body.proposed);
      setDiff(body.diff);
      setNarrative(body.narrative ?? null);
      setShowDetails(false);
      setStatus("previewing");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unexpected error");
      setStatus("error");
    }
  }

  async function onConfirm() {
    if (!proposed || !diff || isDiffEmpty(diff)) return;
    setStatus("applying");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/thesis/${thesis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposed),
      });
      const body = (await res.json().catch(() => null)) as
        | { id?: string; thesis?: Thesis; version?: number; error?: string }
        | null;
      if (!res.ok || !body?.thesis) {
        setErrorMessage(body?.error ?? `Apply failed (${res.status})`);
        setStatus("error");
        return;
      }
      // Push the committed turn into history so the user echo + narrator
      // reply persist as the visible record of what was changed. The next
      // textbox renders below, fresh.
      if (diff) {
        setHistory((h) => [
          ...h,
          { instruction, narrative, diff },
        ]);
      }
      onApplied(body.thesis);
      setProposed(null);
      setDiff(null);
      setNarrative(null);
      setShowDetails(false);
      setInstruction("");
      setStatus("idle");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unexpected error");
      setStatus("error");
    }
  }

  function onCancel() {
    setProposed(null);
    setDiff(null);
    setNarrative(null);
    setShowDetails(false);
    setErrorMessage(null);
    setStatus("idle");
  }

  // The refine-flow bubbles (echo + narrator) continue the cascade index
  // from where the thesis playback bubbles left off.
  let afterIndex = bubbles.length;

  return (
    <ChatThread>
      {bubbles.map((b, i) => (
        <Stagger key={b.id} index={i}>
          <ChatBubble from="app">
            <RichProse text={b.body} />
          </ChatBubble>
        </Stagger>
      ))}

      <div className="pl-12">
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          className="text-xs underline"
          style={{ color: "#585858" }}
        >
          {showJson ? "Hide JSON" : "Show JSON"}
        </button>
        {showJson ? (
          <pre
            data-testid="thesis-json"
            className="mt-2 overflow-x-auto rounded-md p-3 text-xs"
            style={{
              background: "white",
              fontFamily: "var(--font-mono)",
              border: "1px solid #E5E5E5",
            }}
          >
            {JSON.stringify(thesis, null, 2)}
          </pre>
        ) : null}
      </div>

      {/* Committed refinement turns: each turn keeps the user instruction
       * + narrator confirmation as the visible record of what changed. */}
      {history.map((turn, idx) => (
        <React.Fragment key={`turn-${idx}`}>
          <ChatBubble from="user">{turn.instruction}</ChatBubble>
          {turn.narrative ? (
            <ChatBubble from="app">
              <RichProse text={turn.narrative} />
            </ChatBubble>
          ) : (
            <ChatBubble from="app">
              <DiffLines diff={turn.diff} />
            </ChatBubble>
          )}
        </React.Fragment>
      ))}

      {showingPreviewBlock ? (
        <>
          <Stagger index={afterIndex++}>
            <ChatBubble from="user">{instruction}</ChatBubble>
          </Stagger>
          <Stagger index={afterIndex++}>
            {narrative ? (
              <ChatBubble from="app">
                <RichProse text={narrative} />
              </ChatBubble>
            ) : (
              <ChatBubble from="app">
                {diff ? <DiffLines diff={diff} /> : null}
              </ChatBubble>
            )}
          </Stagger>
          <div className="flex flex-col gap-2 pl-12">
            {narrative ? (
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="self-start text-xs underline"
                style={{ color: "#585858" }}
              >
                {showDetails ? "Hide details" : "Show details"}
              </button>
            ) : null}
            {narrative && showDetails && diff ? <DiffLines diff={diff} /> : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={applying}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirmDisabled}
                className="btn btn-primary inline-flex items-center gap-2"
              >
                {applying ? (
                  <>
                    <Spinner size={14} />
                    Applying…
                  </>
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3 pl-12">
          <ChatInputText
            multiline
            placeholder="Type a refinement instruction (e.g., add Japan to regions)..."
            value={instruction}
            onChange={setInstruction}
            onSubmit={onRefineSubmit}
            submitLabel="Refine"
            disabled={refining || applying}
            hideSubmit
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onRefineSubmit(instruction)}
              disabled={
                refining ||
                applying ||
                instruction.trim().length === 0
              }
              className="btn btn-outline inline-flex items-center gap-2"
            >
              {refining ? (
                <>
                  <Spinner size={14} />
                  Updating…
                </>
              ) : (
                "Update"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                onContinue?.();
                // Anchor picker lives at the end of the Extract section; if
                // it isn't rendered (universe already built), fall back to
                // the Scan section as the next logical destination.
                const target =
                  document.getElementById("anchor-picker") ??
                  document.getElementById("step-universe");
                target?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              disabled={refining || applying}
              className="btn btn-primary"
            >
              Ready for next step →
            </button>
          </div>
        </div>
      )}

      {errorMessage ? (
        <p
          className="pl-12 text-sm"
          role="alert"
          style={{ color: "#a30000" }}
        >
          {errorMessage}
        </p>
      ) : null}
    </ChatThread>
  );
}
