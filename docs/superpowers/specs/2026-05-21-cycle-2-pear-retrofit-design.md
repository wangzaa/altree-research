# Cycle 2 — Pear Retrofit, New 4-Step Layout, Chat-Style Thesis Artifact

**Date:** 2026-05-21
**Parent:** GitHub issue #1
**Predecessors:** PR #19 (S6 expert-corpus), PR #20 (S11 OpenRouter/agent-models)
**Direction:** [Pear design system](../../../../design/pear-design-system/SKILL.md)

## Why

Three motivations bundled into one cycle:

1. **Visual identity.** The app currently uses default Tailwind defaults (white surface, Geist sans). The Pear brand (electric cyan accent on warm off-white, Playfair Display + Inter) is the chosen aesthetic for everything user-facing.
2. **Information architecture.** The current three-panel layout (left stages list / centre artifact / right log) is dense. The new shape — a four-step pipeline header above a single content column — narrows the user's focus to one stage at a time and matches the "How It Works" pattern from Pear.
3. **Editing model.** The current `/thesis/[id]` page renders thesis JSON in a structured view with a separate refinement input. Users find the JSON intimidating. Replacing it with a prose-summary + plain-English instruction textbox makes refinement conversational without changing the underlying data model.

## Scope

**In:**

1. Pear design tokens + Inter/Playfair fonts at the global level (`app/globals.css`, `app/layout.tsx`).
2. `PipelineLayout` component replacing `ThreePanelLayout` on `/thesis/[id]`.
3. `StepNumber` component (cyan circle + Playfair numeral + cyan→grey connector).
4. Pear button utility classes (`.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-outline-white`).
5. Chat-style thesis artifact (stateless): template-rendered prose summary + plain-English input. Replaces the JSON view as the primary editing surface.
6. 6-stage → 4-step IA collapse with the new mapping (see §4).
7. Restyle the four routes (`/`, `/sign-in`, `/thesis/new`, `/thesis/[id]`) to Pear surfaces, type, buttons, cards.
8. LiveLog moves to a collapsible bottom drawer.
9. Scroll-reveal `.reveal` class with the Pear easing curve, `prefers-reduced-motion` respected.

**Out (deferred or dropped):**

- Persisted chat-message thread (a `thesis_messages` table). Stateless first; persistence is a follow-up.
- Memo (S12) content itself — render a Pear placeholder card.
- S2.5 region taxonomy refresh.
- S8 XYZZY red-team test.
- S9 sequential drivers / `prior_lens_evidence`.
- Authentication route polish beyond minimal Pear restyle.
- Dark mode (Pear is light-first; dark deferred indefinitely).

## Decisions made during brainstorm

| Decision | Choice |
|---|---|
| Scope size | Full retrofit + chat artifact in one cycle. |
| Chat persistence | Stateless. Prose summary regenerates from current thesis state on each render. No new DB table. |
| Pipeline navigation | Status indicator + click-to-scroll. Each step is an anchored section on `/thesis/[id]`. No state-machine locking. |
| Live Log location | Collapsible bottom drawer, default collapsed, toggle in pipeline header. |
| Tokens utility naming | `pear-` prefix (`bg-pear-cyan`, `text-pear-off-white`, etc.) — avoids collision with default Tailwind names. |
| Existing utilities | Stay as-is. We migrate component-by-component, not via global remap. |
| JSON view | Hidden by default behind a `Show JSON` toggle on the thesis-extraction section. |

## Components

### 1. Tokens + fonts — `app/globals.css` + `app/layout.tsx`

`app/globals.css`:

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

