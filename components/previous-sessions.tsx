"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatCompactDateTime } from "@/lib/format-date";

interface ThesisListItem {
  id: string;
  source_snippet: string | null;
  created_at: string;
  status: string | null;
  verdict: string | null;
}

interface PreviousSessionsProps {
  /** Cap on the number of past sessions shown. Defaults to 10. */
  limit?: number;
}

function snippetPreview(snippet: string | null): string {
  if (!snippet) return "(no description)";
  const trimmed = snippet.trim().replace(/\s+/g, " ");
  return trimmed.length > 100 ? `${trimmed.slice(0, 97)}…` : trimmed;
}

// Verdict chip styling. `null` and unknown values fall through to "Draft"
// because the verdict column is only populated after a successful
// validation run; theses that haven't been validated yet are still
// legitimate sessions worth surfacing.
function verdictChip(verdict: string | null): {
  label: string;
  bg: string;
  fg: string;
} {
  switch (verdict) {
    case "supports":
      return { label: "Supports", bg: "#1a7f3c", fg: "#FFFFFF" };
    case "breaches":
      return { label: "Breaches", bg: "#a30000", fg: "#FFFFFF" };
    case "inconclusive":
      return { label: "Inconclusive", bg: "#8a8a8a", fg: "#FFFFFF" };
    default:
      return { label: "Draft", bg: "#E5E5E5", fg: "#585858" };
  }
}

/** Stacked, clickable list of the user's previous theses, surfaced below
 * the textarea on /thesis/new. Each row links to /thesis/[id] so the user
 * can pick up where they left off. Separate from the sidebar
 * `RecentSessions` component — that one expands into per-thesis
 * LiveLogs (for peeking at pipeline events); this one is for resuming
 * work. */
export function PreviousSessions({ limit = 10 }: PreviousSessionsProps) {
  const [items, setItems] = useState<ThesisListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/thesis/list?limit=${limit}`);
        if (cancelled) return;
        const body = (await res.json().catch(() => null)) as
          | { theses?: ThesisListItem[]; error?: string }
          | null;
        if (!res.ok || !body?.theses) {
          setError(body?.error ?? `Load failed (${res.status})`);
          setItems([]);
        } else {
          setItems(body.theses);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unexpected error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (loading) {
    return (
      <p className="text-xs italic" style={{ color: "#9a9a9a" }}>
        Loading previous sessions…
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-xs" role="alert" style={{ color: "#a30000" }}>
        {error}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-xs" style={{ color: "#9a9a9a" }}>
        No previous sessions yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((t) => {
        const chip = verdictChip(t.verdict);
        return (
          <li key={t.id}>
            <Link
              href={`/thesis/${t.id}`}
              className="block bg-white transition hover:border-neutral-300"
              style={{
                borderRadius: 12,
                padding: "12px 14px",
                border: "1px solid #E5E5E5",
                textDecoration: "none",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <p
                    className="text-sm leading-snug"
                    style={{ color: "var(--color-black)" }}
                  >
                    {snippetPreview(t.source_snippet)}
                  </p>
                  <p className="text-xs" style={{ color: "#9a9a9a" }}>
                    {formatCompactDateTime(t.created_at)}
                  </p>
                </div>
                <span
                  className="shrink-0 text-xs font-medium"
                  style={{
                    background: chip.bg,
                    color: chip.fg,
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  {chip.label}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
