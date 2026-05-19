import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScanPanel } from "@/components/scan-panel";
import { cloneCanonicalScan } from "@/tests/fixtures/scan";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("<ScanPanel>", () => {
  it("renders the Run scan button when initial is null", () => {
    render(
      <ScanPanel
        thesisId="t1"
        universeId="t1_universe_01"
        initial={null}
      />,
    );
    expect(screen.getByRole("button", { name: /run scan/i })).toBeInTheDocument();
  });

  it("renders the chart wrapper, markdown, and Re-run button when initial is set", () => {
    const scan = cloneCanonicalScan();
    render(
      <ScanPanel
        thesisId={scan.thesis_id}
        universeId={scan.universe_id}
        initial={scan}
      />,
    );
    expect(screen.getByText(/RHM\.DE/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-run scan/i })).toBeInTheDocument();
  });

  it("POSTs /api/scan/run on Run click and swaps to the returned payload", async () => {
    const user = userEvent.setup();
    const scan = cloneCanonicalScan();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ scan, dropped: [], dropped_ratios: [] }),
    });

    render(
      <ScanPanel
        thesisId={scan.thesis_id}
        universeId={scan.universe_id}
        initial={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /run scan/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /re-run scan/i }),
      ).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/scan/run",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces dropped count when present in response", async () => {
    const user = userEvent.setup();
    const scan = cloneCanonicalScan();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        scan,
        dropped: [{ ticker: "X.L", reason: "history_lookup_failed" }],
        dropped_ratios: [],
      }),
    });
    render(
      <ScanPanel
        thesisId={scan.thesis_id}
        universeId={scan.universe_id}
        initial={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /run scan/i }));
    await waitFor(() => {
      expect(screen.getByText(/1 ticker.*filtered/i)).toBeInTheDocument();
    });
  });

  it("surfaces 422 detail in an alert when POST fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: "scan_failed", detail: "too_few_history" }),
    });
    render(
      <ScanPanel
        thesisId="t1"
        universeId="t1_universe_01"
        initial={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /run scan/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/too_few_history/);
    });
  });
});