/* Pear button utilities — declared as CSS rather than Tailwind components
   because Tailwind v4 @theme is for tokens, not full classes. */
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
.btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.btn:active { transform: translateY(0) scale(0.98); box-shadow: none; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

.btn-primary { background: var(--color-electric-cyan); color: var(--color-black); }
.btn-primary:hover { background: var(--color-black); color: var(--color-white); }

.btn-secondary { background: var(--color-black); color: var(--color-white); }
.btn-secondary:hover { background: var(--color-electric-cyan); color: var(--color-black); }

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

/* Scroll reveal */
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

`app/layout.tsx`:

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
      <body className={`${inter.variable} ${playfair.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

### 2. `StepNumber` and `PipelineHeader` — `components/pipeline-header.tsx`

```typescript
export type PipelineStep = {
  id: string;            // anchor id, e.g. "step-thesis"
  label: string;         // e.g. "Thesis extraction"
  state: "pending" | "active" | "completed";
};

export function PipelineHeader({ steps }: { steps: PipelineStep[] }): JSX.Element;
```

Renders four `StepNumber` items in a horizontal flexbox with cyan→grey gradient connectors between them. Each circle:
- 48px diameter, `border-radius: 9999px`
- `background: var(--color-electric-cyan)` when active, `transparent + border` when pending, `var(--color-electric-cyan)` with darker background when completed
- Playfair numeral inside, centred, weight 500, 20px
- Active state adds `box-shadow: 0 4px 16px rgba(0,229,255,0.45)` (the Pear glow)
- Click → `document.getElementById(step.id).scrollIntoView({ behavior: "smooth" })`

Connector between circles: 1px height, `background: linear-gradient(to right, var(--color-electric-cyan), #B5B5B5)` for completed→active, solid `#E5E5E5` for pending. Stretches to fill the gap.

Below each numeral, the step `label` in Inter 14px, font-weight 500 — also dimmed at 60% opacity when pending.

Located: top of the page, full-width, sticky (`position: sticky; top: 0; z-index: 50`) with a subtle bottom border + off-white background.

### 3. `PipelineLayout` — `components/pipeline-layout.tsx`

Replaces `ThreePanelLayout`. Props:

```typescript
type PipelineLayoutProps = {
  thesisId?: string;
  steps: PipelineStep[];
  children: React.ReactNode;  // section content, each child wrapped in <PipelineSection>
};
```

Structure:

```
<main className="min-h-screen bg-pear-off-white">
  <PipelineHeader steps={steps} />       {/* sticky top */}
  <div className="container mx-auto px-6 lg:px-12 py-12 space-y-24">
    {children}                           {/* the four <PipelineSection> children */}
  </div>
  <LiveLogDrawer thesisId={thesisId} />  {/* fixed bottom, collapsible */}
</main>
```

`PipelineSection`: small wrapper that takes `id` + `title` and renders the anchor + Playfair section heading + content body. Each section is `min-height: 60vh` to ensure step-scroll anchors land cleanly.

### 4. Chat-style thesis artifact — `components/thesis-chat-artifact.tsx`

Replaces `ThesisEditor` + `ThesisJsonView` + the existing refinement form on `/thesis/[id]`.

```typescript
type ThesisChatArtifactProps = {
  thesis: Thesis;                  // current thesis state
  onRefine: (instruction: string) => Promise<RefinePreview>;
  onConfirmRefine: (next: Thesis) => Promise<void>;
};

type RefinePreview = {
  current: Thesis;
  proposed: Thesis;
  diff: string[];                  // human-readable diff lines, e.g. "scope.regions: added 'JAPAN'"
};
```

Layout (Pear card on `bg-white`, radius 18.75px, padding 30px):

```
┌─ Current thesis (summary) ─────────────────────────────────────┐
│                                                                 │
│ Your thesis: "<claim>"                                          │
│                                                                 │
│ Macro premise: <macro_premise>                                  │
│ Horizon: <horizon_years> years.                                 │
│ Scope: <regions joined>, sectors <gics names>,                  │
│        market cap > $<market_cap_min_usd / 1e9>B.               │
│                                                                 │
│ Drivers:                                                        │
│ 1. <claim> — central estimate <value> <unit>, breaks ↓ <break>. │
│    Applies to: <tickers joined>                                 │
│ 2. ...                                                          │
│                                                                 │
│ Falsification: <primary>[. <secondary>]                         │
│                                                                 │
│                                            [Show JSON]          │
└─────────────────────────────────────────────────────────────────┘

┌─ What would you like to change? ───────────────────────────────┐
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ Type a refinement instruction...                           │ │
│ │                                                            │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                              [Refine]           │
└─────────────────────────────────────────────────────────────────┘
```

**Summary rendering:** pure template, function `summariseThesis(t: Thesis): string` in `lib/thesis-summary.ts`. No LLM call. Falls back gracefully if any field is missing.

**Refinement flow:**
1. User types instruction, presses Refine
2. `onRefine(instruction)` calls existing `/api/thesis/refine` route (returns `RefinePreview`)
3. Modal/card replaces the input with a diff view:
   ```
   ┌─ Proposed changes ─────────────────────────────────────────┐
   │ + scope.regions: added 'JAPAN'                             │
   │ - drivers.industry[0].thesis_breaks_below: 2 → 1.5         │
   │                                                            │
   │ [Cancel]              [Confirm]                            │
   └────────────────────────────────────────────────────────────┘
   ```
4. On Confirm → `onConfirmRefine(proposed)` writes the new thesis to Supabase
5. Summary re-renders with the new state

**Show JSON toggle:** when clicked, expands a `<pre>` block below the summary with the full thesis JSON (read-only, Geist Mono). For debugging / power-users.

**Empty state (no thesis yet, on `/thesis/new`):** the artifact is just the input textarea labeled "Paste your thesis prose. I'll extract the structure and we can refine together." On submit, calls existing `/api/thesis/extract`. The extracted thesis renders the summary on `/thesis/[id]` after redirect.

### 5. `LiveLogDrawer` — `components/live-log-drawer.tsx`

Wraps the existing `LiveLog` from S11. Adds:

- Fixed position at bottom, full-width, off-white surface with top border + soft shadow when open
- Default collapsed: 36px tall header bar with "Live log" + chevron-up button + last-event timestamp
- Click chevron → expands to 30vh tall, scrollable. Chevron rotates 180°.
- Animation via `transition: height 0.3s var(--pear-ease)`

### 6. Page restyling

- **`/` (landing):** Pear hero — off-white bg, Playfair `<h1>` "Investment thesis research, end to end", Inter subtext, CTA pair (Primary cyan "New thesis" + Outline "Sign in"). Subtle scroll-reveal.
- **`/sign-in`:** centred Pear card (18.75px radius, 30px padding) on off-white, Playfair `<h2>`, Inter form labels, primary cyan submit button.
- **`/thesis/new`:** Pear card with the empty-state ThesisChatArtifact (textarea + submit).
- **`/thesis/[id]`:** PipelineLayout shell with four `PipelineSection` children:
  - `Thesis extraction`: ThesisChatArtifact
  - `Universe construction`: restyled universe-table (Pear card wrapper, Inter headers, cyan accent for primary actions, anchor-picker as Pear inputs)
  - `Gather insights`: restyled scan-panel (chart in white card, fundamentals table in beige sub-card) + DriverEvidencePanel (each lens as a Pear card with cyan post-title links)
  - `Memo`: Pear placeholder card with Playfair section heading "Memo coming soon" and a subtle hint that this fills when validation completes

Existing components (`UniverseTable`, `ScanPanel`, `ScanChart`, `PerTickerTable`, `DriverEvidencePanel`, `AnchorPicker`, `ThesisExtractForm`) all get a styling pass:
- Replace `bg-neutral-*` → `bg-white` (cards) or `bg-pear-off-white` (page surfaces)
- Replace `bg-blue-*` / `bg-indigo-*` → `bg-pear-cyan` (primary) or `bg-pear-black` (secondary)
- Headings → Playfair (h1, h2) or Inter semibold (h3)
- Card radius → 18.75px
- Borders → 1px `#E5E5E5`

### 7. 6 → 4 step mapping

| Existing stage | New step | Notes |
|---|---|---|
| 1. Thesis extraction | **Thesis extraction** | Chat artifact replaces JSON view. |
| 2. Universe build | **Universe construction** | Existing table retained, restyled. |
| 3. Scan | **Gather insights** (top half) | Scan chart + fundamentals snapshot. |
| 4. Validation (Bull/Bear) | **Gather insights** (bottom half) | DriverEvidencePanel per driver. |
| 5. Screener | — dropped — | Per direction change (S10 deferred indefinitely). |
| 6. Synthesizer / memo | **Memo** | Placeholder; content fills when S12 lands. |

### 8. Step state derivation

`PipelineHeader.steps[i].state` derived from page data:

| Step | `completed` when | `active` when | `pending` when |
|---|---|---|---|
| Thesis extraction | thesis exists and has all required fields | thesis is being edited (any time on this page is "active" for this step by default) | thesis is null/empty |
| Universe construction | `universe_id` resolves to an existing universe row with tickers | universe row exists but tickers empty / discovery in progress | thesis exists but no universe row |
| Gather insights | at least one `validation_runs` row with bull_evidence for at least one driver | scan_runs exists OR validate-driver is in flight | universe exists but no scan_runs |
| Memo | n/a (always pending until S12) | n/a | always |

The `active` state highlights one step at a time. Logic: lowest step whose `completed` is false. If all are complete, the highest is `active`.

## Acceptance criteria

- [ ] `app/globals.css` declares Pear tokens (`--color-electric-cyan`, `--color-off-white`, etc.) at `:root` AND in `@theme inline` so Tailwind utilities like `bg-pear-cyan` work.
- [ ] `app/layout.tsx` loads Inter + Playfair Display via `next/font/google`. Body font is Inter; Playfair available via `font-serif` utility.
- [ ] `body` background is `#F5F4F2` (off-white) visibly.
- [ ] `.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-outline-white` are usable from any page and match the Pear hover/active behaviour.
- [ ] `PipelineHeader` renders 4 step circles + 3 connectors, sticky at top, cyan glow on active step, click-to-scroll wires up.
- [ ] `PipelineLayout` replaces `ThreePanelLayout` for `/thesis/[id]`. The route still loads and shows thesis content.
- [ ] `ThesisChatArtifact` renders a prose summary of the current thesis (no LLM call). The summary updates after a refinement is confirmed.
- [ ] Refinement input + existing refiner agent still work end-to-end on a real thesis; diff confirmation appears as a Pear card.
- [ ] `Show JSON` toggle reveals the full thesis JSON in a `<pre>` block.
- [ ] `/` landing, `/sign-in`, `/thesis/new` are all visibly Pear-styled (off-white surface, Playfair headlines, Pear buttons, no remaining `bg-blue-*` / `bg-indigo-*` / default Tailwind defaults).
- [ ] `LiveLogDrawer` is collapsed by default, expands on chevron click, and the existing Realtime subscription from S11 still functions (model chip visible).
- [ ] `.reveal` class fades+slides in on intersection; honored when `prefers-reduced-motion: reduce`.
- [ ] All 347 existing tests still pass after the styling/structural changes.
- [ ] No remaining imports of `ThreePanelLayout` (deleted as part of the cycle).

## Out of scope (deferred)

- Persisted chat-message thread (`thesis_messages` table) — covered separately if/when the stateless artifact feels insufficient.
- Memo (S12) actual content generation.
- S2.5, S8, S9 — unchanged from prior cycle's deferred list.
- Dark mode.
- Pear-styled error/empty-state design system audit beyond the obvious spots.
- Accessibility audit (keyboard navigation of pipeline header, ARIA on the chat artifact, focus styles on Pear buttons).

## References

- Pear design system: `/Users/neo/Desktop/design/pear-design-system/SKILL.md`
- Predecessor specs in `docs/superpowers/specs/`
- Predecessor PRs: #19 (S6), #20 (S11)
