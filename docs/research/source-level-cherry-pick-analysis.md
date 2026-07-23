# Code2Lark Source-Level Cherry-Pick Analysis

**Date**: 2026-07-22
**Scope**: Source-level inspection from temporary local shallow clones; clone snapshots are intentionally not retained in this branch
**Goal**: Decide which OSS implementation ideas are worth adapting into Code2Lark's project-understanding layer.

## Cloned Repositories

| Repository | Retention | Checked commit | Why inspected |
|---|---|---:|---|
| `colbymchenry/codegraph` | Not retained; avoid vendoring full engine | `ea72e1b` | Strongest match for symbol graph, framework route extraction, MCP/agent workflow, and local indexing model. |
| `sverweij/dependency-cruiser` | Not retained; integrate as dependency/adapter later | `26dffc0` | Mature JS/TS dependency graph and rule-validation engine with a documented programmatic API. |
| `ast-grep/ast-grep` | Not retained; integrate rules/adapter later | `6dc0f31` | Structural AST pattern matching for route/framework/secret fingerprints without fragile text regex. |
| `dsherret/ts-morph` | Not retained; integrate as dependency/adapter later | `699815f` | Deep TypeScript Compiler API wrapper for exported symbols, signatures, JSDoc, and type-aware analysis. |

## Executive Decision Table

| Priority | Candidate | Source-level finding | Cherry-pick target for Code2Lark | Integration style | Decision |
|---:|---|---|---|---|---|
| 1 | CodeGraph | `src/index.ts` exposes a `CodeGraph` facade over extraction, SQLite queries, reference resolution, graph traversal, context building, and MCP serving. `src/types.ts` defines normalized `NodeKind`/`EdgeKind`, including `route`, `component`, `calls`, `imports`, and `references`. `src/resolution/frameworks/*` contains many framework-specific route resolvers. | Adopt its normalized graph vocabulary and route-node model; expand the current `--backend codegraph` path from route-only to symbol/impact facts where available. | Optional external backend first; do not vendor the engine. Use CLI/JSON or library API only when user-maintained index exists. | **Use first.** This is the best source for graph shape and framework route behavior. |
| 2 | dependency-cruiser | `src/main/index.mjs` exports `cruise()` and `format()`. `types/dependency-cruiser.d.mts` documents `cruise(files, options, resolveOptions, transpileOptions): Promise<IReporterOutput>`. Output includes module dependencies and can be formatted as JSON/Mermaid/DOT. | Add JS/TS dependency graph enrichment: modules, dependency edges, circular deps, orphan modules, affected test hints. | Add as optional npm dependency or invoke via installed package; start with JSON API for JS/TS targets. | **Use second.** Fills Code2Lark's dependency-graph gap with low implementation risk. |
| 3 | ast-grep | NAPI layer exposes `parse`, `parseAsync`, `SgNode.find`, `findAll`, node traversal, and typed rule objects. Core is tree-sitter-based structural matching, not full graph construction. | Replace fragile regex fingerprints with structural rules for common route declarations, config/env assignments, and framework markers. | Prefer CLI/JSON or `@ast-grep/napi` for narrowly-scoped rules; do not build a general graph on top of it. | **Use selectively.** Best as a rule engine, not as the main analyzer. |
| 4 | ts-morph | Monorepo package wraps TypeScript Compiler API. Tests show APIs for `Project`, `SourceFile`, references, imports, exports, declarations, `SyntaxKind`, and AST traversal. | Build a TypeScript-only deep analyzer for exported handlers/functions, JSDoc-derived capability descriptions, parameter schemas, and import references. | Optional TS-specific plugin strategy, gated behind detected `tsconfig.json`. | **Use selectively.** Strong for TS targets, but not polyglot enough to lead. |

## Detailed Cherry-Pick Plan

### 1. CodeGraph: Normalize Code2Lark's structural facts around graph primitives

| Source area inspected | Useful idea | Code2Lark adaptation |
|---|---|---|
| `src/types.ts` | Stable node and edge vocabulary: `file`, `module`, `function`, `method`, `route`, `component`; `calls`, `imports`, `references`, etc. | Extend Code2Lark's `StructuralFacts` to carry a generic `nodes[]` and `edges[]` shape instead of endpoint-only facts. |
| `src/index.ts` | Public facade wires extraction, resolution, graph traversal, and context building behind a small API. | Keep Code2Lark's analyzer backend interface small: `status`, `routes`, `symbols`, `impact`, `dependencies`. Avoid leaking backend internals into product logic. |
| `src/resolution/frameworks/*` | Framework route extraction is handled as route nodes plus references to handlers. | Model Lark-exposable capabilities as `route/command -> handler -> side effect` chains instead of isolated endpoints. |
| MCP/agent guidance | One high-signal tool is preferred over many narrow tools. | For the future Code2Lark skill, expose a small guided workflow instead of many low-level commands. |

**Do not cherry-pick by copying CodeGraph internals.** CodeGraph is a complete indexed engine with SQLite, Rust/native parsing, MCP lifecycle, and auto-sync. Code2Lark should consume it when present and borrow its data model, not vendor its engine.

### 2. dependency-cruiser: Add a JS/TS module dependency layer

| Source area inspected | Useful idea | Code2Lark adaptation |
|---|---|---|
| `src/main/index.mjs` | Public API is intentionally tiny: `cruise()` and `format()`. | Add an optional `dependencyCruiserAnalyzer` that returns JSON facts for JS/TS projects. |
| `types/dependency-cruiser.d.mts` | API accepts file/dir array plus cruise, resolve, and transpile options. | Call `cruise([rootOrSrc], { outputType: "json", includeOnly }, resolveOptions, transpileOptions)` and normalize the result. |
| `src/analyze/derive/*` | Existing derivations cover circular, reachable, dependents, folders, orphans, and metrics. | Use circular/orphan/dependent facts for risk labeling and capability pruning. |
| Report plugins | Mermaid/DOT outputs are available. | Optionally generate a dependency diagram in `analyze` reports, not in the runtime package. |

