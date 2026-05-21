import { GICS_NODES } from "@/lib/data/gics";
import type {
  Falsification,
  IndustryDriver,
  Thesis,
} from "@/lib/schemas/thesis";

export type ThesisBubble = {
  id: string;
  label?: string;
  body: string;
};

function gicsName(code: string): string {
  const node = GICS_NODES.find((n) => n.code === code);
  return node?.name ?? code;
}

function formatMarketCap(usd: number): string {
  if (usd >= 1_000_000_000) return `$${Math.round(usd / 1_000_000_000)}B`;
  if (usd >= 1_000_000) return `$${Math.round(usd / 1_000_000)}M`;
  return `$${usd}`;
}

function scopeBody(t: Thesis): string {
  const regions = t.scope.regions.join(", ");
  const sectors = t.scope.sectors.map(gicsName).join(", ");
  const cap = formatMarketCap(t.scope.market_cap_min_usd);
  return [
    `Horizon: ${t.horizon_years} years`,
    `Regions: ${regions}`,
    `Sectors: ${sectors}`,
    `Market cap > ${cap}`,
  ].join("\n");
}

function driverBody(d: IndustryDriver): string {
  const lines = [
    d.claim,
    `Central estimate: ${d.central_estimate.value} ${d.central_estimate.unit}`,
    `Thesis breaks below: ${d.thesis_breaks_below}`,
  ];
  if (d.tickers && d.tickers.length > 0) {
    lines.push(`Tickers: ${d.tickers.join(", ")}`);
  }
  return lines.join("\n");
}

function falsificationBody(f: Falsification): string {
  const lines = [`Primary: ${f.primary}`];
  if (f.secondary) lines.push(`Secondary: ${f.secondary}`);
  return lines.join("\n");
}

export function thesisBubbles(t: Thesis): ThesisBubble[] {
  const bubbles: ThesisBubble[] = [
    {
      id: "intro",
      body: "Here's the thesis I extracted from your snippet.",
    },
    { id: "claim", label: "Claim", body: t.claim },
    { id: "macro", label: "Macro premise", body: t.macro_premise },
    { id: "scope", label: "Scope", body: scopeBody(t) },
  ];

  t.drivers.industry.forEach((d, i) => {
    bubbles.push({
      id: `driver-${d.id}`,
      label: `Driver ${i + 1}: ${d.id}`,
      body: driverBody(d),
    });
  });

  bubbles.push({
    id: "negate",
    label: "Negate",
    body: falsificationBody(t.falsification),
  });

  return bubbles;
}
