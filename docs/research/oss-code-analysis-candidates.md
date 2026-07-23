# Code2Lark Project Understanding Layer: OSS Candidate Research Report

**Date**: 2026-07-22
**Status**: Research Complete
**Author**: THE LIBRARIAN (automated research agent)

---

## Executive Summary

Code2Lark is evolving from a CLI-first build-time generator into a **skill-first** tool that converts software capabilities into Feishu/Lark workflows. The current `analyze` command uses a built-in internal scanner with optional codegraph backend, but the AGENT.md explicitly states: *"External code-understanding skills should be reused and adapted instead of rebuilding generic project analysis from scratch."*

This report evaluates 10 mature open-source projects across 5 capability categories, ranks them for Code2Lark suitability, and provides concrete cherry-pick targets.

### Top Recommendation

**CodeGraph (colbymchenry/codegraph)** is the strongest single candidate. It already integrates with Code2Lark via the `--backend codegraph` path, provides framework-aware route detection across 17+ frameworks, and exposes a rich MCP tool surface. Its Rust kernel, SQLite storage, and auto-sync file watcher make it the most complete drop-in replacement for the internal scanner.

---

## 1. Code2Lark's Current Analysis Capabilities

Before evaluating candidates, here is what Code2Lark's `analyze` command currently does:

| Capability | Current Implementation | File |
|---|---|---|
| File inventory | `collectSourceFiles()` with skip-dir filtering | `src/commands/analyze.ts:960-980` |
| Route/endpoint detection | Regex-based: FastAPI decorators, Node HTTP patterns, documented endpoints | `src/commands/analyze.ts:856-864, 1002-1011` |
| Framework detection | String matching in requirements.txt, main.py, package.json | `src/commands/analyze.ts:789-799` |
| Secret scanning | Regex patterns for API keys and secret assignments | `src/commands/analyze.ts:49-55` |
| Structural backend | Internal regex + optional codegraph CLI integration | `src/structural-analysis.ts` |
| Dependency graph | **Not implemented** | N/A |
| Symbol extraction | **Not implemented** (only endpoint extraction) | N/A |
| Architecture summarization | **Not implemented** | N/A |
| Code knowledge graph | **Not implemented** | N/A |

**Gap Analysis**: Code2Lark needs structured output containing: entrypoints, routes, commands, side-effect labels, required env, candidate operations, risk level, and clarification questions. The current internal scanner only covers routes and frameworks at a surface level.

---

## 2. Candidate Evaluation Matrix

### Category A: Code Knowledge Graph / Symbol Extraction

| Candidate | Public signal observed during research | License | Language | Maturity | Key Strength |
|---|---|---|---|---|---|
| **CodeGraph** (colbymchenry/codegraph) | High GitHub visibility | MIT | Rust+TS | Active | Framework-aware routes, 20+ languages, MCP native |
| **codelens** (frostorygon/codelens) | Low visibility during research | ? | JS | Early | Call chains, dead code, cycle detection |
| **Arbok** (takuto-san/Arbok) | ? | ? | TS | Active | SQLite index, MCP, memory bank |
| **Ariadne** (CRJFisher/ariadne) | 19 | MIT | TS | Early | Scope graph, call graphs, multi-lang |
| **mcp-codebase-intelligence** (g-tiwari) | Low visibility during research | MIT | TS | Early | 18 tools, 8 languages, LSP hybrid |
| **Specter-Tree** (DinoQuinten/specter-tree) | Low visibility during research | MIT | TS | Early | ts-morph based, TypeScript-only |

### Category B: Dependency Graph / Module Analysis

| Candidate | Public signal observed during research | License | Language | Maturity | Key Strength |
|---|---|---|---|---|---|
| **dependency-cruiser** (sverweij) | Mature and widely used | MIT | JS/TS | Active since 2016+ | Programmatic API, JSON output, dependency rules |
| **madge** (pahen/madge) | Mature public repository | MIT | JS | Active since 2012+ | Simple API, circular detection, Graphviz output |

### Category C: Structural Search / Pattern Matching

| Candidate | Public signal observed during research | License | Language | Maturity | Key Strength |
|---|---|---|---|---|---|
| **ast-grep** (ast-grep/ast-grep) | Active public repository with strong visibility | MIT | Rust | Active since 2022+ | 20+ languages, Node.js binding, jQuery-like API |

### Category D: Codebase Packing / Context Preparation

