"use client";

import React from "react";
import { LiveLog } from "@/components/live-log";

export type LiveLogPanelProps = {
  thesisId?: string;
};

export function LiveLogPanel({ thesisId }: LiveLogPanelProps) {
  return (
    <aside
      data-testid="live-log-panel"
      className="hidden lg:block"
      style={{
        width: 320,
        position: "sticky",
        top: 152,
        alignSelf: "flex-start",
        background: "white",
        border: "1px solid #E5E5E5",
        borderRadius: 18.75,
        maxHeight: "calc(100vh - 200px)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        className="px-4 py-3"
        style={{ borderBottom: "1px solid #E5E5E5" }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: "#585858" }}
        >
          Live log
        </h3>
      </header>
      <div className="flex-1 overflow-y-auto">
        <LiveLog thesisId={thesisId} />
      </div>
    </aside>
  );
}
