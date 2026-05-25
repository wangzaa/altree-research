import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpenQuestionsResolver } from "@/components/open-questions-resolver";

const sampleQuestions = [
  "Is global robot installation growth above 3% in the latest IFR report?",
  "Is Japan's old-age dependency ratio projected above 25% within the five-year horizon?",
  "Is OMRON (6645.T)'s -32% decline company-specific or end-market driven?",
];

describe("<OpenQuestionsResolver>", () => {
  it("renders every question with a checkbox and no per-question Resolve button", () => {
    render(
      <OpenQuestionsResolver
        thesisId="t_26_05_01"
        questions={sampleQuestions}
      />,
    );
    for (const q of sampleQuestions) {
      expect(screen.getByText(q)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("checkbox")).toHaveLength(sampleQuestions.length);
    // The old per-question "Resolve" button must not be present.
    expect(screen.queryByRole("button", { name: /^resolve$/i })).toBeNull();
    // The "classifying..." UI bleed must not appear either.
    expect(screen.queryByText(/classifying/i)).toBeNull();
  });

  it("caps the rendered list at 8 questions", () => {
    const many = Array.from({ length: 12 }, (_, i) => `Question ${i + 1}?`);
    render(<OpenQuestionsResolver thesisId="t_26_05_01" questions={many} />);
    expect(screen.getByText("Question 1?")).toBeInTheDocument();
    expect(screen.getByText("Question 8?")).toBeInTheDocument();
    expect(screen.queryByText("Question 9?")).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(8);
  });

  it("disables the web-search button until at least one question is selected", async () => {
    const user = userEvent.setup();
    render(
      <OpenQuestionsResolver
        thesisId="t_26_05_01"
        questions={sampleQuestions}
      />,
    );
    const button = screen.getByRole("button", { name: /web search/i });
    expect(button).toBeDisabled();
    await user.click(screen.getAllByRole("checkbox")[1]);
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent(/1 selected/i);
  });

  it("Select all / Clear selection toggles every checkbox", async () => {
    const user = userEvent.setup();
    render(
      <OpenQuestionsResolver
        thesisId="t_26_05_01"
        questions={sampleQuestions}
      />,
    );
    await user.click(screen.getByRole("button", { name: /select all/i }));
    for (const cb of screen.getAllByRole("checkbox")) {
      expect(cb).toBeChecked();
    }
    expect(
      screen.getByRole("button", { name: /web search 3 selected/i }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /clear selection/i }));
    for (const cb of screen.getAllByRole("checkbox")) {
      expect(cb).not.toBeChecked();
    }
  });

  it("calls onWebSearch with the picked questions in display order", async () => {
    const user = userEvent.setup();
    const onWebSearch = vi.fn().mockResolvedValue(undefined);
    render(
      <OpenQuestionsResolver
        thesisId="t_26_05_01"
        questions={sampleQuestions}
        onWebSearch={onWebSearch}
      />,
    );
    // Pick the 3rd then the 1st to verify the callback orders by index.
    const boxes = screen.getAllByRole("checkbox");
    await user.click(boxes[2]);
    await user.click(boxes[0]);
    await user.click(screen.getByRole("button", { name: /web search 2 selected/i }));
    expect(onWebSearch).toHaveBeenCalledTimes(1);
    expect(onWebSearch).toHaveBeenCalledWith([
      sampleQuestions[0],
      sampleQuestions[2],
    ]);
  });

  it("shows a 'not wired yet' status when onWebSearch is not provided", async () => {
    const user = userEvent.setup();
    render(
      <OpenQuestionsResolver
        thesisId="t_26_05_01"
        questions={sampleQuestions}
      />,
    );
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: /web search/i }));
    expect(
      screen.getByText(/web search isn[’']t wired yet/i),
    ).toBeInTheDocument();
  });

  it("renders an empty-state message when questions is empty", () => {
    render(<OpenQuestionsResolver thesisId="t_26_05_01" questions={[]} />);
    expect(
      screen.getByText(/no open questions to investigate/i),
    ).toBeInTheDocument();
  });
});
