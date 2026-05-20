import type { Thesis } from "@/lib/schemas/thesis";

export type PathChange = {
  path: string;
  before?: unknown;
  after?: unknown;
};

export type ThesisDiff = {
  added: PathChange[];
  removed: PathChange[];
  changed: PathChange[];
};

const ENVELOPE_FIELDS = new Set<string>([
  "id",
  "version",
  "createdAt",
  "createdBy",
  "source_snippet",
]);

const SET_ARRAY_PATHS = new Set<string>([
  "scope.regions",
  "scope.sectors",
  "scope.tickers_seed",
  "scope.tickers_exclude",
]);

const KEYED_ARRAY_PATHS = new Set<string>(["drivers.industry"]);

function isObject(v: unknown): v is { [k: string]: unknown } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

function walkObject(
  a: unknown,
  b: unknown,
  path: string,
  diff: ThesisDiff,
): void {
  const aObj = isObject(a) ? a : {};
  const bObj = isObject(b) ? b : {};
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);

  for (const key of keys) {
    if (path === "" && ENVELOPE_FIELDS.has(key)) continue;
    const childPath = path === "" ? key : `${path}.${key}`;
    const av = aObj[key];
    const bv = bObj[key];

    if (av === undefined && bv !== undefined) {
      diff.added.push({ path: childPath, after: bv });
      continue;
    }
    if (av !== undefined && bv === undefined) {
      diff.removed.push({ path: childPath, before: av });
      continue;
    }
    if (Array.isArray(av) && Array.isArray(bv)) {
      walkArray(av, bv, childPath, diff);
      continue;
    }
    if (isObject(av) && isObject(bv)) {
      walkObject(av, bv, childPath, diff);
      continue;
    }
    if (!deepEqual(av, bv)) {
      diff.changed.push({ path: childPath, before: av, after: bv });
    }
  }
}

function walkArray(
  a: unknown[],
  b: unknown[],
  path: string,
  diff: ThesisDiff,
): void {
  if (SET_ARRAY_PATHS.has(path)) {
    const aJson = a.map((v) => JSON.stringify(v));
    const bJson = b.map((v) => JSON.stringify(v));
    const aSet = new Set(aJson);
    const bSet = new Set(bJson);
    for (let i = 0; i < a.length; i++) {
      if (!bSet.has(aJson[i])) {
        diff.removed.push({ path, before: a[i] });
      }
    }
    for (let i = 0; i < b.length; i++) {
      if (!aSet.has(bJson[i])) {
        diff.added.push({ path, after: b[i] });
      }
    }
    return;
  }

  if (KEYED_ARRAY_PATHS.has(path)) {
    const aMap = new Map<string, unknown>();
    const bMap = new Map<string, unknown>();
    for (const el of a) {
      if (isObject(el) && typeof el.id === "string") aMap.set(el.id, el);
    }
    for (const el of b) {
      if (isObject(el) && typeof el.id === "string") bMap.set(el.id, el);
    }
    for (const [id, el] of aMap) {
      if (!bMap.has(id)) {
        diff.removed.push({ path: `${path}[id=${id}]`, before: el });
      }
    }
    for (const [id, el] of bMap) {
      if (!aMap.has(id)) {
        diff.added.push({ path: `${path}[id=${id}]`, after: el });
      }
    }
    for (const [id, ae] of aMap) {
      const be = bMap.get(id);
      if (be !== undefined) {
        walkObject(ae, be, `${path}[id=${id}]`, diff);
      }
    }
    return;
  }

  // Positional fallback
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const childPath = `${path}[${i}]`;
    const av = a[i];
    const bv = b[i];
    if (av === undefined && bv !== undefined) {
      diff.added.push({ path: childPath, after: bv });
      continue;
    }
    if (av !== undefined && bv === undefined) {
      diff.removed.push({ path: childPath, before: av });
      continue;
    }
    if (Array.isArray(av) && Array.isArray(bv)) {
      walkArray(av, bv, childPath, diff);
      continue;
    }
    if (isObject(av) && isObject(bv)) {
      walkObject(av, bv, childPath, diff);
      continue;
    }
    if (!deepEqual(av, bv)) {
      diff.changed.push({ path: childPath, before: av, after: bv });
    }
  }
}

export function diffThesis(current: Thesis, proposed: Thesis): ThesisDiff {
  const diff: ThesisDiff = { added: [], removed: [], changed: [] };
  walkObject(current as unknown, proposed as unknown, "", diff);
  return diff;
}
