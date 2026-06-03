---
status: accepted
---

# Theme-first front door over two corpora (expert + covered set)

## Context & decision

The front door is **theme-first**, and the product runs on **two corpora**, not
one:

- The **expert corpus** (global commentary feeds + the pulse engine) surfaces
  **themes** / global momentum — the top-level discovery surface (climate,
  memory-chip shortage, China tension…).
- The **covered set** (388 Japanese companies from `sr.db`) is what themes
  *resolve to*: a theme → a list of exposed Japanese companies with qualitative
  (POST_INTERVIEW) and quantitative (financials) detail.

Shape: **global momentum → Japanese origination → global comparables.** The user
browses/chats global themes, picks Japanese companies exposed to them, then
deep-dives into the existing thesis pipeline (or, later, is routed to a Japanese
fund/brokerage — a separate lead-gen decision, not settled here).

## Why this is worth recording

- **Hard to reverse.** It reorders the product spine and makes the expert corpus
  a first-class front-door input, repurposed from its current role as
  evidence-retrieval-for-a-ticker.
- **Surprising without context.** A reader sees a *Japan* discovery tool whose
  front door is a feed of *global* expert-Substack themes that name almost no
  Japanese companies. The reconciliation: themes are global by necessity (the
  experts don't cover Japanese mid-caps), and bridge to the 388 by company
  attributes, not by mention.
- **Real trade-off.** Supersedes the event-centric Japanese-`NEWS_UPDATE`
  catalyst feed (ADR-0002 / grill Q8–Q9) as the front door. Catalysts demote to
  per-company evidence. Theme-first was chosen because discovery should start
  from *why a space is interesting* (global momentum), not from one company's
  press releases.

## Settled since

- **What a theme is:** a hand-declared list of 4–5 hot topics (no momentum
  ranking, no extraction); the corpus *substantiates* them, it doesn't choose
  them.
- **Theme exposure:** a two-stage funnel — wide keyword recall over recent report
  text → LLM precision tag — gated on *recent activity* (announcement/pivot in a
  ~6-month window), emitting a dated rationale per company.

- **Discovery interaction:** free-form entry (top) + 4–5 hot-topic cards (below),
  on the existing `/thesis/new` scaffold. Free-form text is a *Japan-aware
  discovery query* (matched to topic → opportunity set), not a direct thesis
  extract — so the pivot holds on every path. Discovery chat deferred.

## Open / unsettled (not yet decided)

- **Lead-gen to Japanese funds/brokerages** as a terminal channel (journey step e).
