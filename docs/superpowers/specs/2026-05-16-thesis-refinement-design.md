# S2: Thesis NL refinement with diff confirmation — design

**Issue:** [#3](https://github.com/wangzaa/altree-research/issues/3)
**Builds on:** S1 (#2, closed) — `lib/schemas/thesis.ts`, `lib/anthropic/client.ts`, `lib/agents/thesis-extractor.ts`, `app/api/thesis/[id]/route.ts`.
**Status:** Design approved 2026-05-16.

## Goal

Let the user refine an existing draft thesis using a natural-language instruction ("add Japan to regions", "tighten the M1 break threshold to 1.5y"), preview a structured diff of the proposed change, and Apply or Cancel it. Apply persists the new thesis and bumps `theses.version` in place.

## Decisions

These five design choices were resolved during brainstorming on 2026-05-16. Each was a real open question in the issue; the chosen path is recorded so future readers don't relitigate.

| # | Choice                  | Decision                                                                                                                                                          |
|---|-------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1 | Versioning model        | **In-place bump.** Update the existing row's `thesis` jsonb and increment `version`. No history table. If a later slice needs history, add `thesis_versions` then. |
| 2 | Refine-agent pattern    | **Mirror `thesis-extractor`.** Forced `tool_use` against a tool whose input schema mirrors `ThesisSchema`. Model returns full proposed thesis; we Zod-validate.    |
| 3 | Diff UI rendering       | **Inline change blocks.** One semantic block per change (`Changed` / `Added` / `Removed`) showing path + before→after. Reads like a redline.                       |
| 4 | Persist endpoint shape  | **`PATCH /api/thesis/[id]`.** Body is the proposed thesis JSON. Leaves `POST` free for future child-resource actions.                                              |
| 5 | No-op detection         | **Server-side deep-equal.** Diff is empty when current == proposed; UI disables Apply iff diff is empty. No model-side no-op signal.                              |

## Architecture

```
lib/agents/thesis-refiner.ts        ← new: mirror of thesis-extractor.ts
lib/diff/thesis-diff.ts             ← new: pure diffThesis(current, proposed) -> ThesisDiff
app/api/thesis/refine/route.ts      ← new: POST { thesis_id, instruction } -> { current, proposed, diff }
app/api/thesis/[id]/route.ts        ← edit: add PATCH handler
components/thesis-editor.tsx        ← new: instruction input + diff preview + Apply/Cancel
app/thesis/[id]/page.tsx            ← edit: mount ThesisEditor alongside existing JSON view
```

No schema changes. The existing `theses` table already has the `version` integer column.

## Components

### `lib/agents/thesis-refiner.ts`

Mirrors `lib/agents/thesis-extractor.ts`. Exports:

```ts
interface RefineThesisInput {
  current: Thesis;
  instruction: string;
}
type RefineThesisResult =
  | { ok: true; thesis: Thesis }
  | { ok: false; error: string; raw?: unknown };

async function refineThesis(input: RefineThesisInput): Promise<RefineThesisResult>
```

Implementation:
- Forced `tool_use` (`tool_choice: { type: "tool", name: "propose_thesis" }`).
- Tool input schema is functionally identical to the extractor's (returns a full thesis), so the tool definition is factored to a shared module if duplication becomes noisy — otherwise duplicated inline for clarity.
- System prompt:
  > You are a research analyst refining an existing investment thesis. You receive the current thesis as JSON and an instruction from the analyst. Propose a new thesis that applies *only* the change the instruction asks for. Leave every other field unchanged. Preserve the existing `id`, `version`, `createdAt`, `createdBy`, and `source_snippet` fields exactly.
  > Plus all the same domain rules from the extractor system prompt (regions enum, tickers, thesis_breaks_below invariant, etc.).
- User message: serialize the current thesis as JSON inside a fenced block, followed by the instruction.
- Merge: identical envelope pattern to the extractor (id/version/createdAt/createdBy preserved from input.current, not trusted from tool output), then `ThesisSchema.safeParse`.

### `lib/diff/thesis-diff.ts`

Pure function. No I/O.

```ts
type PathChange = { path: string; before?: unknown; after?: unknown };
type ThesisDiff = {
  added: PathChange[];
  removed: PathChange[];
  changed: PathChange[];
};

function diffThesis(current: Thesis, proposed: Thesis): ThesisDiff
```

Recursive walker over the JSON tree. Path strings use dot notation with bracketed indices (`drivers.industry[0].thesis_breaks_below`) and `[id=...]` for keyed-by-id arrays (`drivers.industry[id=M1].thesis_breaks_below`).

**Array comparison modes (hard-coded by path prefix):**

| Path                                         | Mode          | Diff entries                                    |
|----------------------------------------------|---------------|-------------------------------------------------|
| `scope.regions`                              | Set           | `added`/`removed` of elements; order ignored.   |
| `scope.sectors`                              | Set           | Same.                                           |
| `scope.tickers_seed`                         | Set           | Same.                                           |
| `scope.tickers_exclude`                      | Set           | Same.                                           |
| `drivers.industry`                           | Keyed by `id` | Element ops emit `added[id=...]` / `removed[id=...]` / `changed[id=...].field`. |
| `drivers.industry[id=*].evidence`            | Positional    | Index-based diff (mostly empty in S2).          |
| All other arrays                             | Positional    | Index-based diff.                               |

Fields excluded from the diff (immutable envelope): `id`, `version`, `createdAt`, `createdBy`, `source_snippet`.

### `app/api/thesis/refine/route.ts`

`POST { thesis_id: string, instruction: string }`

1. Validate body shape (Zod).
2. Resolve session (mirror existing extract route).
3. Fetch current thesis from `theses` table by `id` (scoped to session user).
4. Call `refineThesis({ current, instruction })`.
5. If `ok: false` → `502 { error: "refine_failed", detail }` (Anthropic failure) or `422 { error: "invalid_thesis", path }` (Zod failure).
6. Compute `diffThesis(current, proposed)`.
7. Respond `200 { current, proposed, diff }`.

Does not write to the database.

### `app/api/thesis/[id]/route.ts` (extend existing)

Add `PATCH` handler. Body is the proposed thesis JSON.

1. Resolve session.
2. Validate body with `ThesisSchema`.
3. Assert `body.id === param.id`. Mismatch → `400 { error: "id_mismatch" }`.
4. Fetch row to confirm ownership; 404 if missing.
5. Update row: `thesis = body`, `version = version + 1`.
6. Respond `200 { thesis: <row> }`.

### `components/thesis-editor.tsx`

Client component. Lives in the middle panel of the three-panel layout on `/thesis/[id]`. Props: `{ thesis: Thesis }` (the current row).

Local state:
- `instruction: string`
- `proposed: Thesis | null`
- `diff: ThesisDiff | null`
- `status: "idle" | "refining" | "applying" | "error"`
- `errorMessage: string | null`

Subviews:
- Instruction textarea + Submit button (disabled while `refining`).
- When `diff !== null`: the diff preview rendered as inline change blocks (see below) plus an action row (Apply, Cancel).
- Apply is disabled when `diff.added.length + diff.removed.length + diff.changed.length === 0`.
- Apply calls `PATCH /api/thesis/[id]` with `proposed`, then on success replaces the page's baseline thesis and clears `proposed` + `diff`.
- Cancel clears `proposed` + `diff`; no network call.

**Inline change block markup (visual reference):**

```
≡ Changed  drivers.industry[id=M1].thesis_breaks_below
           2.5  →  1.5

≡ Added    scope.regions
           + "JAPAN"

≡ Removed  scope.tickers_exclude
           − "TSLA"
```

Pure presentational; styling via Tailwind. No external diff libraries.

### `app/thesis/[id]/page.tsx` (extend existing)

Mount `<ThesisEditor thesis={thesis} />` inside the middle panel, alongside the existing `ThesisJsonView`. The page becomes a controlled-baseline parent: after Apply, it re-renders the JSON view against the freshly persisted row.

## Data flow

```
[user types instruction]
   ↓
POST /api/thesis/refine { thesis_id, instruction }
   ↓
fetch current row → refineThesis(current, instruction) → ThesisSchema.parse
   ↓
diffThesis(current, proposed)
   ↓
200 { current, proposed, diff }    |    422 invalid_thesis    |    502 refine_failed
   ↓
[client renders inline change blocks; Apply disabled iff diff empty]
   ↓ (Apply)                                  ↓ (Cancel)
PATCH /api/thesis/[id] body=proposed         clear proposed + diff
   ↓
validate → replace row's thesis → version++
   ↓
200 { thesis: row }
   ↓
[client updates baseline; diff clears]
```

## Error handling

| Failure                                | HTTP | Body                                          |
|----------------------------------------|------|-----------------------------------------------|
| Refine body shape wrong                | 400  | `{ error: "bad_request", detail }`            |
| Thesis ID not found                    | 404  | `{ error: "not_found" }`                      |
| Anthropic call fails                   | 502  | `{ error: "refine_failed" }`                  |
| Proposed thesis fails Zod              | 422  | `{ error: "invalid_thesis", path: [...] }`    |
| PATCH body fails Zod                   | 422  | `{ error: "invalid_thesis", path: [...] }`    |
| PATCH body id mismatches param         | 400  | `{ error: "id_mismatch" }`                    |
| Persist write fails                    | 500  | `{ error: "persist_failed" }`                 |

Concurrent-edit detection (If-Match / 409) intentionally out of scope. S2 is single-user; revisit when multi-user lands.

## Testing

| File                                          | Scope                                                                                                                                                                                                                                              |
|-----------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/diff/thesis-diff.test.ts`              | Three AC-mandated change classes + edges: scalar change (`drivers.industry[id=M1].thesis_breaks_below: 2.5→1.5`); array push (`scope.regions` + JAPAN); nested object replacement (full `falsification`); empty diff on deep-equal; mixed multi-change diff; set vs positional handling; keyed-by-id behavior. |
| `tests/agents/thesis-refiner.test.ts`         | Mirror extractor tests. Mock Anthropic client; assert tool schema shape, system-prompt invariants, Zod-rejection path, envelope-preservation (id/version/createdAt/createdBy not overwritten from tool output).                                       |
| `tests/api/thesis-refine.test.ts`             | POST happy-path, 404 not_found, 422 invalid_thesis, 502 refine_failed, 400 bad_request.                                                                                                                                                            |
| `tests/api/thesis-patch.test.ts`              | PATCH happy-path (verify version bump), 422 invalid, 400 id_mismatch, 404 not_found.                                                                                                                                                              |
| `tests/components/thesis-editor.test.tsx`     | Submit triggers refine fetch; Apply disabled on empty diff; Cancel clears proposed; Apply triggers PATCH and updates baseline; error states render.                                                                                                |

## Acceptance criteria mapping

Every AC from issue #3 traced to where it is satisfied:

- "add Japan to regions" → adds JAPAN, no other changes: covered by `thesis-refiner.test.ts` (instruction → tool output) + `thesis-diff.test.ts` (only one entry in `added`).
- "tighten the M1 break threshold to 1.5y" → changes `drivers.industry[id=M1].thesis_breaks_below`: same.
- Apply persists, bumps version, diff re-renders against new baseline: `thesis-patch.test.ts` + `thesis-editor.test.tsx`.
- Cancel leaves thesis unchanged: `thesis-editor.test.tsx`.
- Refine refuses invalid Zod (422 with path): `thesis-refine.test.ts`.
- No-op instruction → empty diff, Apply disabled: `thesis-diff.test.ts` + `thesis-editor.test.tsx`.
- JSON-diff renderer covers three change classes: `thesis-diff.test.ts`.

## YAGNI cuts

- Concurrent-edit detection (If-Match / 409) — defer to multi-user slice.
- Refinement history / undo — defer.
- Streaming the refine response — defer.
- Multi-turn conversational refinement — defer.

## Risks and open questions

- **Tool schema duplication.** The refiner's tool schema is nearly identical to the extractor's. If they drift apart silently we'll have inconsistent thesis shapes. Mitigation: write a shared schema-to-tool-input converter if duplication exceeds ~80 lines; otherwise duplicate explicitly and add a test that asserts structural equivalence at runtime.
- **Diff over keyed-by-id drivers.** If the model renames or reorders driver `id`s (e.g., changes M1 → DRV1), the diff will look like one driver removed and another added, which is misleading. Mitigation: refiner system prompt explicitly forbids changing driver ids; refiner test asserts this; if a future model behaves badly we add a stable-id resolver.
- **`scope.market_cap_min_usd` shape.** A scalar field — should diff cleanly as a "Changed" entry. No special handling required.
