---
status: accepted
---

# Execution via Japanese lead-gen, retiring Endowus fund matching

## Context & decision

The terminal action becomes: deep-dive (existing thesis pipeline → memo) →
**take away** (export the idea/memo) or **request execution** — a lead-gen intro
to a partnered **Japanese fund or brokerage**. The existing Execute stage
(`fund_selector` over `endowus-funds.csv`, a Singapore/HK retail wealth platform)
is **retired**: recommending a broad Endowus Japan-equity fund as the execution
for a thesis on a specific Japanese mid-cap is a mismatch — diffuse exposure, not
the name the user researched.

v1 lead-gen is a **stub**: the "request intro" CTA captures the request (company,
thesis, memo) and queues it; real partner hand-offs are wired once the business
relationships exist. The captured demand is itself signal for those BD
conversations.

## Why this is worth recording

- **Hard to reverse.** Retires a built stage and reorients the product's
  monetization from a tool/fund-matcher toward a lead-gen channel.
- **Surprising without context.** A reader sees the Execute stage stop
  recommending funds and start capturing intro requests, and `endowus-funds.csv`
  /`fund_selector` going unused. The reason is the Japan pivot, not neglect.
- **Real trade-off.** Considered keeping both (rejected — two execution stories
  pull against the Japan-first narrative) and deferring lead-gen entirely
  (rejected — better to make the channel visible and collect demand now, as a
  cheap stub, than to ship a terminal with no execution path).

## Consequences

- `fund_selector` + `endowus-funds*` become dead code to remove or archive once
  the lead-gen terminal lands.
- Lead-gen needs **partnerships** (BD), so v1 ships intent-capture only; live
  routing is a later phase gated on those relationships.
