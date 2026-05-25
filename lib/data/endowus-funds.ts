// Server-only module: reads the bundled Endowus CSV from disk and parses
// it into typed rows. Importing this file pulls in `node:fs`, which breaks
// if it ends up in a client bundle. Client components that just need the
// row type or the risk-label helper should import from
// `./endowus-funds-types` instead.
import fs from "node:fs";
import path from "node:path";
import type { EndowusFund } from "./endowus-funds-types";

export type { EndowusFund } from "./endowus-funds-types";
export { riskRatingLabel } from "./endowus-funds-types";

const CSV_PATH = path.join(process.cwd(), "lib", "data", "endowus-funds.csv");

let _cache: EndowusFund[] | null = null;

/**
 * Minimal RFC-4180-style CSV row tokenizer. The Endowus CSV embeds commas
 * inside quoted fields (e.g. `"SGD Cash, SRS"`) so a naive `split(",")`
 * mis-aligns columns. This handles quoted fields with escaped double quotes;
 * unquoted fields are split on plain commas.
 */
function parseCsvRow(row: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i <= row.length) {
    if (row[i] === '"') {
      // Quoted field — read until the closing quote, respecting "" escapes.
      i += 1;
      let buf = "";
      while (i < row.length) {
        if (row[i] === '"') {
          if (row[i + 1] === '"') {
            buf += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        buf += row[i];
        i += 1;
      }
      out.push(buf);
      if (row[i] === ",") i += 1;
      else if (i >= row.length) return out;
    } else {
      // Unquoted field — read until the next comma or end.
      let buf = "";
      while (i < row.length && row[i] !== ",") {
        buf += row[i];
        i += 1;
      }
      out.push(buf);
      if (row[i] === ",") {
        i += 1;
      } else {
        return out;
      }
    }
  }
  return out;
}

function toNumberOrNull(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function loadEndowusFunds(): EndowusFund[] {
  if (_cache !== null) return _cache;
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  // First row is the header; skip.
  const out: EndowusFund[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    if (cols.length < 11) continue;
    const risk = toNumberOrNull(cols[7]);
    if (risk === null) continue;
    out.push({
      fund_name: cols[0].trim(),
      isin: cols[1].trim(),
      asset_class: cols[2].trim(),
      sub_category: cols[3].trim(),
      region: cols[4].trim(),
      funding_source: cols[5].trim(),
      distribution_type: cols[6].trim(),
      risk_rating: risk,
      fund_fees_pct: toNumberOrNull(cols[8]),
      return_1y_pct: toNumberOrNull(cols[9]),
      return_3y_annualised_pct: toNumberOrNull(cols[10]),
      payout_1y_pct: cols.length > 11 ? toNumberOrNull(cols[11]) : null,
    });
  }
  _cache = out;
  return out;
}

/** Test helper — wipes the in-memory CSV cache. */
export function _resetEndowusFundsCacheForTests(): void {
  _cache = null;
}
