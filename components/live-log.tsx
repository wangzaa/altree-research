"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type PipelineEvent = {
  id: number;
  thesis_id: string | null;
  stage: string | null;
  agent: string | null;
  event_type: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type LiveLogProps = {
  thesisId?: string;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false });
}

function summarisePayload(p: Record<string, unknown> | null): string {
  if (!p) return "";
  if (typeof p.driver_id === "string") {
    const count = typeof p.count === "number" ? ` ${p.count} items` : "";
    return `driver=${p.driver_id}${count}`;
  }
  if (typeof p.error === "string") {
    return `error: ${p.error.slice(0, 60)}`;
  }
  return "";
}

export function LiveLog({ thesisId }: LiveLogProps) {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!thesisId) return;
    let active = true;
    const supabase = getSupabaseBrowserClient();

    (async () => {
      const { data, error: fetchErr } = await supabase
        .from("pipeline_events")
        .select("*")
        .eq("thesis_id", thesisId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!active) return;
      if (fetchErr) {
        setError(fetchErr.message);
        return;
      }
      setEvents((data ?? []) as PipelineEvent[]);
    })();

    const channel = supabase
      .channel(`pipeline_events:${thesisId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pipeline_events",
          filter: `thesis_id=eq.${thesisId}`,
        },
        (payload) => {
          if (!active) return;
          setEvents((prev) => [payload.new as PipelineEvent, ...prev].slice(0, 100));
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [thesisId]);

  if (!thesisId) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
        <p className="text-sm text-neutral-500">
          No thesis selected.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600">
        Live log error: {error}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
        <p className="text-sm text-neutral-500">
          No pipeline events yet for this thesis.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-neutral-100">
      {events.map((e) => {
        const model =
          e.payload && typeof e.payload === "object"
            ? (e.payload as { model?: string }).model
            : undefined;
        return (
          <li key={e.id} className="px-3 py-2 text-xs">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-neutral-500">
                {formatTime(e.created_at)}
              </span>
              <span className="font-semibold">{e.agent ?? e.stage ?? "?"}</span>
              <span className="text-neutral-500">{e.event_type}</span>
              {model && (
                <span className="ml-auto inline-block font-mono text-[10px] uppercase tracking-wide bg-neutral-100 text-neutral-700 px-1.5 py-0.5 rounded">
                  {model}
                </span>
              )}
            </div>
            {summarisePayload(e.payload) && (
              <div className="mt-1 text-neutral-600">
                {summarisePayload(e.payload)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
