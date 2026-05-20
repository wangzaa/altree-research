export interface GenerateUniverseIdInput {
  thesisId: string;
  existingIds: string[];
}

const SUFFIX_REGEX = /^_universe_(\d{2})$/;

export function generateUniverseId(input: GenerateUniverseIdInput): string {
  const prefix = `${input.thesisId}`;
  const used = new Set<number>();
  for (const id of input.existingIds) {
    if (!id.startsWith(prefix)) continue;
    const tail = id.slice(prefix.length);
    const m = tail.match(SUFFIX_REGEX);
    if (!m) continue;
    const n = Number.parseInt(m[1], 10);
    if (Number.isInteger(n) && n >= 1) used.add(n);
  }
  let next = 1;
  while (used.has(next)) next += 1;
  return `${prefix}_universe_${String(next).padStart(2, "0")}`;
}
