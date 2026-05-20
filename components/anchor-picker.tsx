"use client";

import React, { useState, type FormEvent } from "react";
import { getRegionForTicker } from "@/lib/data/regions";

interface AnchorPickerProps {
  tickers_seed: string[];
  /** Optional ticker → company name map. When provided, chips render as "TICKER — Name". */
  tickerNames?: Record<string, string>;
  onSubmit: (anchor: string) => void;
  disabled: boolean;
}

export function AnchorPicker({
  tickers_seed,
  tickerNames,
  onSubmit,
  disabled,
}: AnchorPickerProps) {
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-neutral-700">
          Anchor ticker for this universe
        </span>
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          disabled={disabled}
          placeholder="Yahoo ticker (e.g. RHM.DE)"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100"
        />
      </label>

      {tickers_seed.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span>Suggested from thesis:</span>
          {tickers_seed.map((t) => {
            const name = tickerNames?.[t];
            return (
              <button
                type="button"
                key={t}
                onClick={() => handleChipClick(t)}
                disabled={disabled}
                title={name ? `${t} — ${name}` : t}
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
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

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={submitDisabled}
          className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          Build universe →
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
