import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PipelineHeader } from "@/components/pipeline-header";
import type { PipelineStep } from "@/lib/pipeline-steps";

const sampleSteps: PipelineStep[] = [
  { id: "step-thesis", label: "Thesis extraction", state: "completed" },
  { id: "step-universe", label: "Universe construction", state: "active" },
  { id: "step-insights", label: "Insights", state: "pending" },
  { id: "step-memo", label: "Memo", state: "pending" },
];

describe("<PipelineHeader>", () => {
  it("renders the four step labels and numerals", () => {
    render(<PipelineHeader steps={sampleSteps} />);
    expect(screen.getByText("Thesis extraction")).toBeInTheDocument();
    expect(screen.getByText("Universe construction")).toBeInTheDocument();
    expect(screen.getByText("Insights")).toBeInTheDocument();
    expect(screen.getByText("Memo")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("tags each step button with its state via data-state", () => {
    render(<PipelineHeader steps={sampleSteps} />);
    const thesisButton = screen.getByRole("button", {
      name: /thesis extraction/i,
    });
    expect(thesisButton).toHaveAttribute("data-state", "completed");
    const universeButton = screen.getByRole("button", {
      name: /universe construction/i,
    });
    expect(universeButton).toHaveAttribute("data-state", "active");
    const memoButton = screen.getByRole("button", { name: /memo/i });
    expect(memoButton).toHaveAttribute("data-state", "pending");
  });

  it("scrolls the target section into view on click", async () => {
    const user = userEvent.setup();
    const target = document.createElement("section");
    target.id = "step-universe";
    const scrollIntoViewSpy = vi.fn();
    target.scrollIntoView = scrollIntoViewSpy;
    document.body.appendChild(target);

    render(<PipelineHeader steps={sampleSteps} />);
    await user.click(
      screen.getByRole("button", { name: /universe construction/i }),
    );
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: "smooth" });

    document.body.removeChild(target);
  });
});
