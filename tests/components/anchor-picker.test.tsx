import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnchorPicker } from "@/components/anchor-picker";

describe("<AnchorPicker>", () => {
  it("renders the free-text input and disables submit when empty", () => {
    render(
      <AnchorPicker
        tickers_seed={["RHM.DE", "BA.L"]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );
    expect(screen.getByPlaceholderText(/yahoo ticker/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /build universe/i })).toBeDisabled();
  });

  it("renders chips from tickers_seed", () => {
    render(
      <AnchorPicker
        tickers_seed={["RHM.DE", "BA.L", "LDO.MI"]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );
    expect(screen.getByRole("button", { name: "RHM.DE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BA.L" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LDO.MI" })).toBeInTheDocument();
  });

  it("does not render chip row when tickers_seed is empty", () => {
    render(
      <AnchorPicker tickers_seed={[]} onSubmit={vi.fn()} disabled={false} />,
    );
    expect(screen.queryByText(/suggested from thesis/i)).not.toBeInTheDocument();
  });

  it("populates the input when a chip is clicked", async () => {
    const user = userEvent.setup();
    render(
      <AnchorPicker
        tickers_seed={["RHM.DE", "BA.L"]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "BA.L" }));
    expect(screen.getByPlaceholderText(/yahoo ticker/i)).toHaveValue("BA.L");
  });

  it("calls onSubmit with the ticker on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AnchorPicker
        tickers_seed={["RHM.DE"]}
        onSubmit={onSubmit}
        disabled={false}
      />,
    );
    await user.type(screen.getByPlaceholderText(/yahoo ticker/i), "RHM.DE");
    await user.click(screen.getByRole("button", { name: /build universe/i }));
    expect(onSubmit).toHaveBeenCalledWith("RHM.DE");
  });

  it("rejects unknown suffix and surfaces an inline error", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AnchorPicker tickers_seed={[]} onSubmit={onSubmit} disabled={false} />,
    );
    await user.type(screen.getByPlaceholderText(/yahoo ticker/i), "STUB.ZZ");
    await user.click(screen.getByRole("button", { name: /build universe/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/unknown ticker suffix/i);
  });

  it("trims whitespace and uppercases before submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AnchorPicker tickers_seed={[]} onSubmit={onSubmit} disabled={false} />,
    );
    await user.type(screen.getByPlaceholderText(/yahoo ticker/i), "  rhm.de  ");
    await user.click(screen.getByRole("button", { name: /build universe/i }));
    expect(onSubmit).toHaveBeenCalledWith("RHM.DE");
  });

  it("respects the disabled prop", () => {
    render(
      <AnchorPicker
        tickers_seed={["RHM.DE"]}
        onSubmit={vi.fn()}
        disabled={true}
      />,
    );
    expect(screen.getByPlaceholderText(/yahoo ticker/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /build universe/i })).toBeDisabled();
  });
});
