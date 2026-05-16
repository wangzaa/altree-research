import React from "react";
import type { Thesis } from "@/lib/schemas/thesis";

function Section({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h3>
      <pre className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs leading-relaxed text-neutral-800">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="text-sm text-neutral-900">{value}</dd>
    </div>
  );
}

export function ThesisJsonView({ thesis }: { thesis: Thesis }) {
  const status = thesis.validation?.status ?? "draft";
  const verdict = thesis.validation?.verdict ?? "—";

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <SummaryRow label="ID" value={thesis.id} />
          <SummaryRow label="Version" value={String(thesis.version)} />
          <SummaryRow label="Status" value={String(status)} />
          <SummaryRow label="Verdict" value={String(verdict)} />
          <SummaryRow
            label="Horizon (years)"
            value={String(thesis.horizon_years)}
          />
          <SummaryRow label="Created at" value={thesis.createdAt} />
        </dl>
      </div>

      <Section title="Claim" value={thesis.claim} />
      <Section title="Macro premise" value={thesis.macro_premise} />
      <Section title="Scope" value={thesis.scope} />
      <Section title="Drivers" value={thesis.drivers} />
      <Section title="Falsification" value={thesis.falsification} />
    </div>
  );
}
