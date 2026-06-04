import coveredJson from "./jp-companies.json";
import {
  JpCoveredSetSchema,
  type JpCompany,
  type JpCoveredSet,
} from "@/lib/schemas/jp-company";

let _cache: JpCoveredSet | null = null;

/** Load + validate the committed covered-set snapshot. Cached. */
export function loadCoveredSet(): JpCoveredSet {
  if (_cache) return _cache;
  const parsed = JpCoveredSetSchema.safeParse(coveredJson);
  if (!parsed.success) {
    throw new Error(`Invalid lib/data/jp-companies.json: ${parsed.error.message}`);
  }
  _cache = parsed.data;
  return _cache;
}

export function getCoveredCompanies(): JpCompany[] {
  return loadCoveredSet().companies;
}

/** Look up by bare TSE code ("2802") or Yahoo symbol ("2802.T"). */
export function getCoveredCompany(ticker: string): JpCompany | undefined {
  const bare = ticker.endsWith(".T") ? ticker.slice(0, -2) : ticker;
  return getCoveredCompanies().find((c) => c.ticker === bare);
}

export type { JpCompany };
