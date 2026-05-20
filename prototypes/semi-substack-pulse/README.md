# Semi-Substack Pulse — PROTOTYPE (throwaway)

> ⚠️ **This is a prototype.** No tests, no error handling beyond what makes it runnable, no Supabase, no adversarial harness. Once the verdict at the bottom is captured, either delete this directory or fold the validated decisions into the real implementation (S6-new).

## Question this prototype answers

Given a corpus of independent-expert Substack posts (the 4 semi publications in `experts.json`), can keyword/ticker retrieval + a Bull/Bear LLM call produce real per-driver evidence?

## What this validates

- The RSS pipeline works against all 4 publishers and produces a non-empty corpus.
- The corpus is rich enough that plausible thesis-driver queries return material content.
- The LLM, given retrieved posts, can separate supporting evidence from contradicting evidence (one-sided extraction per lens).
- Whether keyword retrieval is sufficient, or whether the next step has to be embeddings + pgvector.

## Run

```bash
# Fetch RSS into prototypes/semi-substack-pulse/data/posts.jsonl (idempotent)
npm run pulse -- ingest

# Bull/Bear on a driver query
npm run pulse -- run --query "AI accelerator demand sustainability through 2025-2026"
npm run pulse -- run --ticker NVDA --query "data center capex pull-through vs. supply constraints"
npm run pulse -- run --ticker TSM --keyword HBM --query "advanced-node capacity vs. backlog"
npm run pulse -- run --ticker ASML --query "EUV pull-through and China export controls"
```

Flags:
- `--ticker SYM` — prefilter to posts mentioning this ticker (case-insensitive match against the dict in `tickers.ts`)
- `--keyword TERM` — substring-filter title+content (repeatable)
- `--since YYYY-MM-DD` — only posts published on or after this date
- `--limit N` — cap retrieved posts at N (default 12)
- `--query "..."` — free-text driver question passed to the LLM

## What's intentionally missing

- **No adversarial-context-builder.** Bull and Bear are two plain calls with lens-flipped system prompts. The real isolation harness (disallow-list regex, fail-closed assertions, prompt-side leakage detection) lands in S6-new.
- **No citation verifier.** Quotes returned by the LLM are not cross-checked against the corpus. The real impl will do exact-substring verification.
- **No triangulator.** Bull and Bear are printed side-by-side; no verdict synthesis.
- **No persistence beyond a local JSONL file.** `data/posts.jsonl` is gitignored. Wipe by deleting `data/`.
- **No embeddings.** The whole point is to see whether keyword retrieval is good enough before committing to pgvector.
- **Paywalled posts** (SemiAnalysis mostly) only contribute their RSS excerpt. Marked with `is_paywalled: true` in the corpus.

## Verdict

Run on 2026-05-19 against 2 queries: NVDA (AI accelerator demand sustainability through 2025-26) and ASML (EUV/High-NA pull-through + China export controls). Both queries returned substantive, lens-correct, verbatim evidence from real expert posts on Opus 4.7.

| Question | Verdict |
|---|---|
| Does the corpus contain material content for plausible semi theses? | **Yes.** 70 posts across 4 publishers; tickers extracted cleanly; rich content on AI capex, Oracle/Stargate, xAI Colossus, ASML monopoly economics, SMIC ramp, Huawei vertical integration. Avg content ~10k chars (Fabricated/Mule), ~18k (Asianometry), ~27k (SemiAnalysis). |
| Does Bull/Bear extract useful, lens-correct evidence? | **Yes — surprisingly clean even without the adversarial harness.** NVDA returned 11 Bull / 5 Bear; ASML returned 7 Bull / 8 Bear. Each lens picked materially different quotes from the same post (e.g., "Oracle and Animal Spirits" gave Bull the RPO growth quote and Bear the leverage/bubble quote). |
| Is keyword retrieval enough, or do we need embeddings? | **Keyword retrieval is sufficient for the prototype.** Ticker-prefilter pulled relevant posts; the LLM did the within-post relevance work. Embeddings are not needed before the real impl ships — they can be deferred to a v2 if recall problems emerge. **This contradicts the original brainstorm decision to use pgvector.** Recommend revisiting that call. |
| Should S6-new proceed as drafted in the design, or be revised? | **Proceed with two revisions:** (a) drop Mule's Musings from the registry — its feed mirrors Fabricated Knowledge exactly (same author, same posts; only one source); (b) downgrade the embeddings/pgvector scope (see above). |
| What surprised us about the corpus or the LLM behavior? | **Three things.** (1) SemiAnalysis returned full content, not paywalled excerpts — the paywall heuristic from the reference md is now stale, but in our favor. (2) Sonnet 4.6 fails on tool-use output when a quote contains nested double quotes (e.g., `"...to "shrink" even more..."`) — it stringifies the array and the inner JSON breaks. Opus 4.7 handles it. The real impl should either default to Opus for Bull/Bear or use per-item tool calls. (3) Fabricated Knowledge and Mule's Musings publish identical content via two URLs; we'd otherwise double-count Doug O'Laughlin's voice. |

### Implications for S6-new

- Registry: 3 experts, not 4. Drop `mules_musings`.
- Retrieval: ticker + optional keyword filter, full-content injection into prompt. No embeddings until/unless recall fails.
- Model: Opus 4.7 for Bull/Bear (handles nested quotes in tool-use; ~$0.35-0.50 per driver). Cheaper Sonnet fallback should use per-item tool calls instead of an array.
- Adversarial harness still needed — but the corpus pivot doesn't change its design.
- Paywall handling: no special-casing needed for now. Re-check if SemiAnalysis tightens RSS later.
