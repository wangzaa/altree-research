import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpenQuestionsResolver } from "@/components/open-questions-resolver";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("<OpenQuestionsResolver>", () => {
  it("renders each question and classifies on mount", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        classifications: [
          {
            question: "Top 3 by revenue growth?",
            category: "derivable",
            hint: {
              op: "rank_by_metric",
              metric: "revenue_growth_yoy",
              direction: "desc",
              limit: 3,
            },
            confidence: 0.9,
          },
          {
            question: "What does the corpus say about EU defense?",
            category: "corpus",
            hint: "EU defense capex",
            confidence: 0.8,
          },
        ],
      }),
    );

    render(
      <OpenQuestionsResolver
        thesisId="th_1"
        questions={[
          "Top 3 by revenue growth?",
          "What does the corpus say about EU defense?",
        ]}
      />,
    );

    expect(screen.getByText(/Top 3 by revenue growth/)).toBeInTheDocument();
    expect(
      screen.getByText(/What does the corpus say about EU defense/),
    ).toBeInTheDocument();
    // Pre-classify: both chips show "classifying…"
    expect(screen.getAllByText(/classifying/i)).toHaveLength(2);

    await waitFor(() => {
      expect(screen.getByText(/from scan/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/from corpus/i)).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/question/classify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          thesis_id: "th_1",
          questions: [
            "Top 3 by revenue growth?",
            "What does the corpus say about EU defense?",
          ],
        }),
      }),
    );
  });

  it("resolves a derivable question into an answer bubble with a sources toggle", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        classifications: [
          {
            question: "Top 3 by revenue growth?",
            category: "derivable",
            hint: {
              op: "rank_by_metric",
              metric: "revenue_growth_yoy",
              direction: "desc",
              limit: 3,
            },
            confidence: 0.9,
          },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "resolved",
        category: "derivable",
        answer: {
          text: "RHM, BA, LDO lead on YoY revenue growth.",
          sources: {
            tickers: ["RHM.DE", "BA.L", "LDO.MI"],
            scan_column: "revenue_growth_yoy",
            op: "rank_by_metric",
          },
        },
      }),
    );

    render(
      <OpenQuestionsResolver
        thesisId="th_1"
        questions={["Top 3 by revenue growth?"]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/from scan/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /resolve/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/RHM, BA, LDO lead on YoY revenue growth/),
      ).toBeInTheDocument();
    });

    // Sources hidden by default.
    expect(screen.queryByText(/RHM\.DE/)).not.toBeInTheDocument();
    // The toggle advertises the count.
    expect(
      screen.getByRole("button", { name: /show sources \(3\)/i }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /show sources \(3\)/i }),
    );
    expect(screen.getByText(/RHM\.DE/)).toBeInTheDocument();
    expect(screen.getByText(/revenue_growth_yoy/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /hide sources/i }),
    ).toBeInTheDocument();
  });

  it("disables the Resolve button for needs_analyst", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        classifications: [
          {
            question: "What will management do next quarter?",
            category: "needs_analyst",
            hint: null,
            confidence: 0.95,
          },
        ],
      }),
    );

    render(
      <OpenQuestionsResolver
        thesisId="th_1"
        questions={["What will management do next quarter?"]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/needs analyst/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /resolve/i })).toBeDisabled();
  });

  it("renders the not_implemented placeholder when corpus resolve returns it", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        classifications: [
          {
            question: "What does the corpus say?",
            category: "corpus",
            hint: "defense capex",
            confidence: 0.8,
          },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "not_implemented",
        category: "corpus",
        message: "Phase 2 — corpus resolver not built yet.",
      }),
    );

    render(
      <OpenQuestionsResolver
        thesisId="th_1"
        questions={["What does the corpus say?"]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/from corpus/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /resolve/i }));

    const placeholder = await screen.findByText(
      /Phase 2 — corpus resolver not built yet/,
    );
    expect(placeholder).toBeInTheDocument();
    expect(placeholder.className).toMatch(/italic/);
  });

  it("shows the classify-failed banner when classify returns non-ok", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 502));

    render(
      <OpenQuestionsResolver thesisId="th_1" questions={["any question?"]} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Couldn't classify open questions/i),
      ).toBeInTheDocument();
    });
  });

  it("does not re-classify or drop resolved bubbles when parent re-renders with same questions content but new array reference", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        classifications: [
          {
            question: "q1",
            category: "derivable",
            hint: {
              op: "rank_by_metric",
              metric: "revenue_growth_yoy",
              direction: "desc",
              limit: 3,
            },
            confidence: 0.9,
          },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "resolved",
        category: "derivable",
        answer: {
          text: "Resolved answer text",
          sources: {
            tickers: ["AAA", "BBB"],
            scan_column: "revenue_growth_yoy",
            op: "rank_by_metric",
          },
        },
      }),
    );

    const { rerender } = render(
      <OpenQuestionsResolver thesisId="th_1" questions={["q1"]} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/from scan/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /resolve/i }));

    await waitFor(() => {
      expect(screen.getByText(/Resolved answer text/)).toBeInTheDocument();
    });

    // Re-render with a fresh array holding the SAME content. Classify must not
    // re-fire, and the resolved bubble must stay on-screen.
    rerender(
      <OpenQuestionsResolver thesisId="th_1" questions={["q1"]} />,
    );

    // Give any spurious effect a tick to run; it must not.
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Resolved answer text/)).toBeInTheDocument();
  });

  it("re-classifies and rebuilds state without crashing when questions content changes", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        classifications: [
          {
            question: "q1",
            category: "corpus",
            hint: "x",
            confidence: 0.7,
          },
          {
            question: "q2",
            category: "corpus",
            hint: "y",
            confidence: 0.7,
          },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        classifications: [
          {
            question: "q3",
            category: "derivable",
            hint: {
              op: "rank_by_metric",
              metric: "revenue_growth_yoy",
              direction: "desc",
              limit: 3,
            },
            confidence: 0.9,
          },
        ],
      }),
    );

    const { rerender } = render(
      <OpenQuestionsResolver thesisId="th_1" questions={["q1", "q2"]} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/from corpus/i)).toHaveLength(2);
    });

    // Re-render with a shorter, different-content list. Must trigger
    // re-classify (call #2) and must not crash on stale array indices.
    rerender(
      <OpenQuestionsResolver thesisId="th_1" questions={["q3"]} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/from scan/i)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/question/classify",
      expect.objectContaining({
        body: JSON.stringify({
          thesis_id: "th_1",
          questions: ["q3"],
        }),
      }),
    );
    expect(screen.getByText("q3")).toBeInTheDocument();
    expect(screen.queryByText("q1")).not.toBeInTheDocument();
    expect(screen.queryByText("q2")).not.toBeInTheDocument();
  });
});