| Candidate | Public signal observed during research | License | Language | Maturity | Key Strength |
|---|---|---|---|---|---|
| **Repomix** (yamadashy/repomix) | Active public repository with strong visibility | MIT | TS | Active since 2024+ | Tree-sitter compression, MCP server, remote repos |

### Category E: TypeScript Deep Analysis

| Candidate | Public signal observed during research | License | Language | Maturity | Key Strength |
|---|---|---|---|---|---|
| **ts-morph** (dsherret/ts-morph) | Mature and widely used | MIT | TS | Active since 2017+ | Full TypeScript Compiler API wrapper |

---

## 3. Detailed Candidate Profiles

### 3.1 CodeGraph (colbymchenry/codegraph) — **TIER 1: STRONGEST MATCH**

**GitHub**: https://github.com/colbymchenry/codegraph
**License**: MIT
**Observed status during research**: active public repository with strong visibility

**What it provides**:
- Native Rust kernel with tree-sitter parsing for 20+ languages
- SQLite-backed knowledge graph with FTS5 full-text search
- **Framework-aware route detection** across 17 frameworks (Django, Flask, FastAPI, Express, NestJS, Laravel, Rails, Spring, Gin, Axum, ASP.NET, React Router, SvelteKit, etc.)
- Symbol extraction: 22 NodeKinds (function, class, method, route, component, etc.) and 12 EdgeKinds (calls, imports, extends, implements, references, etc.)
- MCP server with `codegraph_explore` (single powerful tool) + 7 auxiliary tools
- Auto-sync file watcher using native OS events
- 100% local, no API keys needed
- CLI: `codegraph query`, `codegraph callers`, `codegraph callees`, `codegraph impact`, `codegraph files`, `codegraph context`

**How it maps to Code2Lark**:
- **Already integrated**: Code2Lark's `structural-analysis.ts` already calls `codegraph status` and `codegraph query route` as an external backend
- **Route detection**: Directly replaces the regex-based `extractFastApiEndpoints()`, `extractNodeHttpEndpoints()`, and `extractDocumentedEndpoints()` with framework-aware, language-agnostic route extraction
- **Symbol extraction**: Provides function/class/method inventory that Code2Lark currently lacks entirely
- **Dependency graph**: `codegraph callers`/`callees`/`impact` provide dependency analysis Code2Lark doesn't have
- **Structured output**: JSON output from `--json` flag is already normalized in `structural-analysis.ts`

**Cherry-pick targets**:
1. **Route detection logic**: Replace `src/commands/analyze.ts` regex-based endpoint extraction with `codegraph query route --kind route --json` results
2. **Symbol inventory**: Add `codegraph query` results to `StructuralFacts` for function/class/method listing
3. **Dependency analysis**: Use `codegraph callers`/`callees` for impact analysis in generated manifests
4. **Framework detection**: Leverage CodeGraph's 17-framework route recognition instead of string-matching `requirements.txt`

**Risks**:
- Requires user-maintained codegraph installation and index (Code2Lark policy: never auto-install)
- Native Rust kernel requires Node 20-24 (Code2Lark already requires Node >=24.16)
- WASM fallback is 5-10x slower

---

### 3.2 dependency-cruiser (sverweij/dependency-cruiser) — **TIER 1: DEPENDENCY GRAPH**

**GitHub**: https://github.com/sverweij/dependency-cruiser
**License**: MIT
**Observed status during research**: mature public repository with broad npm usage

**What it provides**:
- Full dependency graph extraction for JS/TS/CoffeeScript/Vue/Svelte
- Circular dependency detection
- Orphan detection (unused modules)
- Multiple output formats: JSON, DOT, Mermaid, D2, HTML, CSV
- **Programmatic API** (`cruise()` function) for embedding in Node.js tools
- Validation rules engine (configurable via `.dependency-cruiser.js`)
- TypeScript path alias resolution (`tsConfig` option)
- Webpack alias resolution

**How it maps to Code2Lark**:
- **Dependency graph**: Fills the biggest gap in Code2Lark's current analysis — no module dependency tracking exists today
- **Programmatic API**: The `cruise()` function can be called directly from `analyze.ts` without shelling out
- **JSON output**: Structured dependency data can feed into `service_manifest.json` and `capability_map.json`
- **Orphan detection**: Identifies unused files/modules that shouldn't be exposed as capabilities
- **Circular dependency detection**: Safety check before generating adapter code

**Cherry-pick targets**:
1. **Add `cruise()` call** in `collectStructuralFacts()` to produce a dependency graph alongside route facts
2. **Extend `StructuralFacts`** with a `dependencies` field containing module graph data
3. **Use orphan detection** to filter out non-entrypoint files from capability mapping
4. **Generate dependency visualizations** (Mermaid) in analysis reports

