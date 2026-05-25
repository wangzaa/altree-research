import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnchorPicker } from "@/components/anchor-picker";

const fetchMock = vi.fn();

function mockSuggestResponse(
  suggestions: Array<{ ticker: string; name: string; why: string }>,
) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ suggestions }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  // Default: no suggestions, so existing tests that don't care about them
  // get a clean "no suggestions" empty-state.
  mockSuggestResponse([]);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("<AnchorPicker>", () => {
  it("renders the free-text input and disables submit when empty", async () => {
    render(
      <AnchorPicker
        thesis_id="t_26_05_01"
        tickers_seed={["RHM.DE", "BA.L"]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );
    expect(screen.getByPlaceholderText(/yahoo ticker/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /build universe/i })).toBeDisabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("renders chips from tickers_seed", async () => {
    render(
      <AnchorPicker
        thesis_id="t_26_05_01"
        tickers_seed={["RHM.DE", "BA.L", "LDO.MI"]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );
    expect(screen.getByRole("button", { name: "RHM.DE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BA.L" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LDO.MI" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("does not render seed row when tickers_seed is empty", async () => {
    render(
      <AnchorPicker
        thesis_id="t_26_05_01"
        tickers_seed={[]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );
    expect(screen.queryByText(/from your thesis/i)).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("populates the input when a chip is clicked", async () => {
    const user = userEvent.setup();
    render(
      <AnchorPicker
        thesis_id="t_26_05_01"
        tickers_seed={["RHM.DE", "BA.L"]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "BA.L" }));
    expect(screen.getByPlaceholderText(/yahoo ticker/i)).toHaveValue("BA.L");
  });

  it("calls onSubmit with the ticker on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AnchorPicker
        thesis_id="t_26_05_01"
        tickers_seed={["RHM.DE"]}
        onSubmit={onSubmit}
        disabled={false}
      />,
    );
    await user.type(screen.getByPlaceholderText(/yahoo ticker/i), "RHM.DE");
    await user.click(screen.getByRole("button", { name: /build universe/i }));
    expect(onSubmit).toHaveBeenCalledWith("RHM.DE");
  });

  it("rejects unknown suffix and surfaces an inline error", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AnchorPicker
        thesis_id="t_26_05_01"
        tickers_seed={[]}
        onSubmit={onSubmit}
        disabled={false}
      />,
    );
    await user.type(screen.getByPlaceholderText(/yahoo ticker/i), "STUB.ZZ");
    await user.click(screen.getByRole("button", { name: /build universe/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/unknown ticker suffix/i);
  });

  it("trims whitespace and uppercases before submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AnchorPicker
        thesis_id="t_26_05_01"
        tickers_seed={[]}
        onSubmit={onSubmit}
        disabled={false}
      />,
    );
    await user.type(screen.getByPlaceholderText(/yahoo ticker/i), "  rhm.de  ");
    await user.click(screen.getByRole("button", { name: /build universe/i }));
    expect(onSubmit).toHaveBeenCalledWith("RHM.DE");
  });

  it("respects the disabled prop", async () => {
    render(
      <AnchorPicker
        thesis_id="t_26_05_01"
        tickers_seed={["RHM.DE"]}
        onSubmit={vi.fn()}
        disabled={true}
      />,
    );
    expect(screen.getByPlaceholderText(/yahoo ticker/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /build universe/i })).toBeDisabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("calls /api/anchor/suggest with the thesis_id on mount and renders suggestion chips", async () => {
    fetchMock.mockReset();
    mockSuggestResponse([
      {
        ticker: "6954.T",
        name: "Fanuc Corporation",
        why: "Japanese industrial robot leader",
      },
      {
        ticker: "6506.T",
        name: "Yaskawa Electric",
        why: "Servo motors and factory automation",
      },
    ]);

    render(
      <AnchorPicker
        thesis_id="japan_robotics_26_05_01"
        tickers_seed={[]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /6954\.T/i }),
      ).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/anchor/suggest",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ thesis_id: "japan_robotics_26_05_01" }),
      }),
    );
    expect(screen.getByText(/Fanuc Corporation/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Japanese industrial robot leader/i),
    ).toBeInTheDocument();
  });

  it("clicking a suggestion chip fills the anchor input", async () => {
    const user = userEvent.setup();
    fetchMock.mockReset();
    mockSuggestResponse([
      {
        ticker: "6954.T",
        name: "Fanuc Corporation",
        why: "Japanese industrial robot leader",
      },
    ]);

    render(
      <AnchorPicker
        thesis_id="japan_robotics_26_05_01"
        tickers_seed={[]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );

    const chip = await screen.findByRole("button", { name: /6954\.T/i });
    await user.click(chip);
    expect(screen.getByPlaceholderText(/yahoo ticker/i)).toHaveValue("6954.T");
  });

  it("shows a 'no suggestions' empty state when the endpoint returns []", async () => {
    render(
      <AnchorPicker
        thesis_id="t_26_05_01"
        tickers_seed={[]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/no suggestions returned/i),
      ).toBeInTheDocument(),
    );
  });

  it("refetches suggestions when refreshKey changes (Continue-without-refining)", async () => {
    fetchMock.mockReset();
    // Initial mount response.
    mockSuggestResponse([
      {
        ticker: "6594.T",
        name: "Nidec",
        why: "motor leader",
      },
    ]);
    // Bumped-key response.
    mockSuggestResponse([
      {
        ticker: "6954.T",
        name: "Fanuc Corporation",
        why: "robotics leader",
      },
    ]);

    const { rerender } = render(
      <AnchorPicker
        thesis_id="japan_robotics_26_05_01"
        tickers_seed={[]}
        onSubmit={vi.fn()}
        disabled={false}
        refreshKey={0}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /6594\.T/i })).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender(
      <AnchorPicker
        thesis_id="japan_robotics_26_05_01"
        tickers_seed={[]}
        onSubmit={vi.fn()}
        disabled={false}
        refreshKey={1}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /6954\.T/i })).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // First call's response no longer rendered after the bump.
    expect(screen.queryByRole("button", { name: /6594\.T/i })).toBeNull();
  });

  it("renders an error line when the suggest endpoint fails", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: "tool_use_invalid" }),
    });

    render(
      <AnchorPicker
        thesis_id="t_26_05_01"
        tickers_seed={[]}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/couldn[’']t load suggestions/i),
      ).toBeInTheDocument(),
    );
  });
});
