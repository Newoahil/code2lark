# Analyzer Boundary

The analyzer layer provides structural facts and uncertainty. It does not make final product decisions.

## Tool Roles

| Tool | Role | Use when | Do not use for |
|---|---|---|---|
| Code2Lark internal analyzer | Baseline project scan. | Always available fallback. | Deep graph or type proof. |
| CodeGraph | Optional route/symbol/call graph backend. | User has an initialized, fresh index or explicitly permits use. | Auto-installing, auto-initing, or replacing product judgment. |
| dependency-cruiser | JS/TS module graph. | Target is JS/TS and module dependencies affect capability/risk decisions. | Non-JS/TS projects or business intent inference. |
| ast-grep | Structural patterns. | Regex would be brittle: routes, framework markers, config/env assignments. | Full project understanding or data-flow analysis. |
| ts-morph | TypeScript deep extraction. | Target has usable TS config and exported signatures/JSDoc matter. | Polyglot analysis or runtime behavior proof. |

## Normalized Output Expectation

Backends should normalize toward facts such as:

- files
- routes and handlers
- exported functions/classes
- commands/jobs
- module dependencies
- side-effect clues
- required env/config
- confidence and uncertainty
- suggested questions

## Policy

- Prefer optional enrichment over hard dependency.
- If a backend is unavailable, record fallback and continue when safe.
- Never run indexing, installation, sync, or writes for external tools without explicit user permission.
- Low confidence must be visible in the user-facing proposal.
