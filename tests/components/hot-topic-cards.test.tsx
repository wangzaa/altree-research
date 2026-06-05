import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HotTopicCards } from "@/components/hot-topic-cards";
import type { Theme } from "@/lib/schemas/themes";

const themes: Theme[] = [
  {
    id: "memory_cycle",
    label: "Memory up-cycle",
    description: "DRAM/HBM/NAND pricing recovery.",
    keywords: ["dram", "hbm", "nand", "memory", "semiconductor", "wafer"],
  },
  {
    id: "defense",
    label: "Defense & rearmament",
    description: "Rising defense budgets across the bloc.",
    keywords: ["defense", "missile", "radar", "naval", "munitions", "rearmament"],
  },
];

describe("<HotTopicCards>", () => {
  it("renders a card per topic with its label and description", () => {
    render(<HotTopicCards themes={themes} />);
    expect(screen.getByText("Memory up-cycle")).toBeInTheDocument();
    expect(screen.getByText(/DRAM\/HBM\/NAND pricing/)).toBeInTheDocument();
    expect(screen.getByText("Defense & rearmament")).toBeInTheDocument();
  });

  it("links each card to the topic's opportunity set on /thesis/new", () => {
    render(<HotTopicCards themes={themes} />);
    const link = screen.getByRole("link", { name: /Memory up-cycle/ });
    expect(link).toHaveAttribute("href", "/thesis/new?topic=memory_cycle");
  });

  it("marks the selected topic as current", () => {
    render(<HotTopicCards themes={themes} selectedId="defense" />);
    const selected = screen.getByRole("link", { name: /Defense & rearmament/ });
    expect(selected).toHaveAttribute("aria-current", "true");
    const other = screen.getByRole("link", { name: /Memory up-cycle/ });
    expect(other).not.toHaveAttribute("aria-current", "true");
  });
});
