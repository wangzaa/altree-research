"use client";

import React, { useEffect, useState } from "react";
import { LiveLog } from "@/components/live-log";

export type LiveLogPanelProps = {
  thesisId?: string;
};

const STORAGE_KEY = "altree:live-log:collapsed";
const PANEL_MAX_WIDTH = 320;
const PANEL_MIN_WIDTH = 240;
const HANDLE_WIDTH = 36;

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

  return (
    <aside
      data-testid="live-log-panel"
      data-state={collapsed ? "collapsed" : "expanded"}
      // Hidden entirely below the lg breakpoint to keep the artifact full-width
      // on tablet and mobile. Above lg, expanded fills clamp(240px, 25vw, 320px)
      // so it shrinks with the viewport without crowding the artifact.
      className="hidden lg:flex"
      style={{
        flexDirection: "row",
        position: "sticky",
        top: 152,
        alignSelf: "flex-start",
        maxHeight: "calc(100vh - 200px)",
        flexShrink: 0,
        width: collapsed
          ? HANDLE_WIDTH
          : `clamp(${PANEL_MIN_WIDTH}px, 25vw, ${PANEL_MAX_WIDTH}px)`,
        transition: "width 0.25s var(--pear-ease)",
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand live log" : "Collapse live log"}
        aria-expanded={!collapsed}
        title={collapsed ? "Show live log" : "Hide live log"}
        style={{
          width: HANDLE_WIDTH,
          flexShrink: 0,
          background: "white",
          border: "1px solid #E5E5E5",
          borderRadius: collapsed ? 18.75 : "18.75px 0 0 18.75px",
          borderRight: collapsed ? "1px solid #E5E5E5" : "none",
          color: "#585858",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          padding: "12px 0",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontWeight: 600,
          maxHeight: 200,
        }}
      >
        {collapsed ? "▸ Live log" : "◂"}
      </button>
      {!collapsed ? (
        <div
          className="flex flex-col"
          style={{
            flex: 1,
            minWidth: 0,
            background: "white",
            border: "1px solid #E5E5E5",
            borderLeft: "none",
            borderRadius: "0 18.75px 18.75px 0",
            overflow: "hidden",
            maxHeight: "calc(100vh - 200px)",
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
        </div>
      ) : null}
    </aside>
  );
}
