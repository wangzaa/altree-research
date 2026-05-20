import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThesisEditor } from "@/components/thesis-editor";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function mockRefineResponse(opts: {
  status?: number;
  body: unknown;
}): void {
  fetchMock.mockResolvedValueOnce({
    ok: (opts.status ?? 200) < 400,
    status: opts.status ?? 200,
    json: async () => opts.body,
  });
}

describe("<ThesisEditor>", () => {
  it("renders an instruction textarea and disabled Submit when empty", () => {
    const thesis = cloneCanonicalThesis();
    render(<ThesisEditor thesis={thesis} onApplied={vi.fn()} />);
    expect(
      screen.getByPlaceholderText(/refinement instruction/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /propose/i })).toBeDisabled();
  });

  it("calls /api/thesis/refine on Submit and shows the diff blocks", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...thesis.scope.regions, "JAPAN"];

    mockRefineResponse({
      body: {
        current: thesis,
        proposed,
        diff: {
          added: [{ path: "scope.regions", after: "JAPAN" }],
          removed: [],
          changed: [],
        },
      },
    });

    render(<ThesisEditor thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan to regions",
    );
    await user.click(screen.getByRole("button", { name: /propose/i }));

    await waitFor(() => {
      expect(screen.getByText(/Added/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/scope\.regions/)).toBeInTheDocument();
    expect(screen.getByText(/JAPAN/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeEnabled();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/thesis/refine",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          thesis_id: thesis.id,
          instruction: "add Japan to regions",
        }),
      }),
    );
  });

  it("disables Apply when the proposed diff is empty (no-op instruction)", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    mockRefineResponse({
      body: {
        current: thesis,
        proposed: thesis,
        diff: { added: [], removed: [], changed: [] },
      },
    });
    render(<ThesisEditor thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "no changes",
    );
    await user.click(screen.getByRole("button", { name: /propose/i }));
    await waitFor(() => {
      expect(screen.getByText(/no changes proposed/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /apply/i })).toBeDisabled();
  });

  it("Cancel clears the proposed state and re-enables the instruction input", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...thesis.scope.regions, "JAPAN"];
    mockRefineResponse({
      body: {
        current: thesis,
        proposed,
        diff: {
          added: [{ path: "scope.regions", after: "JAPAN" }],
          removed: [],
          changed: [],
        },
      },
    });
    render(<ThesisEditor thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan",
    );
    await user.click(screen.getByRole("button", { name: /propose/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(
      screen.queryByRole("button", { name: /apply/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/refinement instruction/i),
    ).toBeEnabled();
  });

  it("Apply PATCHes /api/thesis/[id] and calls onApplied with the new thesis", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...thesis.scope.regions, "JAPAN"];
    const onApplied = vi.fn();

    mockRefineResponse({
      body: {
        current: thesis,
        proposed,
        diff: {
          added: [{ path: "scope.regions", after: "JAPAN" }],
          removed: [],
          changed: [],
        },
      },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: thesis.id, thesis: proposed, version: 2 }),
    });

    render(<ThesisEditor thesis={thesis} onApplied={onApplied} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan",
    );
    await user.click(screen.getByRole("button", { name: /propose/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /apply/i })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /apply/i }));

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

  it("renders an error message when refine fails", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    mockRefineResponse({
      status: 422,
      body: { error: "invalid_thesis", detail: "Invalid scope.regions" },
    });
    render(<ThesisEditor thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Mars",
    );
    await user.click(screen.getByRole("button", { name: /propose/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Invalid scope\.regions/,
      );
    });
  });
});
