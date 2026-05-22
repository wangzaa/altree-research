import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveLogPanel } from "@/components/live-log-panel";

beforeEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

describe("<LiveLogPanel>", () => {
  it("renders the panel expanded by default with a Live log header", () => {
    render(<LiveLogPanel />);
    const root = screen.getByTestId("live-log-panel");
    expect(root).toHaveAttribute("data-state", "expanded");
    // Both the handle label and the header carry the words; pick the header.
    expect(
      screen.getByRole("heading", { name: /live log/i }),
    ).toBeInTheDocument();
  });

  it("shows the LiveLog empty state when thesisId is undefined and expanded", () => {
    render(<LiveLogPanel />);
    expect(screen.getByText(/no thesis selected/i)).toBeInTheDocument();
  });

  it("collapses on toggle click and remembers the choice in localStorage", async () => {
    const user = userEvent.setup();
    render(<LiveLogPanel />);
    const toggle = screen.getByRole("button", { name: /collapse live log/i });
    await user.click(toggle);
    expect(screen.getByTestId("live-log-panel")).toHaveAttribute(
      "data-state",
      "collapsed",
    );
    // Header should be hidden in the collapsed state; only the handle remains.
    expect(
      screen.queryByRole("heading", { name: /live log/i }),
    ).not.toBeInTheDocument();
    // localStorage persisted the choice.
    expect(window.localStorage.getItem("altree:live-log:collapsed")).toBe("1");
  });

  it("restores collapsed state on mount when localStorage says collapsed", () => {
    window.localStorage.setItem("altree:live-log:collapsed", "1");
    render(<LiveLogPanel />);
    expect(screen.getByTestId("live-log-panel")).toHaveAttribute(
      "data-state",
      "collapsed",
    );
  });
});
