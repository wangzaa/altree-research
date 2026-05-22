# Substack expert-roster expansion — design

**Date:** 2026-05-22
**Status:** spec, awaiting implementation
**Source list:** `substack-equity-experts.md` (curated 21-publication roster, attached in the originating conversation)

---

## Why

The expert corpus (`expert_posts` table) feeds two downstream consumers: cycle 2's bull/bear research (live) and cycle 3's `corpus` open-question resolver (speced). Today the registry holds 3 experts, all `semis`-tagged: Fabricated Knowledge, Asianometry, SemiAnalysis. The 2026-05-19 prototype verdict validated that RSS-based ingestion + keyword retrieval is sufficient for material content, with no embeddings needed.

Universe coverage is broadening beyond semis. The corpus needs to broaden in step, or the `corpus` resolver will silently return empty for non-semis questions and the bull/bear will inherit a known blind spot. This spec expands the roster to **17 experts** across **9 topical tags**, gated by a one-shot audit script that verifies feed health and content yield before any candidate goes live.

## Scope

**In scope:**

- Add 14 new experts to `lib/data/experts.json` as `active: false`
- Add 8 new sector-registry entries (`financials`, `energy`, `materials`, `macro`, `tech_platforms`, `value_quality`, `short_forensic`, `china_asia`)
- Build `scripts/audit-experts.ts` — fetches each candidate feed, emits a markdown verdict table
- Commit the audit table to `docs/superpowers/audits/<run-date>-substack-roster-audit-results.md` (new folder)
- Follow-up commit flips `active: true` per-candidate based on the audit
- Unit tests for the audit's pure-core function and registry sector-tag integrity

**Out of scope (deferred to future cycles, documented here):**

- The "Coverage gaps worth filling" section in `substack-equity-experts.md` — energy/commodities beyond Doomberg (Goehring & Rozencwajg, Resource Maven, Kuppy), crypto (Galaxy, Delphi, Bankless), healthcare/biotech, REITs (Calculated Risk, Hoya Capital), EM/India (Marcellus, The Ken), quant/microstructure (Quant Arb, Robot James). Track as a separate roster-expansion cycle once the present 14 prove out.
- Non-Substack publications named in the md: Stratechery (Memberful, paid-only with per-subscriber RSS), Platformer (Ghost, public), The Generalist (Ghost, public). All deferred until a per-expert subscription-feed mechanism exists, even though two of three are technically Ghost-public — keeping a uniform "Substack-native" rule for this cycle.
- Mule's Musings — confirmed as a duplicate of Fabricated Knowledge in the 2026-05-19 prototype verdict; not re-added.
- Retrieval-layer changes. `lib/agents/expert-corpus/retrieve.ts` already uses `overlaps("sectors", ...)`, so any thesis tagged with one of the new topical tags will find the right experts automatically.
- Schema changes. The existing `SectorRegistryEntrySchema` permits `gics: []` and the existing `ExpertSchema` permits arbitrary `sectors` string entries — both shapes already support the broadened taxonomy.

## Candidate set

Fourteen publications, derived from `substack-equity-experts.md` minus the three already in the registry, the Mule's Musings duplicate, and the three non-Substack pubs:

```
Macro (4)        Doomberg, The Macro Compass, Apricitas Economics, Concoda
Financials (1)   Net Interest
Tech (1)         The Diff
Value (3)        Yet Another Value Blog, Speedwell Memos, Compounding Quality
Short (1)        The Bear Cave
Thematic (1)     Citrini Research
China/Asia (3)   Sinocism, Sinica (Trivium), ChinaTalk
```

Per-candidate proposed sector tagging:

```
doomberg             [energy, materials, macro]
macro_compass        [macro, financials]
apricitas            [macro]
concoda              [macro, financials]
net_interest         [financials]
the_diff             [macro, tech_platforms, financials]
yet_another_value    [value_quality]
speedwell_memos      [value_quality]
compounding_quality  [value_quality]
bear_cave            [short_forensic]
citrini_research     [macro, tech_platforms]
sinocism             [china_asia, macro]
sinica_trivium       [china_asia]
chinatalk            [china_asia, tech_platforms, semis]
```

`chinatalk` carries `semis` deliberately — its export-controls and US-China industrial-policy coverage materially overlaps the existing semis universe, so semis theses should pull from it via the existing overlap operator.

## Sector-registry expansion

Eight new entries added to the `sectors` block in `experts.json`. GICS codes added where they map cleanly; left as `[]` where the tag is a style or region rather than a sector. The schema already supports empty `gics`.

```
semis             gics ["45301010", "45301020"]   (unchanged)
financials        gics ["4030"]
energy            gics ["1010"]
materials         gics ["1510"]
tech_platforms    gics ["4510", "4520"]
macro             gics []
value_quality     gics []
short_forensic    gics []
china_asia        gics []
```

## Audit script

