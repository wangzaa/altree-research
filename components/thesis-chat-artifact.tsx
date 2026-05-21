"use client";

import React, { useState, type ReactNode } from "react";
import { ChatBubble, ChatThread } from "@/components/chat-bubble";
import { ChatInputText } from "@/components/chat-input";
import { thesisBubbles } from "@/lib/thesis-bubbles";
import type { Thesis } from "@/lib/schemas/thesis";
import type { ThesisDiff } from "@/lib/diff/thesis-diff";

export interface ThesisChatArtifactProps {
  thesis: Thesis;
  onApplied: (next: Thesis) => void;
}

type Status = "idle" | "refining" | "previewing" | "applying" | "error";

interface RefineResponse {
  current: Thesis;
  proposed: Thesis;
  diff: ThesisDiff;
  narrative: string | null;
}

function isDiffEmpty(diff: ThesisDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0
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
}: ThesisChatArtifactProps) {
  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [proposed, setProposed] = useState<Thesis | null>(null);
  const [diff, setDiff] = useState<ThesisDiff | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const bubbles = thesisBubbles(thesis);
  const previewing = status === "previewing" && diff !== null;
  const refining = status === "refining";
  const applying = status === "applying";

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

  // Total stagger index reused for the trailing "Anything to change?" prompt
  // + the refine flow bubbles so they continue the cascade smoothly.
  const promptIndex = bubbles.length;
  let afterIndex = promptIndex + 1;

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

  return (
    <ChatThread>
      {bubbles.map((b, i) => (
        <Stagger key={b.id} index={i}>
          <ChatBubble from="app" label={b.label}>
            <div style={{ whiteSpace: "pre-line" }}>{b.body}</div>
            {b.id === "intro" ? (
              <div className="mt-2">
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
            ) : null}
          </ChatBubble>
        </Stagger>
      ))}

      <Stagger index={promptIndex}>
        <ChatBubble from="app">
          Anything you&apos;d like to change?
        </ChatBubble>
      </Stagger>

      {previewing ? (
        <>
          <Stagger index={afterIndex++}>
            <ChatBubble from="user">{instruction}</ChatBubble>
          </Stagger>
          <Stagger index={afterIndex++}>
            {narrative ? (
              <ChatBubble from="app">{narrative}</ChatBubble>
            ) : (
              <ChatBubble from="app" label="Proposed changes">
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
                className="btn btn-primary"
              >
                {applying ? "Applying..." : "Confirm"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="pl-12">
          <ChatInputText
            multiline
            placeholder="Type a refinement instruction (e.g., add Japan to regions)..."
            value={instruction}
            onChange={setInstruction}
            onSubmit={onRefineSubmit}
            submitLabel={refining ? "Refining..." : "Refine"}
            disabled={refining || applying}
          />
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
