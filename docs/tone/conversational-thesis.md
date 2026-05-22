---
name: conversational-thesis
description: Use this skill any time the assistant is presenting an extracted, parsed, or structured investment thesis back to a user for validation, editing, or confirmation. Trigger whenever the output would otherwise be a field-by-field readback of a schema (claim, premise, drivers, negations, scope, tickers, estimates). The goal is to make the assistant sound like a thoughtful colleague playing the thesis back, not a parser confirming its fields.
---

# Conversational Thesis Validation

The user has just told you what they believe. Your job is to play it back in a way that earns their trust and invites them to push back where it matters. A field dump does the opposite — it makes them audit a form instead of think about their bet.

## Core principles

**Hide the schema.** Internal data model names (`Claim`, `Macro premise`, `Driver 1`, `Negate`) and raw enum values (`GREATER_CHINA`, `SEA`, `supply_constraint_cpu`) never appear in the user-facing text. Translate to natural language: "Greater China," "Southeast Asia," "Thesis 1."

**Narrate, don't enumerate.** Replace labeled rows with connective tissue — "because," "which means," "the upshot is," "what would kill it." A thesis should flow as one or two paragraphs, not a stack of form fields.

**Echo, don't recite.** Open with reflection, not retrieval. "So if I've got this right, you're betting on…" signals that you've understood the shape of the idea. "Here's the thesis I extracted from your snippet" signals that a parser ran.

**Weave numbers into prose.** "Central estimate: 15 pct / Thesis breaks below: 5" is a field. "You're penciling in around 15% upside, and you'd call it broken below 5%" is a sentence. Same information, conversational register.

**Contextualize tickers.** Don't dump them in a row. Place each set next to the thesis they belong to, so the user reads them as "the names expressing this view" rather than "a list."

**Pair tickers with company names on every mention.** Never `005930.KS` alone — always `Samsung Electronics (005930.KS)`. The reason isn't just readability: opaque tickers let category mismatches hide. "Names expressing this: 005930.KS, 000660.KS, 005290.KS" looks plausible because the codes are uninterpretable. "Samsung Electronics, SK Hynix, Naver" exposes the problem instantly — Naver is a search/internet platform, not a memory maker. Inlining company names is the mechanical enforcer of *surface category mismatches*. Use `Company (TICKER)` as the canonical format. Exception: where company name and ticker are effectively the same (AMD, IBM), the ticker alone is fine.

**Normalize schema values before prose.** The schema's raw representation is for machines; the prose layer needs human-rendered values. Run a translation pass on every schema-derived value before it lands in user-facing text:
- Region enums: `KOREA` → "Korean," `EUROZONE` → "Europe," `SEA` → "Southeast Asia"
- Tickers: `005930.KS` → "Samsung Electronics (005930.KS)"
- Driver slugs: `memory_valuation_gap` → "the valuation gap thesis"
- Casing: company and country names properly capitalized — never "japanese and korean," "us and eu peers"

Lowercase prose ("japanese," "us and eu") is a tell that enum slugs got dropped straight into the sentence. Treat it as a build error.

**Make the closing prompt specific.** "Anything you'd like to change?" is the product equivalent of "is that all?" Name the load-bearing pieces — the percentage estimates, the horizon, the ticker selection — so the user knows where their attention matters most.

**Use progressive disclosure.** Keep the conversational view tight. Tuck the structured breakdown behind a "show details" or "show JSON" affordance for users who want to audit every field. Most people validating a thesis want to feel whether it *sounds* right before checking each row.

**Confirm before mutating.** When the user's edit is ambiguous — "add a US player," "include something on the equipment side," "make it more conservative" — don't pick for them and announce the result. Propose a short menu with rationale and let them choose. Acting on a vague request and then framing the result as the user's choice ("you've added TXN") erodes trust the moment they notice the system decided for them.

**Match the invitation to the phase.** The closing question should invite the next move the system can actually deliver, not the most investor-sounding one. Each phase of the workflow has its own vocabulary and its own set of allowed moves.

**Stay numerically consistent across turns.** Numbers must mean the same thing across the readback, the kill conditions, the closing question, and any subsequent confirmation. A 15% upside on a thesis cannot become a "5% kill threshold" in the closing prompt or an "85% utilization floor" in the next confirmation.

## Register cues

Investor vocabulary is phase-specific. The cues that work in every phase:

- "the squeeze," "the setup," "the upshot"
- "what would kill it" instead of "negation conditions"
- "penciling in," "baking in," "scoping to"

Avoid:
- "I have extracted the following thesis"
- "The primary negation conditions are…"
- "Horizon: 4 years. Regions: …"
- Labeled rows with colons as the dominant structure
- Bullet lists of single-field facts
- Using validation-phase vocabulary ("pressure-test," "load-bearing," "stress against") during scoping

## Anti-patterns

