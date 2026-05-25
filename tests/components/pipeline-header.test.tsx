import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PipelineHeader } from "@/components/pipeline-header";
import type { PipelineStep } from "@/lib/pipeline-steps";

const sampleSteps: PipelineStep[] = [
  { id: "step-thesis", label: "Extract", state: "completed" },
  { id: "step-universe", label: "Scan", state: "active" },
  { id: "step-insights", label: "Anti/Thesis", state: "pending" },
  { id: "step-trade", label: "Execute", state: "pending" },
];

describe("<PipelineHeader>", () => {
  it("renders the four step labels and numerals", () => {
    render(<PipelineHeader steps={sampleSteps} />);
    expect(screen.getByText("Extract")).toBeInTheDocument();
    expect(screen.getByText("Scan")).toBeInTheDocument();
    expect(screen.getByText("Anti/Thesis")).toBeInTheDocument();
    expect(screen.getByText("Execute")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("tags each step button with its state via data-state", () => {
    render(<PipelineHeader steps={sampleSteps} />);
    const thesisButton = screen.getByRole("button", {
      name: /extract/i,
    });
    expect(thesisButton).toHaveAttribute("data-state", "completed");
    const universeButton = screen.getByRole("button", {
      name: /^scan$/i,
    });
    expect(universeButton).toHaveAttribute("data-state", "active");
    const tradeButton = screen.getByRole("button", { name: /execute/i });
    expect(tradeButton).toHaveAttribute("data-state", "pending");
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
      screen.getByRole("button", { name: /^scan$/i }),
    );
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: "smooth" });

    document.body.removeChild(target);
  });
});
