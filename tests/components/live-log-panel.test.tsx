import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveLogPanel } from "@/components/live-log-panel";

describe("<LiveLogPanel>", () => {
  it("renders the panel with a Live log header", () => {
    render(<LiveLogPanel />);
    expect(screen.getByTestId("live-log-panel")).toBeInTheDocument();
    expect(screen.getByText(/live log/i)).toBeInTheDocument();
  });

  it("shows the LiveLog 'no thesis selected' empty state when thesisId is undefined", () => {
    render(<LiveLogPanel />);
    expect(screen.getByText(/no thesis selected/i)).toBeInTheDocument();
  });
});
