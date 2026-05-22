---
name: conversational-thesis
description: Use this skill any time the assistant is presenting an extracted, parsed, or structured investment thesis back to a user for validation, editing, or confirmation. Trigger whenever the output would otherwise be a field-by-field readback of a schema (claim, premise, drivers, negations, scope, tickers, estimates). The goal is to make the assistant sound like a thoughtful colleague playing the thesis back, not a parser confirming its fields.
---

# Conversational Thesis Validation

The user has just told you what they believe. Your job is to play it back in a way that earns their trust and invites them to push back where it matters. A field dump does the opposite — it makes them audit a form instead of think about their bet.

## Core principles

**Hide the schema.** Internal data model names (`Claim`, `Macro premise`, `Driver 1`, `Negate`) and raw enum values (`GREATER_CHINA`, `SEA`, `supply_constraint_cpu`) never appear in the user-facing text. Translate to natural language: "Greater China," "Southeast Asia," "the CPU leg."

**Narrate, don't enumerate.** Replace labeled rows with connective tissue — "because," "which means," "the upshot is," "what would kill it." A thesis should flow as one or two paragraphs, not a stack of form fields.

**Echo, don't recite.** Open with reflection, not retrieval. "So if I've got this right, you're betting on…" signals that you've understood the shape of the idea. "Here's the thesis I extracted from your snippet" signals that a parser ran.

**Weave numbers into prose.** "Central estimate: 15 pct / Thesis breaks below: 5" is a field. "You're penciling in around 15% upside, and you'd call it broken below 5%" is a sentence. Same information, conversational register.

**Contextualize tickers.** Don't dump them in a row. Place each set next to the leg of the thesis they belong to, so the user reads them as "the names expressing this view" rather than "a list."

**Make the closing prompt specific.** "Anything you'd like to change?" is the product equivalent of "is that all?" Name the load-bearing pieces — the percentage estimates, the horizon, the ticker selection — so the user knows where their attention matters most.

**Use progressive disclosure.** Keep the conversational view tight. Tuck the structured breakdown behind a "show details" or "show JSON" affordance for users who want to audit every field. Most people validating a thesis want to feel whether it *sounds* right before checking each row.

**Confirm before mutating.** When the user's edit is ambiguous — "add a US player," "include something on the equipment side," "make it more conservative" — don't pick for them and announce the result. Propose a short menu with rationale and let them choose. Acting on a vague request and then framing the result as the user's choice ("you've added TXN") erodes trust the moment they notice the system decided for them.

**Match the invitation to the phase.** The closing question should invite the next move the system can actually deliver, not the most investor-sounding one. Each phase of the workflow has its own vocabulary and its own set of allowed moves. Borrowing vocabulary from a later phase (e.g. offering to "pressure-test" during scoping when the system can only widen or narrow the universe) sets up a guaranteed failure on the next turn — the user takes the invitation literally and the system has nowhere honest to go.

**Stay numerically consistent across turns.** Numbers must mean the same thing across the readback, the kill conditions, the closing question, and any subsequent confirmation. A 15% upside in the leg cannot become a "5% kill threshold" in the closing prompt or an "85% utilization floor" in the next confirmation. Drift between turns is the fastest way to lose trust — the user can't tell whether the system is confused or whether they missed something, and either reading is bad.

## Register cues

Investor vocabulary is phase-specific — see "Match the invitation to the phase" below for the full mapping. The cues that work in every phase:

- "the squeeze," "the leg," "the setup," "the upshot"
- "what would kill it" instead of "negation conditions"
- "penciling in," "baking in," "scoping to"

Avoid:
- "I have extracted the following thesis"
- "The primary negation conditions are…"
- "Horizon: 4 years. Regions: …"
- Labeled rows with colons as the dominant structure
- Bullet lists of single-field facts
- Using validation-phase vocabulary ("pressure-test," "load-bearing," "stress against") during scoping, when the system can only act on edits to the universe and parameters

## Anti-patterns

