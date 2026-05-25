import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ScanPanel } from "@/components/scan-panel";
import { cloneCanonicalScan } from "@/tests/fixtures/scan";
import { cloneCanonicalUniverse } from "@/tests/fixtures/universe";

const fetchMock = vi.fn();
const routerRefreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}));

beforeEach(() => {
  fetchMock.mockReset();
  routerRefreshMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("<ScanPanel>", () => {
  it("auto-fires /api/scan/run on mount when no initial scan exists and universe is set", async () => {
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
        universe={cloneCanonicalUniverse()}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/scan/run",
        expect.objectContaining({ method: "POST" }),
      );
    });
    // router.refresh fires after success so server-rendered state updates.
    await waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalledTimes(1);
    });
    // No Run / Re-run scan buttons anymore.
    expect(screen.queryByRole("button", { name: /run scan/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /re-run scan/i }),
    ).toBeNull();
  });

  it("renders the chart + per-ticker table when initial is set (no Run buttons)", () => {
    const scan = cloneCanonicalScan();
    render(
      <ScanPanel
        thesisId={scan.thesis_id}
        universeId={scan.universe_id}
        initial={scan}
        universe={cloneCanonicalUniverse()}
      />,
    );
    expect(screen.getAllByText(/RHM\.DE/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /run scan/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /re-run scan/i }),
    ).toBeNull();
    // No outbound fetch on initial-scan path either.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces dropped count after the auto-run completes", async () => {
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
        universe={cloneCanonicalUniverse()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/1 ticker.*filtered/i)).toBeInTheDocument();
    });
  });

  it("surfaces 422 detail in an alert when the auto-run fails", async () => {
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
        universe={cloneCanonicalUniverse()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/too_few_history/);
    });
  });

  it("re-fires the scan when runScanKey changes (universe Save handle)", async () => {
    const scan = cloneCanonicalScan();
    // First call: initial auto-run is skipped (initial scan provided), so
    // only the bumped key triggers a fetch.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ scan, dropped: [], dropped_ratios: [] }),
    });

    const { rerender } = render(
      <ScanPanel
        thesisId={scan.thesis_id}
        universeId={scan.universe_id}
        initial={scan}
        universe={cloneCanonicalUniverse()}
        runScanKey={0}
      />,
    );
    expect(fetchMock).not.toHaveBeenCalled();

    rerender(
      <ScanPanel
        thesisId={scan.thesis_id}
        universeId={scan.universe_id}
        initial={scan}
        universe={cloneCanonicalUniverse()}
        runScanKey={1}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
