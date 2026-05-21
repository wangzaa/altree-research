"use client";

import React, { useState } from "react";
import { LiveLog } from "@/components/live-log";

export type LiveLogDrawerProps = {
  thesisId?: string;
};

export function LiveLogDrawer({ thesisId }: LiveLogDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const state = expanded ? "expanded" : "collapsed";

  return (
    <div
      data-testid="live-log-drawer"
      data-state={state}
      className="fixed bottom-0 left-0 right-0 z-40 bg-pear-off-white"
      style={{
        borderTop: "1px solid #E5E5E5",
        boxShadow: expanded ? "0 -8px 24px rgba(0,0,0,0.06)" : "none",
        transition: "height 0.3s var(--pear-ease)",
        height: expanded ? "30vh" : 36,
      }}
    >
      <div
        className="flex items-center justify-between px-4"
        style={{ height: 36 }}
      >
        <span className="text-xs font-medium uppercase tracking-wide">
          Live log
        </span>
        <button
          type="button"
          aria-label="Toggle live log"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs"
          style={{
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.2s var(--pear-ease)",
          }}
        >
          ▲
        </button>
      </div>
      {expanded ? (
        <div style={{ height: "calc(30vh - 36px)", overflowY: "auto" }}>
          <LiveLog thesisId={thesisId} />
        </div>
      ) : null}
    </div>
  );
}
