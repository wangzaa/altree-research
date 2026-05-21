"use client";

import React from "react";
import type { PipelineStep, PipelineStepState } from "@/lib/pipeline-steps";

const CIRCLE_BASE: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 9999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-playfair)",
  fontWeight: 500,
  fontSize: 20,
  cursor: "pointer",
  transition: "background-color 0.2s var(--pear-ease), box-shadow 0.2s ease",
  border: "1px solid transparent",
};

function circleStyle(state: PipelineStepState): React.CSSProperties {
  if (state === "active") {
    return {
      ...CIRCLE_BASE,
      background: "var(--color-electric-cyan)",
      color: "var(--color-black)",
      boxShadow: "0 4px 16px rgba(0,229,255,0.45)",
    };
  }
  if (state === "completed") {
    return {
      ...CIRCLE_BASE,
      background: "var(--color-electric-cyan)",
      color: "var(--color-black)",
    };
  }
  return {
    ...CIRCLE_BASE,
    background: "transparent",
    color: "rgba(0,0,0,0.5)",
    borderColor: "#E5E5E5",
  };
}

function connectorBackground(
  left: PipelineStepState,
  right: PipelineStepState,
): string {
  if (left === "completed" && right !== "pending") {
    return "linear-gradient(to right, var(--color-electric-cyan), #B5B5B5)";
  }
  if (left === "completed" || left === "active") {
    return "linear-gradient(to right, var(--color-electric-cyan), #E5E5E5)";
  }
  return "#E5E5E5";
}

function StepNumber({
  step,
  number,
  onClick,
}: {
  step: PipelineStep;
  number: number;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-[140px]">
      <button
        type="button"
        onClick={onClick}
        aria-label={step.label}
        data-state={step.state}
        style={circleStyle(step.state)}
      >
        {number}
      </button>
      <span
        className="text-sm font-medium"
        style={{
          color:
            step.state === "pending" ? "rgba(0,0,0,0.5)" : "var(--color-black)",
        }}
      >
        {step.label}
      </span>
    </div>
  );
}

export function PipelineHeader({ steps }: { steps: PipelineStep[] }) {
  function handleClick(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <header
      className="sticky top-0 z-50 w-full bg-pear-off-white"
      style={{ borderBottom: "1px solid #E5E5E5" }}
    >
      <div className="container mx-auto px-6 lg:px-12 py-6">
        <div className="flex items-start justify-between gap-4">
          {steps.map((step, i) => (
            <React.Fragment key={step.id}>
              <StepNumber
                step={step}
                number={i + 1}
                onClick={() => handleClick(step.id)}
              />
              {i < steps.length - 1 ? (
                <div
                  aria-hidden="true"
                  className="flex-1 mt-6"
                  style={{
                    height: 1,
                    background: connectorBackground(
                      step.state,
                      steps[i + 1].state,
                    ),
                  }}
                />
              ) : null}
            </React.Fragment>
          ))}
        </div>
      </div>
    </header>
  );
}
