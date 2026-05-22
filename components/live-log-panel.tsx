"use client";

import React, { useEffect, useState } from "react";
import { LiveLog } from "@/components/live-log";

export type LiveLogPanelProps = {
  thesisId?: string;
};

const STORAGE_KEY = "altree:live-log:collapsed";
const PANEL_MAX_WIDTH = 320;
const PANEL_MIN_WIDTH = 240;
const COLLAPSED_WIDTH = 32;

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  const path =
    direction === "left" ? "M10 4 L6 8 L10 12" : "M6 4 L10 8 L6 12";
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LiveLogPanel({ thesisId }: LiveLogPanelProps) {
  // Default to expanded; persist any explicit user choice across navigations.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
    if (stored === "0") setCollapsed(false);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    }
  }

  if (collapsed) {
    // Collapsed: a thin right-edge tab with a single chevron pointing left
    // to expand. No vertical text, no header — just enough surface to click.
    return (
      <aside
        data-testid="live-log-panel"
        data-state="collapsed"
        className="hidden lg:block"
        style={{
          width: COLLAPSED_WIDTH,
          position: "sticky",
          top: 152,
          alignSelf: "flex-start",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label="Expand live log"
          aria-expanded={false}
          title="Show live log"
          style={{
            width: COLLAPSED_WIDTH,
            height: 96,
            background: "white",
            border: "1px solid #E5E5E5",
            borderRadius: "18.75px 0 0 18.75px",
            borderRight: "none",
            color: "#585858",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronIcon direction="left" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      data-testid="live-log-panel"
      data-state="expanded"
      className="hidden lg:flex"
      style={{
        flexDirection: "column",
        position: "sticky",
        top: 152,
        alignSelf: "flex-start",
        maxHeight: "calc(100vh - 200px)",
        flexShrink: 0,
        width: `clamp(${PANEL_MIN_WIDTH}px, 25vw, ${PANEL_MAX_WIDTH}px)`,
        background: "white",
        border: "1px solid #E5E5E5",
        borderRadius: 18.75,
        overflow: "hidden",
      }}
    >
      <header
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid #E5E5E5" }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: "#585858" }}
        >
          Live log
        </h3>
        <button
          type="button"
          onClick={toggle}
          aria-label="Collapse live log"
          aria-expanded={true}
          title="Hide live log"
          className="rounded-full"
          style={{
            color: "#585858",
            cursor: "pointer",
            padding: 4,
            background: "transparent",
            border: "none",
          }}
        >
          <ChevronIcon direction="right" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">
        <LiveLog thesisId={thesisId} />
      </div>
    </aside>
  );
}
