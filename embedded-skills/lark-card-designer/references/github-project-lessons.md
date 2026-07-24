# GitHub Project Lessons

This file compresses the research in `docs/github-research.md` into reusable design evidence.

## Major Lessons

- Existing public projects mostly implement sender, builder, renderer, progress card, approval flow, or notification adapters. The gap is a decision layer that chooses the right card style from data intent and audience.
- Stable card output comes from matrices, state machines, component rules, and rendering constraints, not from a broad "make it beautiful" prompt.
- Structured data should stay structured. Projects that handle Feishu tables reliably convert rows/columns to native table-like card components rather than relying on Markdown pipe tables.
- Long content needs staged disclosure: conclusion first, evidence next, raw details folded or linked.
- Operational and approval cards are action surfaces. They need object identity, risk, button state, and audit trail more than report-like prose.
- Digest cards need triage and source attribution. A list of links without priority, summary, source, and feedback is not enough.
- Status color should be bound to state: running, completed, failed, pending approval, rejected, recovered, archived.
- Progress cards should update one card when preserving task context matters; final result cards should switch back to conclusion and evidence.

## Repo-Type Evidence

| Repo type | Evidence to reuse | Design rule |
| --- | --- | --- |
| Formatting skills | Markdown, title, table, collapsible rules | Put rendering constraints in references, not prompts |
| Component builders | Stable component vocabulary | Use consistent names: header, markdown, table, chart, column_set, button, form, note |
| Native table converters | Markdown tables are fragile | Prefer structured native table for structured rows |
| Streaming/progress cards | Single card patch keeps context | Separate process card from result card |
| Approval/ops cards | Locking, audit, selected parameters | Design state machine and audit area |
| News/digest cards | Source, summary, feedback | Use triage categories and feedback buttons |
| Alert adapters | Short status mapping | Keep alert cards small and action-oriented |
| Webhook senders | Sending is solved elsewhere | Keep this skill out of API/send implementation |

## Non-Patterns To Avoid

- Do not copy a CI/CD approval layout into every business card.
- Do not turn a weekly report into a raw table dump.
- Do not make every digest a single article card.
- Do not treat status color as branding.
- Do not maintain separate rules for each CLI. Keep the skill core in `SKILL.md` and `references/`.
