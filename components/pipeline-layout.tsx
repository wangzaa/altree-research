"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PipelineHeader } from "@/components/pipeline-header";
import type { PipelineStep, PipelineStepState } from "@/lib/pipeline-steps";
import { LiveLogPanel } from "@/components/live-log-panel";

export interface PipelineLayoutProps {
  steps: PipelineStep[];
  thesisId?: string;
  children: ReactNode;
}

interface StepStateContextValue {
  /** Override a single step's state from a child client component (e.g.
   * ThesisDetail bumps step-trade to "active" when the user engages with
   * the Execute prompt). No-op if the id isn't in the current step list. */
  setStepState: (id: string, next: PipelineStepState) => void;
}

const StepStateContext = createContext<StepStateContextValue | null>(null);

/** Hook for child client components to drive the pipeline-header state in
 * response to user interactions (clicks, selections, etc.). Falls back to
 * a no-op when used outside the PipelineLayout — safe for tests that
 * render children in isolation. */
export function usePipelineStepState(): StepStateContextValue {
  const ctx = useContext(StepStateContext);
  if (ctx) return ctx;
  return { setStepState: () => undefined };
}

export function PipelineLayout({
  steps: initialSteps,
  thesisId,
  children,
}: PipelineLayoutProps) {
  const [steps, setSteps] = useState<PipelineStep[]>(initialSteps);

  // Re-sync from props when the server-rendered tree gives us new steps
  // (e.g. after router.refresh following a scan complete). Client-driven
  // overrides applied since the previous render are intentionally
  // overwritten — server truth wins on a refresh.
  React.useEffect(() => {
    setSteps(initialSteps);
  }, [initialSteps]);

  const value = useMemo<StepStateContextValue>(
    () => ({
      setStepState: (id, next) => {
        setSteps((prev) =>
          prev.map((s) => (s.id === id ? { ...s, state: next } : s)),
        );
      },
    }),
    [],
  );

  return (
    <StepStateContext.Provider value={value}>
      <main className="min-h-screen bg-pear-off-white pb-24">
        <PipelineHeader steps={steps} />
        <div className="container mx-auto px-6 lg:px-12 py-12">
          <div className="flex gap-8">
            <div className="min-w-0 flex-1 space-y-24">{children}</div>
            <LiveLogPanel thesisId={thesisId} />
          </div>
        </div>
      </main>
    </StepStateContext.Provider>
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
