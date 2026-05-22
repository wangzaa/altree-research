import { GICS_NODES } from "@/lib/data/gics";
import type {
  Falsification,
  IndustryDriver,
  Thesis,
} from "@/lib/schemas/thesis";
import type { Region } from "@/lib/data/regions";

export type ThesisBubble = {
  id: string;
  body: string;
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

function formatEstimate(value: number, unit: string): string {
  // Translate a few common units into conversational form.
  const u = unit.toLowerCase();
  if (u === "pct" || u === "percent" || u === "%") return `${value}%`;
  if (u === "bps") return `${value} bps`;
  return `${value} ${unit}`;
}

function legLabel(driver: IndustryDriver, index: number, total: number): string {
  // Pull a one-or-two-word handle out of the driver id for the soft anchor.
  // e.g. backlog_to_revenue → "backlog", supply_constraint_cpu → "CPUs",
  // memory_cycle_pricing → "memory".
  const id = driver.id.toLowerCase();
  if (id.includes("memory")) return "memory";
  if (id.includes("cpu")) return "CPUs";
  if (id.includes("gpu")) return "GPUs";
  if (id.includes("backlog")) return "backlog";
  if (id.includes("margin")) return "margins";
  if (id.includes("supply")) return "supply";
  if (id.includes("demand")) return "demand";
  if (id.includes("pricing")) return "pricing";
  if (id.includes("capacity")) return "capacity";
  if (id.includes("ev_") || id.includes("electrification")) return "electrification";
  if (id.includes("ai")) return "AI";
  // Fallback: convert snake_case to space-separated, lowercase. No driver id
  // should leak in raw form.
  const words = driver.id.replace(/_/g, " ").toLowerCase();
  return total === 1 ? words : `leg ${index + 1}`;
}

function tickerSentence(driver: IndustryDriver): string {
  if (!driver.tickers || driver.tickers.length === 0) return "";
  return ` Names expressing this: ${joinList(driver.tickers)}.`;
}

function legBody(
  driver: IndustryDriver,
  index: number,
  total: number,
): string {
  const handle = legLabel(driver, index, total);
  const central = formatEstimate(
    driver.central_estimate.value,
    driver.central_estimate.unit,
  );
  const breaks = formatEstimate(
    driver.thesis_breaks_below,
    driver.central_estimate.unit,
  );
  const tickers = tickerSentence(driver);
  return `On **${handle}**, ${driver.claim
    .replace(/\.$/, "")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())}. You're penciling in around ${central}, and you'd call this leg broken below ${breaks}.${tickers}`;
}

function killBody(f: Falsification): string {
  const primary = f.primary.replace(/\.$/, "");
  if (f.secondary) {
    const secondary = f.secondary.replace(/\.$/, "");
    return `What would kill it: ${primary}. Secondary signal: ${secondary}.`;
  }
  return `What would kill it: ${primary}.`;
}

function setupBody(t: Thesis): string {
  const regions = joinList(t.scope.regions.map(regionLabel));
  const sectors = joinList(t.scope.sectors.map(sectorLabel));
  const cap = formatCapFloor(t.scope.market_cap_min_usd);
  const horizon = t.horizon_years;
  // Strip the trailing period from the claim if present, then we add our own.
  const claim = t.claim.replace(/\.$/, "");
  return `${claim}, over the next ${horizon} year${horizon === 1 ? "" : "s"}. You're scoping to ${sectors} names above ${cap} across ${regions}, and the setup assumes ${t.macro_premise
    .replace(/^./, (c) => c.toLowerCase())
    .replace(/\.$/, "")}.`;
}

function closeBody(_t: Thesis): string {
  // Scoping-phase close per docs/tone/conversational-thesis. Invites the
  // kinds of edits the system can actually act on right now (regions,
  // angles, names, thresholds, horizon). Validation-register vocabulary
  // like "pressure-test" / "load-bearing" / "stress" is reserved for the
  // Insights/validation phase, where the system can deliver on it.
  return `Does that match the shape of what you're seeing? Anything you'd want to widen — another region, another angle, more names — or tighten before we move on?`;
}

export function thesisBubbles(t: Thesis): ThesisBubble[] {
  const bubbles: ThesisBubble[] = [
    { id: "opener", body: "Got it — let me play this back." },
    { id: "setup", body: setupBody(t) },
  ];

  const drivers = t.drivers.industry;
  if (drivers.length === 1) {
    bubbles.push({
      id: `leg-${drivers[0].id}`,
      body: legBody(drivers[0], 0, 1),
    });
  } else {
    bubbles.push({
      id: "legs-intro",
      body: `${drivers.length === 2 ? "Two legs" : `${drivers.length} legs`} to the story.`,
    });
    drivers.forEach((d, i) => {
      bubbles.push({
        id: `leg-${d.id}`,
        body: legBody(d, i, drivers.length),
      });
    });
  }

  bubbles.push({ id: "kill", body: killBody(t.falsification) });
  bubbles.push({ id: "close", body: closeBody(t) });

  return bubbles;
}
