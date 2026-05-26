import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PreviousSessions } from "@/components/previous-sessions";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("<PreviousSessions>", () => {
  it("renders a card per thesis with snippet, date, and verdict chip", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        theses: [
          {
            id: "japan_smallcaps_26_05",
            source_snippet:
              "Japanese small-caps are entering a multi-year re-rating",
            created_at: "2026-04-20T14:32:00Z",
            status: "validated",
            verdict: "supports",
          },
          {
            id: "eu_defense_26_03",
            source_snippet: "EU defense rearmament",
            created_at: "2026-03-18T09:11:00Z",
            status: "draft",
            verdict: null,
          },
        ],
      }),
    });
    render(<PreviousSessions />);
    await waitFor(() => {
      expect(
        screen.getByText(/Japanese small-caps are entering/),
      ).toBeInTheDocument();
    });
    // Verdict chips render — "Supports" for the first, "Draft" for the
    // null-verdict second row.
    expect(screen.getByText("Supports")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    // Each card is a link to /thesis/[id].
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/thesis/japan_smallcaps_26_05",
      "/thesis/eu_defense_26_03",
    ]);
  });

  it("renders the empty-state caption when no theses exist", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ theses: [] }),
    });
    render(<PreviousSessions />);
    await waitFor(() => {
      expect(screen.getByText(/No previous sessions yet/i)).toBeInTheDocument();
    });
  });

  it("renders an error caption on fetch failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal_error" }),
    });
    render(<PreviousSessions />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/internal_error/);
    });
  });
});