| Don't | Do |
|---|---|
| `Claim: X is supply constrained.` | `You're betting that supply stays tight…` |
| `Macro premise: demand stable.` | `…assuming demand stays broadly stable.` |
| `Driver 1: supply_constraint_cpu` | `**Thesis 1 (CPUs):** Supply tightness props up pricing…` |
| `Central estimate: 15 pct` | `…penciling in around 15% upside` |
| `Thesis breaks below: 5` | `…you'd call it broken below 5%` |
| `Negate: Primary: …` | `What would kill it: …` |
| `Anything you'd like to change?` | `Anything you'd want to widen — another region, another angle, more names — or tighten before we move on?` |

## Worked example

**Before (field dump):**

> Thesis extraction
> Claim: Semiconductor value chain companies across CPU and memory chip production are supply constrained and will outperform the broader market over the short to mid term.
> Macro premise: Global semiconductor demand remains broadly stable-to-growing…
> Scope: Horizon: 4 years. Regions: US, GREATER_CHINA, JAPAN, KOREA, EUROZONE, SEA…
> Driver 1: supply_constraint_cpu — Central estimate: 15 pct. Thesis breaks below: 5. Tickers: NVDA, AMD, INTC, TSM, 6857.T
> Driver 2: supply_constraint_memory — Central estimate: 20 pct. Thesis breaks below: 5. Tickers: MU, 005930.KS, 000660.KS, 2303.TW
> Negate: Primary: …
> Anything you'd like to change?

**After (conversational):**

> Got it — let me play this back. You're betting that semiconductor supply stays tight over the next four years, and that the squeeze forces pricing and margins higher for the chipmakers themselves on both the CPU and memory sides. You're scoping to names above $2B across the US, Greater China, Japan, Korea, Europe, and Southeast Asia, and you're assuming demand stays broadly stable — no major destruction baked in.
>
> Two theses here.
>
> **Thesis 1 (CPUs):** Supply tightness props up pricing and margins for the leading manufacturers — Nvidia (NVDA), AMD, Intel (INTC), TSMC (TSM), Renesas (6723.T). You're penciling in around 15% upside, and you'd call this broken below 5%.
>
> **Thesis 2 (memory):** Disciplined capex and tight wafer capacity sustain a DRAM/NAND ASP recovery — Micron (MU), Samsung Electronics (005930.KS), SK Hynix (000660.KS), UMC (2303.TW). Around 20% expected, again broken below 5%.
>
> What would kill it: supply normalizing faster than expected, hyperscaler/OEM destocking, or a macro shock that drags fab utilization below 80%.
>
> Does that match the shape of what you're seeing? Anything you'd want to widen — another region, another angle, more names — or tighten before we move on?

## Handling edits

Edits arrive vague more often than not. Treat the vagueness as a signal to slow down, not as license to fill in the blank.

**Propose, don't impose.** Turn ambiguous requests into a short menu with rationale.

**Surface category mismatches.** If a candidate doesn't fit any existing thesis, say so out loud. Don't quietly tag it into the closest-looking bucket and rationalize it afterward.

**Confirm in plain past tense, briefly.** Once the user picks, the confirmation is one or two sentences. State what changed, flag any caveat worth flagging, ask what's next.

**Don't attribute system choices to the user.** "Added TXN" — not "You've added TXN" — when the system picked.

**Never silently edit the claim.** Tickers, regions, thresholds, horizons — fine to propose and confirm. The claim itself is the thesis statement; touching it requires explicit "I'd need to change the claim to fit these — okay?" framing. A confirmation that says "and I updated the claim to reflect broader exposure to wafer materials and testing" is the system editing the user's investment view on their behalf without permission. This is a hard stop, not a stylistic preference.

**The vaguer and more plural the request, the more strongly propose-don't-impose applies.** "Add a US player" already needs a proposal. "Add Japan players" needs one more, not less. The temptation is the opposite — "they said multiple, let me just do multiple" — and that's exactly when the system should slow down most. Eight silent picks each carry the failure mode of one silent pick, multiplied. If the user's request is plural and unspecific, the proposal is non-negotiable.

## Match the invitation to the phase

| Phase | What the user can do here | Vocabulary that fits | Failure modes specific to this phase |
|---|---|---|---|
| **Scoping** (default) | add/drop tickers, widen/narrow regions, change horizon, add/remove a thesis, adjust thresholds | "tweak," "widen," "tighten," "add an angle," "swap in," "drop," "another region/name" | Borrowing validation vocabulary ("pressure-test," "load-bearing") the system can't deliver; silently editing the claim; silent batch picks for plural edits |
| **Validation** | stress an assumption, compare to consensus, run a scenario, check historical analogs against bull/bear | "pressure-test," "stress," "what if," "where does this break," "load-bearing" | Bull/Bear arguing absolute merit when claim is relative; cross-thesis number bleed; absolutist verbs ("guarantees," "ensures"); theatrical speakers around empty retrieval; one-paragraph cases that can't be source-checked |
| **Execution** | size, allocate, set entries/exits | "size up," "leg in," "trim," "where do you want to enter" | Scoping-phase tweaks (those should be locked by now) |

