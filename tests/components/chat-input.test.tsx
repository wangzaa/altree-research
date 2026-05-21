import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ChatInputText,
  ChatInputBinary,
  ChatInputMultiSelect,
  ChatInputAction,
} from "@/components/chat-input";

describe("<ChatInputText>", () => {
  it("renders the placeholder + suffix + submit affordance", () => {
    render(
      <ChatInputText
        placeholder="e.g., 10"
        suffix="years"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("e.g., 10")).toBeInTheDocument();
    expect(screen.getByText("years")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
  });

  it("disables the submit button until minChars is met, then submits the value", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChatInputText placeholder="" onSubmit={onSubmit} minChars={3} />);
    const input = screen.getByPlaceholderText("");
    const button = screen.getByRole("button", { name: /submit/i });

    expect(button).toBeDisabled();
    await user.type(input, "ab");
    expect(button).toBeDisabled();
    await user.type(input, "c");
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onSubmit).toHaveBeenCalledWith("abc");
  });

  it("renders a textarea when multiline=true", () => {
    render(
      <ChatInputText
        placeholder="multi"
        multiline
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("multi").tagName).toBe("TEXTAREA");
  });
});

describe("<ChatInputBinary>", () => {
  it("renders Yes + No and dispatches the boolean on click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ChatInputBinary onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /yes/i }));
    expect(onSelect).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: /no/i }));
    expect(onSelect).toHaveBeenLastCalledWith(false);
  });
});

describe("<ChatInputMultiSelect>", () => {
  function Controlled() {
    const [value, setValue] = useState<string[]>([]);
    return (
      <ChatInputMultiSelect
        options={[
          { value: "AU", label: "Australia" },
          { value: "US", label: "United States" },
          { value: "UK", label: "United Kingdom" },
        ]}
        value={value}
        onChange={setValue}
      />
    );
  }

  it("toggles selection on each chip click and reflects aria-pressed", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const australia = screen.getByRole("button", { name: "Australia" });
    expect(australia).toHaveAttribute("aria-pressed", "false");
    await user.click(australia);
    expect(australia).toHaveAttribute("aria-pressed", "true");
    await user.click(australia);
    expect(australia).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onSubmit with the current selection when a Continue button is provided", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    function Wired() {
      const [v, setV] = useState<string[]>([]);
      return (
        <ChatInputMultiSelect
          options={[
            { value: "AU", label: "Australia" },
            { value: "US", label: "United States" },
          ]}
          value={v}
          onChange={setV}
          onSubmit={onSubmit}
          submitLabel="Continue"
        />
      );
    }
    render(<Wired />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Australia" }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSubmit).toHaveBeenCalledWith(["AU"]);
  });
});

describe("<ChatInputAction>", () => {
  it("dispatches onAction on click and shows loadingLabel when loading", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { rerender } = render(
      <ChatInputAction label="Run scan" onAction={onAction} />,
    );
    await user.click(screen.getByRole("button", { name: /run scan/i }));
    expect(onAction).toHaveBeenCalled();

    rerender(
      <ChatInputAction
        label="Run scan"
        loadingLabel="Running..."
        loading
        onAction={onAction}
      />,
    );
    expect(screen.getByRole("button", { name: /running/i })).toBeDisabled();
  });

  it("renders an optional secondary button that dispatches onSecondary", async () => {
    const user = userEvent.setup();
    const onSecondary = vi.fn();
    render(
      <ChatInputAction
        label="Search for my LinkedIn"
        onAction={vi.fn()}
        secondaryLabel="Skip for now"
        onSecondary={onSecondary}
      />,
    );
    await user.click(screen.getByRole("button", { name: /skip for now/i }));
    expect(onSecondary).toHaveBeenCalled();
  });
});
