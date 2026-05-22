# Substack roster audit — 2026-05-22

**Candidates audited:** 14

**Thresholds:**
- ALIVE = items_last_90d >= 3
- RECENT = most_recent within 30 days
- SUBSTANTIVE = avg_content_chars >= 2000
- LOW_PAYWALL = paywall_hit_rate < 0.5

**Verdict guidance (auto):**
- `reject` — fetch failed
- `defer` — feed empty or ALIVE false
- `promote_candidate` — all four flags pass
- `review` — alive but at least one of RECENT / SUBSTANTIVE / LOW_PAYWALL failed

Set `verdict_final` by hand after review. Use `notes` for the one-line reason.

| slug | name | items_90d | items_30d | most_recent | avg_chars | paywall % | ticker % | flags | verdict_auto | verdict_final | notes |
|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|
| doomberg | Doomberg | 20 | 9 | 2026-05-22 | 2885 | 0% | 5% | ALIVE,RECENT,SUBSTANTIVE,LOW_PAYWALL | promote_candidate | promote | All four flags pass; full content via RSS despite paid-mostly policy. |
| macro_compass | The Macro Compass | 0 | 0 | 2026-02-10 | 5601 | 0% | 5% | SUBSTANTIVE,LOW_PAYWALL | defer | defer | No items in last 90d; latest 2026-02-10. Re-audit next quarter. |
| apricitas | Apricitas Economics | 3 | 1 | 2026-05-03 | 9618 | 0% | 25% | ALIVE,RECENT,SUBSTANTIVE,LOW_PAYWALL | promote_candidate | promote | Chart-forward macro; healthy long-form RSS. |
| concoda | Concoda | 9 | 3 | 2026-05-12 | 1563 | 0% | 5% | ALIVE,RECENT,LOW_PAYWALL | review | defer | avg_chars below 2000 — RSS likely summary-only; revisit if content broadens. |
| net_interest | Net Interest | 14 | 4 | 2026-05-15 | 3506 | 0% | 20% | ALIVE,RECENT,SUBSTANTIVE,LOW_PAYWALL | promote_candidate | promote | Core financials voice; clean signal across all flags. |
| the_diff | The Diff | 0 | 0 | 2022-11-14 | 12828 | 0% | 40% | SUBSTANTIVE,LOW_PAYWALL | defer | defer | Feed at thediff.co/feed is stale (last post 2022-11-14); pub moved off Substack. Follow-up: locate current RSS endpoint before next audit. |
| yet_another_value | Yet Another Value Blog | 20 | 16 | 2026-05-21 | 5408 | 0% | 60% | ALIVE,RECENT,SUBSTANTIVE,LOW_PAYWALL | promote_candidate | promote | High ticker-yield; strong fit for the value lens. |
| speedwell_memos | Speedwell Memos | 5 | 3 | 2026-05-04 | 6627 | 0% | 60% | ALIVE,RECENT,SUBSTANTIVE,LOW_PAYWALL | promote_candidate | promote | Long-form business-quality memos; all flags pass. |
| compounding_quality | Compounding Quality | 20 | 15 | 2026-05-21 | 3877 | 0% | 30% | ALIVE,RECENT,SUBSTANTIVE,LOW_PAYWALL | promote_candidate | promote | High posting cadence; quality-bias lens. |
| bear_cave | The Bear Cave | 19 | 6 | 2026-05-21 | 6093 | 0% | 60% | ALIVE,RECENT,SUBSTANTIVE,LOW_PAYWALL | promote_candidate | promote | Forensic short coverage; weekly cadence. |
| citrini_research | Citrini Research | 6 | 2 | 2026-05-12 | 9370 | 0% | 50% | ALIVE,RECENT,SUBSTANTIVE,LOW_PAYWALL | promote_candidate | promote | Thematic cross-asset; full content via RSS despite paid-mostly policy. |
| sinocism | Sinocism | 20 | 19 | 2026-05-21 | 6949 | 0% | 40% | ALIVE,RECENT,SUBSTANTIVE,LOW_PAYWALL | promote_candidate | promote | China daily; high cadence, strong content yield. |
| sinica_trivium | Sinica (Trivium) | 20 | 20 | 2026-05-22 | 19138 | 0% | 35% | ALIVE,RECENT,SUBSTANTIVE,LOW_PAYWALL | promote_candidate | promote | Long-form podcast transcripts; very rich content. |
| chinatalk | ChinaTalk | 20 | 18 | 2026-05-22 | 31616 | 0% | 70% | ALIVE,RECENT,SUBSTANTIVE,LOW_PAYWALL | promote_candidate | promote | Highest content yield in the audit; cross-tagged with semis for export-controls overlap. |

## Outcome

**Promoted (11):** doomberg, apricitas, net_interest, yet_another_value, speedwell_memos, compounding_quality, bear_cave, citrini_research, sinocism, sinica_trivium, chinatalk.

**Deferred (3):** macro_compass (stale 90d), concoda (RSS too short, likely summary-only), the_diff (stale feed URL — pub moved off Substack).

## Observations

- **Paywall reality vs. policy.** Every paywall_hit_rate is 0%, including pubs the source md flagged as paid-mostly (Doomberg, Citrini, Net Interest). Same pattern as SemiAnalysis from the cycle 2 prototype (2026-05-19). The `detectPaywall` markers (`"this post is for paid subscribers"`, etc.) didn't fire on any of the 14 audited feeds. Two possible reads: (a) these pubs serve full content via RSS regardless of paywall policy, (b) the marker list is conservative and misses other paywall phrasings. Worth a future check by hand-sampling Doomberg/Citrini posts to confirm we're getting full content, not excerpts under unrecognized markers.
- **The Diff feed is stale.** Last post 2022-11-14. The source md noted The Diff moved to a custom domain; the `thediff.co/feed` URL appears to be a Substack-era artifact. Follow-up before re-auditing: locate the current Ghost-side RSS endpoint or accept that the pub requires a different ingest path.
- **Ticker yield is semis-biased.** Pubs covering financials, macro, value have low ticker_yield (5-30%) because `extractTickers` only recognizes the semis ticker dictionary. Expected and not a defect — broadening the dictionary is a future cycle.

## Follow-up cycles

- Locate current RSS endpoint for The Diff; re-audit.
- Broaden the ticker-extraction dictionary beyond semis (financials, energy, materials, value names) so cross-sector posts surface ticker-overlap signal at retrieval time.
- Sample-check Doomberg / Citrini full-content vs excerpt assumption.
- Re-audit deferred pubs (macro_compass, concoda) at the next quarterly heartbeat.

