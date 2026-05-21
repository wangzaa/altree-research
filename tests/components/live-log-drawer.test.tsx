import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveLogDrawer } from "@/components/live-log-drawer";

describe("<LiveLogDrawer>", () => {
  it("renders collapsed by default with a Live log label", () => {
    render(<LiveLogDrawer />);
    const root = screen.getByTestId("live-log-drawer");
    expect(root).toHaveAttribute("data-state", "collapsed");
    expect(screen.getByText(/live log/i)).toBeInTheDocument();
  });

  it("expands when the toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<LiveLogDrawer />);
    const toggle = screen.getByRole("button", { name: /toggle live log/i });
    await user.click(toggle);
    expect(screen.getByTestId("live-log-drawer")).toHaveAttribute(
      "data-state",
      "expanded",
    );
  });

  it("collapses again on second toggle click", async () => {
    const user = userEvent.setup();
    render(<LiveLogDrawer />);
    const toggle = screen.getByRole("button", { name: /toggle live log/i });
    await user.click(toggle);
    await user.click(toggle);
    expect(screen.getByTestId("live-log-drawer")).toHaveAttribute(
      "data-state",
      "collapsed",
    );
  });
});
