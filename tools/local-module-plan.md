# Code2Lark Local Module Plan

Code2Lark is now shaped as a repository-root skill. The real implementation remains in the repository's existing `src/` tree; this document records the local second-development direction that was considered for skill repository integration.

Planned module areas in the real `src/` tree:

| Area | Target role |
|---|---|
| `src/analyzer/` | Normalized facts, dependency graph adapters, AST rules, TS signatures. |
| `src/generator/` | Skill-driven generation orchestration wrappers over existing generation code. |
| `src/verifier/` | Verification, doctor checks, and mode-specific validation gates. |
| `src/evidence/` | Handoff artifacts, sanitized evidence summaries, and cleanup guidance. |

The existing CLI should remain a stable execution entrypoint while reusable core APIs are extracted. Do not create a parallel implementation path under a nested skill directory.