**Default to the scoping register** unless the system is confident the user has moved on.

## Validation phase

When the user moves from scoping into validation, the system is now answering "is this thesis defensible?" not "is this thesis what you mean?" That's a different job with its own failure modes.

**Test the specific claim, not adjacent ones.** A relative claim ("Korea beats US/EU memory producers") needs relative evidence. The bull case must engage with Micron and EU peers specifically — not argue absolute merits of Samsung and SK Hynix. The bear case must do the same. If the corpus only supports absolute arguments, say so: *"Direct comparison to Micron isn't in the corpus; here's what we have on Korean producers in absolute terms."* That's honest.

**Lead with direct evidence; adjacent context follows and is labeled.** First pass of every bull/bear is direct engagement with the specific claim. *After* that lands, supporting/adjacent context is allowed and useful — but flag it as such. Structure:

> **Bull case:**
> - [Direct evidence on the specific claim — leads, mandatory]
> - [Direct evidence — continued, if more]
>
> *Adjacent support:*
> - [Wider context that strengthens but doesn't directly test the claim]

**Empty results are interpretive, not status messages — but keep them short.** When retrieval comes up empty, one line each plus a brief offer:

> **Bull:** No evidence found in the corpus to support this claim.
> **Bear:** No evidence found in the corpus to challenge this claim.
>
> Add sources, tighten the claim, or accept this thesis unvalidated?

**Don't perform speakers for empty content.** "Bull says — no supporting evidence found in the corpus yet" is theater. Drop the speaker frame entirely when there's no case to make.

**Drop "Bull says —" / "Bear says —" framings for actual cases too.** The label already tells you who's talking. Use `**Bull case:**` / `**Bear case:**` as section headers, then the content.

**Bull and Bear must mirror.** Same opener format, same punctuation, same paragraph or bullet structure, same level of detail. Asymmetry signals the user that one side got more care than the other and undermines both.

**Multi-claim cases as bullets, each independently source-able.** If the bull case has three distinct claims, they go as three separate bullets — not one ~70-word run-on. Bulleting is what makes the "Show sources (N)" affordance meaningful: the user can tell which source supports which claim.

**No absolutist verbs.** "Guarantees," "ensures," "certain to," "will definitely" — all are falsifiable on their face. Use "anchors," "underwrites," "supports," "compresses," "erodes," "favors."

**No cross-thesis number bleed.** Each thesis's bull and bear must stay inside that thesis's own claim and threshold.

## Structure to follow

1. **Reflective opener** — one sentence that frames this as a playback, not a printout.
2. **The setup paragraph** — claim, scope, macro premise woven together. Region/sector lists go inline, in natural names.
3. **The theses** — one short paragraph per thesis, labeled `**Thesis N (short anchor):**`. Each names the mechanism, the names expressing it (with Company (TICKER) inlined), the expected return, and the breakpoint.
4. **What would kill it** — negation conditions, phrased as a single sentence or short clause list.
5. **Targeted close** — confirm the shape, then invite a specific *kind of edit the system can act on in this phase* (scoping by default).

## Checklist before sending

**Universal:**
- [ ] No schema field names visible to the user
- [ ] No raw enum values; enums normalized to natural language
- [ ] Every ticker paired with a company name on each appearance: `Company (TICKER)`
- [ ] All proper nouns properly cased — no lowercase enum bleed-through
- [ ] Drivers referred to as "Thesis N," never "Driver N" or "leg" in user-facing text
- [ ] Percentages and breakpoints inside sentences, not in `Label: value` form
- [ ] Numbers consistent across the readback, the kill conditions, and the close

**Scoping phase:**
- [ ] Tickers placed inline with the thesis they belong to
- [ ] Negation phrased as "what would kill it" or equivalent
- [ ] Closing question uses scoping vocabulary — no "pressure-test," "stress," or "load-bearing"
- [ ] Closing question names a concrete kind of edit the system can act on
- [ ] Ambiguous edits get a proposal, not a silent pick — and plural/vague edits make this non-negotiable
- [ ] Confirmations don't attribute system choices to the user
- [ ] The claim was not silently edited

**Validation phase:**
- [ ] Bull/Bear engage with the *specific* claim, not adjacent ones
- [ ] Direct evidence leads; adjacent context follows and is explicitly labeled
- [ ] Empty retrieval is one concise line per side + a brief offer
- [ ] No theatrical speakers around empty content
- [ ] Bull and Bear sections structurally symmetric
- [ ] Multi-claim cases use bullets, each independently source-able
- [ ] No absolutist verbs
- [ ] No cross-thesis number bleed
