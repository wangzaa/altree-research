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
  it("renders the conversational playback (opener + setup + leg + kill + close)", () => {
    const thesis = cloneCanonicalThesis();
    render(<ThesisChatArtifact thesis={thesis} onApplied={vi.fn()} />);
    expect(screen.getByText(/play this back/i)).toBeInTheDocument();
    // Setup paragraph carries the claim, horizon as prose, friendly region.
    expect(
      screen.getByText(
        /EU defense capex cycle benefits primes with multi-year backlog visibility/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/over the next 5 years/i)).toBeInTheDocument();
    expect(screen.getByText(/the Eurozone/i)).toBeInTheDocument();
    // "What would kill it" bubble, not "Negate: Primary:".
    expect(screen.getByText(/What would kill it/i)).toBeInTheDocument();
    // Targeted close in the scoping register, not the generic catch-all and
    // not validation-register words.
    expect(screen.getByText(/widen/i)).toBeInTheDocument();
    expect(screen.queryByText(/pressure-test/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Anything you'd like to change\?$/i)).not.toBeInTheDocument();
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

  it("submits a refinement and shows the conversational narrative", async () => {
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
        narrative:
          "OK — I added JAPAN to your scope. This means the universe will now include Japan-listed defense names.",
      }),
    });

    render(<ThesisChatArtifact thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan",
    );
    await user.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/I added JAPAN to your scope/),
      ).toBeInTheDocument();
    });
    // Details (raw diff) hidden by default when narrative is present.
    expect(screen.queryByText(/scope\.regions/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /show details/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/thesis/refine",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ thesis_id: thesis.id, instruction: "add Japan" }),
      }),
    );
  });

  it("falls back to raw diff lines when narrative is null", async () => {
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
        narrative: null,
      }),
    });

    render(<ThesisChatArtifact thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan",
    );
    await user.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByText(/scope\.regions/)).toBeInTheDocument();
    });
    expect(screen.getByText(/JAPAN/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /show details/i }),
    ).not.toBeInTheDocument();
  });

  it("Show details toggle reveals/hides the raw diff lines", async () => {
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
        narrative: "OK — done. This means more regions.",
      }),
    });

    render(<ThesisChatArtifact thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan",
    );
    await user.click(screen.getByRole("button", { name: /update/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /show details/i }),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText(/scope\.regions/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show details/i }));
    expect(screen.getByText(/scope\.regions/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /hide details/i }));
    expect(screen.queryByText(/scope\.regions/)).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /update/i }));
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

  it("keeps the user instruction + narrator reply visible after Confirm (multi-turn history)", async () => {
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
        narrative: "Added JAPAN to the scope. The seed list now reaches Tokyo Electron.",
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
      "add japan",
    );
    await user.click(screen.getByRole("button", { name: /update/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirm/i })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    // After confirm: the user echo + narrator reply remain visible.
    await waitFor(() => {
      expect(screen.getByText("add japan")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Added JAPAN to the scope/),
    ).toBeInTheDocument();
    // And a fresh refinement textbox is offered below.
    expect(
      screen.getByPlaceholderText(/refinement instruction/i),
    ).toBeEnabled();
    // No Confirm/Cancel left — those belong to a live preview, not history.
    expect(
      screen.queryByRole("button", { name: /confirm/i }),
    ).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /update/i }));
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
