import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

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
    render(<UniverseTable initial={u} onSaved={vi.fn()} />);
    for (const t of u.tickers) {
      expect(screen.getByText(t.ticker)).toBeInTheDocument();
      expect(screen.getByText(t.name)).toBeInTheDocument();
    }
  });

  it("Proceed-to-scan is enabled even when nothing has been edited (re-run path)", () => {
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /proceed to scan/i }),
    ).toBeEnabled();
  });

  it("sorts rows descending then ascending when the Ticker header is clicked twice", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} />);
    const header = screen.getByRole("button", { name: /^Ticker/i });

    // First click defaults to descending (Z→A / largest→smallest) for every column.
    await user.click(header);
    const rowsDesc = Array.from(document.querySelectorAll("tbody tr"))
      .map((r) => r.querySelector("td")?.textContent ?? "");
    const sortedDesc = [...rowsDesc].sort().reverse();
    expect(rowsDesc).toEqual(sortedDesc);

    // Second click on the same column flips to ascending.
    await user.click(header);
    const rowsAsc = Array.from(document.querySelectorAll("tbody tr"))
      .map((r) => r.querySelector("td")?.textContent ?? "");
    const sortedAsc = [...rowsAsc].sort();
    expect(rowsAsc).toEqual(sortedAsc);
  });

  it("sorts rows numerically by Mcap (descending) when its header is clicked", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Mcap/i }));
    const mcapCells = Array.from(document.querySelectorAll("tbody tr"))
      .map((r) => {
        const cells = r.querySelectorAll("td");
        return Number(cells[3]?.textContent?.replace(/,/g, "") ?? "0");
      });
    const sortedDesc = [...mcapCells].sort((a, b) => b - a);
    expect(mcapCells).toEqual(sortedDesc);
  });

  it("removing a row enables Refresh and PATCHes with the remaining payload on click", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    const onSaved = vi.fn();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ universe: { ...u, tickers: u.tickers.slice(1) } }),
    });

    render(<UniverseTable initial={u} onSaved={onSaved} />);

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);

    const saveButton = screen.getByRole("button", { name: /proceed to scan/i });
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

  it("Notes column shows just the rationale for pure_play rows (no tier prefix)", () => {
    const u = cloneCanonicalUniverse();
    const first = u.tickers[0];
    first.exposure_tier = "pure_play";
    first.notes = "lead anchor for the basket";
    render(<UniverseTable initial={u} onSaved={vi.fn()} />);
    // pure_play is the default tier and is intentionally not shown as a
    // prefix — it would just add noise to most rows.
    expect(
      screen.getByText("lead anchor for the basket"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/pure_play/i)).not.toBeInTheDocument();
    // No editable inputs for notes/exposure anymore.
    expect(
      screen.queryByPlaceholderText(/^notes$/i),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  });

  it("Notes column prefixes 'Diversified' / 'ETF proxy' only for non-default tiers", () => {
    const u = cloneCanonicalUniverse();
    u.tickers[0].exposure_tier = "diversified";
    u.tickers[0].notes = "broader industrials mix";
    u.tickers[1].exposure_tier = "etf_proxy";
    u.tickers[1].notes = "sector ETF wrapper";
    render(<UniverseTable initial={u} onSaved={vi.fn()} />);
    expect(
      screen.getByText("Diversified; broader industrials mix"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ETF proxy; sector ETF wrapper"),
    ).toBeInTheDocument();
  });

  it("Remove button drops the row from the table", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} />);
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    const initialCount = removeButtons.length;
    await user.click(removeButtons[0]);
    const remaining = screen.getAllByRole("button", { name: /remove/i });
    expect(remaining.length).toBe(initialCount - 1);
    expect(screen.getByRole("button", { name: /proceed to scan/i })).toBeEnabled();
  });

  it("Add row form appends a new ticker after Yahoo fetch succeeds", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} />);

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
    expect(screen.getByRole("button", { name: /proceed to scan/i })).toBeEnabled();
  });

  it("Add row rejects unknown suffix without calling Yahoo", async () => {
    const user = userEvent.setup();
    const u = cloneCanonicalUniverse();
    render(<UniverseTable initial={u} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /add row/i }));
    await user.type(
      screen.getByPlaceholderText(/new yahoo ticker/i),
      "STUB.ZZ",
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/unknown ticker suffix/i);
  });

  it("Proceed-to-scan surfaces 422 detail in an alert when PATCH fails validation", async () => {
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
    render(<UniverseTable initial={u} onSaved={vi.fn()} />);
    // Trigger dirty by removing a row; Save is otherwise inert.
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);
    await user.click(screen.getByRole("button", { name: /proceed to scan/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/tickers\[0\]\.name too short/);
    });
  });
});
