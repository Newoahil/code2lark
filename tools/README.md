# Code2Lark Local Tooling

This directory documents how the Code2Lark skill reuses executable capabilities while evolving toward a self-contained product package.

## Principle

The user should experience one Code2Lark skill. Internally, the package can reuse CLI/core modules, analyzer adapters, and embedded skills.

## Current Reuse

| Capability | Current source | Direction |
|---|---|---|
| Analyze / plan / generate / install / verify / evidence / handoff | Existing Code2Lark CLI under repository `src/` and `dist/` | Keep CLI as a stable execution entrypoint while extracting reusable core APIs. |
| Card design | `embedded-skills/lark-card-designer/` | Fully bundled as an embedded skill. |
| Dependency graph | dependency-cruiser | Integrate as local analyzer adapter rather than asking users to run it directly. |
| Structural search | ast-grep | Integrate rule packs and optional bundled execution. |
| TypeScript deep analysis | ts-morph | Integrate as a local TS analyzer dependency. |
| Graph model / route resolver ideas | CodeGraph | Borrow graph vocabulary and resolver patterns first; do not vendor the full engine by default. |

## Product Boundary

External tools should become implementation details. Code2Lark should own the normalized facts, risk classification, Lark workflow mapping, generation, verification, and evidence contract.

## Packaging Boundary

The repository root is the Code2Lark skill root because it contains `SKILL.md`, `references/`, `embedded-skills/`, and `tools/`. The existing `package.json` remains the Node CLI/core package metadata for the current TypeScript implementation (`lark-deployer` while the CLI package name is still historical). Do not treat `package.json` as the skill manifest.

## Co-Build Demo Runner

Use the runner to validate the wave-3 static Co-Build design contract:

- `node tools/run-cobuild-demo.mjs` — static checks + optional Codex validation.
- `node tools/run-cobuild-demo.mjs --static-only` — deterministic local checks only, no external calls.
- `node tools/run-cobuild-demo.mjs --verify-response <path>` — validate an existing response JSON file and return non-zero on contract/safety failures.
- `npm run test:cobuild-demo` — run focused fixture test coverage for the runner contract expectations.
- `npm run demo:cobuild` — run static validation plus best-effort Codex external check.

The script only uses Codex when already installed and authenticated. It does not install, configure, or login to Codex. Temporary artifacts are created under the OS temp directory; static-only and skipped runs clean them up automatically, while a real Codex response may leave a reported temp path for sanitized review. If Codex is unavailable or unauthenticated, the report uses `external_agent_status: "skipped"` and keeps `verification_level: "static-only"`.