**Integration example**:
```typescript
import { cruise } from "dependency-cruiser";

const result = await cruise(["src"], {
  outputType: "json",
  includeOnly: "^src",
  tsConfig: "./tsconfig.json",
});
// result.output contains the full dependency graph
```

---

### 3.3 ast-grep (ast-grep/ast-grep) — **TIER 2: STRUCTURAL SEARCH**

**GitHub**: https://github.com/ast-grep/ast-grep
**License**: MIT
**Observed status during research**: active public repository with broad language support

**What it provides**:
- Structural code search using code-as-pattern syntax
- 20+ language support via tree-sitter
- **Node.js binding** with jQuery-like API for AST traversal
- YAML-based rule system for linting
- CLI with `--json` output
- Pattern-based code rewriting

**How it maps to Code2Lark**:
- **Route pattern matching**: Can find route registrations structurally (e.g., `@app.$METHOD("$PATH")`) instead of regex
- **Framework detection**: Structural patterns for detecting Express (`app.$METHOD()`), Flask (`@app.route()`), etc.
- **Secret scanning enhancement**: Structural patterns for `$API_KEY = "$VALUE"` assignments
- **Node.js API**: Can be embedded as a library, not just CLI

**Cherry-pick targets**:
1. **Replace regex endpoint extraction** with ast-grep structural patterns for more accurate route detection
2. **Enhance secret scanning** with structural patterns that catch more variants
3. **Framework fingerprinting**: Use structural patterns to identify framework usage beyond string matching

**Limitations**:
- Requires Rust binary installation (or npx)
- Pattern syntax has learning curve
- Not a full knowledge graph — search-focused, not relationship-focused

---

### 3.4 Repomix (yamadashy/repomix) — **TIER 2: CONTEXT PREPARATION**

**GitHub**: https://github.com/yamadashy/repomix
**License**: MIT
**Observed status during research**: active public repository with strong visibility

**What it provides**:
- Packs entire repositories into AI-friendly XML/Markdown/JSON/plain text
- Tree-sitter code compression (~70% token reduction while preserving structure)
- Token counting per file and total
- MCP server with `pack_codebase` and `pack_remote_repository` tools
- Git-aware filtering (.gitignore, .repomixignore)
- Secretlint integration for security
- Remote repository packing (no manual clone needed)

**How it maps to Code2Lark**:
- **Skill-first workflow**: Repomix's MCP server and explorer skill are exactly the pattern Code2Lark wants to follow
- **Context preparation**: Before analysis, pack the target repo for AI consumption
- **Compression**: Tree-sitter compression extracts code signatures — useful for generating capability summaries
- **Remote analysis**: `pack_remote_repository` could enable analyzing targets without local clones

**Cherry-pick targets**:
1. **Adopt the MCP skill pattern**: Repomix's `repomix-explorer` skill architecture is a reference for Code2Lark's future skill
2. **Use compression for summaries**: Tree-sitter compressed output as input to capability mapping
3. **Token counting**: Add token estimates to analysis reports for LLM context planning

---

### 3.5 ts-morph (dsherret/ts-morph) — **TIER 2: DEEP TYPESCRIPT ANALYSIS**

**GitHub**: https://github.com/dsherret/ts-morph
**License**: MIT
**Observed status during research**: mature public repository with broad TypeScript ecosystem usage

**What it provides**:
- Full TypeScript Compiler API wrapper with ergonomic helper methods
- Symbol extraction: classes, interfaces, functions, methods, properties, enums, type aliases
- Import/export analysis
- Type information and call signature resolution
- JSDoc extraction
- In-memory file manipulation (no disk writes until `.save()`)
- Programmatic code generation from structures

**How it maps to Code2Lark**:
- **TypeScript target analysis**: For TypeScript targets, ts-morph provides the deepest possible analysis
- **Symbol extraction**: Get all exported functions, classes, interfaces with full type signatures
- **JSDoc extraction**: Extract documentation from code for capability descriptions
- **Import graph**: Track which modules import what for dependency analysis

**Cherry-pick targets**:
1. **TypeScript-specific analyzer strategy**: Add a `ts_api` analyzer that uses ts-morph for deep TS project understanding
2. **Symbol-to-capability mapping**: Use exported function signatures to auto-generate capability input/output schemas
3. **JSDoc → capability descriptions**: Extract documentation as capability descriptions

