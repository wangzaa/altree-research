import type { CorpusEvidence } from "@/lib/schemas/validation";

export type DriverEvidencePanelProps = {
  driver_id: string;
  driver_claim: string;
  bull_evidence: CorpusEvidence[];
  bear_evidence: CorpusEvidence[];
};

function EvidenceChip({ e }: { e: CorpusEvidence }) {
  return (
    <li className="border rounded-md p-3 space-y-1 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{e.expert}</span>
        <span className="text-xs text-gray-500">
          {e.date.slice(0, 10)}
        </span>
      </div>
      <div className="text-xs">
        <a
          href={e.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-blue-600"
        >
          {e.post_title}
        </a>
      </div>
      <blockquote className="italic text-gray-700">
        &ldquo;{e.quote}&rdquo;
      </blockquote>
    </li>
  );
}

export function DriverEvidencePanel(props: DriverEvidencePanelProps) {
  return (
    <section className="space-y-4">
      <header>
        <h3 className="font-semibold text-sm">{props.driver_id}</h3>
        <p className="text-sm text-gray-600">{props.driver_claim}</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-semibold mb-2">Supporting evidence</h4>
          {props.bull_evidence.length === 0 ? (
            <p className="text-xs text-gray-500">
              No supporting evidence found in corpus.
            </p>
          ) : (
            <ul className="space-y-2">
              {props.bull_evidence.map((e, i) => (
                <EvidenceChip key={`${e.post_id}-${i}`} e={e} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-2">
            Threshold-breach evidence
          </h4>
          {props.bear_evidence.length === 0 ? (
            <p className="text-xs text-gray-500">
              No threshold-breach evidence found in corpus.
            </p>
          ) : (
            <ul className="space-y-2">
              {props.bear_evidence.map((e, i) => (
                <EvidenceChip key={`${e.post_id}-${i}`} e={e} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
