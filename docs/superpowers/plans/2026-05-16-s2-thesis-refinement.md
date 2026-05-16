# S2 — Thesis NL Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user refine an existing draft thesis with a natural-language instruction, preview a structured JSON diff, and Apply (persist) or Cancel. Apply bumps `theses.version` in place.

**Architecture:** One new agent (`thesis-refiner`, mirrors `thesis-extractor`), one new pure diff util (`thesis-diff`), one new API route (`POST /api/thesis/refine`), one new HTTP verb on the existing `[id]` route (`PATCH`), one new client component (`ThesisEditor`), one page edit to mount the editor. No schema changes — the existing `theses.version` integer column is bumped in place.

**Tech Stack:** Next.js 15 App Router · TypeScript · Vitest · React Testing Library · Tailwind · Supabase Postgres (via `getSupabaseServerClient`) · Better Auth (via `getCurrentUser`) · Anthropic SDK (via `lib/anthropic/client.ts` seam).

**Spec:** [docs/superpowers/specs/2026-05-16-thesis-refinement-design.md](../specs/2026-05-16-thesis-refinement-design.md)

**GitHub issue:** [#3](https://github.com/wangzaa/altree-research/issues/3)

**Working branch:** `s1-walking-skeleton` (continue on it — S1 is closed and S2 builds directly on it; no new branch).

---

## Preconditions

Before starting Task 1, audit the working tree:

```bash
git status --short
```

There are uncommitted changes from the S1 close-out (test dep install, `dev` script `unset` prefix) **plus** pre-existing modifications that were already present at session start (`app/api/thesis/extract/route.ts`, `next.config.ts`). Do not mingle them with S2 work.

Run:

```bash
git add package.json package-lock.json
git diff --staged | head -50    # sanity-check what's staged
git commit -m "chore(s1): install @testing-library/dom; unset ANTHROPIC_API_KEY in dev script

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Leave `app/api/thesis/extract/route.ts`, `next.config.ts`, and untracked `.claude/` alone — they are out of S2 scope.

Confirm tests are green before touching new code:

```bash
npm test
```

Expected: 15 test files, 101 tests passing.

---

## File Structure

**New files:**
- `tests/fixtures/thesis.ts` — shared canonical `Thesis` fixture (Task 1).
- `lib/diff/thesis-diff.ts` — pure `diffThesis(current, proposed)` (Task 2).
- `tests/diff/thesis-diff.test.ts` — unit tests for the diff util (Task 2).
- `lib/agents/thesis-refiner.ts` — refine agent (Task 3).
- `tests/agents/thesis-refiner.test.ts` — agent tests (Task 3).
- `app/api/thesis/refine/route.ts` — POST refine endpoint (Task 4).
- `tests/api/thesis-refine.test.ts` — route tests (Task 4).
- `tests/api/thesis-patch.test.ts` — PATCH route tests (Task 5).
- `components/thesis-editor.tsx` — refinement UI (Task 6).
- `tests/components/thesis-editor.test.tsx` — UI tests (Task 6).

**Modified files:**
- `app/api/thesis/[id]/route.ts` — add `PATCH` handler (Task 5).
- `app/thesis/[id]/page.tsx` — mount `<ThesisEditor>` (Task 7).

---

## Task 1: Shared canonical thesis fixture

**Why first:** Tasks 2–6 all need a known-good `Thesis` to diff against, refine from, and persist. Inlining it five times across test files duplicates ~60 lines; one shared fixture file keeps later tasks tight.

**Files:**
- Create: `tests/fixtures/thesis.ts`

- [ ] **Step 1.1: Write the fixture module**

Create `tests/fixtures/thesis.ts`:

```ts
import type { Thesis } from "@/lib/schemas/thesis";

export const FIXED_NOW = new Date("2026-05-14T12:00:00.000Z");

export const canonicalThesis: Thesis = {
  id: "eu_defense_rearmament_cycle_26_05_01",
  version: 1,
  createdAt: FIXED_NOW.toISOString(),
  createdBy: "user_abc123",
  source_snippet: "EU defense rearmament cycle.",
  claim:
    "EU defense capex cycle benefits primes with multi-year backlog visibility",
  macro_premise:
    "EU defense rearmament continues; NATO 3% commitment holds through 2030",
  horizon_years: 5,
  scope: {
    type: "thematic",
    sectors: ["20101010"],
    regions: ["EUROZONE", "UK", "NON_EZ_DM_EU"],
    market_cap_min_usd: 1_000_000_000,
    tickers_seed: ["RHM.DE", "BA.L", "LDO.MI"],
    tickers_exclude: [],
  },
  drivers: {
    industry: [
      {
        id: "backlog_to_revenue",
        claim: "Sector backlog/revenue >= 2y sustained",
        central_estimate: { value: 3.0, unit: "years" },
        thesis_breaks_below: 1.5,
        evidence: [],
        verdict: null,
        classification: "industry",
      },
    ],
  },
  falsification: {
    primary:
      "NATO 3% commitment formally rolled back, OR EU procurement budget cut >20% YoY",
    secondary: "Sector backlog/revenue <1.5y for 2 consecutive quarters",
  },
  universe_id: "eu_defense_global",
  validation: {
    status: "draft",
    verdict: null,
    last_validated_at: null,
    open_tensions: [],
  },
};

/**
 * Returns a deep clone so test mutations don't bleed across cases.
 */
export function cloneCanonicalThesis(): Thesis {
  return structuredClone(canonicalThesis);
}
```

- [ ] **Step 1.2: Verify the fixture type-checks**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 1.3: Commit**

```bash
git add tests/fixtures/thesis.ts
git commit -m "test(s2): shared canonical thesis fixture for diff/refiner tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `lib/diff/thesis-diff.ts`

**What it does:** Pure function `diffThesis(current, proposed) -> ThesisDiff`. Walks the tree, emits `{added, removed, changed}` arrays of `{path, before?, after?}` entries. Hard-codes per-path comparison modes (set / keyed-by-id / positional). Excludes immutable envelope fields (`id`, `version`, `createdAt`, `createdBy`, `source_snippet`).

**Files:**
- Create: `tests/diff/thesis-diff.test.ts`
- Create: `lib/diff/thesis-diff.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `tests/diff/thesis-diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { diffThesis } from "@/lib/diff/thesis-diff";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

describe("diffThesis", () => {
  it("returns an empty diff for identical inputs", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("ignores envelope fields (id, version, createdAt, createdBy, source_snippet)", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.id = "different_id_26_05_99";
    b.version = 42;
    b.createdAt = "2099-12-31T00:00:00.000Z";
    b.createdBy = "someone_else";
    b.source_snippet = "totally different prose";
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("emits a single 'changed' entry for a scalar field change", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.drivers.industry[0].thesis_breaks_below = 1.5;
    a.drivers.industry[0].thesis_breaks_below = 2.5;
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([
      {
        path: "drivers.industry[id=backlog_to_revenue].thesis_breaks_below",
        before: 2.5,
        after: 1.5,
      },
    ]);
  });

  it("treats scope.regions as a set: pushed element shows up as 'added'", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.scope.regions = [...a.scope.regions, "JAPAN"];
    const diff = diffThesis(a, b);
    expect(diff.changed).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual([{ path: "scope.regions", after: "JAPAN" }]);
  });

  it("treats scope.regions as a set: removed element shows up as 'removed'", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.scope.regions = a.scope.regions.filter((r) => r !== "UK");
    const diff = diffThesis(a, b);
    expect(diff.changed).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([{ path: "scope.regions", before: "UK" }]);
  });

  it("treats scope.regions as a set: reorder alone is not a change", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.scope.regions = [...a.scope.regions].reverse();
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("treats drivers.industry as keyed-by-id: new id shows up as 'added'", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    const newDriver = {
      id: "operating_margin",
      claim: "Sector operating margin expands to >12% by 2028",
      central_estimate: { value: 12, unit: "pct" },
      thesis_breaks_below: 8,
      evidence: [],
      verdict: null,
      classification: "industry" as const,
    };
    b.drivers.industry.push(newDriver);
    const diff = diffThesis(a, b);
    expect(diff.changed).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual([
      { path: "drivers.industry[id=operating_margin]", after: newDriver },
    ]);
  });

  it("treats drivers.industry as keyed-by-id: changed scalar field nests under id", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.drivers.industry[0].claim = "Sector backlog/revenue >= 2.5y sustained";
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([
      {
        path: "drivers.industry[id=backlog_to_revenue].claim",
        before: "Sector backlog/revenue >= 2y sustained",
        after: "Sector backlog/revenue >= 2.5y sustained",
      },
    ]);
  });

  it("emits added/removed for nested optional fields appearing or disappearing", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    delete (b.falsification as { secondary?: string }).secondary;
    const diff = diffThesis(a, b);
    expect(diff.changed).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([
      { path: "falsification.secondary", before: a.falsification.secondary },
    ]);
  });

  it("emits a 'changed' entry per leaf for nested object replacement", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.falsification = {
      primary: "Different primary falsifier",
      secondary: "Different secondary falsifier",
    };
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toHaveLength(2);
    expect(diff.changed).toContainEqual({
      path: "falsification.primary",
      before: a.falsification.primary,
      after: "Different primary falsifier",
    });
    expect(diff.changed).toContainEqual({
      path: "falsification.secondary",
      before: a.falsification.secondary,
      after: "Different secondary falsifier",
    });
  });

  it("collects multiple unrelated changes in one diff", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    b.scope.regions = [...a.scope.regions, "JAPAN"];
    b.drivers.industry[0].thesis_breaks_below = 1.0;
    a.drivers.industry[0].thesis_breaks_below = 1.5;
    b.claim = "Refined claim text";
    const diff = diffThesis(a, b);
    expect(diff.added).toEqual([{ path: "scope.regions", after: "JAPAN" }]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toHaveLength(2);
    expect(diff.changed).toContainEqual({
      path: "drivers.industry[id=backlog_to_revenue].thesis_breaks_below",
      before: 1.5,
      after: 1.0,
    });
    expect(diff.changed).toContainEqual({
      path: "claim",
      before: a.claim,
      after: "Refined claim text",
    });
  });

  it("returns a result whose arrays are all defined even when empty", () => {
    const a = cloneCanonicalThesis();
    const b = cloneCanonicalThesis();
    const diff = diffThesis(a, b);
    expect(Array.isArray(diff.added)).toBe(true);
    expect(Array.isArray(diff.removed)).toBe(true);
    expect(Array.isArray(diff.changed)).toBe(true);
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/diff/thesis-diff.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/diff/thesis-diff'".

- [ ] **Step 2.3: Write the implementation**

Create `lib/diff/thesis-diff.ts`:

```ts
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

type Json =
  | null
  | string
  | number
  | boolean
  | Json[]
  | { [k: string]: Json };

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
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run:

```bash
npx vitest run tests/diff/thesis-diff.test.ts
```

Expected: PASS — all 12 tests green.

- [ ] **Step 2.5: Commit**

```bash
git add lib/diff/thesis-diff.ts tests/diff/thesis-diff.test.ts
git commit -m "feat(s2): pure thesis-diff util with set/keyed-by-id/positional modes

Walks Thesis JSON producing { added, removed, changed } path-keyed
entries. Hard-codes per-path array comparison modes (scope.* as set,
drivers.industry as keyed-by-id, others positional). Excludes
immutable envelope fields (id, version, createdAt, createdBy,
source_snippet).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `lib/agents/thesis-refiner.ts`

**What it does:** Forced `tool_use` against Anthropic. Tool input mirrors `ThesisSchema`. System prompt explains: receive current thesis + instruction, propose new thesis applying only the requested change. Returns `{ok: true, thesis} | {ok: false, error, raw?}` after Zod validation; envelope fields (`id`, `version`, `createdAt`, `createdBy`, `source_snippet`) are restored from the caller's `current` thesis after the model returns — defense in depth against model hallucination.

**Files:**
- Create: `tests/agents/thesis-refiner.test.ts`
- Create: `lib/agents/thesis-refiner.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `tests/agents/thesis-refiner.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const createMessageMock = vi.fn();

vi.mock("@/lib/anthropic/client", () => ({
  createMessage: createMessageMock,
}));

function toolInputFromThesis(t: ReturnType<typeof cloneCanonicalThesis>) {
  return {
    claim: t.claim,
    macro_premise: t.macro_premise,
    horizon_years: t.horizon_years,
    scope: t.scope,
    drivers: {
      industry: t.drivers.industry.map((d) => ({
        id: d.id,
        claim: d.claim,
        central_estimate: d.central_estimate,
        thesis_breaks_below: d.thesis_breaks_below,
        classification: d.classification,
      })),
    },
    falsification: t.falsification,
    universe_id: t.universe_id,
  };
}

function mockToolUse(input: unknown) {
  createMessageMock.mockResolvedValueOnce({
    content: [
      { type: "tool_use", id: "toolu_1", name: "propose_thesis", input },
    ],
    stop_reason: "tool_use",
    usage: { input_tokens: 100, output_tokens: 50 },
    raw: {},
  });
}

describe("refineThesis", () => {
  beforeEach(() => {
    createMessageMock.mockReset();
  });

  it("returns ok:true with parsed proposed thesis on happy path", async () => {
    const current = cloneCanonicalThesis();
    const toolInput = toolInputFromThesis(current);
    toolInput.scope.regions = [...current.scope.regions, "JAPAN"];
    mockToolUse(toolInput);

    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({
      current,
      instruction: "add Japan to regions",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.thesis.scope.regions).toContain("JAPAN");
    expect(result.thesis.id).toBe(current.id);
    expect(result.thesis.version).toBe(current.version);
    expect(result.thesis.createdAt).toBe(current.createdAt);
    expect(result.thesis.createdBy).toBe(current.createdBy);
    expect(result.thesis.source_snippet).toBe(current.source_snippet);
  });

  it("forces tool use via tool_choice and includes current thesis + instruction in user content", async () => {
    const current = cloneCanonicalThesis();
    mockToolUse(toolInputFromThesis(current));

    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    await refineThesis({ current, instruction: "tighten the M1 break to 1.5" });

    expect(createMessageMock).toHaveBeenCalledTimes(1);
    const call = createMessageMock.mock.calls[0][0];
    expect(call.tool_choice).toEqual({ type: "tool", name: "propose_thesis" });
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].name).toBe("propose_thesis");
    expect(Array.isArray(call.system)).toBe(true);
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0].role).toBe("user");
    const userContent = call.messages[0].content as string;
    expect(userContent).toContain("tighten the M1 break to 1.5");
    expect(userContent).toContain(current.claim);
    expect(userContent).toContain(current.id);
  });

  it("preserves envelope fields from caller's current even when model hallucinates them", async () => {
    const current = cloneCanonicalThesis();
    const toolInput = toolInputFromThesis(current);
    mockToolUse({
      ...toolInput,
      id: "WRONG_ID_99_99_99",
      version: 999,
      createdAt: "1999-01-01T00:00:00.000Z",
      createdBy: "imposter",
      source_snippet: "different snippet",
    } as unknown);

    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({ current, instruction: "noop" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.thesis.id).toBe(current.id);
    expect(result.thesis.version).toBe(current.version);
    expect(result.thesis.createdAt).toBe(current.createdAt);
    expect(result.thesis.createdBy).toBe(current.createdBy);
    expect(result.thesis.source_snippet).toBe(current.source_snippet);
  });

  it("returns ok:false when no tool_use block exists", async () => {
    createMessageMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "sorry, I cannot help" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
      raw: {},
    });
    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({
      current: cloneCanonicalThesis(),
      instruction: "x",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
  });

  it("returns ok:false when tool_use has the wrong tool name", async () => {
    createMessageMock.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "extract_thesis",
          input: toolInputFromThesis(cloneCanonicalThesis()),
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 5 },
      raw: {},
    });
    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({
      current: cloneCanonicalThesis(),
      instruction: "x",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
  });

  it("returns ok:false when tool_use.input is not an object", async () => {
    mockToolUse("not an object");
    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({
      current: cloneCanonicalThesis(),
      instruction: "x",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tool_use/i);
    expect(result.raw).toBe("not an object");
  });

  it("returns ok:false with zod error when proposed thesis violates schema", async () => {
    const current = cloneCanonicalThesis();
    const bad = toolInputFromThesis(current) as Record<string, unknown>;
    delete bad.claim;
    mockToolUse(bad);
    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({ current, instruction: "drop the claim" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
    expect(result.raw).toEqual(bad);
  });

  it("returns ok:false on unknown region in proposed thesis", async () => {
    const current = cloneCanonicalThesis();
    const bad = toolInputFromThesis(current);
    bad.scope.regions = ["MARS"] as unknown as typeof bad.scope.regions;
    mockToolUse(bad);
    const { refineThesis } = await import("@/lib/agents/thesis-refiner");
    const result = await refineThesis({ current, instruction: "add Mars" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toMatch(/region/);
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/agents/thesis-refiner.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/agents/thesis-refiner'".

- [ ] **Step 3.3: Write the implementation**

Create `lib/agents/thesis-refiner.ts`:

```ts
import {
  createMessage,
  type AnthropicContentBlock,
  type AnthropicTextBlockParam,
  type AnthropicTool,
  type AnthropicToolUse,
} from "@/lib/anthropic/client";
import { REGION_VALUES } from "@/lib/data/regions";
import { ThesisSchema, type Thesis } from "@/lib/schemas/thesis";

export interface RefineThesisInput {
  current: Thesis;
  instruction: string;
}

export type RefineThesisResult =
  | { ok: true; thesis: Thesis }
  | { ok: false; error: string; raw?: unknown };

const TOOL_NAME = "propose_thesis";

const refineThesisTool: AnthropicTool = {
  name: TOOL_NAME,
  description:
    "Return a structured investment thesis that incorporates the analyst's instruction. Only call this tool. Do not return free-text.",
  input_schema: {
    type: "object",
    properties: {
      claim: { type: "string" },
      macro_premise: { type: "string" },
      horizon_years: { type: "integer", minimum: 1, maximum: 30 },
      scope: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["thematic", "single_name"] },
          sectors: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
          regions: {
            type: "array",
            items: { type: "string", enum: [...REGION_VALUES] },
            minItems: 1,
          },
          market_cap_min_usd: { type: "number", minimum: 0 },
          tickers_seed: { type: "array", items: { type: "string" } },
          tickers_exclude: { type: "array", items: { type: "string" } },
        },
        required: [
          "type",
          "sectors",
          "regions",
          "market_cap_min_usd",
          "tickers_seed",
          "tickers_exclude",
        ],
      },
      drivers: {
        type: "object",
        properties: {
          industry: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                claim: { type: "string" },
                central_estimate: {
                  type: "object",
                  properties: {
                    value: { type: "number" },
                    unit: { type: "string" },
                  },
                  required: ["value", "unit"],
                },
                thesis_breaks_below: { type: "number" },
                classification: { type: "string", enum: ["industry"] },
              },
              required: [
                "id",
                "claim",
                "central_estimate",
                "thesis_breaks_below",
                "classification",
              ],
            },
          },
        },
        required: ["industry"],
      },
      falsification: {
        type: "object",
        properties: {
          primary: { type: "string" },
          secondary: { type: "string" },
        },
        required: ["primary"],
      },
      universe_id: { type: "string" },
    },
    required: [
      "claim",
      "macro_premise",
      "horizon_years",
      "scope",
      "drivers",
      "falsification",
      "universe_id",
    ],
  },
};

const systemBlocks: AnthropicTextBlockParam[] = [
  {
    type: "text",
    text: `You are a research analyst refining an existing investment thesis.

You receive the current thesis as JSON and an instruction from the analyst. Propose a new thesis that applies ONLY the change the instruction asks for. Leave every other field exactly as it was.

Rules:
- Be conservative — only change what the instruction explicitly requests.
- Preserve all driver \`id\` fields. Do not rename, reorder, or replace driver ids.
- GICS sector codes must be 2/4/6/8 digit numerics from the standard taxonomy.
- Region codes are: US, UK, EUROZONE, NON_EZ_DM_EU, JAPAN, ASIA_DM, ASIA_EM, AMERICAS_NON_US, ANZ_DM.
- Yahoo tickers use suffixes (RHM.DE = Germany, BA.L = UK, 7203.T = Japan, etc).
- thesis_breaks_below must remain strictly less than the central_estimate value.
- falsification.primary is required; falsification.secondary is optional.
- horizon_years should remain in the existing range unless the instruction asks to change it.
- Return the full new thesis via the supplied tool. Do not return free-text.`,
    cache_control: { type: "ephemeral" },
  },
];

interface ToolDriverInput {
  id: string;
  claim: string;
  central_estimate: { value: number; unit: string };
  thesis_breaks_below: number;
  classification: "industry";
}

interface ToolThesisInput {
  claim: string;
  macro_premise: string;
  horizon_years: number;
  scope: unknown;
  drivers: { industry: ToolDriverInput[] };
  falsification: { primary: string; secondary?: string };
  universe_id: string;
}

function findToolUse(
  content: AnthropicContentBlock[],
): AnthropicToolUse | undefined {
  for (const block of content) {
    if (block.type === "tool_use" && block.name === TOOL_NAME) {
      return block;
    }
  }
  return undefined;
}

function buildUserMessage(current: Thesis, instruction: string): string {
  return `Current thesis:
\`\`\`json
${JSON.stringify(current, null, 2)}
\`\`\`

Instruction: ${instruction}`;
}

export async function refineThesis(
  input: RefineThesisInput,
): Promise<RefineThesisResult> {
  const result = await createMessage({
    system: systemBlocks,
    tools: [refineThesisTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: buildUserMessage(input.current, input.instruction),
      },
    ],
  });

  const toolUse = findToolUse(result.content);
  if (!toolUse) {
    return { ok: false, error: "Model did not produce a propose_thesis tool_use block" };
  }
  if (
    typeof toolUse.input !== "object" ||
    toolUse.input === null ||
    Array.isArray(toolUse.input)
  ) {
    return {
      ok: false,
      error: "tool_use.input was not an object",
      raw: toolUse.input,
    };
  }

  const toolInput = toolUse.input as ToolThesisInput;
  const driversInput = toolInput.drivers?.industry ?? [];

  // Envelope fields are restored from caller's current — defense in depth.
  const merged = {
    id: input.current.id,
    version: input.current.version,
    createdAt: input.current.createdAt,
    createdBy: input.current.createdBy,
    source_snippet: input.current.source_snippet,
    claim: toolInput.claim,
    macro_premise: toolInput.macro_premise,
    horizon_years: toolInput.horizon_years,
    scope: toolInput.scope,
    drivers: {
      industry: driversInput.map((d) => {
        const existing = input.current.drivers.industry.find(
          (cur) => cur.id === d.id,
        );
        return {
          ...d,
          evidence: existing?.evidence ?? [],
          verdict: existing?.verdict ?? null,
        };
      }),
    },
    falsification: toolInput.falsification,
    universe_id: toolInput.universe_id,
    validation: input.current.validation,
  };

  const parsed = ThesisSchema.safeParse(merged);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.message,
      raw: toolUse.input,
    };
  }
  return { ok: true, thesis: parsed.data };
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run:

```bash
npx vitest run tests/agents/thesis-refiner.test.ts
```

Expected: PASS — all 8 tests green.

- [ ] **Step 3.5: Commit**

```bash
git add lib/agents/thesis-refiner.ts tests/agents/thesis-refiner.test.ts
git commit -m "feat(s2): thesis-refiner agent mirroring extractor

Forced tool_use against 'propose_thesis' tool whose schema mirrors
ThesisSchema. System prompt: apply only the requested change, leave
everything else unchanged, preserve driver ids. Envelope fields
(id/version/createdAt/createdBy/source_snippet) restored from caller
post-model — defense in depth. Per-driver evidence/verdict preserved
by id from current thesis.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `POST /api/thesis/refine`

**What it does:** Validates body, resolves session, fetches current thesis (owner-scoped), calls `refineThesis`, computes `diffThesis(current, proposed)`, returns `{current, proposed, diff}`. Does not write.

**Files:**
- Create: `tests/api/thesis-refine.test.ts`
- Create: `app/api/thesis/refine/route.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `tests/api/thesis-refine.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const getCurrentUserMock = vi.fn();
const refineThesisMock = vi.fn();

const eqMaybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: eqMaybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));
const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/agents/thesis-refiner", () => ({
  refineThesis: refineThesisMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/thesis/refine", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/thesis/refine", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    refineThesisMock.mockReset();
    fromMock.mockClear();
    selectMock.mockClear();
    eqMock.mockClear();
    eqMaybeSingleMock.mockReset();
  });

  it("returns 400 when body is invalid JSON", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is missing thesis_id or instruction", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(makeRequest({ thesis_id: "x_26_05_01" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({
        thesis_id: "eu_defense_rearmament_cycle_26_05_01",
        instruction: "add JAPAN",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when thesis not found", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    eqMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({
        thesis_id: "eu_defense_rearmament_cycle_26_05_01",
        instruction: "add JAPAN",
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 404 when thesis belongs to a different user", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: current.id, user_id: "other_user", thesis: current },
      error: null,
    });
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({ thesis_id: current.id, instruction: "x" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 when refineThesis fails Zod validation", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: current.id, user_id: current.createdBy, thesis: current },
      error: null,
    });
    refineThesisMock.mockResolvedValue({
      ok: false,
      error: "Invalid scope.regions",
      raw: { scope: { regions: ["MARS"] } },
    });
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({ thesis_id: current.id, instruction: "add Mars" }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_thesis");
    expect(body.detail).toBe("Invalid scope.regions");
  });

  it("returns 502 when refineThesis throws", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: current.id, user_id: current.createdBy, thesis: current },
      error: null,
    });
    refineThesisMock.mockRejectedValue(new Error("anthropic 500"));
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({ thesis_id: current.id, instruction: "x" }),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("refine_failed");
  });

  it("returns 200 with current/proposed/diff on happy path", async () => {
    const current = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...current.scope.regions, "JAPAN"];

    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: current.id, user_id: current.createdBy, thesis: current },
      error: null,
    });
    refineThesisMock.mockResolvedValue({ ok: true, thesis: proposed });

    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({ thesis_id: current.id, instruction: "add JAPAN" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.current).toEqual(current);
    expect(body.proposed).toEqual(proposed);
    expect(body.diff.added).toEqual([
      { path: "scope.regions", after: "JAPAN" },
    ]);
    expect(body.diff.removed).toEqual([]);
    expect(body.diff.changed).toEqual([]);

    expect(refineThesisMock).toHaveBeenCalledWith({
      current,
      instruction: "add JAPAN",
    });
  });

  it("returns 200 with empty diff when proposed equals current (no-op instruction)", async () => {
    const current = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: current.id, user_id: current.createdBy, thesis: current },
      error: null,
    });
    refineThesisMock.mockResolvedValue({ ok: true, thesis: proposed });
    const { POST } = await import("@/app/api/thesis/refine/route");
    const res = await POST(
      makeRequest({ thesis_id: current.id, instruction: "no changes" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.diff.added).toEqual([]);
    expect(body.diff.removed).toEqual([]);
    expect(body.diff.changed).toEqual([]);
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/api/thesis-refine.test.ts
```

Expected: FAIL with "Cannot find module '@/app/api/thesis/refine/route'".

- [ ] **Step 4.3: Write the implementation**

Create `app/api/thesis/refine/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { refineThesis } from "@/lib/agents/thesis-refiner";
import { getCurrentUser } from "@/lib/auth/session";
import { diffThesis } from "@/lib/diff/thesis-diff";
import { ThesisIdSchema, type Thesis } from "@/lib/schemas/thesis";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  thesis_id: ThesisIdSchema,
  instruction: z.string().min(1).max(2_000),
});

export async function POST(req: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const { thesis_id, instruction } = parsed.data;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("theses")
      .select("*")
      .eq("id", thesis_id)
      .maybeSingle();

    if (error || !data || data.user_id !== user.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const current = data.thesis as Thesis;

    let result;
    try {
      result = await refineThesis({ current, instruction });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[/api/thesis/refine] refine_failed:", message);
      return NextResponse.json({ error: "refine_failed" }, { status: 502 });
    }

    if (!result.ok) {
      return NextResponse.json(
        { error: "invalid_thesis", detail: result.error, raw: result.raw ?? null },
        { status: 422 },
      );
    }

    const diff = diffThesis(current, result.thesis);
    return NextResponse.json(
      { current, proposed: result.thesis, diff },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/thesis/refine] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", details: message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run:

```bash
npx vitest run tests/api/thesis-refine.test.ts
```

Expected: PASS — all 9 tests green.

- [ ] **Step 4.5: Commit**

```bash
git add app/api/thesis/refine/route.ts tests/api/thesis-refine.test.ts
git commit -m "feat(s2): POST /api/thesis/refine returning {current, proposed, diff}

Validates body, resolves session, owner-scoped fetch, calls refiner,
computes path-keyed diff, returns 200. Error matrix: 400 invalid_body,
401 unauthenticated, 404 not_found, 422 invalid_thesis, 502
refine_failed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `PATCH /api/thesis/[id]`

**What it does:** Body is the proposed thesis JSON. Validates with `ThesisSchema`, asserts `body.id === param.id`, owner-scoped fetch, then updates `thesis` jsonb and increments `version`. Returns the updated row.

**Files:**
- Modify: `app/api/thesis/[id]/route.ts` (append `PATCH` export)
- Create: `tests/api/thesis-patch.test.ts`

- [ ] **Step 5.1: Write the failing tests**

Create `tests/api/thesis-patch.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const getCurrentUserMock = vi.fn();

const eqUpdateMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: eqUpdateMock }));
const eqMaybeSingleMock = vi.fn();
const eqSelectMock = vi.fn(() => ({ maybeSingle: eqMaybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqSelectMock }));
const fromMock = vi.fn(() => ({ select: selectMock, update: updateMock }));
const supabaseClient = { from: fromMock };

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => supabaseClient,
}));

function makeRequest(id: string, body: unknown): Request {
  return new Request(`http://test/api/thesis/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/thesis/[id]", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    fromMock.mockClear();
    selectMock.mockClear();
    eqSelectMock.mockClear();
    eqMaybeSingleMock.mockReset();
    updateMock.mockClear();
    eqUpdateMock.mockReset();
    eqUpdateMock.mockResolvedValue({ error: null });
  });

  it("returns 400 when path id is malformed", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u" });
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(
      makeRequest("bad-id", cloneCanonicalThesis()),
      paramsFor("bad-id"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const current = cloneCanonicalThesis();
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(makeRequest(current.id, current), paramsFor(current.id));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body id does not match path id", async () => {
    const current = cloneCanonicalThesis();
    const wrongPath = "different_thesis_26_05_01";
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(makeRequest(wrongPath, current), paramsFor(wrongPath));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("id_mismatch");
  });

  it("returns 422 when body fails Zod", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    const bad = { ...current, claim: "" };
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(makeRequest(current.id, bad), paramsFor(current.id));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_thesis");
  });

  it("returns 404 when thesis does not exist", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(
      makeRequest(current.id, current),
      paramsFor(current.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when thesis belongs to a different user", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: "user_abc123" });
    eqMaybeSingleMock.mockResolvedValue({
      data: { id: current.id, user_id: "other_user", version: 1, thesis: current },
      error: null,
    });
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(
      makeRequest(current.id, current),
      paramsFor(current.id),
    );
    expect(res.status).toBe(404);
  });

  it("returns 500 when update fails", async () => {
    const current = cloneCanonicalThesis();
    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: {
        id: current.id,
        user_id: current.createdBy,
        version: 1,
        thesis: current,
      },
      error: null,
    });
    eqUpdateMock.mockResolvedValue({ error: { message: "db down" } });
    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(
      makeRequest(current.id, current),
      paramsFor(current.id),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("persist_failed");
  });

  it("returns 200, persists new thesis, and bumps version", async () => {
    const current = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...current.scope.regions, "JAPAN"];

    getCurrentUserMock.mockResolvedValue({ id: current.createdBy });
    eqMaybeSingleMock.mockResolvedValue({
      data: {
        id: current.id,
        user_id: current.createdBy,
        version: 1,
        thesis: current,
      },
      error: null,
    });

    const { PATCH } = await import("@/app/api/thesis/[id]/route");
    const res = await PATCH(
      makeRequest(current.id, proposed),
      paramsFor(current.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.thesis).toEqual(proposed);
    expect(body.version).toBe(2);

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updateArg = updateMock.mock.calls[0][0];
    expect(updateArg.version).toBe(2);
    expect(updateArg.thesis).toEqual(proposed);

    expect(eqUpdateMock).toHaveBeenCalledWith("id", current.id);
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/api/thesis-patch.test.ts
```

Expected: FAIL with "PATCH is not a function" (or similar — the export does not exist yet).

- [ ] **Step 5.3: Edit `app/api/thesis/[id]/route.ts` to add the `PATCH` handler**

The file currently exports `GET` only. Add a `PATCH` export at the end and a Zod-import. Final file contents:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ThesisIdSchema, ThesisSchema } from "@/lib/schemas/thesis";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const idCheck = ThesisIdSchema.safeParse(id);
  if (!idCheck.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("theses")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (data.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ id: data.id, thesis: data.thesis }, { status: 200 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const idCheck = ThesisIdSchema.safeParse(id);
    if (!idCheck.success) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const parsed = ThesisSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_thesis", detail: parsed.error.message },
        { status: 422 },
      );
    }
    const proposed = parsed.data;

    if (proposed.id !== id) {
      return NextResponse.json({ error: "id_mismatch" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const fetched = await supabase
      .from("theses")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetched.error || !fetched.data || fetched.data.user_id !== user.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const nextVersion = (fetched.data.version ?? 1) + 1;
    const update = await supabase
      .from("theses")
      .update({ thesis: proposed, version: nextVersion })
      .eq("id", id);

    if (update.error) {
      console.error("[/api/thesis/[id]:PATCH] persist_failed:", update.error);
      return NextResponse.json(
        { error: "persist_failed", details: update.error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { id, thesis: proposed, version: nextVersion },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/thesis/[id]:PATCH] unhandled:", message);
    return NextResponse.json(
      { error: "internal_error", details: message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run:

```bash
npx vitest run tests/api/thesis-patch.test.ts tests/api/thesis-get.test.ts
```

Both files should PASS — the existing GET tests must remain green.

- [ ] **Step 5.5: Commit**

```bash
git add app/api/thesis/[id]/route.ts tests/api/thesis-patch.test.ts
git commit -m "feat(s2): PATCH /api/thesis/[id] persists refined thesis and bumps version

Validates ThesisSchema, asserts body.id == path id, owner-scoped fetch,
updates thesis jsonb and version+1, returns row. Error matrix: 400
invalid_id/invalid_body/id_mismatch, 401 unauthenticated, 404 not_found,
422 invalid_thesis, 500 persist_failed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `components/thesis-editor.tsx`

**What it does:** Client component with three states: idle (instruction input), preview (proposed thesis + diff + Apply/Cancel), error. Apply triggers PATCH and on success calls a parent-supplied `onApplied(thesis)` callback. Apply is disabled when the diff is empty.

**Files:**
- Create: `tests/components/thesis-editor.test.tsx`
- Create: `components/thesis-editor.tsx`

- [ ] **Step 6.1: Write the failing tests**

Create `tests/components/thesis-editor.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThesisEditor } from "@/components/thesis-editor";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function mockRefineResponse(opts: {
  status?: number;
  body: unknown;
}): void {
  fetchMock.mockResolvedValueOnce({
    ok: (opts.status ?? 200) < 400,
    status: opts.status ?? 200,
    json: async () => opts.body,
  });
}

describe("<ThesisEditor>", () => {
  it("renders an instruction textarea and disabled Submit when empty", () => {
    const thesis = cloneCanonicalThesis();
    render(<ThesisEditor thesis={thesis} onApplied={vi.fn()} />);
    expect(
      screen.getByPlaceholderText(/refinement instruction/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /propose/i })).toBeDisabled();
  });

  it("calls /api/thesis/refine on Submit and shows the diff blocks", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...thesis.scope.regions, "JAPAN"];

    mockRefineResponse({
      body: {
        current: thesis,
        proposed,
        diff: {
          added: [{ path: "scope.regions", after: "JAPAN" }],
          removed: [],
          changed: [],
        },
      },
    });

    render(<ThesisEditor thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan to regions",
    );
    await user.click(screen.getByRole("button", { name: /propose/i }));

    await waitFor(() => {
      expect(screen.getByText(/Added/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/scope\.regions/)).toBeInTheDocument();
    expect(screen.getByText(/JAPAN/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeEnabled();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/thesis/refine",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          thesis_id: thesis.id,
          instruction: "add Japan to regions",
        }),
      }),
    );
  });

  it("disables Apply when the proposed diff is empty (no-op instruction)", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    mockRefineResponse({
      body: {
        current: thesis,
        proposed: thesis,
        diff: { added: [], removed: [], changed: [] },
      },
    });
    render(<ThesisEditor thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "no changes",
    );
    await user.click(screen.getByRole("button", { name: /propose/i }));
    await waitFor(() => {
      expect(screen.getByText(/no changes/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /apply/i })).toBeDisabled();
  });

  it("Cancel clears the proposed state and re-enables the instruction input", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...thesis.scope.regions, "JAPAN"];
    mockRefineResponse({
      body: {
        current: thesis,
        proposed,
        diff: {
          added: [{ path: "scope.regions", after: "JAPAN" }],
          removed: [],
          changed: [],
        },
      },
    });
    render(<ThesisEditor thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan",
    );
    await user.click(screen.getByRole("button", { name: /propose/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(
      screen.queryByRole("button", { name: /apply/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/refinement instruction/i),
    ).toBeEnabled();
  });

  it("Apply PATCHes /api/thesis/[id] and calls onApplied with the new thesis", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...thesis.scope.regions, "JAPAN"];
    const onApplied = vi.fn();

    mockRefineResponse({
      body: {
        current: thesis,
        proposed,
        diff: {
          added: [{ path: "scope.regions", after: "JAPAN" }],
          removed: [],
          changed: [],
        },
      },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: thesis.id, thesis: proposed, version: 2 }),
    });

    render(<ThesisEditor thesis={thesis} onApplied={onApplied} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan",
    );
    await user.click(screen.getByRole("button", { name: /propose/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /apply/i })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(onApplied).toHaveBeenCalledWith(proposed);
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/thesis/${thesis.id}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(proposed),
      }),
    );
  });

  it("renders an error message when refine fails", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    mockRefineResponse({
      status: 422,
      body: { error: "invalid_thesis", detail: "Invalid scope.regions" },
    });
    render(<ThesisEditor thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Mars",
    );
    await user.click(screen.getByRole("button", { name: /propose/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Invalid scope\.regions/,
      );
    });
  });
});
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/components/thesis-editor.test.tsx
```

Expected: FAIL with "Cannot find module '@/components/thesis-editor'".

- [ ] **Step 6.3: Write the implementation**

Create `components/thesis-editor.tsx`:

```tsx
"use client";

import React, { useState, type FormEvent } from "react";
import type { Thesis } from "@/lib/schemas/thesis";
import type { ThesisDiff } from "@/lib/diff/thesis-diff";

interface ThesisEditorProps {
  thesis: Thesis;
  onApplied: (next: Thesis) => void;
}

type Status = "idle" | "refining" | "previewing" | "applying" | "error";

interface RefineResponse {
  current: Thesis;
  proposed: Thesis;
  diff: ThesisDiff;
}

function isDiffEmpty(diff: ThesisDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0
  );
}

function formatValue(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  return JSON.stringify(v, null, 0);
}

function DiffBlock({
  kind,
  path,
  before,
  after,
}: {
  kind: "Added" | "Removed" | "Changed";
  path: string;
  before?: unknown;
  after?: unknown;
}) {
  const colour =
    kind === "Added"
      ? "text-green-700 bg-green-50 border-green-200"
      : kind === "Removed"
        ? "text-red-700 bg-red-50 border-red-200"
        : "text-amber-700 bg-amber-50 border-amber-200";
  return (
    <div
      className={`flex flex-col gap-1 rounded-md border px-3 py-2 text-xs ${colour}`}
    >
      <div className="flex items-center gap-2 font-medium">
        <span className="uppercase tracking-wide">{kind}</span>
        <code className="text-neutral-700">{path}</code>
      </div>
      {kind === "Changed" ? (
        <div className="font-mono text-[11px] text-neutral-800">
          {formatValue(before)} <span className="text-neutral-500">→</span>{" "}
          {formatValue(after)}
        </div>
      ) : kind === "Added" ? (
        <div className="font-mono text-[11px] text-neutral-800">
          + {formatValue(after)}
        </div>
      ) : (
        <div className="font-mono text-[11px] text-neutral-800">
          − {formatValue(before)}
        </div>
      )}
    </div>
  );
}

export function ThesisEditor({ thesis, onApplied }: ThesisEditorProps) {
  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [proposed, setProposed] = useState<Thesis | null>(null);
  const [diff, setDiff] = useState<ThesisDiff | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submitDisabled =
    status === "refining" ||
    status === "applying" ||
    instruction.trim().length === 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitDisabled) return;
    setStatus("refining");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/thesis/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis_id: thesis.id, instruction }),
      });
      const body = (await res.json().catch(() => null)) as
        | (RefineResponse & { error?: string; detail?: string })
        | null;
      if (!res.ok || !body || "error" in body && body.error) {
        const detail = body?.detail ?? body?.error ?? `Request failed (${res.status})`;
        setErrorMessage(detail);
        setStatus("error");
        return;
      }
      setProposed(body.proposed);
      setDiff(body.diff);
      setStatus("previewing");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unexpected error");
      setStatus("error");
    }
  }

  async function onApply() {
    if (!proposed || !diff || isDiffEmpty(diff)) return;
    setStatus("applying");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/thesis/${thesis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposed),
      });
      const body = (await res.json().catch(() => null)) as
        | { id?: string; thesis?: Thesis; version?: number; error?: string }
        | null;
      if (!res.ok || !body?.thesis) {
        setErrorMessage(body?.error ?? `Apply failed (${res.status})`);
        setStatus("error");
        return;
      }
      onApplied(body.thesis);
      setProposed(null);
      setDiff(null);
      setInstruction("");
      setStatus("idle");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unexpected error");
      setStatus("error");
    }
  }

  function onCancel() {
    setProposed(null);
    setDiff(null);
    setErrorMessage(null);
    setStatus("idle");
  }

  const refining = status === "refining";
  const applying = status === "applying";
  const previewing = status === "previewing" && diff !== null;
  const applyDisabled = !diff || isDiffEmpty(diff) || applying;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={refining || previewing || applying}
          placeholder="Refinement instruction (e.g., add Japan to regions)..."
          className="min-h-[80px] w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100"
        />
        {!previewing ? (
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={submitDisabled}
              className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              {refining ? "Proposing..." : "Propose change"}
            </button>
          </div>
        ) : null}
      </form>

      {previewing && diff ? (
        <div className="flex flex-col gap-3">
          {isDiffEmpty(diff) ? (
            <p className="text-xs text-neutral-500">No changes proposed.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {diff.added.map((c, i) => (
                <DiffBlock
                  key={`a-${i}`}
                  kind="Added"
                  path={c.path}
                  after={c.after}
                />
              ))}
              {diff.removed.map((c, i) => (
                <DiffBlock
                  key={`r-${i}`}
                  kind="Removed"
                  path={c.path}
                  before={c.before}
                />
              ))}
              {diff.changed.map((c, i) => (
                <DiffBlock
                  key={`c-${i}`}
                  kind="Changed"
                  path={c.path}
                  before={c.before}
                  after={c.after}
                />
              ))}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={applying}
              className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={applyDisabled}
              className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              {applying ? "Applying..." : "Apply"}
            </button>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6.4: Run tests to verify they pass**

Run:

```bash
npx vitest run tests/components/thesis-editor.test.tsx
```

Expected: PASS — all 6 tests green. If `@testing-library/user-event` is not installed, install it first:

```bash
npm install -D @testing-library/user-event
```

…then re-run.

- [ ] **Step 6.5: Commit**

```bash
git add components/thesis-editor.tsx tests/components/thesis-editor.test.tsx
# Only stage package files if user-event needed installing:
git add -p package.json package-lock.json 2>/dev/null || true
git commit -m "feat(s2): ThesisEditor component with inline-change-block diff preview

Instruction input -> POST /api/thesis/refine -> diff preview ->
Apply (PATCH) | Cancel. Apply disabled on empty diff. Inline change
blocks render Added/Removed/Changed with path + before/after.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Mount `ThesisEditor` on `/thesis/[id]`

**What it does:** Render `<ThesisEditor>` alongside the existing JSON view in the middle panel. After Apply, replace the baseline thesis and re-render the JSON view. Since the existing page is likely a server component, we'll need a thin client wrapper that owns the baseline state.

**Files:**
- Modify: `app/thesis/[id]/page.tsx`
- Possibly create: `app/thesis/[id]/thesis-detail.client.tsx` (a client wrapper) — adjust based on what's currently in the page file.

- [ ] **Step 7.1: Inspect the current page**

Run:

```bash
cat app/thesis/[id]/page.tsx
```

Read the current structure. If it's a server component that fetches the thesis and renders `<ThesisJsonView>`, we need a client wrapper to own the baseline state. If it's already a client component, integrate `<ThesisEditor>` directly.

- [ ] **Step 7.2: Implement the page change**

There are two shapes to handle. Choose based on Step 7.1.

**Case A: Page is a server component fetching the thesis and rendering `<ThesisJsonView thesis={...} />`.**

Create `app/thesis/[id]/thesis-detail.client.tsx`:

```tsx
"use client";

import React, { useState } from "react";
import { ThesisEditor } from "@/components/thesis-editor";
import { ThesisJsonView } from "@/components/thesis-json-view";
import type { Thesis } from "@/lib/schemas/thesis";

export function ThesisDetail({ initial }: { initial: Thesis }) {
  const [thesis, setThesis] = useState<Thesis>(initial);
  return (
    <div className="flex flex-col gap-6">
      <ThesisJsonView thesis={thesis} />
      <ThesisEditor thesis={thesis} onApplied={setThesis} />
    </div>
  );
}
```

Then update `app/thesis/[id]/page.tsx` to render `<ThesisDetail initial={thesis} />` in place of the previous direct `<ThesisJsonView>` call inside the middle panel. Preserve the surrounding three-panel layout, error states, and auth redirects.

**Case B: Page is already a client component.**

Add the editor inline next to `<ThesisJsonView>` and hoist the thesis into local `useState<Thesis>(initialThesis)` if it isn't already, threading `setThesis` as the `onApplied` callback.

- [ ] **Step 7.3: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7.4: Full test suite**

Run:

```bash
npm test
```

Expected: all test files passing. No regressions in `stage-list`, `thesis-json-view`, `thesis-extract-form`, or any API/agent test.

- [ ] **Step 7.5: Manual smoke test**

Start dev server:

```bash
npm run dev
```

Walk through, with the dev server logs visible:

1. Sign in.
2. Navigate to `/thesis/new`, paste a thesis snippet, submit. The extract round-trip should still work (you should land on `/thesis/<id>` with the JSON rendered).
3. On `/thesis/<id>`, type `add Japan to regions` into the new instruction box. Click Propose change.
4. Verify a single green "Added scope.regions + JAPAN" block appears. Apply should be enabled, Cancel should be enabled.
5. Click Apply. Verify the JSON view updates to include JAPAN and the editor returns to the empty instruction state.
6. Submit `no changes` as an instruction. Verify the preview renders "No changes proposed." and Apply is disabled.
7. Click Cancel after a non-empty proposal. Verify the diff disappears and the instruction input is re-enabled.
8. Try an instruction like `add Mars to regions`. Verify the editor shows the 422 detail in an alert.

Stop dev server when verified.

- [ ] **Step 7.6: Commit**

```bash
git add app/thesis/[id]/page.tsx app/thesis/[id]/thesis-detail.client.tsx
git commit -m "feat(s2): mount ThesisEditor alongside JsonView on /thesis/[id]

Thin client wrapper owns the baseline thesis state; after Apply the
JSON view re-renders against the freshly persisted thesis.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Final AC walk and issue closure

- [ ] **Step 8.1: Run the full test suite one more time**

Run:

```bash
npm test
```

Expected: every test file green. Capture the final counts (Vitest will print `Test Files  N passed / Tests  M passed`).

- [ ] **Step 8.2: Close issue #3 with the AC walkthrough**

Map each AC from issue #3 to where it is verified:

```bash
gh issue close 3 --comment "$(cat <<'EOF'
## S2 acceptance criteria walkthrough

- [x] "add Japan to regions" surfaces a diff adding JAPAN, no other changes — `tests/diff/thesis-diff.test.ts` ("treats scope.regions as a set: pushed element shows up as 'added'") + `tests/agents/thesis-refiner.test.ts` ("returns ok:true with parsed proposed thesis on happy path") + `tests/components/thesis-editor.test.tsx` ("calls /api/thesis/refine on Submit and shows the diff blocks").
- [x] "tighten the M1 break threshold to 1.5y" surfaces a `changed` entry for `drivers.industry[id=...].thesis_breaks_below` — `tests/diff/thesis-diff.test.ts` ("emits a single 'changed' entry for a scalar field change").
- [x] Apply persists the new JSON, bumps `theses.version`, diff re-renders against new baseline — `tests/api/thesis-patch.test.ts` ("returns 200, persists new thesis, and bumps version") + `tests/components/thesis-editor.test.tsx` ("Apply PATCHes /api/thesis/[id] and calls onApplied with the new thesis").
- [x] Cancel leaves existing thesis unchanged — `tests/components/thesis-editor.test.tsx` ("Cancel clears the proposed state and re-enables the instruction input"); no PATCH call is made.
- [x] Refine endpoint refuses to return a proposed thesis that fails Zod validation (422 with path) — `tests/api/thesis-refine.test.ts` ("returns 422 when refineThesis fails Zod validation").
- [x] A no-op instruction returns an empty diff and Apply is disabled — `tests/api/thesis-refine.test.ts` ("returns 200 with empty diff when proposed equals current") + `tests/components/thesis-editor.test.tsx` ("disables Apply when the proposed diff is empty (no-op instruction)").
- [x] Vitest unit tests for JSON-diff renderer covering three change classes (scalar, array push, nested object replacement) — `tests/diff/thesis-diff.test.ts` has tests for all three plus envelope-exclusion, set semantics, keyed-by-id, and multi-change collection.

## Notes

- Design spec: docs/superpowers/specs/2026-05-16-thesis-refinement-design.md
- Implementation plan: docs/superpowers/plans/2026-05-16-s2-thesis-refinement.md
EOF
)"
```

- [ ] **Step 8.3: Confirm the next branch decision**

`s1-walking-skeleton` now contains both S1 and S2 work. Inspect the log:

```bash
git log --oneline main..HEAD
```

Decide with the user whether to merge to `main` now or continue with S3 on the same branch. Default for this codebase has been continuing on the same branch through sequential slices.

---

## Self-review summary

- **Spec coverage:** Every section of the spec is implemented in a task. Decision table → distributed throughout. Architecture → file structure section + Tasks 2–7. Components → Tasks 2 (diff), 3 (refiner), 4 (refine route), 5 (PATCH), 6 (editor). Data flow → Task 7 manual smoke. Error handling → integrated into each API task. Testing → each task has TDD steps. YAGNI cuts → none of the deferred features have implementation tasks.
- **Placeholder scan:** No `TBD`, `TODO`, or "fill in" text. Every code step contains the actual code an engineer would write.
- **Type consistency:** `ThesisDiff` / `PathChange` types defined in Task 2; reused by name in Tasks 4, 6, 7. `RefineThesisInput` / `RefineThesisResult` defined in Task 3; consumed in Task 4. `ThesisEditor` props defined in Task 6; consumed in Task 7. Function names (`diffThesis`, `refineThesis`, `ThesisEditor`) consistent throughout.
- **AC coverage:** Every issue-#3 AC has at least one test cited in Task 8's walkthrough.
