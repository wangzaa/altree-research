---
status: accepted
---

# Japan-first origination, global comparables; discovery-first front door

## Context & decision

altree-research pivots from a generic, any-region thesis tool to a **Japan-first**
product. Origination is Japanese: the front door is a **discovery surface over
the covered set** (388 Shared-Research-covered TSE companies in `jp-companies.json`),
where users browse opportunities and pick a Japanese company as the **anchor**.
Comparables stay **global** — the peer **universe** built around that anchor is
*not* constrained to Japan; cross-region peers (US/EU/Korea/…) are expected and
wanted. Picking a company pre-fills the anchor and offers an opt-in, editable
"draft a thesis from the research" action seeded from that company's latest
POST_INTERVIEW_UPDATE note; the existing `thesis/extract` flow then runs unchanged.

## Why this is worth recording

- **Hard to reverse.** It reshapes the product's entry point and flow, and the
  positioning ("the alternative-to-US Japan research tool") is built on it.
- **Surprising without context.** A future reader sees a *thesis* tool whose
  front door is a *Japanese company browser*, with origination gated to Japan
  but the comparable universe deliberately global. Both halves look odd until
  you know the moat is the Japanese research corpus, not the peer-discovery
  machinery.
- **Real trade-off.** Considered: (a) Japan as an *addition* behind the existing
  generic flow — rejected because it makes the corpus a bolt-on and leaves the
  pilot's anchor-confusion unsolved; and (b) thesis-prose-first entry with only
  a richer downstream anchor picker — rejected because it preserves the ordering
  that confuses users and doesn't deliver "discovery first." Discovery-first
  origination structurally dissolves the anchor-rationale confusion (the anchor
  is the company you chose to investigate) and is the only model that exploits
  the corpus as a browsing surface.

## Consequences

- The covered set's jobs are **discovery → anchor → evidence-grounding**, never
  bounding the universe.
- `sr.db` has **no market cap**; Yahoo supplies it at universe-build time, so the
  covered set cannot scale-filter peers on its own.
- The generic any-region paste-prose entry survives only as a **secondary path**,
  not the default.
