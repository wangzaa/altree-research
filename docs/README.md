# altree-research Documentation

## Architecture (Start Here)

Architecture Decision Records (ADRs) explain **why** the system is built this way.

| ADR | Title | Status | See Also |
|-----|-------|--------|----------|
| [ADR-0001](./adr/0001-japan-first-origination-global-comparables.md) | Japan-first origination, global comparables | ✅ Accepted | Discovery-first front door |
| [ADR-0002](./adr/0002-covered-set-data-residency.md) | Covered-set data residency | ✅ Accepted | Stable JSON + volatile Supabase |
| [ADR-0003](./adr/0003-theme-first-two-corpus-discovery.md) | Theme-first front door over two corpora | ✅ Accepted | Expert corpus + covered set |
| [ADR-0004](./adr/0004-execution-via-japanese-lead-gen.md) | Execution via Japanese lead-gen | ✅ Accepted | Retires Endowus fund matching |
| [ADR-0005](./adr/0005-unauthenticated-file-defined-discovery.md) | Unauthenticated, file-defined discovery | ✅ Accepted | Per-company polling, no paginated feed |

## Domain Specifications

| Document | Purpose |
|----------|---------|
| [Shared Research Handoff](./shared_research_handoff.md) | Ingestion domain language, operations, and data flow |
| [CONTEXT.md](../CONTEXT.md) | Global glossary — thesis, driver, anchor, universe, covered set |

## Implementation

### Superpowers

Detailed implementation plans and design specs for feature development.

| Category | Description |
|----------|-------------|
| [plans](./superpowers/plans/) | Step-by-step implementation tasks with TDD approach |
| [specs](./superpowers/specs/) | Design documents with architecture decisions |
| [audits](./superpowers/audits/) | Audit results and data quality reviews |

### Status Tracking

| Plan | Status | Spec | ADR |
|------|--------|------|-----|
| [2026-05-28-shared-research-ingester](./superpowers/plans/2026-05-28-shared-research-ingester.md) | ⏳ Not Started | - | [ADR-0005](./adr/0005-unauthenticated-file-defined-discovery.md) |
| [2026-05-22-substack-roster-expansion](./superpowers/plans/2026-05-22-substack-roster-expansion.md) | ⏳ Not Started | [spec](./superpowers/specs/2026-05-22-substack-roster-expansion-design.md) | - |
| [2026-05-22-cycle-3-phase-1-question-resolver](./superpowers/plans/2026-05-22-cycle-3-phase-1-question-resolver.md) | ⏳ Not Started | [spec](./superpowers/specs/2026-05-22-cycle-3-phase-1-question-resolver-design.md) | - |
| [2026-05-21-cycle-2-pear-retrofit](./superpowers/plans/2026-05-21-cycle-2-pear-retrofit.md) | ⏳ Not Started | [spec](./superpowers/specs/2026-05-21-cycle-2-pear-retrofit-design.md) | - |
| [2026-05-20-openrouter-agent-models](./superpowers/plans/2026-05-20-openrouter-agent-models.md) | ⏳ Not Started | [spec](./superpowers/specs/2026-05-20-openrouter-agent-models-design.md) | - |
| [2026-05-19-s5-scan-stage](./superpowers/plans/2026-05-19-s5-scan-stage.md) | ⏳ Not Started | [spec](./superpowers/specs/2026-05-19-s5-scan-stage-design.md) | - |
| [2026-05-19-expert-corpus-stage4-rework](./superpowers/plans/2026-05-19-expert-corpus-stage4-rework.md) | ⏳ Not Started | [spec](./superpowers/specs/2026-05-19-expert-corpus-stage4-rework-design.md) | - |
| [2026-05-18-s3-universe-build](./superpowers/plans/2026-05-18-s3-universe-build.md) | ⏳ Not Started | [spec](./superpowers/specs/2026-05-18-universe-build-design.md) | - |
| [2026-05-16-s2-thesis-refinement](./superpowers/plans/2026-05-16-s2-thesis-refinement.md) | ⏳ Not Started | [spec](./superpowers/specs/2026-05-16-thesis-refinement-design.md) | - |

## Style & Voice

| Document | Purpose |
|----------|---------|
| [Conversational Thesis](./tone/conversational-thesis.md) | How to present extracted/parsed theses to users — hide the schema, narrate don't enumerate, echo don't recite |

---

**Need help?** Start with the ADRs to understand the architecture, then consult the domain specs for details, and finally refer to the superpowers plans/specs for implementation guidance.
