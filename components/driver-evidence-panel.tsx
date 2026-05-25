"use client";

import React, { useState } from "react";
import { ChatBubble, ChatThread } from "@/components/chat-bubble";
import type { CorpusEvidence } from "@/lib/schemas/validation";

export type DriverEvidencePanelProps = {
  driver_id: string;
  driver_claim: string;
  /** 1-indexed position of this driver within the thesis. Used to label
   * the section as "Thesis 1", "Thesis 2", etc. */
  thesisIndex: number;
  /** Total drivers in the parent thesis. When 1, the header drops the
   * number ("Thesis (anchor)" rather than "Thesis 1 (anchor)"). */
  thesisCount: number;
  bull_evidence: CorpusEvidence[];
  bear_evidence: CorpusEvidence[];
  bull_synthesis?: string | null;
  bear_synthesis?: string | null;
  loading?: boolean;
};

function thesisAnchor(driverId: string): string {
  const id = driverId.toLowerCase();
  if (id.includes("memory")) return "memory";
  if (id.includes("cpu")) return "CPUs";
  if (id.includes("gpu")) return "GPUs";
  if (id.includes("backlog")) return "backlog";
  if (id.includes("margin")) return "margins";
  if (id.includes("supply")) return "supply";
  if (id.includes("demand")) return "demand";
  if (id.includes("pricing")) return "pricing";
  if (id.includes("capacity")) return "capacity";
  if (id.includes("hbm")) return "HBM";
  if (id.includes("dram")) return "DRAM";
  if (id.includes("nand")) return "NAND";
  if (id.includes("foundry")) return "foundry";
  if (id.includes("packaging")) return "packaging";
  if (id.includes("ai")) return "AI";
  return driverId.replace(/_/g, " ").toLowerCase();
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

/** Parses inline **bold** spans + leading `- ` bullets so the synthesiser
 * can emit multi-claim cases that render as a real bulleted list. */
function SynthesisBody({ text }: { text: string }) {
  const lines = text.split(/\n/);
  const bulletLines = lines.filter((l) => /^\s*-\s+/.test(l));
  const hasBullets = bulletLines.length >= 2;

  function inlineBold(s: string, keyPrefix: string): React.ReactNode[] {
    const parts = s.split(/\*\*([^*]+)\*\*/g);
    return parts.map((segment, i) =>
      i % 2 === 1 ? (
        <strong key={`${keyPrefix}-${i}`}>{segment}</strong>
      ) : (
        <React.Fragment key={`${keyPrefix}-${i}`}>{segment}</React.Fragment>
      ),
    );
  }

  if (hasBullets) {
    // Group: pre-bullet prose, bullets, post-bullet prose.
    const pre: string[] = [];
    const post: string[] = [];
    const bullets: string[] = [];
    let phase: "pre" | "bullets" | "post" = "pre";
    for (const l of lines) {
      if (/^\s*-\s+/.test(l)) {
        phase = "bullets";
        bullets.push(l.replace(/^\s*-\s+/, ""));
      } else if (l.trim().length === 0) {
        if (phase === "bullets") phase = "post";
      } else {
        if (phase === "pre") pre.push(l);
        else post.push(l);
      }
    }
    return (
      <div>
        {pre.length > 0 ? (
          <p className="mb-2">{inlineBold(pre.join(" "), "pre")}</p>
        ) : null}
        <ul className="list-disc pl-5 space-y-1">
          {bullets.map((b, i) => (
            <li key={`b-${i}`}>{inlineBold(b, `bullet-${i}`)}</li>
          ))}
        </ul>
        {post.length > 0 ? (
          <p className="mt-2 italic" style={{ color: "#585858" }}>
            {inlineBold(post.join(" "), "post")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ whiteSpace: "pre-line" }}>{inlineBold(text, "single")}</div>
  );
}

function emptyBody(lens: "bull" | "bear"): string {
  return lens === "bull"
    ? "No evidence found in the corpus to support this claim."
    : "No evidence found in the corpus to challenge this claim.";
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
  const label = lens === "bull" ? "Thesis" : "Anti-thesis";
  const hasSynthesis =
    typeof synthesis === "string" && synthesis.trim().length > 0;
  const text = loading
    ? "Reading the corpus..."
    : hasSynthesis
      ? synthesis!
      : emptyBody(lens);

  return (
    <div className="flex flex-col gap-2">
      <ChatBubble from="app" label={label}>
        <SynthesisBody text={text} />
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
  const anchor = thesisAnchor(props.driver_id);
  const heading =
    props.thesisCount === 1
      ? `Thesis (${anchor})`
      : `Thesis ${props.thesisIndex + 1} (${anchor})`;
  // When both sides are empty we render a single offer block instead of
  // theatrical empty bubbles. Per tone v3: empty results are interpretive,
  // not status messages.
  const bothEmpty =
    !props.loading &&
    (!props.bull_synthesis || props.bull_synthesis.trim().length === 0) &&
    (!props.bear_synthesis || props.bear_synthesis.trim().length === 0) &&
    props.bull_evidence.length === 0 &&
    props.bear_evidence.length === 0;

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h3 className="text-base font-semibold">{heading}</h3>
        <p className="text-sm" style={{ color: "#585858" }}>
          {props.driver_claim}
        </p>
      </header>
      {bothEmpty ? (
        <ChatBubble from="app">
          <div>
            <p>
              No evidence found in the corpus, on either side.
            </p>
            <p className="mt-2" style={{ color: "#585858" }}>
              Add sources, tighten the claim, or accept this thesis
              unvalidated?
            </p>
          </div>
        </ChatBubble>
      ) : (
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
      )}
    </section>
  );
}
