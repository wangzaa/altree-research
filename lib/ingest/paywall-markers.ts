// Substring patterns that indicate a Substack RSS item is the public excerpt
// of a paid post rather than the full content. Detection is conservative:
// false-negatives are acceptable (full content stored anyway); false-
// positives would mark full content as paywalled.

export const PAYWALL_MARKERS: readonly string[] = [
  "this post is for paid subscribers",
  "this post is for paying subscribers",
  "subscribe to read",
];

export function detectPaywall(text: string): boolean {
  const low = text.toLowerCase();
  return PAYWALL_MARKERS.some((m) => low.includes(m));
}
