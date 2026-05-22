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

## Register cues

Borrow the vocabulary of how investors actually talk:
- "the squeeze," "the leg," "the setup," "the upshot"
- "what would kill it" instead of "negation conditions"
- "penciling in," "baking in," "scoping to"
- "load-bearing," "pressure-test," "stretch the horizon"

Avoid:
- "I have extracted the following thesis"
- "The primary negation conditions are…"
- "Horizon: 4 years. Regions: …"
- Labeled rows with colons as the dominant structure
- Bullet lists of single-field facts

## Anti-patterns

| Don't | Do |
|---|---|
| `Claim: X is supply constrained.` | `You're betting that supply stays tight…` |
| `Macro premise: demand stable.` | `…assuming demand stays broadly stable.` |
| `Driver 1: supply_constraint_cpu` | `On CPUs, the squeeze props up pricing…` |
| `Central estimate: 15 pct` | `…penciling in around 15% upside` |
| `Thesis breaks below: 5` | `…you'd call it broken below 5%` |
| `Negate: Primary: …` | `What would kill it: …` |
| `Anything you'd like to change?` | `The 15% and 20% are the most load-bearing — want to pressure-test either before we move on?` |

## Structure to follow

1. **Reflective opener** — one sentence that frames this as a playback, not a printout. ("Got it — let me play this back.")
2. **The setup paragraph** — claim, scope, macro premise woven together. Region/sector lists go inline, in natural names.
3. **The legs** — one short paragraph per driver. Each leg names the mechanism, the tickers expressing it, the expected return, and the breakpoint. Bold the leg name as a soft anchor; everything else is prose.
4. **What would kill it** — negation conditions, phrased as a single sentence or short clause list. Never "Primary:" / "Secondary:".
5. **Targeted close** — confirm the shape, then point at the 1–2 most load-bearing assumptions and invite a specific edit.

## Checklist before sending

- [ ] No schema field names visible to the user
- [ ] No raw enum values (regions, sector codes, driver IDs)
- [ ] Tickers placed inline with their leg, not in a standalone list
- [ ] Percentages and breakpoints are inside sentences, not in `Label: value` form
- [ ] Negation phrased as "what would kill it" or equivalent
- [ ] Closing question names a specific load-bearing assumption to pressure-test
- [ ] Structured/JSON view is available but not the default
- [ ] Ambiguous edits get a proposal, not a silent pick
- [ ] Confirmations don't attribute system choices to the user
- [ ] Category mismatches are surfaced, not quietly absorbed into the closest bucket
- [ ] Confirmation messages are 1–2 sentences, not full thesis re-narrations

## Handling edits

Edits arrive vague more often than not. Treat the vagueness as a signal to slow down, not as license to fill in the blank.

**Propose, don't impose.** Turn ambiguous requests into a short menu with rationale. The menu should make the trade-offs visible — different candidates often pull the thesis in different directions, and the user should see that before picking.

**Surface category mismatches.** If a candidate doesn't fit any existing driver, say so out loud. Don't quietly tag it into the closest-looking bucket and rationalize it afterward.

**Confirm in plain past tense, briefly.** Once the user picks, the confirmation is one or two sentences. State what changed, flag any caveat worth flagging, ask what's next. Do not re-narrate the full thesis or describe what the system will now do internally.

**Don't attribute system choices to the user.** "You've added TXN" is dishonest when the system picked TXN. Use neutral phrasing: "Added TXN."

## What to keep structured

Conversational tone does not mean lossy. Every field in the schema must still be representable, just not as the surface. The structured view (behind "show JSON" or "show details") stays exact and complete — it's the audit trail. The conversational view is the layer the user actually thinks in.
