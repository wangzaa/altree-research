"use client";

import React, { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const MIN_LENGTH = 20;

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
        | { id?: string; error?: string }
        | null;
      if (!res.ok || !body?.id) {
        setError(body?.error ?? `Request failed (${res.status})`);
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
        <span className="text-sm font-medium text-neutral-700">
          Paste thesis prose
        </span>
        <textarea
          value={snippet}
          onChange={(e) => setSnippet(e.target.value)}
          disabled={submitting}
          className="min-h-[200px] w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100"
          placeholder="Paste the investment thesis prose here (minimum 20 characters)..."
        />
      </label>

      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500">
          {snippet.trim().length} chars
        </span>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {submitting ? "Extracting..." : "Extract thesis"}
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