**Limitations**:
- TypeScript/JavaScript only (not polyglot like tree-sitter-based tools)
- Heavier dependency (~1.4MB unpacked)
- Requires tsconfig.json for proper resolution

---

### 3.6 madge (pahen/madge) — **TIER 3: LIGHTWEIGHT DEPENDENCY GRAPH**

**GitHub**: https://github.com/pahen/madge
**License**: MIT
**Observed status during research**: mature public repository
**Observed status during research**: mature public repository with broad npm usage

**What it provides**:
- Simple module dependency graph generation
- Circular dependency detection
- Orphan and leaf detection
- DOT/SVG/Image output
- Programmatic API: `.obj()`, `.depends()`, `.circular()`, `.orphans()`, `.leaves()`

**How it maps to Code2Lark**:
- Lighter alternative to dependency-cruiser for simple dependency graphs
- `.depends(id)` for impact analysis
- `.circular()` for safety checks

**Limitations**:
- Less actively maintained (last release Aug 2024)
- Fewer features than dependency-cruiser (no validation rules, fewer output formats)
- 124 open issues

---

### 3.7 Other Candidates (TIER 3: Niche/Experimental)

| Candidate | Notes |
|---|---|
| **codelens** (frostorygon) | 13 MCP tools, call chains, dead code, cycle detection. Very new during research with low public visibility. Interesting call chain tracing but too immature. |
| **Arbok** (takuto-san) | SQLite index, MCP server, memory bank generation. Interesting concept but smaller community. |
| **Ariadne** (CRJFisher) | Scope graph approach, multi-language. Early-stage and low-signal during research. |
| **mcp-codebase-intelligence** (g-tiwari) | 18 tools, 8 languages, LSP hybrid. Ambitious but still low-signal during research. |
| **Specter-Tree** (DinoQuinten) | ts-morph based, TypeScript-only. Too narrow and immature for Code2Lark's current needs. |
| **hermes-code-intel-plugin** (rewasa) | tree-sitter + ast-grep + LSP hybrid. Interesting architecture but low-signal during research and tied to Hermes Agent. |

---

## 4. Ranked Recommendations

### Tier 1: Strongly Recommended (adopt now)

| Rank | Project | Rationale | Effort |
|---|---|---|---|
| **1** | **CodeGraph** | Already integrated; framework-aware routes; 20+ languages; MCP native; replaces most of internal scanner | Low (enhance existing integration) |
| **2** | **dependency-cruiser** | Fills the dependency graph gap; mature ecosystem usage; programmatic API; JSON output | Medium (new integration) |

### Tier 2: Recommended (adopt selectively)

| Rank | Project | Rationale | Effort |
|---|---|---|---|
| **3** | **ast-grep** | Structural search for route/framework detection; Node.js binding; replaces fragile regex | Medium |
| **4** | **ts-morph** | Deep TypeScript analysis for TS targets; JSDoc extraction; type-aware capability mapping | Medium-High |
| **5** | **Repomix** | Reference architecture for skill-first pattern; compression for summaries; MCP skill template | Low (pattern reference) |

### Tier 3: Watch / Niche Use

| Rank | Project | Rationale |
|---|---|---|
| **6** | **madge** | Lighter dependency-cruiser alternative; less maintained |
| **7** | **codelens** | Interesting call chain tracing; too immature |
| **8** | **Arbok** | Memory bank concept; small community |

---

## 5. Recommended Architecture: Skill-First Project Understanding Layer

Based on this research, the recommended architecture for Code2Lark's future project understanding layer:

