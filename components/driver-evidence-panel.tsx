"use client";

import React, { useState } from "react";
import { ChatBubble, ChatThread } from "@/components/chat-bubble";
import type { CorpusEvidence } from "@/lib/schemas/validation";

export type DriverEvidencePanelProps = {
  driver_id: string;
  driver_claim: string;
  bull_evidence: CorpusEvidence[];
  bear_evidence: CorpusEvidence[];
  bull_synthesis?: string | null;
  bear_synthesis?: string | null;
  loading?: boolean;
};

function fallbackSynthesis(
  lens: "bull" | "bear",
  evidence: CorpusEvidence[],
): string {
  if (evidence.length === 0) {
    return lens === "bull"
      ? "Bull says — no supporting evidence found in the corpus yet."
      : "Bear says — no threshold-breach evidence found in the corpus yet.";
  }
  return lens === "bull"
    ? `Bull says — ${evidence.length} supporting note${evidence.length === 1 ? "" : "s"} in the corpus. Open sources to read the quotes.`
    : `Bear says — ${evidence.length} threshold-breach note${evidence.length === 1 ? "" : "s"} in the corpus. Open sources to read the quotes.`;
}

function SourceChip({ e }: { e: CorpusEvidence }) {
  return (
    <li
      style={{
        background: "white",
        border: "1px solid #E5E5E5",
        borderRadius: 14,
        padding: 12,
      }}
      className="space-y-1 text-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{e.expert}</span>
        <span className="text-xs" style={{ color: "#585858" }}>
          {e.date.slice(0, 10)}
        </span>
      </div>
      <div className="text-xs">
        <a
          href={e.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: "var(--color-electric-cyan)" }}
        >
          {e.post_title}
        </a>
      </div>
      <blockquote className="italic" style={{ color: "#585858" }}>
        &ldquo;{e.quote}&rdquo;
      </blockquote>
    </li>
  );
}

function LensBubble({
  lens,
  synthesis,
  evidence,
  loading,
}: {
  lens: "bull" | "bear";
  synthesis: string | null | undefined;
  evidence: CorpusEvidence[];
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = lens === "bull" ? "Bull" : "Bear";
  const text = loading
    ? `${label} — here's what they are saying. Reading the corpus...`
    : typeof synthesis === "string" && synthesis.length > 0
      ? synthesis
      : fallbackSynthesis(lens, evidence);

  return (
    <div className="flex flex-col gap-2">
      <ChatBubble from="app" label={label}>
        {text}
      </ChatBubble>
      {!loading && evidence.length > 0 ? (
        <div className="pl-12">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs underline"
            style={{ color: "#585858" }}
          >
            {open ? "Hide sources" : `Show sources (${evidence.length})`}
          </button>
          {open ? (
            <ul className="mt-3 space-y-2">
              {evidence.map((e, i) => (
                <SourceChip key={`${e.post_id}-${i}`} e={e} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DriverEvidencePanel(props: DriverEvidencePanelProps) {
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h3 className="text-base font-semibold">{props.driver_id}</h3>
        <p className="text-sm" style={{ color: "#585858" }}>
          {props.driver_claim}
        </p>
      </header>
      <ChatThread>
        <LensBubble
          lens="bull"
          synthesis={props.bull_synthesis}
          evidence={props.bull_evidence}
          loading={props.loading}
        />
        <LensBubble
          lens="bear"
          synthesis={props.bear_synthesis}
          evidence={props.bear_evidence}
          loading={props.loading}
        />
      </ChatThread>
    </section>
  );
}
