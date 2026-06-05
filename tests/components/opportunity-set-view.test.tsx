import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OpportunitySetView } from "@/components/opportunity-set-view";
import type { OpportunityRow } from "@/lib/agents/theme-exposure/view";

function row(over: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    ticker: over.ticker ?? "6146",
    yahoo_ticker: over.yahoo_ticker ?? "6146.T",
    name_en: over.name_en ?? "Disco",
    rationale: over.rationale ?? "Expanded HBM dicing capacity (Apr 2026).",
    as_of: over.as_of ?? "2026-04-12",
    description: over.description ?? "Precision dicing tools for semiconductor wafers.",
    financials: over.financials ?? {
      revenue_jpy_mn: 1_400_000,
      gross_profit_jpy_mn: null,
      operating_profit_jpy_mn: 120_000,
      operating_margin: 0.086,
      revenue_yoy: 0.043,
    },
  };
}

describe("<OpportunitySetView>", () => {
  it("renders each company's qualitative why (dated rationale + description)", () => {
    render(
      <OpportunitySetView
        themeLabel="Memory chip up-cycle"
        rows={[row()]}
        ratesByCurrency={{ JPY: 0.0066 }}
      />,
    );
    expect(screen.getByText("Disco")).toBeInTheDocument();
    expect(screen.getByText(/6146/)).toBeInTheDocument();
    expect(
      screen.getByText(/Expanded HBM dicing capacity/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Precision dicing tools/),
    ).toBeInTheDocument();
    // dated rationale shows the as_of date
    expect(screen.getByText(/12 Apr 2026/)).toBeInTheDocument();
  });

  it("renders quantitative financials converted to USD via live FX", () => {
    render(
      <OpportunitySetView
        themeLabel="Memory chip up-cycle"
        rows={[row()]}
        ratesByCurrency={{ JPY: 0.0066 }}
      />,
    );
    // 1,400,000 JPYmn → 9,240 USD M
    expect(screen.getByText("9,240")).toBeInTheDocument();
    // operating margin 0.086 → 8.6%
    expect(screen.getByText("8.6%")).toBeInTheDocument();
    // revenue YoY 0.043 → +4.3%
    expect(screen.getByText("+4.3%")).toBeInTheDocument();
  });

  it("renders a clear empty state when no companies are moving on the topic", () => {
    render(<OpportunitySetView themeLabel="Defense capex" rows={[]} />);
    expect(screen.getByText(/no .*recent/i)).toBeInTheDocument();
    // names the topic so the empty state is unambiguous
    expect(screen.getByText(/Defense capex/)).toBeInTheDocument();
  });
});
