"use client";

import React, { useEffect, useState } from "react";
import { LiveLog } from "@/components/live-log";
import { formatCompactDateTime } from "@/lib/format-date";

interface ThesisListItem {
  id: string;
  source_snippet: string | null;
  created_at: string;
  status: string | null;
}

interface RecentSessionsProps {
  /** Current thesis ID — excluded from the recent list so the user only
   * sees other sessions. Optional: when omitted, every recent thesis is
   * shown (useful for an account-wide view if we ever build one). */
  currentThesisId?: string;
  /** Cap on the number of past sessions shown. Defaults to 5. */
  limit?: number;
}

function snippetPreview(snippet: string | null): string {
  if (!snippet) return "(no description)";
  const trimmed = snippet.trim().replace(/\s+/g, " ");
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

/** Carousel of the user's recent theses surfaced above the Live Log. Each
 * row is a `<details>` disclosure: collapsed shows snippet + timestamp;
 * expanded mounts a one-shot LiveLog scoped to that thesis (no realtime
 * subscription). Mirrors the Live Log's open/closed pattern but per-row
 * so the user can compare multiple past sessions side-by-side. */
export function RecentSessions({
  currentThesisId,
  limit = 5,
}: RecentSessionsProps) {
  const [items, setItems] = useState<ThesisListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/thesis/list?limit=${limit + 1}`);
        if (cancelled) return;
        const body = (await res.json().catch(() => null)) as
          | { theses?: ThesisListItem[]; error?: string }
          | null;
        if (!res.ok || !body?.theses) {
          setError(body?.error ?? `Load failed (${res.status})`);
          setItems([]);
        } else {
          const filtered = currentThesisId
            ? body.theses.filter((t) => t.id !== currentThesisId)
            : body.theses;
          setItems(filtered.slice(0, limit));
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
  }, [currentThesisId, limit]);

  if (loading) {
    return (
      <p
        className="px-4 py-3 text-xs italic"
        style={{ color: "#9a9a9a" }}
      >
        Loading recent sessions…
      </p>
    );
  }

  if (error) {
    return (
      <p
        className="px-4 py-3 text-xs"
        role="alert"
        style={{ color: "#a30000" }}
      >
        {error}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p
        className="px-4 py-3 text-xs"
        style={{ color: "#9a9a9a" }}
      >
        No other sessions yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-100">
      {items.map((t) => (
        <li key={t.id}>
          <details className="group">
            <summary
              className="flex cursor-pointer flex-col gap-0.5 px-4 py-2.5 text-xs hover:bg-neutral-50"
              style={{ listStyle: "none" }}
            >
              <span
                className="font-medium leading-tight"
                style={{ color: "var(--color-black)" }}
              >
                {snippetPreview(t.source_snippet)}
              </span>
              <span style={{ color: "#9a9a9a" }}>
                {formatCompactDateTime(t.created_at)}
              </span>
            </summary>
            <div
              className="max-h-64 overflow-y-auto"
              style={{ borderTop: "1px solid #E5E5E5" }}
            >
              <LiveLog thesisId={t.id} realtime={false} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
