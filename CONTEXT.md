# altree-research

Japan-first investment-thesis research pipeline. Origination is Japanese: ideas,
opportunities, and the anchor are discovered inside the **covered set** of
Japanese companies. Comparables are global: the **universe** benchmarks the
Japanese anchor against world peers. Flow: discover Japanese opportunity →
structured thesis + drivers → global peer universe → fundamentals → adversarial
bull/bear research → memo → fund implementations. This glossary fixes the
language so the same word means the same thing in code, docs, and conversation.

## Directional principle

**Global-theme discovery → Japanese origination → global comparables.**
Discovery starts from *global* macro **themes** (surfaced from the expert
corpus); themes resolve to Japanese companies in the **covered set**; the thesis
originates on a Japanese **anchor**; the peer **universe** built around it is
*not* constrained to Japan — global peers are expected. The product is a
global → Japan → global sandwich: global momentum in, Japanese origination in
the middle, global comparables out. "Pivot to Japan" means the *origination* is
Japanese, not that the inputs or the analysis are Japan-only.

## Language

### Thesis & pipeline

**Thesis**:
The investment claim under test, plus its scope (sectors, regions, market-cap
floor). Extracted from user prose into structured form.

**Driver**:
A single causal lever inside a thesis that the bull/bear research evaluates
independently. A **Thesis** has many **Drivers**.

**Anchor**:
The one seed company an analyst names as embodying the thesis. Seeds universe
discovery; appears first in the resulting universe.
_Avoid_: anchor ticker (the value), "main company".

**Universe**:
The set of comparable peers assembled for *one* thesis, scale-filtered against
the anchor and enriched from Yahoo. Per-thesis and disposable.
_Avoid_: "peer list", "watchlist".

### Markets & coverage

**Investable market**:
Every listed company reachable via Yahoo for a region (e.g. all of TSE for
Japan). Unbounded; the universe is drawn from it.

**Covered set**:
The 388 Japanese companies we hold Shared-Research data for in `sr.db` — a
curated slice of the Japanese investable market, not the whole of it. The
**front door**: the origination surface users discover opportunities in, the
pool the anchor is chosen from, and the source of `jp-companies.json`. Jobs:
discovery → anchor → evidence-grounding. *Not* a candidate pool for the
universe (the universe is global).
_Avoid_: "the dataset", "the corpus" (ambiguous — see below), "all Japanese
companies".

**Corpus**:
The body of Shared-Research report text (`POST_INTERVIEW_UPDATE`,
`NEWS_UPDATE`, `FLASH`) attached to the covered set. Distinct from the **covered
set** (the companies) and from **financials** (the numbers).

**Expert corpus**:
The roster of *global* expert commentary feeds (Substack/RSS — SemiAnalysis,
Fabricated Knowledge, Doomberg, Macro Compass…), sector-tagged, with the **pulse**
retrieval+lens engine over them. The source of **themes** / global momentum.
Covers global names and macro — it almost never names the Japanese mid-caps in
the covered set, so it cannot bridge to them by ticker mention.

**Theme** (a.k.a. hot topic):
A global macro storyline (e.g. memory-chip shortage, China cross-border tension,
climate) surfaced from the **expert corpus**. The front-door unit of discovery:
users browse/discuss themes, which resolve to exposed companies in the covered
set. Distinct from a **sector** (a static industry bucket).

**Theme exposure**:
The link from a **theme** to a covered company, established by *recent activity*
— a company surfaces under a theme only when its recent reports (`NEWS_UPDATE` /
latest `POST_INTERVIEW`, ~6-month window) show an announcement or strategic pivot
relevant to that theme. Activity-based, not static classification, and *not* by
expert mention. Dynamic: the opportunity set is whoever has recently moved,
refreshed on sync. Companies with no recent theme-relevant activity don't appear.

Built as a two-stage funnel: **keyword recall** (wide per-theme term set over
recent report *text*) narrows the 388 to candidates, then an **LLM precision
pass** (`theme_tagger`) confirms genuine recent exposure and emits the dated
rationale. Stage 1 is a gate, so its keyword net must be wide — a stage-1 miss
never reaches the LLM.

