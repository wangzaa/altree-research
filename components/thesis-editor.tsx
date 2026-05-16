"use client";

import React, { useState, type FormEvent } from "react";
import type { Thesis } from "@/lib/schemas/thesis";
import type { ThesisDiff } from "@/lib/diff/thesis-diff";

interface ThesisEditorProps {
  thesis: Thesis;
  onApplied: (next: Thesis) => void;
}

type Status = "idle" | "refining" | "previewing" | "applying" | "error";

interface RefineResponse {
  current: Thesis;
  proposed: Thesis;
  diff: ThesisDiff;
}

function isDiffEmpty(diff: ThesisDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0
  );
}

function formatValue(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  return JSON.stringify(v, null, 0);
}

function DiffBlock({
  kind,
  path,
  before,
  after,
}: {
  kind: "Added" | "Removed" | "Changed";
  path: string;
  before?: unknown;
  after?: unknown;
}) {
  const colour =
    kind === "Added"
      ? "text-green-700 bg-green-50 border-green-200"
      : kind === "Removed"
        ? "text-red-700 bg-red-50 border-red-200"
        : "text-amber-700 bg-amber-50 border-amber-200";
  return (
    <div
      className={`flex flex-col gap-1 rounded-md border px-3 py-2 text-xs ${colour}`}
    >
      <div className="flex items-center gap-2 font-medium">
        <span className="uppercase tracking-wide">{kind}</span>
        <code className="text-neutral-700">{path}</code>
      </div>
      {kind === "Changed" ? (
        <div className="font-mono text-[11px] text-neutral-800">
          {formatValue(before)} <span className="text-neutral-500">→</span>{" "}
          {formatValue(after)}
        </div>
      ) : kind === "Added" ? (
        <div className="font-mono text-[11px] text-neutral-800">
          + {formatValue(after)}
        </div>
      ) : (
        <div className="font-mono text-[11px] text-neutral-800">
          − {formatValue(before)}
        </div>
      )}
    </div>
  );
}

export function ThesisEditor({ thesis, onApplied }: ThesisEditorProps) {
  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [proposed, setProposed] = useState<Thesis | null>(null);
  const [diff, setDiff] = useState<ThesisDiff | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submitDisabled =
    status === "refining" ||
    status === "applying" ||
    instruction.trim().length === 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
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
        const detail = body?.detail ?? body?.error ?? `Request failed (${res.status})`;
        setErrorMessage(detail);
        setStatus("error");
        return;
      }
      setProposed(body.proposed);
      setDiff(body.diff);
      setStatus("previewing");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unexpected error");
      setStatus("error");
    }
  }

  async function onApply() {
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
    setErrorMessage(null);
    setStatus("idle");
  }

  const refining = status === "refining";
  const applying = status === "applying";
  const previewing = status === "previewing" && diff !== null;
  const applyDisabled = !diff || isDiffEmpty(diff) || applying;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={refining || previewing || applying}
          placeholder="Refinement instruction (e.g., add Japan to regions)..."
          className="min-h-[80px] w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100"
        />
        {!previewing ? (
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={submitDisabled}
              className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              {refining ? "Proposing..." : "Propose change"}
            </button>
          </div>
        ) : null}
      </form>

      {previewing && diff ? (
        <div className="flex flex-col gap-3">
          {isDiffEmpty(diff) ? (
            <p className="text-xs text-neutral-500">No changes proposed.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {diff.added.map((c, i) => (
                <DiffBlock
                  key={`a-${i}`}
                  kind="Added"
                  path={c.path}
                  after={c.after}
                />
              ))}
              {diff.removed.map((c, i) => (
                <DiffBlock
                  key={`r-${i}`}
                  kind="Removed"
                  path={c.path}
                  before={c.before}
                />
              ))}
              {diff.changed.map((c, i) => (
                <DiffBlock
                  key={`c-${i}`}
                  kind="Changed"
                  path={c.path}
                  before={c.before}
                  after={c.after}
                />
              ))}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={applying}
              className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={applyDisabled}
              className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              {applying ? "Applying..." : "Apply"}
            </button>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
