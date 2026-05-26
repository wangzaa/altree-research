"use client";

import React, { useEffect, useState } from "react";
import { Spinner } from "@/components/spinner";
import { riskRatingLabel } from "@/lib/data/endowus-funds-types";

interface SelectedFund {
  isin: string;
  fund_name: string;
  asset_class: string;
  sub_category: string;
  region: string;
  risk_rating: number;
  return_1y_pct: number | null;
  return_3y_annualised_pct: number | null;
  why: string;
}

interface FundSelectionCardsProps {
  thesis_id: string;
  /** Bumped by the parent to force a refetch (e.g. after the thesis is
   * refined or memo regenerated). */
  refreshKey?: number;
}

const ENDOWUS_FUNDS_URL = "https://endowus.com/investment-funds-list";

function fmtReturn(fund: SelectedFund): { label: string; value: string } {
  if (fund.return_3y_annualised_pct !== null) {
    return {
      label: "Avg ann return (3Y)",
      value: `${fund.return_3y_annualised_pct.toFixed(1)}% p.a.`,
    };
  }
  if (fund.return_1y_pct !== null) {
    return {
      label: "Return (1Y)",
      value: `${fund.return_1y_pct.toFixed(1)}%`,
    };
  }
  return { label: "Avg ann return", value: "—" };
}

function FundCard({ fund }: { fund: SelectedFund }) {
  const ret = fmtReturn(fund);
  const risk = riskRatingLabel(fund.risk_rating);
  return (
    <a
      href={ENDOWUS_FUNDS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col overflow-hidden transition-shadow hover:shadow-md"
      style={{
        background: "white",
        border: "1px solid #E5E5E5",
        borderRadius: 18.75,
        color: "var(--color-black)",
      }}
    >
      <div
        className="px-5 py-4"
        style={{ background: "#F5F4F2", borderBottom: "1px solid #E5E5E5" }}
      >
        <h3 className="font-serif text-2xl leading-tight">{fund.fund_name}</h3>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-5 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span
              className="text-xs font-semibold tracking-wider"
              style={{ color: "#585858" }}
            >
              {risk}
            </span>
            <p className="text-sm" style={{ color: "var(--color-black)" }}>
              {fund.why}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs" style={{ color: "#585858" }}>
              {ret.label}
            </span>
            <span
              className="font-serif tabular-nums"
              style={{ fontSize: 28, lineHeight: 1, color: "var(--color-black)" }}
            >
              {ret.value}
            </span>
          </div>
        </div>
        <div className="text-xs" style={{ color: "#9a9a9a" }}>
          {fund.asset_class} · {fund.sub_category} · {fund.region}
        </div>
      </div>
      <div
        className="px-5 py-3 text-center text-sm font-semibold tracking-wide"
        style={{
          background: "var(--color-pear-cyan-light)",
          color: "var(--color-black)",
          borderTop: "1px solid #E5E5E5",
        }}
      >
        LEARN MORE →
      </div>
    </a>
  );
}

export function FundSelectionCards({
  thesis_id,
  refreshKey,
}: FundSelectionCardsProps) {
  const [funds, setFunds] = useState<SelectedFund[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch("/api/fund/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thesis_id }),
        });
        const body = (await res.json().catch(() => null)) as
          | { funds?: SelectedFund[]; error?: string }
          | null;
        if (cancelled) return;
        if (!res.ok || !body?.funds) {
          setError(body?.error ?? `Fund selection failed (${res.status})`);
          setFunds([]);
        } else {
          setFunds(body.funds);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unexpected error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thesis_id, refreshKey]);

  if (loading && funds === null) {
    return (
      <p
        className="inline-flex items-center gap-2 text-sm italic"
        style={{ color: "#585858" }}
      >
        <Spinner size={14} />
        Matching…
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-sm" role="alert" style={{ color: "#a30000" }}>
        Couldn’t load fund picks: {error}
      </p>
    );
  }
  if (!funds || funds.length === 0) {
    return (
      <p className="text-sm" style={{ color: "#585858" }}>
        No funds in the catalogue matched the thesis closely enough. Refine the
        scope (regions or sectors) and try again.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {funds.map((f) => (
        <FundCard key={f.isin} fund={f} />
      ))}
    </div>
  );
}
