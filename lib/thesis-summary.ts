import { GICS_NODES } from "@/lib/data/gics";
import type { IndustryDriver, Thesis } from "@/lib/schemas/thesis";

function gicsName(code: string): string {
  const node = GICS_NODES.find((n) => n.code === code);
  return node?.name ?? code;
}

function formatMarketCap(usd: number): string {
  if (usd >= 1_000_000_000) return `$${Math.round(usd / 1_000_000_000)}B`;
  if (usd >= 1_000_000) return `$${Math.round(usd / 1_000_000)}M`;
  return `$${usd}`;
}

function summariseDriver(driver: IndustryDriver, index: number): string {
  const tickerSuffix =
    driver.tickers && driver.tickers.length > 0
      ? `. Applies to: ${driver.tickers.join(", ")}`
      : "";
  return `${index + 1}. ${driver.id} — ${driver.claim}. Central estimate ${driver.central_estimate.value} ${driver.central_estimate.unit}; thesis breaks below ${driver.thesis_breaks_below}${tickerSuffix}.`;
}

export function summariseThesis(t: Thesis): string {
  const scope = t.scope;
  const regions = scope.regions.join(", ");
  const sectors = scope.sectors.map(gicsName).join(", ");
  const cap = formatMarketCap(scope.market_cap_min_usd);

  const driverLines = t.drivers.industry
    .map((d, i) => summariseDriver(d, i))
    .join("\n");

  const falsification = t.falsification.secondary
    ? `${t.falsification.primary}. Secondary: ${t.falsification.secondary}.`
    : `${t.falsification.primary}.`;

  return [
    `Your thesis: "${t.claim}"`,
    "",
    `Macro premise: ${t.macro_premise}.`,
    `Horizon: ${t.horizon_years} years.`,
    `Scope: ${regions}; sectors ${sectors}; market cap > ${cap}.`,
    "",
    "Drivers:",
    driverLines,
    "",
    `Falsification: ${falsification}`,
  ].join("\n");
}
