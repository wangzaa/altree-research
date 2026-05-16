import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { ThesisExtractForm } from "@/components/thesis-extract-form";

describe("ThesisExtractForm", () => {
  it("disables submit button below 20 characters", () => {
    render(<ThesisExtractForm />);
    const textarea = screen.getByPlaceholderText(
      /Paste the investment thesis/i,
    ) as HTMLTextAreaElement;
    const button = screen.getByRole("button", { name: /Extract thesis/i });

    fireEvent.change(textarea, { target: { value: "x".repeat(19) } });
    expect(button).toBeDisabled();
  });

  it("enables submit button at 20+ characters", () => {
    render(<ThesisExtractForm />);
    const textarea = screen.getByPlaceholderText(
      /Paste the investment thesis/i,
    ) as HTMLTextAreaElement;
    const button = screen.getByRole("button", { name: /Extract thesis/i });

    fireEvent.change(textarea, { target: { value: "x".repeat(25) } });
    expect(button).not.toBeDisabled();
  });
});
