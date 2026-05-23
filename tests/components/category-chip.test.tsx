import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryChip } from "@/components/category-chip";

describe("<CategoryChip>", () => {
  it("renders 'from scan data' for derivable", () => {
    render(<CategoryChip category="derivable" />);
    expect(screen.getByText(/from scan/i)).toBeInTheDocument();
  });

  it("renders 'from corpus' for corpus", () => {
    render(<CategoryChip category="corpus" />);
    expect(screen.getByText(/corpus/i)).toBeInTheDocument();
  });

  it("renders 'needs analyst' for needs_analyst", () => {
    render(<CategoryChip category="needs_analyst" />);
    expect(screen.getByText(/needs analyst/i)).toBeInTheDocument();
  });

  it("renders 'classifying…' when category is undefined", () => {
    render(<CategoryChip category={undefined} />);
    expect(screen.getByText(/classifying/i)).toBeInTheDocument();
  });
});
