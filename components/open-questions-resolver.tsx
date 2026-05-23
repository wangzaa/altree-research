"use client";

import React, { useEffect, useState } from "react";
import type {
  ClassifiedQuestion,
  DerivableAnswer,
  QuestionCategory,
} from "@/lib/schemas/question";
import { CategoryChip } from "@/components/category-chip";

type ResolveState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "resolved";
      category: "derivable";
      answer: DerivableAnswer;
      showSources: boolean;
    }
  | { status: "not_implemented"; category: QuestionCategory; message: string }
  | { status: "unresolvable"; category: QuestionCategory; message: string }
  | { status: "error"; message: string };

export function OpenQuestionsResolver({
  thesisId,
  questions,
}: {
  thesisId: string;
  questions: string[];
}) {
  const [classifications, setClassifications] = useState<
    (ClassifiedQuestion | undefined)[]
  >(() => questions.map(() => undefined));
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [resolveStates, setResolveStates] = useState<ResolveState[]>(() =>
    questions.map(() => ({ status: "idle" })),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/question/classify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ thesis_id: thesisId, questions }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        const cs: ClassifiedQuestion[] = body.classifications ?? [];
        setClassifications(questions.map((_, i) => cs[i] ?? undefined));
      } catch (err) {
        if (cancelled) return;
        setClassifyError(
          err instanceof Error ? err.message : "classify failed",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thesisId, questions]);

  async function resolve(i: number) {
    const c = classifications[i];
    if (!c || c.category === "needs_analyst") return;

    setResolveStates((prev) => {
      const next = [...prev];
      next[i] = { status: "loading" };
      return next;
    });

    try {
      const res = await fetch("/api/question/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          thesis_id: thesisId,
          question: c.question,
          category: c.category,
          hint: c.hint,
        }),
      });
      const body = await res.json();
      setResolveStates((prev) => {
        const next = [...prev];
        if (body.status === "resolved") {
          next[i] = {
            status: "resolved",
            category: "derivable",
            answer: body.answer,
            showSources: false,
          };
        } else if (body.status === "not_implemented") {
          next[i] = {
            status: "not_implemented",
            category: body.category,
            message: body.message,
          };
        } else if (body.status === "unresolvable") {
          next[i] = {
            status: "unresolvable",
            category: body.category,
            message: body.message,
          };
        } else {
          next[i] = {
            status: "error",
            message: body.detail ?? body.error ?? `status ${res.status}`,
          };
        }
        return next;
      });
    } catch (err) {
      setResolveStates((prev) => {
        const next = [...prev];
        next[i] = {
          status: "error",
          message: err instanceof Error ? err.message : "resolve failed",
        };
        return next;
      });
    }
  }

  function toggleSources(i: number) {
    setResolveStates((prev) => {
      const next = [...prev];
      const cur = next[i];
      if (cur.status === "resolved") {
        next[i] = { ...cur, showSources: !cur.showSources };
      }
      return next;
    });
  }

  if (classifyError) {
    return (
      <p className="text-sm text-red-600">
        Couldn&apos;t classify open questions: {classifyError}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {questions.map((q, i) => {
        const c = classifications[i];
        const state = resolveStates[i];
        const disabled =
          !c || c.category === "needs_analyst" || state.status === "loading";
        return (
          <li key={i} className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <span className="flex-1">{q}</span>
              <CategoryChip category={c?.category} />
              <button
                type="button"
                className="rounded-md border border-pear-black/15 px-2 py-0.5 text-xs disabled:opacity-40"
                onClick={() => resolve(i)}
                disabled={disabled}
              >
                {state.status === "loading" ? "…" : "Resolve"}
              </button>
            </div>
            {state.status === "resolved" && (
              <div className="ml-4 rounded-md bg-pear-cyan-light/40 p-2 text-sm">
                <p>{state.answer.text}</p>
                <button
                  type="button"
                  className="mt-1 text-xs underline"
                  onClick={() => toggleSources(i)}
                >
                  {state.showSources
                    ? "Hide sources"
                    : `Show sources (${state.answer.sources.tickers.length})`}
                </button>
                {state.showSources && (
                  <p className="mt-1 text-xs text-pear-black/70">
                    Tickers: {state.answer.sources.tickers.join(", ")} · column:{" "}
                    {state.answer.sources.scan_column}
                  </p>
                )}
              </div>
            )}
            {state.status === "not_implemented" && (
              <p className="ml-4 text-xs text-pear-black/60 italic">
                {state.message}
              </p>
            )}
            {state.status === "unresolvable" && (
              <p className="ml-4 text-xs text-pear-black/60 italic">
                {state.message}
              </p>
            )}
            {state.status === "error" && (
              <p className="ml-4 text-xs text-red-600">{state.message}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
