"use client";

import React, { useState, type FormEvent } from "react";
import { summariseThesis } from "@/lib/thesis-summary";
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

  const summary = summariseThesis(thesis);
  const previewing = status === "previewing" && diff !== null;
  const refining = status === "refining";
  const applying = status === "applying";

  const submitDisabled =
    refining || applying || previewing || instruction.trim().length === 0;
  const confirmDisabled = !diff || isDiffEmpty(diff) || applying;

  async function onRefineSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitDisabled) return;
    setStatus("refining");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/thesis/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis_id: thesis.id, instruction }),
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

  return (
    <div className="flex flex-col gap-6">
      <section
        className="bg-white"
        style={{
          borderRadius: 18.75,
          padding: 30,
          border: "1px solid #E5E5E5",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <h3
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: "#585858" }}
          >
            Current thesis
          </h3>
          <button
            type="button"
            onClick={() => setShowJson((v) => !v)}
            className="text-xs underline"
            style={{ color: "#585858" }}
          >
            {showJson ? "Hide JSON" : "Show JSON"}
          </button>
        </div>
        <pre
          className="mt-4 whitespace-pre-wrap text-sm"
          style={{ fontFamily: "var(--font-sans)", lineHeight: 1.6 }}
        >
          {summary}
        </pre>
        {showJson ? (
          <pre
            data-testid="thesis-json"
            className="mt-4 overflow-x-auto rounded-md p-3 text-xs"
            style={{
              background: "#F5F4F2",
              fontFamily: "var(--font-mono)",
              border: "1px solid #E5E5E5",
            }}
          >
            {JSON.stringify(thesis, null, 2)}
          </pre>
        ) : null}
      </section>

      <section
        className="bg-white"
        style={{
          borderRadius: 18.75,
          padding: 30,
          border: "1px solid #E5E5E5",
        }}
      >
        <h3
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: "#585858" }}
        >
          What would you like to change?
        </h3>
        <form onSubmit={onRefineSubmit} className="mt-4 flex flex-col gap-3">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={refining || previewing || applying}
            placeholder="Refinement instruction (e.g., add Japan to regions)..."
            className="min-h-[100px] w-full rounded-md px-3 py-2 text-sm"
            style={{
              background: "white",
              border: "1px solid #E5E5E5",
            }}
          />
          {!previewing ? (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitDisabled}
                className="btn btn-primary"
              >
                {refining ? "Refining..." : "Refine"}
              </button>
            </div>
          ) : null}
        </form>

        {previewing && diff ? (
          <div className="mt-4 flex flex-col gap-3">
            {narrative ? (
              <div
                className="rounded-md p-4 text-sm leading-relaxed"
                style={{
                  background: "var(--color-pear-cyan-light)",
                  color: "var(--color-black)",
                  borderRadius: 18.75,
                }}
              >
                {narrative}
              </div>
            ) : (
              <h4
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "#585858" }}
              >
                Proposed changes
              </h4>
            )}

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

            {!narrative || showDetails ? <DiffLines diff={diff} /> : null}

            <div className="flex justify-end gap-2">
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
        ) : null}

        {errorMessage ? (
          <p className="mt-3 text-sm" role="alert" style={{ color: "#a30000" }}>
            {errorMessage}
          </p>
        ) : null}
      </section>
    </div>
  );
}
