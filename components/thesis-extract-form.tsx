"use client";

import React, { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/spinner";

const MIN_LENGTH = 20;

function friendlyError(
  status: number,
  body: { code?: string; error?: string } | null,
): string {
  switch (body?.code) {
    case "extraction_invalid":
      return "We couldn't structure that thesis. Try adding more specifics — sectors, regions, or named companies — and resubmit.";
    case "tool_use_missing":
    case "tool_use_invalid":
      return "The model didn't return a structured thesis. Please try again.";
  }
  switch (body?.error) {
    case "invalid_body":
      return "Please paste at least 20 characters of thesis prose.";
    case "unauthenticated":
      return "You need to sign in to extract a thesis.";
    case "persist_failed":
      return "We couldn't save the thesis. Please try again.";
  }
  return `Request failed (${status})`;
}

export function ThesisExtractForm() {
  const router = useRouter();
  const [snippet, setSnippet] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = submitting || snippet.trim().length < MIN_LENGTH;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/thesis/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_snippet: snippet }),
      });
      const body = (await res.json().catch(() => null)) as
        | { id?: string; error?: string; code?: string }
        | null;
      if (!res.ok || !body?.id) {
        setError(friendlyError(res.status, body));
        setSubmitting(false);
        return;
      }
      router.push(`/thesis/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" style={{ color: "#585858" }}>
          Paste thesis prose
        </span>
        <textarea
          value={snippet}
          onChange={(e) => setSnippet(e.target.value)}
          disabled={submitting}
          className="min-h-[200px] w-full rounded-md px-3 py-2 text-sm"
          style={{
            background: "white",
            border: "1px solid #E5E5E5",
            color: "var(--color-black)",
          }}
          placeholder="Japanese small-caps are entering a multi-year re-rating as corporate governance reform forces buybacks and unlocks balance sheets. Risks: yen reversal, reform fatigue, US recession spillover…"
        />
      </label>

      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "#585858" }}>
          {snippet.trim().length} chars
        </span>
        <button
          type="submit"
          disabled={disabled}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          {submitting ? (
            <>
              <Spinner size={14} />
              Extracting...
            </>
          ) : (
            "Extract thesis"
          )}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
