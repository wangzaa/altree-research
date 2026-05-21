import React, { type ReactNode } from "react";
import { PipelineHeader } from "@/components/pipeline-header";
import type { PipelineStep } from "@/lib/pipeline-steps";
import { LiveLogPanel } from "@/components/live-log-panel";

export interface PipelineLayoutProps {
  steps: PipelineStep[];
  thesisId?: string;
  children: ReactNode;
}

export function PipelineLayout({
  steps,
  thesisId,
  children,
}: PipelineLayoutProps) {
  return (
    <main className="min-h-screen bg-pear-off-white pb-24">
      <PipelineHeader steps={steps} />
      <div className="container mx-auto px-6 lg:px-12 py-12">
        <div className="flex gap-8">
          <div className="min-w-0 flex-1 space-y-24">{children}</div>
          <LiveLogPanel thesisId={thesisId} />
        </div>
      </div>
    </main>
  );
}

export function PipelineSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="min-h-[60vh] scroll-mt-32">
      <h2
        className="mb-6"
        style={{
          fontFamily: "var(--font-playfair)",
          fontWeight: 500,
          fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
        }}
      >
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}
