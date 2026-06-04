import type { JpCompany } from "@/lib/schemas/jp-company";
import type { RecentReport } from "@/lib/schemas/theme-exposure";

/** A stage-1 survivor: a covered company plus the recent reports that matched
 *  the topic's keyword net. The matched reports (not the whole corpus) are what
 *  the stage-2 theme_tagger reads. */
export type Candidate = {
  company: JpCompany;
  matched: RecentReport[];
};

/** Stage 1 (recall): for each company, keep the recent reports whose text
 *  matches the topic's keyword net; a company with ≥1 matching report becomes a
 *  candidate. Recall is the only job — cast wide, since a stage-1 miss never
 *  reaches the LLM. Pure (no I/O), so it unit-tests in isolation. */
export function recallCandidates(
  companies: JpCompany[],
  reportsByTicker: Map<string, RecentReport[]>,
  keywords: string[],
): Candidate[] {
  const low = keywords.map((k) => k.toLowerCase());
  const hits = (r: RecentReport): boolean => {
    const blob = `${r.title} ${r.text}`.toLowerCase();
    return low.some((k) => blob.includes(k));
  };

  const out: Candidate[] = [];
  for (const company of companies) {
    const reports = reportsByTicker.get(company.ticker) ?? [];
    const matched = reports.filter(hits);
    if (matched.length) out.push({ company, matched });
  }
  return out;
}
