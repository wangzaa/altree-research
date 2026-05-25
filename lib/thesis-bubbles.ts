import { GICS_NODES } from "@/lib/data/gics";
import type {
  Falsification,
  IndustryDriver,
  Thesis,
} from "@/lib/schemas/thesis";
import type { Region } from "@/lib/data/regions";

export type ThesisBubble = {
  id: string;
  /** Body text. May contain inline **bold** spans for thesis anchors;
   * the renderer is responsible for converting those to <strong>. */
  body: string;
};

export type ThesisBubblesOptions = {
  /** Optional ticker -> company name lookup. When present, every ticker
   * in the prose renders as "Company (TICKER)" instead of bare ticker. */
  tickerNames?: Record<string, string>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Schema-to-natural-language translators. Per docs/tone/conversational-thesis
// no raw enum values or schema field names ever surface to the user.
// ─────────────────────────────────────────────────────────────────────────────

const REGION_LABEL: Record<Region, string> = {
  US: "the US",
  CANADA: "Canada",
  LATAM: "Latin America",
  UK: "the UK",
  EUROZONE: "the Eurozone",
  NORDICS: "the Nordics",
  SWITZERLAND: "Switzerland",
  CEE: "Central and Eastern Europe",
  MIDDLE_EAST: "the Middle East",
  AFRICA: "Africa",
  JAPAN: "Japan",
  KOREA: "Korea",
  GREATER_CHINA: "Greater China",
  SOUTH_ASIA: "South Asia",
  SEA: "Southeast Asia",
  ANZ: "Australia and New Zealand",
};

function regionLabel(region: string): string {
  return (REGION_LABEL as Record<string, string>)[region] ?? region;
}

function sectorLabel(code: string): string {
  const node = GICS_NODES.find((n) => n.code === code);
  return node?.name ?? code;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function formatCapFloor(usd: number): string {
  if (usd >= 1_000_000_000) return `$${Math.round(usd / 1_000_000_000)}B`;
  if (usd >= 1_000_000) return `$${Math.round(usd / 1_000_000)}M`;
  return `$${usd.toLocaleString()}`;
}

/** Drops the legal-entity suffixes Yahoo and SEC databases append to
 * company names. Per v5: legal suffixes (`Co., Ltd.`, `Corp.`, `Inc.`,
 * etc.) shouldn't appear in conversational prose — they're a tell that
 * a database export landed in user-facing text. Order matters: longest
 * patterns first so `Co., Ltd.` is removed in one pass, not stripped to
 * `Co.,` and then to nothing. */
function stripLegalSuffix(name: string): string {
  const patterns: RegExp[] = [
    /,?\s*Co\.,?\s*Ltd\.?$/i,
    /,?\s*Co\.\s*,?\s*Ltd\.?$/i,
    /,?\s*S\.A\.B\.\s+de\s+C\.V\.$/i,
    /,?\s*Corporation$/i,
    /,?\s*Incorporated$/i,
    /,?\s*Limited$/i,
    /,?\s*Holdings?$/i,
    /,?\s*Group$/i,
    /,?\s*Corp\.?$/i,
    /,?\s*Inc\.?$/i,
    /,?\s*Ltd\.?$/i,
    /,?\s*LLC$/i,
    /,?\s*plc$/i,
    /,?\s*PLC$/i,
    /,?\s*S\.A\.$/i,
    /,?\s*N\.V\.$/i,
    /,?\s*S\.p\.A\.$/i,
    /,?\s*AG$/,
    /,?\s*SE$/,
    /,?\s*Oyj$/i,
    /,?\s*A\/S$/i,
  ];
  let out = name.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of patterns) {
      const next = out.replace(p, "").trim();
      if (next !== out && next.length > 0) {
        out = next;
        changed = true;
      }
    }
  }
  return out;
}

/** Renders a ticker as `Company (TICKER)` when a name is available, else
 * bare ticker. Per tone v3: opaque tickers hide category mismatches, so
 * inlining names is the mechanical enforcer of "surface category mismatches"
 * during scoping. */
function tickerLabel(
  ticker: string,
  tickerNames: Record<string, string> | undefined,
): string {
  const rawName = tickerNames?.[ticker];
  if (!rawName) return ticker;
  const name = stripLegalSuffix(rawName);
  // Where company name and ticker are effectively the same (AMD, IBM,
  // TSMC vs TSM), render just the ticker. Heuristic: name fits in <=4 chars
  // and matches the ticker prefix.
  const stripped = name.replace(/[^A-Za-z0-9]/g, "");
  if (stripped.length <= 4 && ticker.startsWith(stripped.toUpperCase())) {
    return ticker;
  }
  return `${name} (${ticker})`;
}

