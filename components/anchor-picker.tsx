"use client";

import React, { useEffect, useState, type FormEvent } from "react";
import { getRegionForTicker } from "@/lib/data/regions";
import { Spinner } from "@/components/spinner";

interface AnchorPickerProps {
  thesis_id: string;
  tickers_seed: string[];
  /** Optional ticker → company name map. When provided, chips render as "TICKER — Name". */
  tickerNames?: Record<string, string>;
  onSubmit: (anchor: string) => void;
  disabled: boolean;
  /** Distinct from `disabled`: true while the parent is mid-fetch building
   * the universe. Drives the spinner on the submit button so the user sees
   * progress instead of an inert disabled state. */
  pending?: boolean;
  /** Opaque value the parent bumps to request a fresh /api/anchor/suggest
   * call. Bumping forces the useEffect to re-fire even when thesis_id
   * hasn't changed (e.g. when the user clicks "Continue without refining"
   * on the thesis chat artifact). */
  refreshKey?: number;
}

interface AnchorSuggestion {
  ticker: string;
  name: string;
  why: string;
}

interface AnchorSuggestionDrop {
  ticker: string;
  reason: string;
}

export function AnchorPicker({
  thesis_id,
  tickers_seed,
  tickerNames,
  onSubmit,
  disabled,
  pending = false,
  refreshKey,
}: AnchorPickerProps) {
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AnchorSuggestion[]>([]);
  const [dropped, setDropped] = useState<AnchorSuggestionDrop[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingSuggestions(true);
    setSuggestError(null);
    (async () => {
      try {
        const res = await fetch("/api/anchor/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thesis_id }),
        });
        const body = (await res.json().catch(() => null)) as
          | {
              suggestions?: AnchorSuggestion[];
              dropped?: AnchorSuggestionDrop[];
              error?: string;
            }
          | null;
        if (cancelled) return;
        if (!res.ok || !body?.suggestions) {
          setSuggestError(body?.error ?? `Suggest failed (${res.status})`);
          setSuggestions([]);
          setDropped([]);
        } else {
          setSuggestions(body.suggestions);
          setDropped(body.dropped ?? []);
        }
      } catch (err) {
        if (cancelled) return;
        setSuggestError(
          err instanceof Error ? err.message : "Unexpected error",
        );
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thesis_id, refreshKey]);

  const submitDisabled = disabled || ticker.trim().length === 0;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitDisabled) return;
    const normalised = ticker.trim().toUpperCase();
    const region = getRegionForTicker(normalised);
    if (region === null) {
      const lastDot = normalised.lastIndexOf(".");
      const suffix = lastDot === -1 ? "(no suffix)" : normalised.slice(lastDot);
      setError(`Unknown ticker suffix ${suffix} — not a supported Yahoo market`);
      return;
    }
    setError(null);
    onSubmit(normalised);
  }

  function handleChipClick(t: string) {
    setTicker(t);
    setError(null);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        disabled={disabled}
        placeholder="Yahoo ticker (e.g. RHM.DE)"
        aria-label="Anchor ticker"
        className="w-full rounded-md px-3 py-2 text-sm"
        style={{
          background: "white",
          border: "1px solid #E5E5E5",
          color: "var(--color-black)",
        }}
      />

      {tickers_seed.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span>From your thesis:</span>
          {tickers_seed.map((t) => {
            const name = tickerNames?.[t];
            return (
              <button
                type="button"
                key={t}
                onClick={() => handleChipClick(t)}
                disabled={disabled}
                title={name ? `${t} — ${name}` : t}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: "var(--color-pear-cyan-light)",
                  border: "1px solid #E5E5E5",
                  color: "var(--color-black)",
                }}
              >
                <span className="font-mono">{t}</span>
                {name ? (
                  <span className="font-normal text-neutral-500">— {name}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium" style={{ color: "#585858" }}>
          Suggested in your scope
        </span>
        {loadingSuggestions ? (
          <span
            className="inline-flex items-center gap-2 text-xs italic"
            style={{ color: "#9a9a9a" }}
          >
            <Spinner size={12} />
            Searching for tickers that fit your scope…
          </span>
        ) : suggestError ? (
          <span className="text-xs" style={{ color: "#a30000" }}>
            Couldn’t load suggestions: {suggestError}
          </span>
        ) : suggestions.length === 0 ? (
          <span className="text-xs italic" style={{ color: "#9a9a9a" }}>
            No suggestions returned. Type any Yahoo ticker to continue.
          </span>
        ) : (
          <ul className="flex flex-col gap-1">
            {suggestions.map((s) => (
              <li key={s.ticker}>
                <button
                  type="button"
                  onClick={() => handleChipClick(s.ticker)}
                  disabled={disabled}
                  title={s.why}
                  className="block w-full rounded-md px-2.5 py-1 text-left text-xs hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background: "white",
                    border: "1px dashed #B5B5B5",
                    color: "var(--color-black)",
                  }}
                >
                  <span className="font-mono font-medium">{s.ticker}</span>
                  <span style={{ color: "#585858" }}> — {s.name}</span>
                  <span style={{ color: "#9a9a9a" }}> — {s.why}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {dropped.length > 0 ? (
          <details
            className="mt-1 rounded-md p-2 text-xs"
            style={{
              background: "#F5F4F2",
              border: "1px solid #E5E5E5",
              color: "#585858",
            }}
          >
            <summary className="cursor-pointer">
              {dropped.length} candidate{dropped.length === 1 ? "" : "s"} dropped
              during validation
            </summary>
            <ul className="mt-1 list-disc pl-5">
              {dropped.map((d, i) => (
                <li key={`${d.ticker}-${d.reason}-${i}`}>
                  <code className="font-mono">{d.ticker}</code> — {d.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={submitDisabled || pending}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          {pending ? (
            <>
              <Spinner size={14} />
              Building universe…
            </>
          ) : (
            "Build universe →"
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