Recommended first implementation: dependency graph only, no custom rule enforcement. Rules can come later after Code2Lark knows how graph facts affect generated Lark entrypoints.

### 3. ast-grep: Replace brittle regexes with structural patterns

| Source area inspected | Useful idea | Code2Lark adaptation |
|---|---|---|
| `crates/napi/types/sgnode.d.ts` | `SgNode.find()` and `findAll()` support pattern and rule matching. | Define small rule packs for Express/FastAPI/Nest/Flask/Next-style route declarations. |
| `crates/napi/types/rule.d.ts` | Rules support `pattern`, `kind`, `inside`, `has`, `precedes`, `follows`, `all`, `any`, `not`. | Express capability detection as declarative rules that are easier to test than hand-written regex. |
| `crates/core/src/tree_sitter/*` | Parser caching and injected-language handling are solved by ast-grep. | Use ast-grep only as an external/optional parser; avoid reimplementing parser cache logic. |
| CLI package | `@ast-grep/cli` distributes platform binaries through optional dependencies. | For MVP, prefer CLI invocation to avoid native binding friction in Code2Lark's package. |

Recommended first implementation: create an `analysis-rules/` directory with 5-10 route/config patterns and golden fixtures. Do not attempt a full AST analyzer.

### 4. ts-morph: TypeScript-only deep capability extraction

| Source area inspected | Useful idea | Code2Lark adaptation |
|---|---|---|
| `packages/ts-morph` package surface | `Project` and `SourceFile` are the main API concepts. | Load target `tsconfig.json`, enumerate source files, and extract exported functions/classes. |
| SourceFile reference tests | APIs cover referenced/referencing source files and import/export declarations. | Map exported handlers to imports and likely call sites for impact/risk labels. |
| AST helper tests | `SyntaxKind`, descendant traversal, declaration helpers, and structure extraction are mature. | Extract parameter names/types/JSDoc to seed Lark form fields and capability descriptions. |

Recommended first implementation: only enable for TypeScript targets with a usable `tsconfig.json`; otherwise fall back to CodeGraph/internal/ast-grep facts.

## Proposed Code2Lark Analyzer Pipeline

| Stage | Backend | Required? | Output |
|---|---|---:|---|
| File inventory | Existing internal scanner | Yes | Source files, skipped dirs, target metadata. |
| Route/symbol graph | CodeGraph, if initialized | Optional | Route nodes, handler references, symbol list, call/impact hints. |
| JS/TS dependency graph | dependency-cruiser | Optional | Module dependency edges, circular deps, orphans, affected tests. |
| Structural fingerprints | ast-grep CLI or NAPI | Optional | Route/config/framework/secret pattern hits with source locations. |
| TypeScript signatures | ts-morph | Optional | Exported function/class signatures, JSDoc, input/output hints. |
| Product mapping | Code2Lark-owned logic | Yes | Candidate Lark operations, risk labels, clarification questions, generation plan. |

## Implementation Order

| Step | Change | Why first/next | Acceptance signal |
|---:|---|---|---|
| 1 | Define a backend-neutral `StructuralGraphFacts` shape inspired by CodeGraph node/edge vocabulary. | Prevents every backend from leaking custom output into product logic. | Existing `analyze` tests still pass; route-only internal facts map into the new shape. |
| 2 | Expand current CodeGraph backend to include symbols and optional impact/call facts when CLI supports JSON for them. | Highest-value backend already partially integrated. | Calendar/image-agent analysis records richer facts without requiring CodeGraph installation. |
| 3 | Add dependency-cruiser as optional JS/TS dependency enrichment. | Dependency graph is a clear current gap and API is straightforward. | A TS/JS fixture reports module edges and circular/orphan summaries. |
| 4 | Add ast-grep rule pack for route/config fingerprints. | Improves precision of current regex scanner without replacing the analyzer. | Golden fixtures prove regex false positives are reduced. |
| 5 | Add ts-morph TS analyzer. | Useful for schema/JSDoc extraction, but only after the shared facts shape exists. | TS fixture produces parameter/type/JSDoc-derived capability hints. |

## Risk Notes

| Risk | Impact | Mitigation |
|---|---|---|
| Vendoring whole analyzers would bloat Code2Lark and duplicate mature tools. | High maintenance cost and packaging risk. | Prefer optional external adapters and normalized output. |
| CodeGraph requires a user-maintained index. | Backend may be unavailable in fresh targets. | Keep `auto` fallback; never run `init`/`sync` without explicit user permission. |
| dependency-cruiser is JS/TS-focused. | No help for Python/Go/etc. | Treat as enrichment, not universal analyzer. |
| ast-grep rule packs can become framework-specific maintenance burden. | Medium. | Keep rules small, fixture-driven, and capability-oriented. |
| ts-morph may need valid project config. | Type-aware extraction can fail on broken targets. | Gate behind tsconfig detection and return non-blocking warnings. |

## Bottom Line

The source-level inspection confirms the earlier ranking. CodeGraph should define the graph vocabulary and primary optional backend. dependency-cruiser should fill JS/TS dependency facts. ast-grep should replace brittle regexes for narrowly-scoped structural fingerprints. ts-morph should be a TypeScript-only enrichment layer for signatures and documentation.
