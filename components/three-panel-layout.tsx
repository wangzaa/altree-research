import type { ReactNode } from "react";
import { StageList, type Stage } from "@/components/stage-list";
import { LiveLog } from "@/components/live-log";

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-lg border border-neutral-200 bg-white ${className ?? ""}`}
    >
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
          {title}
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

export interface ThreePanelLayoutProps {
  stages: Stage[];
  artifact: ReactNode;
}

export function ThreePanelLayout({ stages, artifact }: ThreePanelLayoutProps) {
  return (
    <main className="min-h-screen bg-neutral-50 p-4">
      <div className="flex h-[calc(100vh-2rem)] flex-col gap-4 lg:grid lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <Panel title="Pipeline">
          <div className="p-3">
            <StageList stages={stages} />
          </div>
        </Panel>

        <Panel title="Artifact">{artifact}</Panel>

        <Panel title="Live log">
          <LiveLog />
        </Panel>
      </div>
    </main>
  );
}