**Opportunity set**:
The companies surfaced for a given **theme** — those with a recent
theme-relevant **theme exposure**. A movers' subset of the 388, not the whole
covered set.

**Execution (lead-gen)**:
The terminal action: after deep-dive → memo, the user either *takes away* the
idea (export) or *requests an intro* to a partnered Japanese fund/brokerage. v1
captures the request only (no live partner routing). Replaces the retired Endowus
`fund_selector`.
_Avoid_: "fund selection", "fund matching" (the retired Endowus path).

**Discovery feed**:
The theme-first front door. Layout: a **free-form entry** on top (paste a
headline / describe an idea) over **4–5 hot-topic cards**. Both are *discovery
queries*, not thesis inputs — free-form text is matched to the topic(s) it's
about; a card is a pre-canned query. Both route to an **opportunity set** of
Japanese companies. The thesis-extract engine is reused *downstream* (at the
seeded-thesis step), never as the front-door behavior. (Superseded the earlier
event-centric Japanese-catalyst feed.)

**Catalyst**:
A single recent corporate event (from a Japanese `NEWS_UPDATE`). *Demoted* from
front-door feed to **per-company evidence** — shown when a user drills into a
company, not as the top-level discovery surface.

### Report types (in `sr.db`)

**POST_INTERVIEW_UPDATE**:
The full qualitative research note — business overview + management's strategic
framing. ~2k chars, ~7–8 per company. The report type carried into the app for
grounding bull/bear + memo.

**NEWS_UPDATE**:
A single discrete corporate event in prose (deal, approval, financing). Short,
high-volume; a catalyst feed. Deferred to a later phase.

**FLASH**:
Quarterly earnings tables (revenue/GP/margin/YoY). The source of the
**financials** snapshot — not re-ingested as evidence.

### Pipeline stages (internal name → user-facing label)

The pipeline has internal stage ids and *separate* user-facing labels. The
internal names are schema; they must never appear in the UI (same rule as the
conversational-thesis tone doc, applied to navigation). User-facing labels:

- **Discover** — the theme-first front door (new under the pivot; precedes Extract).
- **Thesis** (internal `Extract`) — the seeded thesis + refinement.
- **Comparables** (internal `Scan`) — the global peer universe + fundamentals.
- **Pressure-test** (internal `Anti/Thesis`) — bull/bear validation per driver.
- **Execution** (internal `Execute`) — take-away + Japanese lead-gen.

Each stage entry carries a one-line **orientation narration** (what just happened ·
why this step · what you can do), governed by the conversational-thesis tone doc.
_Avoid_ in the UI: "Extract", "Scan", "Anti/Thesis", "Execute", "Driver".

## Flagged ambiguities

- **"Ticker" nomenclature**: `sr.db` stores bare TSE codes (`2802`, `186A`);
  Yahoo needs the `.T` suffix (`2802.T`). Canonical join key is the
  Yahoo-suffixed form; the bare code is the source key only.
- **Sector**: `sr.db` uses a custom taxonomy ("Trading Company", "Biotechnology");
  thesis **scope** uses GICS. These are *not* interchangeable — any
  sector-based filtering across the boundary needs an explicit mapping.
- **"Corpus" vs "covered set"**: the covered set is the *companies*; the corpus
  is the *report text about them*. Don't say "corpus" to mean the company list.

## Example dialogue

> **Dev**: Do we pull the universe from the covered set?
> **Analyst**: No — the covered set is the front door: you discover the
> opportunity and pick the Japanese *anchor* there. The universe built around
> that anchor is global — US, EU, Korea peers are expected. We just won't have
> corpus text for the non-Japanese names.
> **Dev**: So the covered set never constrains the universe?
> **Analyst**: Right. Japan-first origination, global comparables. The covered
> set's jobs are discovery, anchor, and grounding the bull/bear research on the
> Japanese name — not bounding the peer set.
> **Dev**: And the front door shows the covered set?
> **Analyst**: All 388, with financials and the latest POST_INTERVIEW_UPDATE as
> the description. Yahoo fills in market cap at build time, since `sr.db` has
> none.