`scripts/audit-experts.ts`. Mirrors the pure-core / I/O-wrapper split of `lib/ingest/expert-corpus.ts` (`ingestFeed` pure, `refreshCorpus` orchestrator).

### Pure core

```
auditFeed(expert: Expert, parsedFeed: ParsedFeed, now: Date): AuditRow
```

Reuses `htmlToText`, `detectPaywall`, and `extractTickers` from `lib/ingest/` so the audit's view of "paywalled" and "ticker yield" is identical to what production ingest will see. No network, no clock — `now` is injected for testability.

### Metrics

```
fetch_status         "ok" | "error:<message>"
total_items          number of items in feed
items_last_90d       items with pubDate within 90 days of now
items_last_30d       items with pubDate within 30 days of now
most_recent          ISO date of newest item, or null
avg_content_chars    mean htmlToText(content) length across all items
paywall_hit_rate     share of items where detectPaywall(text) === true
ticker_yield         share of items where extractTickers(text).length > 0
date_quality         "ok" | "degraded"   (degraded when ≥1 item has an
                                          unparseable pubDate)
```

### Flags

Emitted alongside metrics, surfaced in the table for analyst judgment. **No hard pass/fail** — the analyst chooses based on the flag pattern.

```
ALIVE        items_last_90d >= 3
RECENT       most_recent within 30 days
SUBSTANTIVE  avg_content_chars >= 2000
LOW_PAYWALL  paywall_hit_rate < 0.5
```

### Verdict guidance (script-emitted, analyst-overridable)

```
fetch failure                                    → reject
total_items == 0 OR !ALIVE                        → defer
all four flags pass                               → promote_candidate
some flags fail, none of the above                → review
```

### I/O wrapper

```
auditCandidates(): Promise<{ rows: AuditRow[]; results_path: string }>
```

Loads the registry, filters to `active === false`, fetches each `feed_url` with the same `rss-parser` config used in production (custom field `content:encoded → contentEncoded`), 15-second per-feed timeout, per-feed errors caught and recorded rather than aborting.

### Outputs

Two writes:

1. Markdown table to stdout for quick eyeballing.
2. Same table appended to `docs/superpowers/audits/<TODAY>-substack-roster-audit-results.md`, with a header (run date, candidate count, threshold definitions) and a hand-edit-friendly verdict column. If a file for today already exists, append rather than clobber so multiple reruns within a day are non-destructive.

### npm wiring

```
"audit:experts": "tsx scripts/audit-experts.ts"
```

Parallel to the existing `corpus:refresh`. Run with `npm run audit:experts`.

## Promotion workflow

The single PR ships:

1. `lib/data/experts.json` updated (17 experts, 9 sectors, 14 new entries `active: false`)
2. `scripts/audit-experts.ts` + tests
3. `package.json` wired

After the PR lands, the workflow is:

1. Run `npm run audit:experts` once locally → produces `docs/superpowers/audits/<date>-substack-roster-audit-results.md`
2. Review the table, hand-set the verdict column per candidate
3. Commit the audit-results file
4. Open a second small PR that flips `active: false → true` for `promote_candidate` rows, with the experts.json change carrying a comment line referencing the audit-results file

Demotions in future quarters follow the same shape — the audit is written so it can be re-run quarterly without refactor, even though this cycle is one-shot.

## File-level changes

**New files:**

```
scripts/audit-experts.ts
tests/unit/scripts/audit-experts.test.ts
docs/superpowers/audits/<date>-substack-roster-audit-results.md   (post-merge, new folder)
```

**Modified:**

```
lib/data/experts.json     (14 new experts active:false, 8 new sectors)
package.json              (audit:experts script entry)
```

**Possibly modified (only if missing today):**

```
tests/unit/data/experts.test.ts   (registry sector-tag integrity)
```

**Unchanged:**

```
lib/data/experts.ts                 (loader is registry-shape-agnostic)
lib/schemas/experts.ts              (existing schema already permits new shape)
lib/ingest/expert-corpus.ts         (reads whatever the registry holds)
lib/ingest/paywall-markers.ts       (no new markers required for Substack-native pubs)
lib/agents/expert-corpus/retrieve.ts (sector overlap already handles broader tags)
```

## Error handling

Failure modes the audit handles explicitly:

- *Feed returns HTTP error or times out (15s)* → recorded as `fetch_status: "error:<msg>"`, row still emitted with zero metrics, all flags false, verdict guidance `reject`.
- *Feed parses but has zero items* → `total_items: 0`, ALIVE false, verdict guidance `defer` (the feed exists but yielded nothing — could be transient).
- *Dates unparseable* → `parseDate` falls back to `new Date()` as in `lib/ingest/expert-corpus.ts`, and the row gets `date_quality: "degraded"` so the analyst knows recency metrics are unreliable.
- *Content empty or pure boilerplate* → `avg_content_chars` will be low, SUBSTANTIVE flag false, analyst sees it.
- *Platform isn't Substack* → irrelevant for the 14 by selection, but the script doesn't assume Substack; any URL `rss-parser` can read works.

