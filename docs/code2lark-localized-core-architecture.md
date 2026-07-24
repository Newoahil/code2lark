# Code2Lark Localized Core Architecture

**Date**: 2026-07-22
**Status**: Implementation guide for the first localized-core branch
**Branch target**: stop before merge; do not merge from this branch without review

## 1. Product Shape

Code2Lark is a repository-root composite skill package with a TypeScript CLI/core implementation underneath it.

```text
SKILL.md                         # Code2Lark skill entrypoint
references/                      # Retrofit, Co-Build, analyzer, safety, evidence rules
embedded-skills/lark-card-designer/ # bundled card-design capability
tools/                           # executable reuse and localization plans
src/                             # existing TypeScript CLI/core implementation
docs/                            # product and engineering records
tests/                           # regression gates
```

The user-facing product is the Code2Lark skill. The CLI remains because it is the stable local execution harness for tests, CI, and repeatable operations.

## 2. Layer Boundaries

| Layer | Owns | Does not own |
|---|---|---|
| Skill | Mode selection, questions, safety gates, orchestration, handoff language. | Business implementation details or raw static-analysis algorithms. |
| Core API | Reusable analyze/generate/verify/evidence functions. | User-facing conversation policy. |
| CLI | Scriptable access to core APIs for CI and local QA. | Primary product UX. |
| Analyzer adapters | Low-level facts from internal scanner and integrated OSS tools. | Final business intent or Lark workflow decisions. |
| Capability mapper | Candidate Lark entrypoints, risk labels, confirmation questions. | Parsing every language itself. |
| Generator/verifier/evidence | Lark integration package, validation, audit, handoff. | Generic code intelligence beyond C2L needs. |
| Embedded lark-card-designer | Card information architecture and interaction-state design. | Sending cards, credentials, callbacks, or runtime implementation. |

## 3. OSS Localization Policy

Code2Lark should not ask users to manually operate a pile of external CLIs. OSS capabilities should be localized behind adapters where they materially improve C2L's product loop.

| Source | Localization style | First use |
|---|---|---|
| dependency-cruiser | Add a local optional analyzer adapter or dependency. | JS/TS module graph, circular deps, orphan modules. |
| ast-grep | Add bundled structural rule packs and an adapter. | Route/config/framework/secret fingerprints. |
| ts-morph | Add a TS analyzer module. | Exported signatures, JSDoc, parameter hints. |
| CodeGraph | Borrow graph vocabulary and route/edge model first; keep external backend optional. | Normalize structural facts and future route/symbol expansion. |
| lark-card-designer | Fully embedded skill. | Card design decisions and review rules. |

## 4. Normalized Structural Facts

The first code step is to introduce a backend-neutral graph fact shape while preserving current manifest fields.

```text
StructuralFacts
  backend
  routes                  # existing route_provenance source
  graph                   # new normalized facts
    nodes[]               # route/file/symbol/config/etc.
    edges[]               # references/calls/imports/contains/etc.
    confidence
    notes[]
```

MVP rules:

- Existing `routes` and manifest `route_provenance` remain stable.
- Internal analyzer maps discovered endpoints into `route` nodes.
- CodeGraph route backend maps queried routes into `route` nodes.
- Missing optional analyzers must not block safe fallback.
- Graph facts are evidence, not product decisions.

## 5. CLI Retention

Keep the CLI as TypeScript compiled to Node.js:

```powershell
npm run build
node dist/index.js analyze <target> --out <out>
node dist/index.js plan <out>
node dist/index.js generate <out> --out <generated>
node dist/index.js verify <generated> --strict
```

The desired evolution is not to remove the CLI, but to extract reusable core APIs so both the CLI and skill orchestration use the same implementation.

## 6. First Implementation Slice

This branch should implement only the smallest useful code step:

1. Add normalized structural graph types.
2. Populate route nodes from existing internal and CodeGraph route facts.
3. Emit graph facts into `service_manifest.source_scan.structural_graph` while keeping existing fields.
4. Add tests that prove old fields still work and new graph facts exist.

Out of scope for this slice:

- Adding dependency-cruiser as a package dependency.
- Adding ast-grep rule execution.
- Adding ts-morph analysis.
- Replacing the analyzer strategy system.
- Sending real Lark cards.

## 7. QA Gate Before Merge

Stop before merge when all are true:

- New tests show RED before implementation and GREEN after implementation.
- `npm run build` passes.
- Relevant CLI smoke tests pass.
- Full `npm test` passes or any pre-existing blocker is clearly documented.
- `git diff --check` passes.
- Changed TypeScript files have clean diagnostics.
- Branch contains reviewable changes and no secrets.