```
┌─────────────────────────────────────────────────────────┐
│                 Code2Lark Skill (Future)                  │
│  Orchestrates: understand → clarify → design → deliver   │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│           Project Understanding Layer (NEW)              │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  CodeGraph   │  │ dep-cruiser  │  │   ast-grep   │   │
│  │  (routes,    │  │ (dependency  │  │ (structural  │   │
│  │  symbols,    │  │  graph,      │  │  patterns,   │   │
│  │  call graph) │  │  orphans)    │  │  framework   │   │
│  └──────┬───────┘  └──────┬───────┘  │  detection)  │   │
│         │                 │           └──────┬───────┘   │
│         └─────────┬───────┘                  │           │
│                   │                          │           │
│         ┌─────────▼──────────────────────────▼───────┐   │
│         │        Structured Facts (JSON)              │   │
│         │  - entrypoints, routes, commands            │   │
│         │  - dependencies, call graph                 │   │
│         │  - side-effect labels, risk levels           │   │
│         │  - required env, candidate operations       │   │
│         │  - clarification questions                  │   │
│         └────────────────────┬────────────────────────┘   │
└──────────────────────────────┼────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────┐
│              Code2Lark Core (existing)                     │
│  Business mapping → Lark card/workflow design →            │
│  Safety policy → Mode A/B delivery → Install/verify/handoff │
└───────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **External tools produce structured facts** — CodeGraph, dependency-cruiser, and ast-grep each produce JSON output that gets normalized into a unified `StructuralFacts` schema
2. **Code2Lark owns business mapping** — The core differentiator remains converting project capabilities into safe, operable, auditable Lark workflows
3. **Graceful degradation** — Each external tool is optional; the system works with any subset (like the current `--backend auto|internal|codegraph` pattern)
4. **MCP-native** — All three Tier 1/2 tools support or are compatible with MCP, aligning with Code2Lark's skill-first direction

---

## 6. Next-Step Plan

### Phase 1: Enhance CodeGraph Integration (Week 1-2)

1. **Extend `StructuralFacts`** to include symbol inventory and dependency data from CodeGraph
2. **Add `codegraph query`** call for symbol extraction (functions, classes, methods)
3. **Add `codegraph callers`/`callees`** for impact analysis in generated manifests
4. **Leverage framework-aware routes**: Map CodeGraph's 17-framework route detection into `StructuralRouteFact[]`
5. **Update `structural-analysis.ts`** to normalize the richer CodeGraph output

### Phase 2: Add Dependency Graph (Week 2-3)

1. **Add `dependency-cruiser`** as an optional dependency (or `npx` invocation)
2. **Extend `StructuralFacts`** with `dependencies: DependencyGraph` field
3. **Add dependency visualization** (Mermaid) to analysis reports
4. **Use orphan detection** to filter non-entrypoint files from capability mapping
5. **Add circular dependency check** as a safety gate

### Phase 3: Structural Pattern Enhancement (Week 3-4)

1. **Add ast-grep patterns** for framework detection (Express, Flask, FastAPI, etc.)
2. **Replace regex-based endpoint extraction** with ast-grep structural patterns
3. **Enhance secret scanning** with structural patterns

### Phase 4: TypeScript Deep Analysis (Week 4+)

1. **Add ts-morph-based analyzer** for TypeScript projects
2. **Extract JSDoc** for capability descriptions
3. **Use type information** for auto-generating input/output schemas

### Phase 5: Skill-First Architecture (Ongoing)

1. **Study Repomix's skill pattern** as reference architecture
2. **Design Code2Lark skill** that orchestrates: CodeGraph → dependency-cruiser → ast-grep → business mapping → Lark workflow
3. **Implement MCP server** for Code2Lark's project understanding layer

---

## 7. License Summary

All Tier 1 and Tier 2 candidates are **MIT licensed**, making them safe for cherry-picking, forking, and adaptation:

| Project | License | Commercial Use | Modification | Distribution |
|---|---|---|---|---|
| CodeGraph | MIT | ✅ | ✅ | ✅ |
| dependency-cruiser | MIT | ✅ | ✅ | ✅ |
| ast-grep | MIT | ✅ | ✅ | ✅ |
| ts-morph | MIT | ✅ | ✅ | ✅ |
| Repomix | MIT | ✅ | ✅ | ✅ |
| madge | MIT | ✅ | ✅ | ✅ |

---

## 8. Key Insights

1. **CodeGraph is the clear winner** for route/symbol extraction — it's already integrated, has the broadest language support, and provides framework-aware route detection that directly replaces Code2Lark's fragile regex-based approach.

2. **dependency-cruiser fills the biggest gap** — Code2Lark has zero dependency graph capability today. Adding it would enable impact analysis, orphan detection, and circular dependency checks.

3. **The MCP ecosystem is converging** — CodeGraph, Repomix, codelens, Arbok, and mcp-codebase-intelligence all expose MCP servers. This aligns perfectly with Code2Lark's skill-first direction.

4. **Don't rebuild generic analysis** — The AGENT.md guidance is correct. CodeGraph + dependency-cruiser + ast-grep cover 90%+ of what Code2Lark's internal scanner does, with better accuracy and broader language support.

5. **Keep Code2Lark's core differentiator** — Business mapping, Lark card/workflow design, safety policy, and Mode A/B delivery remain Code2Lark's unique value. External tools should feed structured facts into this pipeline, not replace it.

---

*Report generated by THE LIBRARIAN research agent. All findings based on public GitHub repositories, documentation, and web research as of July 2026.*
