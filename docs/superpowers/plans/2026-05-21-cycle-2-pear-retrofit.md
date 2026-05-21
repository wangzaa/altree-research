# Cycle 2 — Pear Retrofit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrofit the app to the Pear design system — Inter/Playfair fonts, off-white/cyan palette — replace the three-panel layout on `/thesis/[id]` with a sticky 4-step pipeline header above a single-column content body, and replace the JSON thesis view + refinement form with a chat-style artifact (prose summary + plain-English instruction input).

**Architecture:**
- Foundation: add Pear tokens, fonts, button utilities, and `.reveal` scroll-reveal class to `app/globals.css` + `app/layout.tsx`. Existing `bg-neutral-*` utilities stay valid in Tailwind v4, so older pages keep working through the migration.
- New components in `components/`: `pipeline-header.tsx` (StepNumber circles + connector bar), `pipeline-layout.tsx` (PipelineLayout shell + PipelineSection wrapper), `live-log-drawer.tsx` (collapsible bottom drawer wrapping the existing `LiveLog`), `thesis-chat-artifact.tsx` (summary + refine input + Show JSON toggle).
- New pure utilities in `lib/`: `thesis-summary.ts` (`summariseThesis(t: Thesis): string`) and `pipeline-steps.ts` (`deriveStepStates(...)` returns the four `PipelineStep` rows for the header).
- Integration: rewrite `app/thesis/[id]/page.tsx` to fetch validation_runs alongside thesis/universe/scan, derive the four pipeline steps server-side, and render `<PipelineLayout>` wrapping `<ThesisDetail>`. The client component renders four `<PipelineSection>` children.
- Restyle the three other routes (`/`, `/sign-in`, `/thesis/new`) and the inner components (`ThesisExtractForm`, `UniverseTable`, `AnchorPicker`, `ScanPanel`, `PerTickerTable`, `ScanChart`, `DriverEvidencePanel`) class-by-class to Pear surfaces, buttons, and headings.
- Delete `ThreePanelLayout`, `ThesisJsonView`, `ThesisEditor`, `StageList` and their tests once the new flow lands.

**Tech Stack:** Next.js 15.5 (App Router) + React 19, Tailwind v4 with `@theme inline`, `next/font/google` for Inter + Playfair Display, Vitest 3 + React Testing Library + jsdom for tests, Supabase JS client, existing `/api/thesis/refine` and `/api/thesis/[id]` endpoints (unchanged).

**Baseline before any change:** 347 tests pass, 2 skipped, across 47 files (`npm test`).

---

## File Structure

**New files:**
- `lib/thesis-summary.ts` — pure `summariseThesis(t: Thesis): string`.
- `lib/pipeline-steps.ts` — pure `deriveStepStates(inputs): PipelineStep[]`.
- `components/pipeline-header.tsx` — `StepNumber`, `PipelineHeader`, `PipelineStep` type export.
- `components/pipeline-layout.tsx` — `PipelineLayout`, `PipelineSection`.
- `components/live-log-drawer.tsx` — collapsible drawer wrapping `<LiveLog>`.
- `components/thesis-chat-artifact.tsx` — summary card + refine form + diff preview + Show JSON toggle.
- `tests/lib/thesis-summary.test.ts`
- `tests/lib/pipeline-steps.test.ts`
- `tests/components/pipeline-header.test.tsx`
- `tests/components/pipeline-layout.test.tsx`
- `tests/components/live-log-drawer.test.tsx`
- `tests/components/thesis-chat-artifact.test.tsx`

**Modified files:**
- `app/globals.css` — Pear tokens, button utilities, `.reveal`.
- `app/layout.tsx` — Inter + Playfair fonts.
- `app/page.tsx` — Pear hero restyle.
- `app/sign-in/page.tsx` — Pear card restyle.
- `app/thesis/new/page.tsx` — Pear card restyle.
- `app/thesis/[id]/page.tsx` — fetch validation_runs, derive steps, render `<PipelineLayout>` instead of `<ThreePanelLayout>`.
- `app/thesis/[id]/thesis-detail.client.tsx` — render four `<PipelineSection>` children using `<ThesisChatArtifact>` for step 1.
- `tests/setup.ts` — stub `Element.prototype.scrollIntoView` for jsdom.
- `components/thesis-extract-form.tsx` — Pear inputs + `.btn-primary`.
- `components/universe-table.tsx` — Pear card wrapping, `.btn`-class buttons.
- `components/anchor-picker.tsx` — Pear inputs + chips, `.btn-primary`.
- `components/scan-panel.tsx` — Pear card wrapping, `.btn` buttons.
- `components/per-ticker-table.tsx` — Pear table surface.
- `components/scan-chart.tsx` — Pear card wrapping for the chart container.
- `components/driver-evidence-panel.tsx` — Pear card per lens, cyan post-title links.

**Deleted files (final cleanup task):**
- `components/three-panel-layout.tsx`
- `components/thesis-json-view.tsx`
- `components/thesis-editor.tsx`
- `components/stage-list.tsx`
- `tests/components/stage-list.test.tsx`
- `tests/components/thesis-json-view.test.tsx`
- `tests/components/thesis-editor.test.tsx`

**Out of scope (left untouched):**
- The `* 2.tsx`/`* 2.ts` Finder-duplicate files (untracked junk per memory `feedback_avoid_git_add_all`).
- Any file under `app/api/`, `lib/agents/`, `lib/schemas/`, `lib/data/`, `lib/diff/`, `lib/llm/`, `lib/auth/`, `lib/supabase/`, `lib/ingest/`, `lib/aggregation/`, `prototypes/`, `scripts/`, or `supabase/`. The refinement and PATCH endpoints, the diff lib, and the agent layer all stay as they are.

---

## Task 1: Pear design tokens + Inter/Playfair fonts

Replace the default Geist + grayscale tokens with Pear's palette, mounted in both `:root` (raw CSS variables) and `@theme inline` (so Tailwind v4 emits `bg-pear-cyan`, `text-pear-off-white`, etc.). Load Inter + Playfair Display via `next/font/google` so they're available at `var(--font-inter)` / `var(--font-playfair)`.

**Files:**
- Modify: `app/globals.css` (full rewrite below)
- Modify: `app/layout.tsx` (full rewrite below)

- [ ] **Step 1: Replace `app/globals.css` entirely**

Overwrite the file with:

