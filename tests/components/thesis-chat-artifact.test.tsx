import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThesisChatArtifact } from "@/components/thesis-chat-artifact";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("<ThesisChatArtifact>", () => {
  it("renders the prose summary of the current thesis", () => {
    const thesis = cloneCanonicalThesis();
    render(<ThesisChatArtifact thesis={thesis} onApplied={vi.fn()} />);
    expect(
      screen.getByText(
        /EU defense capex cycle benefits primes with multi-year backlog visibility/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Horizon: 5 years/)).toBeInTheDocument();
  });

  it("does not show the JSON view until Show JSON is clicked", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    render(<ThesisChatArtifact thesis={thesis} onApplied={vi.fn()} />);
    expect(screen.queryByTestId("thesis-json")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show json/i }));
    expect(screen.getByTestId("thesis-json")).toBeInTheDocument();
    expect(screen.getByTestId("thesis-json")).toHaveTextContent(thesis.id);
  });

  it("submits a refinement instruction and shows the diff preview", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...thesis.scope.regions, "JAPAN"];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        current: thesis,
        proposed,
        diff: {
          added: [{ path: "scope.regions", after: "JAPAN" }],
          removed: [],
          changed: [],
        },
      }),
    });

    render(<ThesisChatArtifact thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan",
    );
    await user.click(screen.getByRole("button", { name: /refine/i }));

    await waitFor(() => {
      expect(screen.getByText(/JAPAN/)).toBeInTheDocument();
    });
    expect(screen.getByText(/scope\.regions/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/thesis/refine",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ thesis_id: thesis.id, instruction: "add Japan" }),
      }),
    );
  });

  it("PATCHes /api/thesis/[id] on Confirm and calls onApplied", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...thesis.scope.regions, "JAPAN"];
    const onApplied = vi.fn();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        current: thesis,
        proposed,
        diff: {
          added: [{ path: "scope.regions", after: "JAPAN" }],
          removed: [],
          changed: [],
        },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: thesis.id, thesis: proposed, version: 2 }),
    });

    render(<ThesisChatArtifact thesis={thesis} onApplied={onApplied} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan",
    );
    await user.click(screen.getByRole("button", { name: /refine/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirm/i })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => {
      expect(onApplied).toHaveBeenCalledWith(proposed);
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/thesis/${thesis.id}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(proposed),
      }),
    );
  });

  it("Cancel discards the proposed diff and re-enables the input", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...thesis.scope.regions, "JAPAN"];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        current: thesis,
        proposed,
        diff: {
          added: [{ path: "scope.regions", after: "JAPAN" }],
          removed: [],
          changed: [],
        },
      }),
    });

    render(<ThesisChatArtifact thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan",
    );
    await user.click(screen.getByRole("button", { name: /refine/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /cancel/i })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(
      screen.queryByRole("button", { name: /confirm/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/refinement instruction/i),
    ).toBeEnabled();
  });
});
