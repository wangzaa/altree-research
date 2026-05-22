import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UniverseTable } from "@/components/universe-table";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("<UniverseTable>", () => {
  it("renders all tickers from the initial universe", () => {
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);
    for (const t of u.tickers) {
      expect(screen.getByText(t.ticker)).toBeInTheDocument();
      expect(screen.getByText(t.name)).toBeInTheDocument();
    }
  });

  it("Save is disabled when nothing has been edited", () => {
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("sorts rows ascending then descending when the Ticker header is clicked twice", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);
    const header = screen.getByRole("button", { name: /^Ticker/i });

    await user.click(header);
    // Asc: tickers should be lexicographically sorted.
    const rowsAsc = Array.from(document.querySelectorAll("tbody tr"))
      .map((r) => r.querySelector("td")?.textContent ?? "");
    const sortedAsc = [...rowsAsc].sort();
    expect(rowsAsc).toEqual(sortedAsc);

    await user.click(header);
    const rowsDesc = Array.from(document.querySelectorAll("tbody tr"))
      .map((r) => r.querySelector("td")?.textContent ?? "");
    const sortedDesc = [...rowsAsc].sort().reverse();
    expect(rowsDesc).toEqual(sortedDesc);
  });

  it("sorts rows numerically by Mcap when its header is clicked", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Mcap/i }));
    const mcapCells = Array.from(document.querySelectorAll("tbody tr"))
      .map((r) => {
        const cells = r.querySelectorAll("td");
        return Number(cells[3]?.textContent?.replace(/,/g, "") ?? "0");
      });
    const sortedAsc = [...mcapCells].sort((a, b) => a - b);
    expect(mcapCells).toEqual(sortedAsc);
  });

  it("editing notes enables Save and PATCHes with the full payload on click", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    const onSaved = vi.fn();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ universe: { ...u, tickers: [{ ...u.tickers[0], notes: "edited" }, ...u.tickers.slice(1)] } }),
    });

    render(<UniverseTable initial={u} onSaved={onSaved} onRefresh={vi.fn()} />);

    const notesInputs = screen.getAllByPlaceholderText(/notes/i);
    await user.clear(notesInputs[0]);
    await user.type(notesInputs[0], "edited");

    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/universe/${u.id}`,
      expect.objectContaining({ method: "PATCH" }),
    );
    // After save, a visible "Saved at HH:MM" indicator appears so the user
    // gets feedback even when the button re-disables on dirty=false.
    await waitFor(() => {
      expect(
        screen.getByTestId("universe-saved-indicator"),
      ).toBeInTheDocument();
    });
  });

  it("changing exposure_tier dropdown enables Save", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "diversified");
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("Remove button drops the row and enables Save", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    const initialCount = removeButtons.length;
    await user.click(removeButtons[0]);
    const remaining = screen.getAllByRole("button", { name: /remove/i });
    expect(remaining.length).toBe(initialCount - 1);
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("Add row form appends a new ticker after Yahoo fetch succeeds", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /add row/i }));

    const newRowInput = screen.getByPlaceholderText(/new yahoo ticker/i);
    await user.type(newRowInput, "DASF.PA"); // Dassault Aviation, EUROZONE

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ name: "Dassault Aviation", market_cap_usd: 25e9 }),
    });

    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText("DASF.PA")).toBeInTheDocument();
    });
    expect(screen.getByText("Dassault Aviation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("Add row rejects unknown suffix without calling Yahoo", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /add row/i }));
    await user.type(
      screen.getByPlaceholderText(/new yahoo ticker/i),
      "STUB.ZZ",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/unknown ticker suffix/i);
  });

  it("Refresh from scope calls onRefresh", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    const onRefresh = vi.fn();
    render(
      <UniverseTable initial={u} onSaved={vi.fn()} onRefresh={onRefresh} />,
    );
    await user.click(screen.getByRole("button", { name: /refresh from scope/i }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("Save surfaces 422 detail in an alert when PATCH fails validation", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        error: "invalid_universe",
        detail: "tickers[0].name too short",
      }),
    });
    render(<UniverseTable initial={u} onSaved={vi.fn()} onRefresh={vi.fn()} />);
    const notesInputs = screen.getAllByPlaceholderText(/notes/i);
    await user.clear(notesInputs[0]);
    await user.type(notesInputs[0], "x");
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/tickers\[0\]\.name too short/);
    });
  });
});
