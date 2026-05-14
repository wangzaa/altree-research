export function sluggifyForThesis(source: string): string {
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (normalized.length === 0) {
    return "thesis";
  }

  let candidate = normalized.slice(0, 40).replace(/_+$/g, "");

  if (candidate.length === 0) {
    return "thesis";
  }

  if (/^[0-9]/.test(candidate)) {
    candidate = `t_${candidate}`;
  }

  if (candidate.length > 40) {
    candidate = candidate.slice(0, 40).replace(/_+$/g, "");
  }

  return candidate;
}
