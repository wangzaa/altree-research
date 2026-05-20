// Regexes that detect opposite-lens content. Two scopes:
//
// 1. SYSTEM_DISALLOW (broad) — applied to the system prompt only. The
//    prompt is OUR text; we can guarantee it doesn't say "bear" inside
//    the bull prompt. False positives here mean we wrote a bad prompt.
//
// 2. CORPUS_DISALLOW (narrow — agent identifiers only) — applied to the
//    injected corpus content. Real financial commentary uses "bear case",
//    "downside", "bullish" etc. routinely; filtering those would block
//    legitimate input. We only fail-closed on direct agent-identifier
//    leakage (the strings "bear_researcher" / "bull_researcher" should
//    NEVER appear in corpus content — if they do, something is very wrong).
//
// HITL: these regexes are reviewer-gated. Do not edit without spec signoff
// recorded as a PR comment on the corpus-Stage-4 ticket.

export const BULL_SYSTEM_DISALLOW: readonly RegExp[] = [
  /\bbear\b/i,
  /\bbearish\b/i,
  /\bdownside\b/i,
  /\bcounter[- ]evidence\b/i,
  /\bbreach(es)?\b/i,
  /bear_researcher/,
];

export const BEAR_SYSTEM_DISALLOW: readonly RegExp[] = [
  /\bbull\b/i,
  /\bbullish\b/i,
  /\bupside\b/i,
  /\bsupporting evidence\b/i,
  /\bsupports?\b/i,
  /bull_researcher/,
];

export const BULL_CORPUS_DISALLOW: readonly RegExp[] = [
  /bear_researcher/,
];

export const BEAR_CORPUS_DISALLOW: readonly RegExp[] = [
  /bull_researcher/,
];

export function systemDisallowFor(lens: "bull" | "bear"): readonly RegExp[] {
  return lens === "bull" ? BULL_SYSTEM_DISALLOW : BEAR_SYSTEM_DISALLOW;
}

export function corpusDisallowFor(lens: "bull" | "bear"): readonly RegExp[] {
  return lens === "bull" ? BULL_CORPUS_DISALLOW : BEAR_CORPUS_DISALLOW;
}

export function findFirstDisallowed(
  text: string,
  patterns: readonly RegExp[],
): RegExp | null {
  for (const p of patterns) if (p.test(text)) return p;
  return null;
}