```css
@import "tailwindcss";

:root {
  /* Pear core palette */
  --color-black:               #000000;
  --color-white:               #FFFFFF;

  /* Signature accent */
  --color-electric-cyan:       #00E5FF;
  --color-electric-cyan-light: #CCFAFF;

  /* Warm neutrals */
  --color-off-white:           #F5F4F2;
  --color-beige:               #E7E3D3;
  --color-peach:               #FFDBB8;

  /* App surface aliases */
  --background: var(--color-off-white);
  --foreground: var(--color-black);

  /* Pear easing — every meaningful transition uses this */
  --pear-ease: cubic-bezier(0.16, 1, 0.3, 1);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);

  --color-pear-cyan:       var(--color-electric-cyan);
  --color-pear-cyan-light: var(--color-electric-cyan-light);
  --color-pear-off-white:  var(--color-off-white);
  --color-pear-beige:      var(--color-beige);
  --color-pear-peach:      var(--color-peach);
  --color-pear-black:      var(--color-black);

  --font-sans:  var(--font-inter);
  --font-serif: var(--font-playfair);
  --font-mono:  var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: Replace `app/layout.tsx` entirely**

Overwrite with:

```tsx
import type { Metadata } from "next";
import { Inter, Playfair_Display, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "altree-research",
  description: "altree-research",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${playfair.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: 347 passed, 2 skipped (47 files). No regressions — only typography changed.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add Pear design tokens + Inter/Playfair fonts

Replaces Geist sans + grayscale tokens with the Pear palette and
typography. Tokens are exposed both at :root and inside @theme inline
so Tailwind v4 emits bg-pear-cyan, text-pear-off-white, etc. Existing
neutral utility classes still work — page-by-page migration follows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pear button + reveal utility classes

Append button utilities (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-outline-white`) and the `.reveal` scroll-reveal class. These get used directly by component classNames (Tailwind v4 `@theme` is for tokens, not full classes).

**Files:**
- Modify: `app/globals.css` (append below the existing body rule)

- [ ] **Step 1: Append button + reveal utilities to `app/globals.css`**

Append (do not replace what's there) immediately after the closing `}` of the `body { ... }` rule:

```css

/* Pear buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 9999px;
  border: none;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 0.2s var(--pear-ease),
              color 0.2s var(--pear-ease),
              transform 0.2s ease,
              box-shadow 0.2s ease;
}
.btn:hover  { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.btn:active { transform: translateY(0) scale(0.98); box-shadow: none; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

.btn-primary           { background: var(--color-electric-cyan); color: var(--color-black); }
.btn-primary:hover     { background: var(--color-black); color: var(--color-white); }

.btn-secondary         { background: var(--color-black); color: var(--color-white); }
.btn-secondary:hover   { background: var(--color-electric-cyan); color: var(--color-black); }

.btn-outline {
  background: transparent;
  border: 1px solid var(--color-black);
  color: var(--color-black);
}
.btn-outline:hover {
  background: var(--color-electric-cyan);
  color: var(--color-black);
  border-color: var(--color-electric-cyan);
}

.btn-outline-white {
  background: transparent;
  border: 1px solid var(--color-white);
  color: var(--color-white);
}
.btn-outline-white:hover { background: var(--color-white); color: var(--color-black); }

/* Scroll reveal — used by hero/section bands */
.reveal {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.8s var(--pear-ease), transform 0.8s var(--pear-ease);
  transition-delay: calc(var(--delay, 0) * 0.1s);
}
.reveal.visible { opacity: 1; transform: translateY(0); }
@media (prefers-reduced-motion: reduce) {
  .reveal { opacity: 1; transform: none; transition: none; }
}
```

- [ ] **Step 2: Run tests to confirm no regression**

Run: `npm test`
Expected: 347 passed, 2 skipped.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "$(cat <<'EOF'
feat(ui): add Pear button + reveal utility classes

Adds .btn / .btn-primary / .btn-secondary / .btn-outline /
.btn-outline-white and the .reveal scroll-reveal helper to globals.css.
Tailwind v4 @theme is for tokens only, so these are declared as raw CSS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `summariseThesis()` pure util — TDD

Stateless function that renders a Thesis as a plain-English prose paragraph for the chat artifact summary card. Falls back gracefully when an optional field is missing. No LLM call.

**Files:**
- Create: `lib/thesis-summary.ts`
- Test: `tests/lib/thesis-summary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/thesis-summary.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { summariseThesis } from "@/lib/thesis-summary";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

describe("summariseThesis", () => {
  it("renders the claim, horizon, and macro premise", () => {
    const out = summariseThesis(cloneCanonicalThesis());
    expect(out).toContain(
      "EU defense capex cycle benefits primes with multi-year backlog visibility",
    );
    expect(out).toContain("5 years");
    expect(out).toContain("NATO 3% commitment holds through 2030");
  });

  it("joins scope regions and sectors with friendly names", () => {
    const out = summariseThesis(cloneCanonicalThesis());
    // GICS 20101010 belongs to sector 20 = Industrials; the summary should
    // include the human-readable sector name, not just the code.
    expect(out).toMatch(/EUROZONE.*UK|UK.*EUROZONE/);
    expect(out).toMatch(/Industrials|Capital Goods/i);
  });

  it("formats market cap minimum in $B", () => {
    const out = summariseThesis(cloneCanonicalThesis());
    expect(out).toContain("$1B");
  });

  it("lists each driver with central estimate, unit, and breaks-below", () => {
    const out = summariseThesis(cloneCanonicalThesis());
    expect(out).toContain("backlog_to_revenue");
    expect(out).toContain("3");
    expect(out).toContain("years");
    expect(out).toContain("1.5");
  });

  it("includes primary falsification and secondary when present", () => {
    const out = summariseThesis(cloneCanonicalThesis());
    expect(out).toContain("NATO 3% commitment formally rolled back");
    expect(out).toContain("Sector backlog/revenue <1.5y");
  });

  it("omits secondary falsification when undefined", () => {
    const t = cloneCanonicalThesis();
    delete t.falsification.secondary;
    const out = summariseThesis(t);
    expect(out).toContain("NATO 3% commitment formally rolled back");
    expect(out).not.toContain("undefined");
  });

  it("includes ticker list for a driver when tickers are present", () => {
    const t = cloneCanonicalThesis();
    t.drivers.industry[0].tickers = ["RHM.DE", "BA.L"];
    const out = summariseThesis(t);
    expect(out).toContain("RHM.DE");
    expect(out).toContain("BA.L");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- thesis-summary`
Expected: FAIL with `Cannot find module '@/lib/thesis-summary'`.

- [ ] **Step 3: Implement `lib/thesis-summary.ts`**

Create `lib/thesis-summary.ts`:

```typescript
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
  const tickerSuffix = driver.tickers && driver.tickers.length > 0
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
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- thesis-summary`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 354 passed (347 + 7 new), 2 skipped.

- [ ] **Step 6: Commit**

```bash
git add lib/thesis-summary.ts tests/lib/thesis-summary.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): add summariseThesis prose renderer

Pure template function that renders a Thesis as plain-English prose for
the chat-style artifact's summary card. Falls back gracefully when
optional fields (driver tickers, secondary falsification) are missing.
GICS codes resolve to human-readable sector/industry names.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `deriveStepStates()` pure util — TDD

Pure function that derives the four `PipelineStep` rows from raw inputs (thesis presence, universe row, scan row, validation_runs row). Used by `app/thesis/[id]/page.tsx` to feed `<PipelineHeader>`.

The `PipelineStep` type lives **here** in `lib/pipeline-steps.ts`, not in `components/pipeline-header.tsx` — the component will import it. Types belong with the smaller, dependency-free file.

**Files:**
- Create: `lib/pipeline-steps.ts`
- Test: `tests/lib/pipeline-steps.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/pipeline-steps.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { deriveStepStates, type PipelineStep } from "@/lib/pipeline-steps";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";
import type { Universe } from "@/lib/schemas/universe";
import type { ScanResults } from "@/lib/schemas/scan";

const sampleUniverse: Universe = {
  id: "eu_defense_global",
  tickers: [
    {
      ticker: "RHM.DE",
      name: "Rheinmetall",
      region: "EUROZONE",
      market_cap_usd_b: 30,
      exposure_tier: "pure_play",
    },
  ],
};

const sampleScan: ScanResults = {
  history_5y: [],
  tickers_snapshot: [],
  descriptive_markdown: "",
};

describe("deriveStepStates", () => {
  it("returns four steps in the documented order", () => {
    const steps = deriveStepStates({
      thesis: cloneCanonicalThesis(),
      universe: null,
      scan: null,
      validationResults: null,
    });
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.id)).toEqual([
      "step-thesis",
      "step-universe",
      "step-insights",
      "step-memo",
    ]);
    expect(steps.map((s) => s.label)).toEqual([
      "Thesis extraction",
      "Universe construction",
      "Gather insights",
      "Memo",
    ]);
  });

  it("marks thesis active and others pending with no universe/scan", () => {
    const steps = deriveStepStates({
      thesis: cloneCanonicalThesis(),
      universe: null,
      scan: null,
      validationResults: null,
    });
    expect(steps[0].state).toBe("completed");
    expect(steps[1].state).toBe("active");
    expect(steps[2].state).toBe("pending");
    expect(steps[3].state).toBe("pending");
  });

  it("marks universe completed when a universe with tickers is present", () => {
    const steps = deriveStepStates({
      thesis: cloneCanonicalThesis(),
      universe: sampleUniverse,
      scan: null,
      validationResults: null,
    });
    expect(steps[1].state).toBe("completed");
    expect(steps[2].state).toBe("active");
  });

  it("marks insights completed once any driver has bull_evidence", () => {
    const steps = deriveStepStates({
      thesis: cloneCanonicalThesis(),
      universe: sampleUniverse,
      scan: sampleScan,
      validationResults: {
        backlog_to_revenue: {
          bull_evidence: [
            {
              expert: "x",
              post_id: "1",
              post_url: "https://example.com",
              post_title: "t",
              quote: "q",
              date: "2026-01-01",
            },
          ],
          bear_evidence: [],
        },
      },
    });
    expect(steps[2].state).toBe("completed");
    expect(steps[3].state).toBe("active");
  });

  it("keeps memo pending even when all earlier steps are complete", () => {
    const steps = deriveStepStates({
      thesis: cloneCanonicalThesis(),
      universe: sampleUniverse,
      scan: sampleScan,
      validationResults: {
        backlog_to_revenue: {
          bull_evidence: [
            {
              expert: "x",
              post_id: "1",
              post_url: "https://example.com",
              post_title: "t",
              quote: "q",
              date: "2026-01-01",
            },
          ],
          bear_evidence: [],
        },
      },
    });
    // Memo content is S12; always pending until then. Active marker still
    // lands on memo since it's the lowest-incomplete step.
    expect(steps[3].state).toBe("active");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- pipeline-steps`
Expected: FAIL with `Cannot find module '@/lib/pipeline-steps'`.

- [ ] **Step 3: Implement `lib/pipeline-steps.ts`**

Create `lib/pipeline-steps.ts`:

```typescript
import type { Thesis } from "@/lib/schemas/thesis";
import type { Universe } from "@/lib/schemas/universe";
import type { ScanResults } from "@/lib/schemas/scan";
import type { DriverValidationResult } from "@/lib/schemas/validation";

export type PipelineStepState = "pending" | "active" | "completed";

export type PipelineStep = {
  id: string;
  label: string;
  state: PipelineStepState;
};

export type DeriveStepStatesInputs = {
  thesis: Thesis | null;
  universe: Universe | null;
  scan: ScanResults | null;
  validationResults: Record<string, DriverValidationResult> | null;
};

function hasAnyBullEvidence(
  results: Record<string, DriverValidationResult> | null,
): boolean {
  if (!results) return false;
  return Object.values(results).some(
    (r) => Array.isArray(r.bull_evidence) && r.bull_evidence.length > 0,
  );
}

export function deriveStepStates(
  inputs: DeriveStepStatesInputs,
): PipelineStep[] {
  const thesisDone = inputs.thesis !== null;
  const universeDone =
    inputs.universe !== null && inputs.universe.tickers.length > 0;
  const insightsDone = hasAnyBullEvidence(inputs.validationResults);
  // Memo (S12) is always pending in cycle 2.
  const memoDone = false;

  const completion = [thesisDone, universeDone, insightsDone, memoDone];
  // Lowest-index incomplete step is "active". If everything is complete,
  // the last step is "active".
  let activeIdx = completion.findIndex((c) => !c);
  if (activeIdx === -1) activeIdx = completion.length - 1;

  const labels: Array<{ id: string; label: string }> = [
    { id: "step-thesis", label: "Thesis extraction" },
    { id: "step-universe", label: "Universe construction" },
    { id: "step-insights", label: "Gather insights" },
    { id: "step-memo", label: "Memo" },
  ];

  return labels.map((l, i) => ({
    id: l.id,
    label: l.label,
    state: completion[i]
      ? "completed"
      : i === activeIdx
        ? "active"
        : "pending",
  }));
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- pipeline-steps`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 359 passed (354 + 5 new), 2 skipped.

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline-steps.ts tests/lib/pipeline-steps.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): add deriveStepStates pipeline-step derivation

Pure function mapping raw inputs (thesis, universe, scan,
validation_runs results) to the four PipelineStep rows the new
pipeline header consumes. The lowest-index incomplete step is marked
active; memo (S12) is always pending in cycle 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Stub `scrollIntoView` in tests/setup.ts

jsdom doesn't implement `Element.prototype.scrollIntoView`. The PipelineHeader's click-to-scroll handler calls it; without a stub the click handler test crashes. One-line addition; gets its own commit so the rationale is recorded.

**Files:**
- Modify: `tests/setup.ts` (append to the existing file)

- [ ] **Step 1: Append the stub**

Append at the end of `tests/setup.ts`:

```typescript

// jsdom doesn't implement Element.prototype.scrollIntoView. PipelineHeader
// click-to-scroll relies on it; the no-op stub lets click handlers run
// without crashing.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}
```

- [ ] **Step 2: Run the test suite**

Run: `npm test`
Expected: 359 passed, 2 skipped. No new tests yet — confirming the stub doesn't break existing setup.

- [ ] **Step 3: Commit**

```bash
git add tests/setup.ts
git commit -m "$(cat <<'EOF'
test: stub Element.prototype.scrollIntoView in jsdom setup

jsdom doesn't ship scrollIntoView. The new pipeline header uses it for
click-to-scroll between sections; stubbing here so handler tests don't
crash.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `PipelineHeader` + `StepNumber` component — TDD

Sticky top-of-page header with 4 numbered circles + 3 connector bars + step labels. The header drives navigation: click a step → smooth-scroll to the corresponding section. Active step gets the cyan glow. Imports `PipelineStep` from `lib/pipeline-steps.ts`.

**Files:**
- Create: `components/pipeline-header.tsx`
- Test: `tests/components/pipeline-header.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/pipeline-header.test.tsx`:

```typescript
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PipelineHeader } from "@/components/pipeline-header";
import type { PipelineStep } from "@/lib/pipeline-steps";

const sampleSteps: PipelineStep[] = [
  { id: "step-thesis", label: "Thesis extraction", state: "completed" },
  { id: "step-universe", label: "Universe construction", state: "active" },
  { id: "step-insights", label: "Gather insights", state: "pending" },
  { id: "step-memo", label: "Memo", state: "pending" },
];

describe("<PipelineHeader>", () => {
  it("renders the four step labels and numerals", () => {
    render(<PipelineHeader steps={sampleSteps} />);
    expect(screen.getByText("Thesis extraction")).toBeInTheDocument();
    expect(screen.getByText("Universe construction")).toBeInTheDocument();
    expect(screen.getByText("Gather insights")).toBeInTheDocument();
    expect(screen.getByText("Memo")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("tags each step button with its state via data-state", () => {
    render(<PipelineHeader steps={sampleSteps} />);
    const thesisButton = screen.getByRole("button", {
      name: /thesis extraction/i,
    });
    expect(thesisButton).toHaveAttribute("data-state", "completed");
    const universeButton = screen.getByRole("button", {
      name: /universe construction/i,
    });
    expect(universeButton).toHaveAttribute("data-state", "active");
    const memoButton = screen.getByRole("button", { name: /memo/i });
    expect(memoButton).toHaveAttribute("data-state", "pending");
  });

  it("scrolls the target section into view on click", async () => {
    const user = userEvent.setup();
    const target = document.createElement("section");
    target.id = "step-universe";
    const scrollIntoViewSpy = vi.fn();
    target.scrollIntoView = scrollIntoViewSpy;
    document.body.appendChild(target);

    render(<PipelineHeader steps={sampleSteps} />);
    await user.click(
      screen.getByRole("button", { name: /universe construction/i }),
    );
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: "smooth" });

    document.body.removeChild(target);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- pipeline-header`
Expected: FAIL with `Cannot find module '@/components/pipeline-header'`.

- [ ] **Step 3: Implement `components/pipeline-header.tsx`**

Create `components/pipeline-header.tsx`:

```tsx
"use client";

import React from "react";
import type { PipelineStep, PipelineStepState } from "@/lib/pipeline-steps";

const CIRCLE_BASE: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 9999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-playfair)",
  fontWeight: 500,
  fontSize: 20,
  cursor: "pointer",
  transition: "background-color 0.2s var(--pear-ease), box-shadow 0.2s ease",
  border: "1px solid transparent",
};

function circleStyle(state: PipelineStepState): React.CSSProperties {
  if (state === "active") {
    return {
      ...CIRCLE_BASE,
      background: "var(--color-electric-cyan)",
      color: "var(--color-black)",
      boxShadow: "0 4px 16px rgba(0,229,255,0.45)",
    };
  }
  if (state === "completed") {
    return {
      ...CIRCLE_BASE,
      background: "var(--color-electric-cyan)",
      color: "var(--color-black)",
    };
  }
  return {
    ...CIRCLE_BASE,
    background: "transparent",
    color: "rgba(0,0,0,0.5)",
    borderColor: "#E5E5E5",
  };
}

function connectorBackground(
  left: PipelineStepState,
  right: PipelineStepState,
): string {
  if (left === "completed" && right !== "pending") {
    return "linear-gradient(to right, var(--color-electric-cyan), #B5B5B5)";
  }
  if (left === "completed" || left === "active") {
    return "linear-gradient(to right, var(--color-electric-cyan), #E5E5E5)";
  }
  return "#E5E5E5";
}

function StepNumber({
  step,
  number,
  onClick,
}: {
  step: PipelineStep;
  number: number;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-[140px]">
      <button
        type="button"
        onClick={onClick}
        aria-label={step.label}
        data-state={step.state}
        style={circleStyle(step.state)}
      >
        {number}
      </button>
      <span
        className="text-sm font-medium"
        style={{
          color: step.state === "pending" ? "rgba(0,0,0,0.5)" : "var(--color-black)",
        }}
      >
        {step.label}
      </span>
    </div>
  );
}

export function PipelineHeader({ steps }: { steps: PipelineStep[] }) {
  function handleClick(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <header
      className="sticky top-0 z-50 w-full bg-pear-off-white border-b"
      style={{ borderColor: "#E5E5E5" }}
    >
      <div className="container mx-auto px-6 lg:px-12 py-6">
        <div className="flex items-start justify-between gap-4">
          {steps.map((step, i) => (
            <React.Fragment key={step.id}>
              <StepNumber
                step={step}
                number={i + 1}
                onClick={() => handleClick(step.id)}
              />
              {i < steps.length - 1 ? (
                <div
                  aria-hidden="true"
                  className="flex-1 mt-6"
                  style={{
                    height: 1,
                    background: connectorBackground(step.state, steps[i + 1].state),
                  }}
                />
              ) : null}
            </React.Fragment>
          ))}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- pipeline-header`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 362 passed (359 + 3 new), 2 skipped.

- [ ] **Step 6: Commit**

```bash
git add components/pipeline-header.tsx tests/components/pipeline-header.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add PipelineHeader with cyan step circles

Sticky top-of-page header with four numbered Pear circles, connector
gradients, and click-to-scroll wiring. Active step gets the cyan glow;
pending steps fade to 50% opacity. Exports PipelineStep / PipelineStepState
types consumed by lib/pipeline-steps.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `LiveLogDrawer` — TDD

Collapsible bottom drawer wrapping the existing `<LiveLog>`. Default state collapsed (36px header bar). Click chevron → expanded (30vh body, scrollable). Animation via `height` transition with Pear easing. Lands before `PipelineLayout` so the layout's import resolves.

**Files:**
- Create: `components/live-log-drawer.tsx`
- Test: `tests/components/live-log-drawer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/live-log-drawer.test.tsx`:

```typescript
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveLogDrawer } from "@/components/live-log-drawer";

describe("<LiveLogDrawer>", () => {
  it("renders collapsed by default with a Live log label", () => {
    render(<LiveLogDrawer thesisId="t_demo" />);
    const root = screen.getByTestId("live-log-drawer");
    expect(root).toHaveAttribute("data-state", "collapsed");
    expect(screen.getByText(/live log/i)).toBeInTheDocument();
  });

  it("expands when the toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<LiveLogDrawer thesisId="t_demo" />);
    const toggle = screen.getByRole("button", { name: /toggle live log/i });
    await user.click(toggle);
    expect(screen.getByTestId("live-log-drawer")).toHaveAttribute(
      "data-state",
      "expanded",
    );
  });

  it("collapses again on second toggle click", async () => {
    const user = userEvent.setup();
    render(<LiveLogDrawer thesisId="t_demo" />);
    const toggle = screen.getByRole("button", { name: /toggle live log/i });
    await user.click(toggle);
    await user.click(toggle);
    expect(screen.getByTestId("live-log-drawer")).toHaveAttribute(
      "data-state",
      "collapsed",
    );
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- live-log-drawer`
Expected: FAIL with `Cannot find module '@/components/live-log-drawer'`.

- [ ] **Step 3: Implement `components/live-log-drawer.tsx`**

Create `components/live-log-drawer.tsx`:

```tsx
"use client";

import React, { useState } from "react";
import { LiveLog } from "@/components/live-log";

export type LiveLogDrawerProps = {
  thesisId?: string;
};

export function LiveLogDrawer({ thesisId }: LiveLogDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const state = expanded ? "expanded" : "collapsed";

  return (
    <div
      data-testid="live-log-drawer"
      data-state={state}
      className="fixed bottom-0 left-0 right-0 z-40 bg-pear-off-white"
      style={{
        borderTop: "1px solid #E5E5E5",
        boxShadow: expanded ? "0 -8px 24px rgba(0,0,0,0.06)" : "none",
        transition: "height 0.3s var(--pear-ease)",
        height: expanded ? "30vh" : 36,
      }}
    >
      <div
        className="flex items-center justify-between px-4"
        style={{ height: 36 }}
      >
        <span className="text-xs font-medium uppercase tracking-wide">
          Live log
        </span>
        <button
          type="button"
          aria-label="Toggle live log"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs"
          style={{
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.2s var(--pear-ease)",
          }}
        >
          ▲
        </button>
      </div>
      {expanded ? (
        <div style={{ height: "calc(30vh - 36px)", overflowY: "auto" }}>
          <LiveLog thesisId={thesisId} />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- live-log-drawer`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 365 passed (362 + 3 new), 2 skipped.

- [ ] **Step 6: Commit**

```bash
git add components/live-log-drawer.tsx tests/components/live-log-drawer.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add collapsible LiveLogDrawer

Bottom-fixed drawer wrapping the existing LiveLog component. Default
collapsed to a 36px header bar; chevron click expands to 30vh with the
Pear easing curve. Existing Realtime subscription inside LiveLog is
preserved as-is.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `PipelineLayout` + `PipelineSection` — TDD

Shell component that wraps the page: sticky `<PipelineHeader>` on top, container body with section children, `<LiveLogDrawer>` at the bottom. `PipelineSection` is the small wrapper each step's content uses; it sets the anchor id and renders a Playfair section heading.

**Files:**
- Create: `components/pipeline-layout.tsx`
- Test: `tests/components/pipeline-layout.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/pipeline-layout.test.tsx`:

```typescript
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  PipelineLayout,
  PipelineSection,
} from "@/components/pipeline-layout";
import type { PipelineStep } from "@/lib/pipeline-steps";

const steps: PipelineStep[] = [
  { id: "step-thesis", label: "Thesis extraction", state: "active" },
  { id: "step-universe", label: "Universe construction", state: "pending" },
  { id: "step-insights", label: "Gather insights", state: "pending" },
  { id: "step-memo", label: "Memo", state: "pending" },
];

describe("<PipelineLayout>", () => {
  it("renders the header labels and each section's children", () => {
    render(
      <PipelineLayout steps={steps}>
        <PipelineSection id="step-thesis" title="Thesis extraction">
          <p>thesis body</p>
        </PipelineSection>
        <PipelineSection id="step-universe" title="Universe construction">
          <p>universe body</p>
        </PipelineSection>
      </PipelineLayout>,
    );
    expect(
      screen.getAllByText("Thesis extraction").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("thesis body")).toBeInTheDocument();
    expect(screen.getByText("universe body")).toBeInTheDocument();
  });

  it("anchors each section by id", () => {
    render(
      <PipelineLayout steps={steps}>
        <PipelineSection id="step-thesis" title="Thesis extraction">
          <p>x</p>
        </PipelineSection>
      </PipelineLayout>,
    );
    expect(document.getElementById("step-thesis")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- pipeline-layout`
Expected: FAIL with `Cannot find module '@/components/pipeline-layout'`.

- [ ] **Step 3: Implement `components/pipeline-layout.tsx`**

Create `components/pipeline-layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { PipelineHeader } from "@/components/pipeline-header";
import type { PipelineStep } from "@/lib/pipeline-steps";
import { LiveLogDrawer } from "@/components/live-log-drawer";

export interface PipelineLayoutProps {
  steps: PipelineStep[];
  thesisId?: string;
  children: ReactNode;
}

export function PipelineLayout({
  steps,
  thesisId,
  children,
}: PipelineLayoutProps) {
  return (
    <main className="min-h-screen bg-pear-off-white pb-24">
      <PipelineHeader steps={steps} />
      <div className="container mx-auto px-6 lg:px-12 py-12 space-y-24">
        {children}
      </div>
      <LiveLogDrawer thesisId={thesisId} />
    </main>
  );
}

export function PipelineSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="min-h-[60vh] scroll-mt-32">
      <h2
        className="mb-6"
        style={{
          fontFamily: "var(--font-playfair)",
          fontWeight: 500,
          fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
        }}
      >
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- pipeline-layout`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 367 passed (365 + 2 new), 2 skipped.

- [ ] **Step 6: Commit**

```bash
git add components/pipeline-layout.tsx tests/components/pipeline-layout.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add PipelineLayout + PipelineSection

Page shell wrapping the sticky PipelineHeader, a content container, and
the collapsible LiveLogDrawer. PipelineSection is the per-step wrapper
each step's content uses; it sets the anchor id and the Playfair
section heading. scroll-mt-32 keeps anchor landings clear of the
sticky header.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `ThesisChatArtifact` — TDD

Card that renders the prose summary of the current thesis + a refinement instruction textarea + diff preview/confirm flow + a Show JSON toggle. Replaces `<ThesisJsonView>` + `<ThesisEditor>` on `/thesis/[id]`. Re-uses the existing `/api/thesis/refine` and `/api/thesis/[id]` endpoints unchanged.

**Files:**
- Create: `components/thesis-chat-artifact.tsx`
- Test: `tests/components/thesis-chat-artifact.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/thesis-chat-artifact.test.tsx`:

```typescript
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThesisChatArtifact } from "@/components/thesis-chat-artifact";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("<ThesisChatArtifact>", () => {
  it("renders the prose summary of the current thesis", () => {
    const thesis = cloneCanonicalThesis();
    render(<ThesisChatArtifact thesis={thesis} onApplied={vi.fn()} />);
    expect(
      screen.getByText(
        /EU defense capex cycle benefits primes with multi-year backlog visibility/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Horizon: 5 years/)).toBeInTheDocument();
  });

  it("does not show the JSON view until Show JSON is clicked", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    render(<ThesisChatArtifact thesis={thesis} onApplied={vi.fn()} />);
    expect(screen.queryByTestId("thesis-json")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show json/i }));
    expect(screen.getByTestId("thesis-json")).toBeInTheDocument();
    expect(screen.getByTestId("thesis-json")).toHaveTextContent(thesis.id);
  });

  it("submits a refinement instruction and shows the diff preview", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...thesis.scope.regions, "JAPAN"];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        current: thesis,
        proposed,
        diff: {
          added: [{ path: "scope.regions", after: "JAPAN" }],
          removed: [],
          changed: [],
        },
      }),
    });

    render(<ThesisChatArtifact thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan",
    );
    await user.click(screen.getByRole("button", { name: /refine/i }));

    await waitFor(() => {
      expect(screen.getByText(/JAPAN/)).toBeInTheDocument();
    });
    expect(screen.getByText(/scope\.regions/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/thesis/refine",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ thesis_id: thesis.id, instruction: "add Japan" }),
      }),
    );
  });

  it("PATCHes /api/thesis/[id] on Confirm and calls onApplied", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...thesis.scope.regions, "JAPAN"];
    const onApplied = vi.fn();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        current: thesis,
        proposed,
        diff: {
          added: [{ path: "scope.regions", after: "JAPAN" }],
          removed: [],
          changed: [],
        },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: thesis.id, thesis: proposed, version: 2 }),
    });

    render(<ThesisChatArtifact thesis={thesis} onApplied={onApplied} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan",
    );
    await user.click(screen.getByRole("button", { name: /refine/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirm/i })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /confirm/i }));
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

  it("Cancel discards the proposed diff and re-enables the input", async () => {
    const user = userEvent.setup();
    const thesis = cloneCanonicalThesis();
    const proposed = cloneCanonicalThesis();
    proposed.scope.regions = [...thesis.scope.regions, "JAPAN"];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        current: thesis,
        proposed,
        diff: {
          added: [{ path: "scope.regions", after: "JAPAN" }],
          removed: [],
          changed: [],
        },
      }),
    });

    render(<ThesisChatArtifact thesis={thesis} onApplied={vi.fn()} />);
    await user.type(
      screen.getByPlaceholderText(/refinement instruction/i),
      "add Japan",
    );
    await user.click(screen.getByRole("button", { name: /refine/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /cancel/i })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(
      screen.queryByRole("button", { name: /confirm/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/refinement instruction/i),
    ).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- thesis-chat-artifact`
Expected: FAIL with `Cannot find module '@/components/thesis-chat-artifact'`.

- [ ] **Step 3: Implement `components/thesis-chat-artifact.tsx`**

Create `components/thesis-chat-artifact.tsx`:

```tsx
"use client";

import React, { useState, type FormEvent } from "react";
import { summariseThesis } from "@/lib/thesis-summary";
import type { Thesis } from "@/lib/schemas/thesis";
import type { ThesisDiff } from "@/lib/diff/thesis-diff";

export interface ThesisChatArtifactProps {
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

function DiffLines({ diff }: { diff: ThesisDiff }) {
  if (isDiffEmpty(diff)) {
    return (
      <p className="text-sm" style={{ color: "#585858" }}>
        No changes proposed.
      </p>
    );
  }
  return (
    <ul className="space-y-1 font-mono text-xs">
      {diff.added.map((c, i) => (
        <li key={`a-${i}`} style={{ color: "#0a7a30" }}>
          + {c.path}: {JSON.stringify(c.after)}
        </li>
      ))}
      {diff.removed.map((c, i) => (
        <li key={`r-${i}`} style={{ color: "#a30000" }}>
          − {c.path}: {JSON.stringify(c.before)}
        </li>
      ))}
      {diff.changed.map((c, i) => (
        <li key={`c-${i}`} style={{ color: "#8a5a00" }}>
          ~ {c.path}: {JSON.stringify(c.before)} → {JSON.stringify(c.after)}
        </li>
      ))}
    </ul>
  );
}

export function ThesisChatArtifact({
  thesis,
  onApplied,
}: ThesisChatArtifactProps) {
  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [proposed, setProposed] = useState<Thesis | null>(null);
  const [diff, setDiff] = useState<ThesisDiff | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  const summary = summariseThesis(thesis);
  const previewing = status === "previewing" && diff !== null;
  const refining = status === "refining";
  const applying = status === "applying";

  const submitDisabled =
    refining || applying || previewing || instruction.trim().length === 0;
  const confirmDisabled = !diff || isDiffEmpty(diff) || applying;

  async function onRefineSubmit(e: FormEvent<HTMLFormElement>) {
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
      if (!res.ok || !body || ("error" in body && body.error)) {
        setErrorMessage(
          body?.detail ?? body?.error ?? `Request failed (${res.status})`,
        );
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

  async function onConfirm() {
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

  return (
    <div className="flex flex-col gap-6">
      <section
        className="bg-white"
        style={{ borderRadius: 18.75, padding: 30, border: "1px solid #E5E5E5" }}
      >
        <div className="flex items-start justify-between gap-4">
          <h3
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: "#585858" }}
          >
            Current thesis
          </h3>
          <button
            type="button"
            onClick={() => setShowJson((v) => !v)}
            className="text-xs underline"
            style={{ color: "#585858" }}
          >
            {showJson ? "Hide JSON" : "Show JSON"}
          </button>
        </div>
        <pre
          className="mt-4 whitespace-pre-wrap text-sm"
          style={{ fontFamily: "var(--font-sans)", lineHeight: 1.6 }}
        >
          {summary}
        </pre>
        {showJson ? (
          <pre
            data-testid="thesis-json"
            className="mt-4 overflow-x-auto rounded-md p-3 text-xs"
            style={{
              background: "#F5F4F2",
              fontFamily: "var(--font-mono)",
              border: "1px solid #E5E5E5",
            }}
          >
            {JSON.stringify(thesis, null, 2)}
          </pre>
        ) : null}
      </section>

      <section
        className="bg-white"
        style={{ borderRadius: 18.75, padding: 30, border: "1px solid #E5E5E5" }}
      >
        <h3
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: "#585858" }}
        >
          What would you like to change?
        </h3>
        <form onSubmit={onRefineSubmit} className="mt-4 flex flex-col gap-3">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={refining || previewing || applying}
            placeholder="Refinement instruction (e.g., add Japan to regions)..."
            className="min-h-[100px] w-full rounded-md px-3 py-2 text-sm"
            style={{ border: "1px solid #E5E5E5", background: "white" }}
          />
          {!previewing ? (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitDisabled}
                className="btn btn-primary"
              >
                {refining ? "Refining..." : "Refine"}
              </button>
            </div>
          ) : null}
        </form>

        {previewing && diff ? (
          <div className="mt-4 flex flex-col gap-3">
            <h4
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "#585858" }}
            >
              Proposed changes
            </h4>
            <DiffLines diff={diff} />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={applying}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirmDisabled}
                className="btn btn-primary"
              >
                {applying ? "Applying..." : "Confirm"}
              </button>
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="mt-3 text-sm" role="alert" style={{ color: "#a30000" }}>
            {errorMessage}
          </p>
        ) : null}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -- thesis-chat-artifact`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 372 passed (367 + 5 new), 2 skipped.

- [ ] **Step 6: Commit**

```bash
git add components/thesis-chat-artifact.tsx tests/components/thesis-chat-artifact.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add ThesisChatArtifact (prose summary + refine input)

Pear-styled card that renders summariseThesis() output plus a
plain-English refinement textarea. Reuses /api/thesis/refine for the
diff preview and /api/thesis/[id] PATCH on confirm — endpoints
unchanged. JSON view is hidden behind a Show JSON toggle so the prose
is the primary editing surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Migrate `/thesis/[id]` to the pipeline layout

Rewrite both `app/thesis/[id]/page.tsx` (server) and `app/thesis/[id]/thesis-detail.client.tsx` (client). Page fetches validation_runs alongside the existing thesis/universe/scan, derives steps via `deriveStepStates`, and renders `<PipelineLayout>` wrapping `<ThesisDetail>`. Client renders four `<PipelineSection>` children, with step 1's content being `<ThesisChatArtifact>` (replacing the old `<ThesisJsonView>` + `<ThesisEditor>` pair) and step 4 being a placeholder card.

**Files:**
- Modify: `app/thesis/[id]/page.tsx`
- Modify: `app/thesis/[id]/thesis-detail.client.tsx`

- [ ] **Step 1: Rewrite `app/thesis/[id]/page.tsx`**

Replace the file contents with:

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getQuote } from "@/lib/data/yahoo";
import { ScanResultsSchema, type ScanResults } from "@/lib/schemas/scan";
import { ThesisIdSchema, type Thesis } from "@/lib/schemas/thesis";
import type { Universe } from "@/lib/schemas/universe";
import { DriverValidationResultSchema, type DriverValidationResult } from "@/lib/schemas/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PipelineLayout } from "@/components/pipeline-layout";
import { deriveStepStates } from "@/lib/pipeline-steps";
import { ThesisDetail } from "./thesis-detail.client";

export default async function ThesisViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const idCheck = ThesisIdSchema.safeParse(id);
  if (!idCheck.success) {
    notFound();
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("theses")
    .select("id, user_id, thesis")
    .eq("id", id)
    .maybeSingle();

  if (error || !data || data.user_id !== user.id || !data.thesis) {
    notFound();
  }

  const thesis = data.thesis as unknown as Thesis;

  let initialUniverse: Universe | null = null;
  if (thesis.universe_id) {
    const { data: uRow } = await supabase
      .from("universes")
      .select("id, created_by, universe")
      .eq("id", thesis.universe_id)
      .maybeSingle();
    if (uRow && uRow.created_by === user.id && uRow.universe) {
      initialUniverse = uRow.universe as unknown as Universe;
    }
  }

  let initialScan: ScanResults | null = null;
  {
    const { data: sRows } = await supabase
      .from("scan_runs")
      .select("results")
      .eq("thesis_id", id)
      .order("run_at", { ascending: false })
      .limit(1);
    const raw = sRows?.[0]?.results;
    if (raw) {
      const parsed = ScanResultsSchema.safeParse(raw);
      if (parsed.success) initialScan = parsed.data;
    }
  }

  let initialValidation: Record<string, DriverValidationResult> | null = null;
  {
    const { data: vRows } = await supabase
      .from("validation_runs")
      .select("results")
      .eq("thesis_id", id)
      .order("run_at", { ascending: false })
      .limit(1);
    const raw = vRows?.[0]?.results;
    if (raw && typeof raw === "object") {
      const acc: Record<string, DriverValidationResult> = {};
      for (const [driverId, value] of Object.entries(raw as Record<string, unknown>)) {
        const parsed = DriverValidationResultSchema.safeParse(value);
        if (parsed.success) acc[driverId] = parsed.data;
      }
      initialValidation = Object.keys(acc).length > 0 ? acc : null;
    }
  }

  const seedNames: Record<string, string> = {};
  if (!initialUniverse && thesis.scope.tickers_seed.length > 0) {
    const results = await Promise.all(
      thesis.scope.tickers_seed.map(async (t) => {
        const quote = await getQuote(t);
        return [t, quote?.name ?? null] as const;
      }),
    );
    for (const [ticker, name] of results) {
      if (name) seedNames[ticker] = name;
    }
  }

  const steps = deriveStepStates({
    thesis,
    universe: initialUniverse,
    scan: initialScan,
    validationResults: initialValidation,
  });

  return (
    <PipelineLayout steps={steps} thesisId={thesis.id}>
      <ThesisDetail
        initial={thesis}
        initialUniverse={initialUniverse}
        initialScan={initialScan}
        initialValidation={initialValidation}
        seedNames={seedNames}
      />
    </PipelineLayout>
  );
}
```

- [ ] **Step 2: Rewrite `app/thesis/[id]/thesis-detail.client.tsx`**

Replace the file contents with:

```tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AnchorPicker } from "@/components/anchor-picker";
import { ScanPanel } from "@/components/scan-panel";
import { ThesisChatArtifact } from "@/components/thesis-chat-artifact";
import { UniverseTable } from "@/components/universe-table";
import { DriverEvidencePanel } from "@/components/driver-evidence-panel";
import { PipelineSection } from "@/components/pipeline-layout";
import type { ScanResults } from "@/lib/schemas/scan";
import type { Thesis } from "@/lib/schemas/thesis";
import type { Universe } from "@/lib/schemas/universe";
import type { DriverValidationResult } from "@/lib/schemas/validation";

interface ThesisDetailProps {
  initial: Thesis;
  initialUniverse: Universe | null;
  initialScan: ScanResults | null;
  initialValidation: Record<string, DriverValidationResult> | null;
  seedNames?: Record<string, string>;
}

interface DroppedTicker {
  ticker: string;
  reason: string;
}

export function ThesisDetail({
  initial,
  initialUniverse,
  initialScan,
  initialValidation,
  seedNames,
}: ThesisDetailProps) {
  const router = useRouter();
  const [thesis, setThesis] = useState<Thesis>(initial);
  const [universe, setUniverse] = useState<Universe | null>(initialUniverse);
  const [picking, setPicking] = useState<boolean>(initialUniverse === null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<DroppedTicker[]>([]);

  async function handleBuild(anchor: string) {
    setBuilding(true);
    setBuildError(null);
    setDropped([]);
    try {
      const res = await fetch("/api/universe/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis_id: thesis.id, anchor_ticker: anchor }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            universe?: Universe;
            dropped?: DroppedTicker[];
            error?: string;
            detail?: string;
          }
        | null;
      if (!res.ok || !body?.universe) {
        setBuildError(
          body?.detail ?? body?.error ?? `Build failed (${res.status})`,
        );
        setBuilding(false);
        return;
      }
      setUniverse(body.universe);
      setThesis((t) => ({ ...t, universe_id: body.universe!.id }));
      setDropped(body.dropped ?? []);
      setPicking(false);
      setBuilding(false);
      router.refresh();
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Unexpected error");
      setBuilding(false);
    }
  }

  function handleRefresh() {
    setPicking(true);
    setUniverse(null);
  }

  return (
    <>
      <PipelineSection id="step-thesis" title="Thesis extraction">
        <ThesisChatArtifact thesis={thesis} onApplied={setThesis} />
      </PipelineSection>

      <PipelineSection id="step-universe" title="Universe construction">
        <div className="flex flex-col gap-4">
          {picking || universe === null ? (
            <AnchorPicker
              tickers_seed={thesis.scope.tickers_seed}
              tickerNames={seedNames}
              onSubmit={handleBuild}
              disabled={building}
            />
          ) : (
            <UniverseTable
              initial={universe}
              onSaved={setUniverse}
              onRefresh={handleRefresh}
            />
          )}
          {dropped.length > 0 ? (
            <details
              className="rounded-md p-3 text-xs"
              style={{
                background: "#F5F4F2",
                border: "1px solid #E5E5E5",
                color: "#585858",
              }}
            >
              <summary className="cursor-pointer font-medium">
                {dropped.length} ticker(s) filtered during build
              </summary>
              <ul className="mt-2 list-disc pl-5">
                {dropped.map((d) => (
                  <li key={d.ticker}>
                    <code className="font-mono">{d.ticker}</code> — {d.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {buildError ? (
            <p className="text-sm" role="alert" style={{ color: "#a30000" }}>
              {buildError}
            </p>
          ) : null}
        </div>
      </PipelineSection>

      <PipelineSection id="step-insights" title="Gather insights">
        {universe ? (
          <div className="flex flex-col gap-8">
            <ScanPanel
              thesisId={thesis.id}
              universeId={universe.id}
              initial={initialScan}
            />
            {initialValidation ? (
              <div className="flex flex-col gap-6">
                {thesis.drivers.industry.map((driver) => {
                  const v = initialValidation[driver.id];
                  if (!v) return null;
                  return (
                    <DriverEvidencePanel
                      key={driver.id}
                      driver_id={driver.id}
                      driver_claim={driver.claim}
                      bull_evidence={v.bull_evidence}
                      bear_evidence={v.bear_evidence}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "#585858" }}>
            Build the universe to enable insights.
          </p>
        )}
      </PipelineSection>

      <PipelineSection id="step-memo" title="Memo">
        <div
          className="bg-white"
          style={{
            borderRadius: 18.75,
            padding: 30,
            border: "1px solid #E5E5E5",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-playfair)",
              fontWeight: 500,
              fontSize: 24,
            }}
          >
            Memo coming soon
          </h3>
          <p className="mt-2 text-sm" style={{ color: "#585858" }}>
            Once validation completes, the memo fills in here.
          </p>
        </div>
      </PipelineSection>
    </>
  );
}
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: 372 passed, 2 skipped. The thesis-detail file has no direct test; integration is exercised indirectly through component tests.

- [ ] **Step 4: Visual smoke check**

Start the dev server: `npm run dev`
Open `http://localhost:3000/thesis/<an-existing-thesis-id>` in a browser. Confirm:
1. The sticky header shows four cyan circles (1–4) with the labels Thesis extraction / Universe construction / Gather insights / Memo.
2. Clicking step 2 smoothly scrolls down to the Universe section.
3. The thesis content area shows a white card with a prose summary (not the old JSON).
4. The Show JSON toggle reveals the JSON below the prose.
5. The live log drawer sits at the bottom and is collapsed by default; clicking the chevron expands it.

Stop the server (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add app/thesis/[id]/page.tsx app/thesis/[id]/thesis-detail.client.tsx
git commit -m "$(cat <<'EOF'
feat(ui): switch /thesis/[id] to PipelineLayout + ThesisChatArtifact

Replaces ThreePanelLayout with the new four-step PipelineLayout shell.
Server-side step state derivation now reads validation_runs alongside
universe + scan_runs. ThesisJsonView + ThesisEditor are replaced by the
chat-style artifact; the rest of the section content (universe table,
scan panel, driver evidence) is unchanged behaviourally but moves into
PipelineSection wrappers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Restyle the landing page `/`

Replace the centred card with a Pear hero band — Playfair `<h1>`, Inter subtext, primary cyan + outline CTA pair.

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx`**

Overwrite with:

```tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";

export default async function Home() {
  await requireUser();

  return (
    <main className="min-h-screen bg-pear-off-white">
      <section className="container mx-auto px-6 lg:px-12 py-24">
        <div className="max-w-3xl">
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-black)" }}
          >
            altree research
          </span>
          <h1
            className="mt-4"
            style={{
              fontFamily: "var(--font-playfair)",
              fontWeight: 500,
              fontSize: "clamp(2.5rem, 5vw + 1rem, 3.75rem)",
              lineHeight: 1.1,
            }}
          >
            Investment thesis research, end to end.
          </h1>
          <p
            className="mt-6 text-lg"
            style={{ color: "#585858", maxWidth: 560, lineHeight: 1.6 }}
          >
            Extract structure from prose, build a universe, gather supporting
            and threshold-breach evidence, and decide whether the thesis
            still holds.
          </p>
          <div className="mt-8 flex gap-4">
            <Link href="/thesis/new" className="btn btn-primary">
              New thesis
            </Link>
            <form action="/sign-out" method="post">
              <button type="submit" className="btn btn-outline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: 372 passed, 2 skipped.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
feat(ui): restyle landing page to Pear hero

Off-white surface, Playfair headline, Inter subtext, primary cyan
"New thesis" + outline "Sign out" CTA pair per Pear pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Restyle `/sign-in`

Centred Pear card on off-white: Playfair `<h2>`, Inter form labels, primary cyan submit. Behaviour unchanged.

**Files:**
- Modify: `app/sign-in/page.tsx`

- [ ] **Step 1: Replace `app/sign-in/page.tsx`**

Overwrite with:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";

type Status = "idle" | "sending" | "sent";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    setError(null);
    setStatus("sending");
    try {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: "/",
      });
      if (result.error) {
        setError(result.error.message ?? "Failed to send magic link");
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setStatus("idle");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-pear-off-white p-6">
      <div
        className="w-full max-w-md bg-white"
        style={{
          borderRadius: 18.75,
          padding: 30,
          border: "1px solid #E5E5E5",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-playfair)",
            fontWeight: 500,
            fontSize: "clamp(1.75rem, 3vw, 2rem)",
            lineHeight: 1.15,
          }}
        >
          Sign in
        </h2>
        <p className="mt-2 text-sm" style={{ color: "#585858" }}>
          Enter your email to receive a magic link.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" style={{ color: "#585858" }}>
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "sending"}
              className="rounded-md px-3 py-2 text-sm"
              style={{
                background: "white",
                border: "1px solid #E5E5E5",
                color: "var(--color-black)",
              }}
              placeholder="you@example.com"
            />
          </label>

          <button
            type="submit"
            disabled={status === "sending" || email.length === 0}
            className="btn btn-primary"
          >
            {status === "sending" ? "Sending..." : "Send magic link"}
          </button>

          {error ? (
            <p className="text-sm" role="alert" style={{ color: "#a30000" }}>
              {error}
            </p>
          ) : null}

          {status === "sent" ? (
            <p
              className="rounded-md px-3 py-2 text-sm"
              style={{ background: "#CCFAFF", color: "var(--color-black)" }}
            >
              Check your terminal — the link was logged there in dev mode.
            </p>
          ) : null}
        </form>

        <p className="mt-6 text-xs" style={{ color: "#585858" }}>
          Dev mode: the magic link is logged to the Next.js server console —
          copy it and paste into the browser.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: 372 passed, 2 skipped.

- [ ] **Step 3: Commit**

```bash
git add app/sign-in/page.tsx
git commit -m "$(cat <<'EOF'
feat(ui): restyle /sign-in as a Pear card

Off-white surface with a centred white card (18.75px radius, 30px
padding), Playfair heading, primary cyan submit button. Magic-link
flow unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Restyle `/thesis/new` page + extract form

Pear card on off-white; the extract form's inputs and submit get Pear surfaces and the `.btn-primary` class.

**Files:**
- Modify: `app/thesis/new/page.tsx`
- Modify: `components/thesis-extract-form.tsx`

- [ ] **Step 1: Replace `app/thesis/new/page.tsx`**

Overwrite with:

```tsx
import { requireUser } from "@/lib/auth/require-user";
import { ThesisExtractForm } from "@/components/thesis-extract-form";

export default async function NewThesisPage() {
  await requireUser();

  return (
    <main className="min-h-screen bg-pear-off-white py-16">
      <div className="container mx-auto px-6 lg:px-12">
        <div className="max-w-2xl mx-auto">
          <h1
            style={{
              fontFamily: "var(--font-playfair)",
              fontWeight: 500,
              fontSize: "clamp(2rem, 4vw, 2.5rem)",
              lineHeight: 1.15,
            }}
          >
            New thesis
          </h1>
          <p className="mt-3 text-base" style={{ color: "#585858" }}>
            Paste a thesis snippet — we&apos;ll extract the structured object
            and let you refine it from there.
          </p>
          <div
            className="mt-8 bg-white"
            style={{
              borderRadius: 18.75,
              padding: 30,
              border: "1px solid #E5E5E5",
            }}
          >
            <ThesisExtractForm />
          </div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Restyle `components/thesis-extract-form.tsx`**

In `components/thesis-extract-form.tsx`, replace the textarea className and the submit button as follows. Other logic is unchanged.

Find:

```tsx
<textarea
  value={snippet}
  onChange={(e) => setSnippet(e.target.value)}
  disabled={submitting}
  className="min-h-[200px] w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100"
  placeholder="Paste the investment thesis prose here (minimum 20 characters)..."
/>
```

Replace with:

```tsx
<textarea
  value={snippet}
  onChange={(e) => setSnippet(e.target.value)}
  disabled={submitting}
  className="min-h-[200px] w-full rounded-md px-3 py-2 text-sm"
  style={{
    background: "white",
    border: "1px solid #E5E5E5",
    color: "var(--color-black)",
  }}
  placeholder="Paste the investment thesis prose here (minimum 20 characters)..."
/>
```

Find:

```tsx
<button
  type="submit"
  disabled={disabled}
  className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
>
  {submitting ? "Extracting..." : "Extract thesis"}
</button>
```

Replace with:

```tsx
<button type="submit" disabled={disabled} className="btn btn-primary">
  {submitting ? "Extracting..." : "Extract thesis"}
</button>
```

Find the label span:

```tsx
<span className="text-sm font-medium text-neutral-700">
  Paste thesis prose
</span>
```

Replace with:

```tsx
<span className="text-sm font-medium" style={{ color: "#585858" }}>
  Paste thesis prose
</span>
```

And the char count:

```tsx
<span className="text-xs text-neutral-500">
  {snippet.trim().length} chars
</span>
```

Replace with:

```tsx
<span className="text-xs" style={{ color: "#585858" }}>
  {snippet.trim().length} chars
</span>
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: 372 passed, 2 skipped. `tests/components/thesis-extract-form.test.tsx` exercises behaviour (submit → POST → redirect), not classNames, so it stays green.

- [ ] **Step 4: Commit**

```bash
git add app/thesis/new/page.tsx components/thesis-extract-form.tsx
git commit -m "$(cat <<'EOF'
feat(ui): restyle /thesis/new and ThesisExtractForm to Pear

Pear card shell with Playfair heading; textarea + submit adopt the
Pear input surface and .btn-primary utility. Behaviour unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Restyle inner components (AnchorPicker, UniverseTable, ScanPanel, DriverEvidencePanel)

Class-by-class swaps. The existing component tests assert on roles/text, not classNames, so they remain green. Each file gets the minimal swap to Pear surfaces; do not change props or behaviour.

**Files:**
- Modify: `components/anchor-picker.tsx`
- Modify: `components/universe-table.tsx`
- Modify: `components/scan-panel.tsx`
- Modify: `components/driver-evidence-panel.tsx`

- [ ] **Step 1: Restyle `components/anchor-picker.tsx`**

Find:

```tsx
<input
  type="text"
  value={ticker}
  onChange={(e) => setTicker(e.target.value)}
  disabled={disabled}
  placeholder="Yahoo ticker (e.g. RHM.DE)"
  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100"
/>
```

Replace with:

```tsx
<input
  type="text"
  value={ticker}
  onChange={(e) => setTicker(e.target.value)}
  disabled={disabled}
  placeholder="Yahoo ticker (e.g. RHM.DE)"
  className="w-full rounded-md px-3 py-2 text-sm"
  style={{
    background: "white",
    border: "1px solid #E5E5E5",
    color: "var(--color-black)",
  }}
/>
```

Find the submit button:

```tsx
<button
  type="submit"
  disabled={submitDisabled}
  className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
>
  Build universe →
</button>
```

Replace with:

```tsx
<button type="submit" disabled={submitDisabled} className="btn btn-primary">
  Build universe →
</button>
```

Find the chip button:

```tsx
<button
  type="button"
  key={t}
  onClick={() => handleChipClick(t)}
  disabled={disabled}
  title={name ? `${t} — ${name}` : t}
  className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
>
```

Replace with:

```tsx
<button
  type="button"
  key={t}
  onClick={() => handleChipClick(t)}
  disabled={disabled}
  title={name ? `${t} — ${name}` : t}
  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
  style={{
    background: "var(--color-pear-cyan-light)",
    border: "1px solid #E5E5E5",
    color: "var(--color-black)",
  }}
>
```

- [ ] **Step 2: Restyle `components/scan-panel.tsx`**

For both the "Run scan" button (the initial-empty-state one) and the "Re-run scan" button, replace the bare `bg-neutral-900 ...` className strings with `className="btn btn-secondary"`. For the surrounding wrapper boxes:

Find:

```tsx
<article className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-800">
  {scan.descriptive_markdown}
</article>
```

Replace with:

```tsx
<article
  className="whitespace-pre-wrap rounded-md p-4 text-sm"
  style={{
    background: "white",
    border: "1px solid #E5E5E5",
    color: "var(--color-black)",
    borderRadius: 18.75,
  }}
>
  {scan.descriptive_markdown}
</article>
```

Find the dashed empty-state wrapper:

```tsx
<div className="flex flex-col gap-3 rounded-md border border-dashed border-neutral-300 p-4">
```

Replace with:

```tsx
<div
  className="flex flex-col gap-3 rounded-md p-4"
  style={{ border: "1px dashed #E5E5E5" }}
>
```

Find the dropped-tickers details:

```tsx
<details className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
```

Replace with:

```tsx
<details
  className="rounded-md p-3 text-xs"
  style={{
    background: "#F5F4F2",
    border: "1px solid #E5E5E5",
    color: "#585858",
  }}
>
```

- [ ] **Step 3: Restyle `components/universe-table.tsx`**

Apply the following exact find/replace pairs. Keep all `value`, `onChange`, `disabled`, `onClick`, and other prop logic identical.

(a) Table outer wrapper. Find:

```tsx
<div className="overflow-x-auto rounded-md border border-neutral-200">
```

Replace with:

```tsx
<div
  className="overflow-x-auto"
  style={{
    background: "white",
    border: "1px solid #E5E5E5",
    borderRadius: 18.75,
  }}
>
```

(b) `<thead>`. Find:

```tsx
<thead className="bg-neutral-50 text-neutral-700">
```

Replace with:

```tsx
<thead style={{ background: "#F5F4F2", color: "#585858" }}>
```

(c) Exposure-tier `<select>`. Find:

```tsx
className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900"
```

Replace with:

```tsx
className="rounded px-2 py-1 text-xs"
style={{ background: "white", border: "1px solid #E5E5E5", color: "var(--color-black)" }}
```

(d) Notes `<input>`. Find:

```tsx
className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 placeholder:text-neutral-400"
```

Replace with:

```tsx
className="w-full rounded px-2 py-1 text-xs"
style={{ background: "white", border: "1px solid #E5E5E5", color: "var(--color-black)" }}
```

(e) Per-row Remove button. Find:

```tsx
<button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100"
                  >
                    Remove
                  </button>
```

Replace with:

```tsx
<button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="rounded px-2 py-0.5 text-xs"
                    style={{ background: "white", border: "1px solid #E5E5E5", color: "#585858" }}
                  >
                    Remove
                  </button>
```

(f) Add-row sub-card wrapper. Find:

```tsx
<div className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
```

Replace with:

```tsx
<div
          className="flex flex-col gap-2 rounded-md p-3"
          style={{ background: "#F5F4F2", border: "1px solid #E5E5E5" }}
        >
```

(g) New-ticker `<input>` inside the add-row card. Find:

```tsx
<input
              type="text"
              value={newRowTicker}
              onChange={(e) => setNewRowTicker(e.target.value)}
              placeholder="New Yahoo ticker (e.g. DASF.PA)"
              className="flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
              disabled={addingPending}
            />
```

Replace with:

```tsx
<input
              type="text"
              value={newRowTicker}
              onChange={(e) => setNewRowTicker(e.target.value)}
              placeholder="New Yahoo ticker (e.g. DASF.PA)"
              className="flex-1 rounded px-2 py-1 text-sm"
              style={{ background: "white", border: "1px solid #E5E5E5", color: "var(--color-black)" }}
              disabled={addingPending}
            />
```

(h) Add-row submit button. Find:

```tsx
className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400"
```

Replace with:

```tsx
className="btn btn-secondary"
              style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}
```

(i) Add-row Cancel button. Find:

```tsx
className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
```

Replace with:

```tsx
className="btn btn-outline"
              style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}
```

(j) "+ Add row" button. Find:

```tsx
className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
```

Replace with:

```tsx
className="btn btn-outline"
            style={{ padding: "0.375rem 0.75rem", fontSize: "0.75rem" }}
```

(k) "Refresh from scope" button. Find:

```tsx
<button
          type="button"
          onClick={onRefresh}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Refresh from scope
        </button>
```

Replace with:

```tsx
<button
          type="button"
          onClick={onRefresh}
          className="btn btn-outline"
        >
          Refresh from scope
        </button>
```

(l) "Save" button. Find:

```tsx
<button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {saving ? "Saving..." : "Save"}
        </button>
```

Replace with:

```tsx
<button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="btn btn-primary"
        >
          {saving ? "Saving..." : "Save"}
        </button>
```

(m) Save error paragraph. Find:

```tsx
<p className="text-sm text-red-600" role="alert">
          {saveError}
        </p>
```

Replace with:

```tsx
<p className="text-sm" role="alert" style={{ color: "#a30000" }}>
          {saveError}
        </p>
```

(n) Add-row error paragraph. Find:

```tsx
<p className="text-xs text-red-600" role="alert">
              {addError}
            </p>
```

Replace with:

```tsx
<p className="text-xs" role="alert" style={{ color: "#a30000" }}>
              {addError}
            </p>
```

- [ ] **Step 4: Restyle `components/driver-evidence-panel.tsx`**

Replace the file contents with:

```tsx
import type { CorpusEvidence } from "@/lib/schemas/validation";

export type DriverEvidencePanelProps = {
  driver_id: string;
  driver_claim: string;
  bull_evidence: CorpusEvidence[];
  bear_evidence: CorpusEvidence[];
};

function EvidenceChip({ e }: { e: CorpusEvidence }) {
  return (
    <li
      className="space-y-1 text-sm"
      style={{
        background: "white",
        border: "1px solid #E5E5E5",
        borderRadius: 18.75,
        padding: 16,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{e.expert}</span>
        <span className="text-xs" style={{ color: "#585858" }}>
          {e.date.slice(0, 10)}
        </span>
      </div>
      <div className="text-xs">
        <a
          href={e.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: "var(--color-electric-cyan)" }}
        >
          {e.post_title}
        </a>
      </div>
      <blockquote className="italic" style={{ color: "#585858" }}>
        &ldquo;{e.quote}&rdquo;
      </blockquote>
    </li>
  );
}

export function DriverEvidencePanel(props: DriverEvidencePanelProps) {
  return (
    <section className="space-y-4">
      <header>
        <h3 className="text-base font-semibold">{props.driver_id}</h3>
        <p className="text-sm" style={{ color: "#585858" }}>
          {props.driver_claim}
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-semibold mb-2">Supporting evidence</h4>
          {props.bull_evidence.length === 0 ? (
            <p className="text-xs" style={{ color: "#585858" }}>
              No supporting evidence found in corpus.
            </p>
          ) : (
            <ul className="space-y-2">
              {props.bull_evidence.map((e, i) => (
                <EvidenceChip key={`${e.post_id}-${i}`} e={e} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-2">
            Threshold-breach evidence
          </h4>
          {props.bear_evidence.length === 0 ? (
            <p className="text-xs" style={{ color: "#585858" }}>
              No threshold-breach evidence found in corpus.
            </p>
          ) : (
            <ul className="space-y-2">
              {props.bear_evidence.map((e, i) => (
                <EvidenceChip key={`${e.post_id}-${i}`} e={e} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 372 passed, 2 skipped. Component tests for AnchorPicker, UniverseTable, ScanPanel etc. assert on role/text not on classNames, so they stay green. If any test breaks because of a swap, restore the relevant accessible label or role before continuing.

- [ ] **Step 6: Visual smoke check via dev server**

Run: `npm run dev`
Visit a `/thesis/[id]` with an existing universe + scan. Confirm:
- Anchor picker / universe table / scan panel all render against the off-white surface inside white Pear cards.
- Buttons are pill-shaped with cyan primary or black secondary.
- Driver evidence panels show cyan-coloured post-title links.
Stop server (Ctrl+C).

- [ ] **Step 7: Commit**

```bash
git add components/anchor-picker.tsx components/universe-table.tsx components/scan-panel.tsx components/driver-evidence-panel.tsx
git commit -m "$(cat <<'EOF'
feat(ui): restyle inner pipeline components to Pear

Swaps bg-neutral-*/border-neutral-* class strings for Pear surfaces
(white cards on off-white, 1px #E5E5E5 borders, 18.75px radii) and
replaces bg-neutral-900 buttons with .btn .btn-primary / .btn-secondary.
DriverEvidencePanel gets cyan post-title links. No behavioural change;
all existing component tests stay green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Delete dead components + their tests

`ThreePanelLayout`, `ThesisJsonView`, `ThesisEditor`, and `StageList` no longer have any importers. Delete the source files and the matching test files.

**Files:**
- Delete: `components/three-panel-layout.tsx`
- Delete: `components/thesis-json-view.tsx`
- Delete: `components/thesis-editor.tsx`
- Delete: `components/stage-list.tsx`
- Delete: `tests/components/stage-list.test.tsx`
- Delete: `tests/components/thesis-json-view.test.tsx`
- Delete: `tests/components/thesis-editor.test.tsx`

- [ ] **Step 1: Verify no remaining importers**

Run:
```bash
grep -rn "ThreePanelLayout\|ThesisJsonView\|ThesisEditor\|StageList" app components lib tests --include='*.ts' --include='*.tsx' | grep -v ' 2\.tsx\| 2\.ts'
```
Expected: only matches inside the four source files and their three test files (which are about to be deleted). No matches in `app/` or `lib/`. If any other file references them, stop and resolve before deleting.

- [ ] **Step 2: Delete the seven files**

Run:
```bash
rm components/three-panel-layout.tsx components/thesis-json-view.tsx components/thesis-editor.tsx components/stage-list.tsx
rm tests/components/stage-list.test.tsx tests/components/thesis-json-view.test.tsx tests/components/thesis-editor.test.tsx
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: 364 passed (372 − 8 deleted tests: 1 StageList + 1 ThesisJsonView + 6 ThesisEditor), 2 skipped.

- [ ] **Step 4: Commit**

```bash
git add -u components/ tests/components/
git commit -m "$(cat <<'EOF'
chore(ui): drop ThreePanelLayout, ThesisJsonView, ThesisEditor, StageList

These four components are no longer imported by any page after the
PipelineLayout / ThesisChatArtifact migration. Their tests are also
removed; the new pipeline-* and thesis-chat-artifact tests cover the
replacement surfaces.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Final verification

Run the full test suite one more time, plus a manual walk through every restyled route.

- [ ] **Step 1: Full test run**

Run: `npm test`
Expected: 364 passed, 2 skipped.

- [ ] **Step 2: Build smoke check**

Run: `npm run build`
Expected: clean build with no TypeScript errors.

- [ ] **Step 3: Dev server walkthrough**

Run: `npm run dev`. In a browser:

a) Visit `/` (after sign-in if needed). Confirm: off-white background, Playfair "Investment thesis research, end to end." headline, cyan "New thesis" + outline "Sign out" CTA pair.

b) Sign out → visit `/sign-in`. Confirm: Pear white card centred on off-white, Playfair "Sign in", primary cyan "Send magic link" button.

c) Sign back in → visit `/thesis/new`. Confirm: Pear card, Playfair "New thesis" heading, primary cyan "Extract thesis" button.

d) Open an existing thesis at `/thesis/<id>`. Confirm:
- Sticky 4-step pipeline header at top with cyan circles, click-to-scroll works.
- Step 1 shows prose summary in a white card; Show JSON toggle works.
- Refinement input: type "no-op change", press Refine — diff preview renders; Cancel works.
- Step 2 shows the universe table (or anchor picker if no universe).
- Step 3 shows scan panel + driver evidence cards (where present).
- Step 4 shows the "Memo coming soon" placeholder card.
- Live log drawer at the bottom is collapsed by default; chevron expands it.

Stop the dev server (Ctrl+C).

- [ ] **Step 4: No commit if nothing changed**

If steps 1–3 surfaced no regressions, do not commit. The cycle is complete.

If a regression appeared, fix it now with a targeted commit that names the regression in its message. Re-run the full test suite before stopping.

---

## Out of scope (deferred, per spec)

- Persisted `thesis_messages` table (stateless chat first).
- Memo (S12) actual content.
- S2.5 region taxonomy refresh.
- S8 XYZZY red-team test.
- S9 sequential drivers / `prior_lens_evidence`.
- Dark mode.
- Accessibility audit beyond what comes for free with semantic HTML in the new components.
- Pear-styled error / empty-state design system audit beyond the spots touched here.