function thesisAnchor(driver: IndustryDriver): string {
  // Strip the `drv_` prefix that the extractor sometimes attaches to
  // driver ids — without this, the fallback emits "drv aging
  // demographics" verbatim into the readback (a v5 anti-pattern).
  const id = driver.id.toLowerCase().replace(/^drv_/, "");
  if (id.includes("memory")) return "memory";
  if (id.includes("cpu")) return "CPUs";
  if (id.includes("gpu")) return "GPUs";
  if (id.includes("backlog")) return "backlog";
  if (id.includes("margin")) return "margins";
  if (id.includes("supply")) return "supply";
  if (id.includes("demand")) return "demand";
  if (id.includes("pricing")) return "pricing";
  if (id.includes("capacity")) return "capacity";
  if (id.includes("hbm")) return "HBM";
  if (id.includes("dram")) return "DRAM";
  if (id.includes("nand")) return "NAND";
  if (id.includes("foundry")) return "foundry";
  if (id.includes("packaging")) return "packaging";
  if (id.includes("ev_") || id.includes("electrification")) return "electrification";
  if (id.includes("ai")) return "AI";
  // Fallback: snake_case → space-separated. The `drv_` prefix has already
  // been stripped above.
  return id.replace(/_/g, " ");
}

function tickerSentence(
  driver: IndustryDriver,
  tickerNames: Record<string, string> | undefined,
): string {
  if (!driver.tickers || driver.tickers.length === 0) return "";
  const labelled = driver.tickers.map((t) => tickerLabel(t, tickerNames));
  return ` Names expressing this: ${joinList(labelled)}.`;
}

function thesisBody(
  driver: IndustryDriver,
  index: number,
  total: number,
  tickerNames: Record<string, string> | undefined,
): string {
  const anchor = thesisAnchor(driver);
  const tickers = tickerSentence(driver, tickerNames);
  const headerLabel =
    total === 1 ? `**Thesis (${anchor}):**` : `**Thesis ${index + 1} (${anchor}):**`;
  // Sentence-case the claim — never leave it lowercase, which would signal
  // an enum slug got dropped raw into the prose. Per v5: target returns
  // and break thresholds DO NOT appear in the readback prose. They live
  // in JSON / show-details, and are referenced in Anti/Thesis where
  // genuinely needed.
  const claim = driver.claim
    .replace(/\.$/, "")
    .replace(/^./, (c) => c.toUpperCase());
  return `${headerLabel} ${claim}.${tickers}`;
}

function killBody(f: Falsification): string {
  // v5: kill conditions render as a bold header + simple-statement bullets.
  // Never "Primary:" / "Secondary signal:" — those were Label:value
  // patterns the v4 anti-pattern table called out.
  const items = [f.primary, f.secondary]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.replace(/\.$/, "").trim());
  const bullets = items.map((s) => `- ${s}`).join("\n");
  return `**What would kill it:**\n${bullets}`;
}

function setupBody(t: Thesis): string {
  const regions = joinList(t.scope.regions.map(regionLabel));
  const sectors = joinList(t.scope.sectors.map(sectorLabel));
  const cap = formatCapFloor(t.scope.market_cap_min_usd);
  const horizon = t.horizon_years;
  const claim = t.claim.replace(/\.$/, "");
  // Lower-case the leading char of the macro premise only — its body stays
  // as-written so any proper nouns inside it ("NATO," "Korean," etc.) keep
  // their casing.
  const macro = t.macro_premise
    .replace(/^./, (c) => c.toLowerCase())
    .replace(/\.$/, "");
  return `${claim}, over the next ${horizon} year${horizon === 1 ? "" : "s"}. You're scoping to ${sectors} names above ${cap} across ${regions}, and the setup assumes ${macro}.`;
}

function closeBody(_t: Thesis): string {
  // Scoping-phase close per docs/tone/conversational-thesis. Invites the
  // kinds of edits the system can actually act on right now.
  return `Does that match the shape of what you're seeing? Anything you'd want to widen — another region, another angle, more names — or tighten before we move on?`;
}

export function thesisBubbles(
  t: Thesis,
  options: ThesisBubblesOptions = {},
): ThesisBubble[] {
  const { tickerNames } = options;

  const bubbles: ThesisBubble[] = [
    { id: "opener", body: "Got it — let me play this back." },
    { id: "setup", body: setupBody(t) },
  ];

  const drivers = t.drivers.industry;
  if (drivers.length > 1) {
    const word = drivers.length === 2 ? "Two theses" : `${drivers.length} theses`;
    bubbles.push({
      id: "theses-intro",
      body: `${word} here.`,
    });
  }
  drivers.forEach((d, i) => {
    bubbles.push({
      id: `thesis-${d.id}`,
      body: thesisBody(d, i, drivers.length, tickerNames),
    });
  });

  bubbles.push({ id: "kill", body: killBody(t.falsification) });
  bubbles.push({ id: "close", body: closeBody(t) });

  return bubbles;
}
