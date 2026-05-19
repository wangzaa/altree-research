// Regexes that detect opposite-lens content. The bull lens fails on any
// match in its system prompt OR injected post content; mirror for bear.
//
// HITL: these regexes are reviewer-gated. Do not edit without spec signoff
// recorded as a PR comment on the corpus-Stage-4 ticket.

export const BULL_DISALLOW: readonly RegExp[] = [
  /\bbear\b/i,
  /\bbearish\b/i,
  /\bdownside\b/i,
  /\bcounter[- ]evidence\b/i,
  /\bbreach(es)?\b/i,
  /bear_researcher/,
];

export const BEAR_DISALLOW: readonly RegExp[] = [
  /\bbull\b/i,
  /\bbullish\b/i,
  /\bupside\b/i,
  /\bsupporting evidence\b/i,
  /\bsupports?\b/i,
  /bull_researcher/,
];

export function disallowFor(lens: "bull" | "bear"): readonly RegExp[] {
  return lens === "bull" ? BULL_DISALLOW : BEAR_DISALLOW;
}

export function findFirstDisallowed(
  text: string,
  patterns: readonly RegExp[],
): RegExp | null {
  for (const p of patterns) if (p.test(text)) return p;
  return null;
}
