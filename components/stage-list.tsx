import React from "react";

export type StageStatus = "pending" | "running" | "completed" | "failed";

export interface Stage {
  name: string;
  status: StageStatus;
}

const STATUS_DOT_CLASS: Record<StageStatus, string> = {
  pending: "bg-neutral-300",
  running: "bg-amber-400",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
};

const STATUS_LABEL: Record<StageStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

export function StageList({ stages }: { stages: Stage[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {stages.map((stage, idx) => {
        const interactive = stage.status === "completed";
        return (
          <li key={`${stage.name}-${idx}`}>
            <button
              type="button"
              disabled={!interactive}
              data-status={stage.status}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm text-neutral-800 hover:border-neutral-200 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-500 disabled:hover:border-transparent disabled:hover:bg-transparent"
            >
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASS[stage.status]}`}
                />
                <span>{stage.name}</span>
              </span>
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                {STATUS_LABEL[stage.status]}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