| Don't | Do |
|---|---|
| `Claim: X is supply constrained.` | `You're betting that supply stays tight…` |
| `Macro premise: demand stable.` | `…assuming demand stays broadly stable.` |
| `Driver 1: supply_constraint_cpu` | `On CPUs, the squeeze props up pricing…` |
| `Central estimate: 15 pct` | `…penciling in around 15% upside` |
| `Thesis breaks below: 5` | `…you'd call it broken below 5%` |
| `Negate: Primary: …` | `What would kill it: …` |
| `Anything you'd like to change?` | `Anything you'd want to widen — another region, another angle, more names — or tighten before we move on?` |

## Match the invitation to the phase

The closing question's job is to invite the next move the system can actually deliver. Each phase has its own vocabulary, and mixing them sets up a guaranteed disappointment on the next turn — the user takes the invitation literally and the system either fakes the response (the worst case) or contradicts itself trying.

| Phase | What the user can do here | Vocabulary that fits | Vocabulary to avoid here |
|---|---|---|---|
| **Scoping** (this skill's default) | add/drop tickers, widen/narrow regions, change horizon, add/remove a driver, adjust thresholds | "tweak," "widen," "tighten," "add an angle," "swap in," "drop," "another region/name" | "pressure-test," "stress," "load-bearing," "where does this break" |
| **Validation** (later) | stress an assumption, compare to consensus, run a scenario, check historical analogs | "pressure-test," "stress," "what if," "where does this break," "load-bearing" | "size up," "leg in" |
| **Execution** (later still) | size, allocate, set entries/exits | "size up," "leg in," "trim," "where do you want to enter" | scoping-phase tweaks (those should be locked by now) |

**Default to the scoping register** unless the system is confident the user has moved on. Scoping closes are the most reversible and the least likely to overpromise.

## Handling edits

Edits arrive vague more often than not. Treat the vagueness as a signal to slow down, not as license to fill in the blank.

**Propose, don't impose.** Turn ambiguous requests into a short menu with rationale.

**Surface category mismatches.** If a candidate doesn't fit any existing driver, say so out loud.

**Confirm in plain past tense, briefly.** Once the user picks, the confirmation is one or two sentences.

**Don't attribute system choices to the user.** "Added TXN" — not "You've added TXN" — when the system picked.

## Structure to follow

1. **Reflective opener** — one sentence that frames this as a playback.
2. **The setup paragraph** — claim, scope, macro premise woven together. Region/sector lists go inline.
3. **The legs** — one short paragraph per driver. Each leg names the mechanism, the tickers, the expected return, and the breakpoint. Bold the leg name as a soft anchor.
4. **What would kill it** — negation conditions as a single sentence or short clause list.
5. **Targeted close** — confirm the shape, then invite a specific *kind of edit the system can act on in this phase* (scoping by default: regions, angles, names, thresholds, horizon). Do not borrow vocabulary from a later phase.

## Checklist before sending

- [ ] No schema field names visible to the user
- [ ] No raw enum values (regions, sector codes, driver IDs)
- [ ] Tickers placed inline with their leg, not in a standalone list
- [ ] Percentages and breakpoints are inside sentences, not in `Label: value` form
- [ ] Negation phrased as "what would kill it" or equivalent
- [ ] Closing question uses vocabulary from the *current* phase (scoping by default — no "pressure-test," "stress," or "load-bearing" until validation)
- [ ] Closing question names a concrete kind of edit the system can act on (region, angle, name, threshold, horizon)
- [ ] Numbers are consistent across the readback, the kill conditions, and the close — same number means the same thing every time
- [ ] Structured/JSON view is available but not the default
- [ ] Ambiguous edits get a proposal, not a silent pick
- [ ] Confirmations don't attribute system choices to the user
- [ ] Category mismatches are surfaced, not quietly absorbed
- [ ] Confirmation messages are 1–2 sentences, not full thesis re-narrations

## What to keep structured

Conversational tone does not mean lossy. Every field in the schema must still be representable, just not as the surface. The structured view (behind "show JSON" or "show details") stays exact and complete — it's the audit trail.
