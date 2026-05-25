"use client";

import React from "react";

interface SpinnerProps {
  /** Pixel diameter. Defaults to 14 — sized to sit alongside button text. */
  size?: number;
  /** Stroke color. Falls back to currentColor so it inherits the button's
   * text color (white on filled buttons, dark on outline buttons). */
  color?: string;
  className?: string;
}

/** Small Tailwind `animate-spin` SVG ring. Used as an inline progress
 * indicator on async buttons / fetching panels — pairs well with text like
 * "Saving…" or stands alone next to italic status copy. */
export function Spinner({ size = 14, color, className }: SpinnerProps) {
  return (
    <svg
      className={`animate-spin ${className ?? ""}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ color }}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 1-9 9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