No DB writes during audit. Production `expert_posts` is untouched until `npm run corpus:refresh` runs after the promotion commit.

## Testing

**Unit (`tests/unit/scripts/audit-experts.test.ts`, new):**

- `auditFeed` returns expected metrics on a synthetic feed with known dates, content lengths, paywall markers (`FAKE_FEED` pattern from `tests/unit/ingest/expert-corpus.test.ts`).
- Date arithmetic uses the injected `now` at the 90-day / 30-day boundaries.
- Flags fire at exact thresholds (3-post / 30-day / 2000-char / 0.5 paywall).
- Error path: a feed that throws produces `fetch_status: "error:..."`, all-false flags, no crash.

**Registry integrity (`tests/unit/data/experts.test.ts`, extend or add):**

- Every `sectors[]` entry on every expert references a sector key declared in the `sectors` registry block. This is the only guardrail against silent mis-tagging — `overlaps()` against an undeclared sector is undetectable at retrieval time.

**Real-feed validation:** the audit run itself. Reviewing the 14-row verdict table before merging the promotion commit *is* the integration test.

**Unchanged:** `tests/unit/ingest/expert-corpus.test.ts` — pipeline is unchanged.

## Non-obvious tradeoffs

- **Topical tags overload `sectors` semantics.** Tags like `macro`, `short_forensic`, `value_quality`, `china_asia` aren't sectors in any strict sense. The pragmatic call is to reuse the existing field rather than add a `topics[]` column, because the retrieval clause already does what we need (`overlaps`). If the field name becomes a comprehension burden later, rename `sectors → tags` in a single sweep — but defer until the friction is real.
- **`active: false` interstitial leaves dead entries in the registry.** Anything that fails the audit stays in `experts.json` as `active: false`. That's deliberate: the registry then carries a record of "considered and rejected" alongside "considered and accepted", which is useful at the next quarterly review (e.g., a feed that was dead in May might be live in November). Cost is ~6 inactive rows of registry noise.
- **No automatic promotion.** The audit emits guidance, not a decision. A future quarterly heartbeat could auto-demote (e.g., flip `active: true → false` if a previously-live pub has been silent 90+ days), but auto-*promotion* should stay manual because the editorial choice ("is this voice we want in the corpus") isn't purely mechanical.
- **`chinatalk` cross-tagged with `semis`.** The cleanest argument against this is "tag what the publication primarily is, not what it overlaps with." The counter-argument, and the chosen direction, is that semis theses materially benefit from ChinaTalk's export-controls coverage and the cost of including it (one extra tag) is much lower than the cost of a semi-thesis going to corpus and missing the most relevant non-semi expert.
- **Two-step PR vs. one PR with `active: true` directly.** Tempting to skip the `active: false` step and audit live. Chose two-step because the audit-results doc becomes the durable rationale committed alongside the promotion — without the two-step, the "why did we promote Net Interest but defer Compounding Quality" decision is lost to chat history.

## Acceptance criteria

- [ ] `lib/data/experts.json` contains 17 experts (3 live `active: true` + 14 new `active: false`), 9 sector keys, schema-valid (`ExpertRegistrySchema.parse` succeeds in CI/test)
- [ ] `scripts/audit-experts.ts` runs against the candidate set, emits markdown to stdout, and writes/appends to `docs/superpowers/audits/<date>-substack-roster-audit-results.md`
- [ ] `npm run audit:experts` wired in `package.json`
- [ ] Unit tests cover `auditFeed` pure-core metrics + boundary thresholds + error path
- [ ] Registry-integrity test prevents `sectors[]` typos that reference undeclared sector keys
- [ ] Audit-results doc committed (post-merge run) with the live 14-row verdict table
- [ ] A separate commit flips `active: true` for `promote_candidate` rows, with a comment line in `experts.json` referencing the audit-results file by name
- [ ] Coverage-gaps section from `substack-equity-experts.md` documented as out-of-scope here with the categories enumerated
- [ ] `substack-equity-experts.md` referenced from the spec as source-of-truth for editorial decisions

## Follow-up cycles to track

- **Coverage-gaps expansion:** energy-beyond-Doomberg, crypto, healthcare, REITs, EM/India, quant/microstructure. Reuse the audit script unchanged.
- **Non-Substack ingest path:** Stratechery (Memberful, paid private feed), Platformer (Ghost public), The Generalist (Ghost public). Requires per-expert subscription-token handling and a small registry-schema extension (`feed_auth?: { kind: "memberful_subscriber"; env_var: string }` or similar).
- **Quarterly heartbeat:** wire `audit:experts` into a scheduled job that re-runs the audit against all registered experts (`active` true and false) and surfaces drift — dead feeds among the live, revived feeds among the dead, sudden paywall tightening.
- **Topic-name rename:** if `sectors` becomes a misleading field name once `macro` / `short_forensic` / `china_asia` are in it, rename to `tags` in one sweep.
