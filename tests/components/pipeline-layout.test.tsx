import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  PipelineLayout,
  PipelineSection,
} from "@/components/pipeline-layout";
import type { PipelineStep } from "@/lib/pipeline-steps";

const steps: PipelineStep[] = [
  { id: "step-thesis", label: "Extract", state: "active" },
  { id: "step-universe", label: "Scan", state: "pending" },
  { id: "step-insights", label: "Anti/Thesis", state: "pending" },
  { id: "step-trade", label: "Execute", state: "pending" },
];

describe("<PipelineLayout>", () => {
  it("renders the header labels and each section's children", () => {
    render(
      <PipelineLayout steps={steps}>
        <PipelineSection id="step-thesis" title="Extract">
          <p>thesis body</p>
        </PipelineSection>
        <PipelineSection id="step-universe" title="Scan">
          <p>universe body</p>
        </PipelineSection>
      </PipelineLayout>,
    );
    expect(
      screen.getAllByText("Extract").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("thesis body")).toBeInTheDocument();
    expect(screen.getByText("universe body")).toBeInTheDocument();
  });

  it("anchors each section by id", () => {
    render(
      <PipelineLayout steps={steps}>
        <PipelineSection id="step-thesis" title="Extract">
          <p>x</p>
        </PipelineSection>
      </PipelineLayout>,
    );
    expect(document.getElementById("step-thesis")).not.toBeNull();
  });
});
