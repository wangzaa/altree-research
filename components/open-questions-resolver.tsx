"use client";

import React, { useEffect, useMemo, useState } from "react";

const MAX_QUESTIONS = 8;

export interface OpenQuestionsResolverProps {
  thesisId: string;
  questions: string[];
  /** Hook for the (next-step) web-search action. When omitted, the bulk
   * button still renders so the selection affordance is visible, but
   * clicking it shows the "not wired yet" status line below the list. */
  onWebSearch?: (selectedQuestions: string[]) => Promise<void> | void;
}

export function OpenQuestionsResolver({
  questions,
  onWebSearch,
}: OpenQuestionsResolverProps) {
  const capped = useMemo(() => questions.slice(0, MAX_QUESTIONS), [questions]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Reset selection if the question list itself changes — the indices we
  // were tracking may no longer point at the same questions.
  useEffect(() => {
    setSelected(new Set());
    setStatusMessage(null);
  }, [capped]);

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    setStatusMessage(null);
  }

  function toggleAll() {
    if (selected.size === capped.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(capped.map((_, i) => i)));
    }
    setStatusMessage(null);
  }

  async function handleSearch() {
    if (selected.size === 0) return;
    const picked = Array.from(selected)
      .sort((a, b) => a - b)
      .map((i) => capped[i]);
    if (!onWebSearch) {
      setStatusMessage(
        `${picked.length} question${picked.length === 1 ? "" : "s"} queued — web search isn't wired yet.`,
      );
      return;
    }
    setSubmitting(true);
    setStatusMessage(null);
    try {
      await onWebSearch(picked);
      setStatusMessage(
        `Sent ${picked.length} question${picked.length === 1 ? "" : "s"} to web search.`,
      );
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : "Web search failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (capped.length === 0) {
    return (
      <p className="text-sm" style={{ color: "#585858" }}>
        No open questions to investigate.
      </p>
    );
  }

  const allSelected = selected.size === capped.length;
  const someSelected = selected.size > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs" style={{ color: "#585858" }}>
        <button
          type="button"
          onClick={toggleAll}
          className="hover:underline"
        >
          {allSelected ? "Clear selection" : "Select all"}
        </button>
        <span>
          {capped.length} of up to {MAX_QUESTIONS}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {capped.map((q, i) => {
          const isChecked = selected.has(i);
          const inputId = `open-question-${i}`;
          return (
            <li
              key={i}
              className="flex items-start gap-2 rounded-md px-2 py-1.5"
              style={{
                background: isChecked ? "var(--color-pear-cyan-light)" : "transparent",
                transition: "background-color 0.15s ease",
              }}
            >
              <input
                id={inputId}
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(i)}
                className="mt-0.5"
                aria-label={`Select question ${i + 1} for web search`}
              />
              <label
                htmlFor={inputId}
                className="flex-1 cursor-pointer text-sm leading-relaxed"
              >
                {q}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-end gap-3">
        {statusMessage ? (
          <span className="text-xs" style={{ color: "#585858" }}>
            {statusMessage}
          </span>
        ) : null}
        <button
          type="button"
          onClick={handleSearch}
          disabled={!someSelected || submitting}
          className="btn btn-primary"
        >
          {submitting
            ? "Searching..."
            : someSelected
              ? `Web search ${selected.size} selected →`
              : "Web search selected →"}
        </button>
      </div>
    </div>
  );
}
