import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StageList } from "@/components/stage-list";

describe("StageList", () => {
  it("renders all stage names and marks completed status", () => {
    render(
      <StageList
        stages={[
          { name: "Stage 1", status: "completed" },
          { name: "Stage 2", status: "pending" },
        ]}
      />,
    );

    expect(screen.getByText("Stage 1")).toBeInTheDocument();
    expect(screen.getByText("Stage 2")).toBeInTheDocument();

    const stage1Button = screen.getByRole("button", { name: /Stage 1/i });
    expect(stage1Button).toHaveAttribute("data-status", "completed");

    const stage2Button = screen.getByRole("button", { name: /Stage 2/i });
    expect(stage2Button).toHaveAttribute("data-status", "pending");
    expect(stage2Button).toBeDisabled();
  });
});
