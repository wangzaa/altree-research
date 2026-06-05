import React from "react";
import type { OpportunityRow } from "@/lib/agents/theme-exposure/view";
import {
  fmtJpyMnToUsdM,
  fmtPct,
  fmtAsOf,
} from "@/lib/agents/theme-exposure/view";

export interface OpportunitySetViewProps {
  themeLabel: string;
  rows: OpportunityRow[];
  ratesByCurrency?: Record<string, number>;
  fxAsOf?: string | null;
}

/**
 * The opportunity set for a hot topic (#30): the covered Japanese companies
 * exposed to it, each with a dated qualitative "why" (theme_tagger rationale +
 * covered-set description) and quantitative financials rendered in USD via the
 * app's live FX (the file stores JPYmn). A quiet topic renders an empty state.
 */
export function OpportunitySetView({
  themeLabel,
  rows,
  ratesByCurrency,
  fxAsOf,
}: OpportunitySetViewProps) {
  if (rows.length === 0) {
    return (
      <div
        className="bg-white"
        style={{ borderRadius: 18.75, padding: 30, border: "1px solid #E5E5E5" }}
      >
        <p className="text-base" style={{ color: "#585858" }}>
          No companies have recent activity on{" "}
          <span style={{ color: "var(--color-black)", fontWeight: 500 }}>
            {themeLabel}
          </span>{" "}
          right now. Exposure is activity-based — check back after the next sync,
          or pick another topic.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm" style={{ color: "#585858" }}>
          {rows.length} {rows.length === 1 ? "company" : "companies"} moving on{" "}
          <span style={{ color: "var(--color-black)", fontWeight: 500 }}>
            {themeLabel}
          </span>
        </p>
        {fxAsOf ? (
          <span className="text-xs" style={{ color: "#9A9A9A" }}>
            FX as of {fxAsOf}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <article
            key={r.ticker}
            className="bg-white"
            style={{
              borderRadius: 18.75,
              padding: 24,
              border: "1px solid #E5E5E5",
            }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3
                className="text-lg"
                style={{ fontFamily: "var(--font-playfair)", fontWeight: 500 }}
              >
                {r.name_en}
              </h3>
              <span className="font-mono text-xs" style={{ color: "#585858" }}>
                {r.ticker} · {r.yahoo_ticker}
              </span>
            </div>

            {/* Qualitative: dated rationale (the "why" it surfaced) */}
            <p className="mt-2 text-sm" style={{ color: "var(--color-black)" }}>
              <span
                className="mr-2 inline-block rounded-full px-2 py-0.5 text-xs"
                style={{ background: "#F0EFEC", color: "#585858" }}
              >
                {fmtAsOf(r.as_of)}
              </span>
              {r.rationale}
            </p>

            {/* Qualitative: covered-set business description */}
            {r.description ? (
              <p className="mt-2 text-xs" style={{ color: "#585858", lineHeight: 1.5 }}>
                {r.description}
              </p>
            ) : null}

            {/* Quantitative: financials in USD via live FX */}
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              <Metric
                label="Revenue (USD M)"
                value={fmtJpyMnToUsdM(r.financials.revenue_jpy_mn, ratesByCurrency)}
              />
              <Metric
                label="Op. profit (USD M)"
                value={fmtJpyMnToUsdM(
                  r.financials.operating_profit_jpy_mn,
                  ratesByCurrency,
                )}
              />
              <Metric
                label="Op. margin"
                value={fmtPct(r.financials.operating_margin)}
              />
              <Metric
                label="Revenue YoY"
                value={fmtPct(r.financials.revenue_yoy, { signed: true })}
              />
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt
        className="text-xs uppercase tracking-wide"
        style={{ color: "#9A9A9A" }}
      >
        {label}
      </dt>
      <dd className="tabular-nums text-sm" style={{ color: "var(--color-black)" }}>
        {value}
      </dd>
    </div>
  );
}
