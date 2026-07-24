# Code2Lark Skill MVP Requirements

**Date**: 2026-07-22
**Status**: Draft for MVP implementation
**Product direction**: Skill-first experience, reusable CLI/core underneath

## 1. MVP Positioning

Code2Lark MVP is a skill-first workflow that helps an AI coding agent turn selected software capabilities into Feishu/Lark entrypoints. It must support both existing-project retrofit and new-feature co-build, but it is not expected to automatically understand every codebase or make irreversible product decisions without confirmation.

The MVP promise is:

> For common Web/API/task-style projects, Code2Lark can discover candidate capabilities, ask the right confirmation questions, generate an isolated Lark integration, verify the result, and produce handoff evidence.

## 2. Modes

| Mode | Primary user intent | Role of project analysis | Code2Lark behavior |
|---|---|---|---|
| Retrofit | Add Lark entrypoints to an existing project. | Core engine. It discovers existing APIs, jobs, commands, handlers, config, and risk signals. | Analyze first, propose candidates, ask before modifying, then generate/install isolated integration. |
| Co-Build | Build a new business capability and Lark entrypoint together. | Safety guardrail. It detects existing structure and avoids fighting the host project. | Participate only when the user expresses Lark/business-entry intent; coordinate contracts with the main development agent. |

Retrofit needs stronger static analysis because the product must infer from existing code. Co-Build needs stronger interaction discipline because the product must avoid taking over business design.

## 3. MVP Scope

| Area | In scope for MVP | Out of scope for MVP |
|---|---|---|
| Project types | Common JS/TS/Python Web/API/task projects, small internal tools, admin workflows, scheduled jobs with safe dry-run semantics. | Arbitrary desktop/mobile/game/embedded systems, heavily dynamic private frameworks, opaque binary-only systems. |
| Analysis | Routes, handlers, exported functions, module dependencies, config/env hints, side-effect clues, candidate operations. | Guaranteed business intent, complete data-flow proof, full runtime behavior reconstruction. |
| Generation | Isolated Lark adapter/host module, card actions, validation, audit events, `.env.example`, README/runbook. | Deep rewrite of target business logic, production deployment automation, automatic permission ownership changes. |
| Safety | Dry-run-first, allowlist, confirmation cards, audit logs, explicit install/apply steps, no secret commits. | Silent dangerous action exposure, automatic deletion/payment/send actions without confirmation. |
| Evidence | Local verification report, Level 2 evidence template, handoff notes, cleanup rules. | Fully automated real-tenant certification across all Lark app configurations. |

## 4. Analyzer Sufficiency Boundary

The current cherry-pick set is sufficient for MVP, not sufficient for a general-purpose product claim.

| Source | MVP role | Boundary |
|---|---|---|
| CodeGraph | Primary optional graph model and route/symbol backend. | Use when the user maintains an index; do not auto-init or vendor the engine. |
| dependency-cruiser | JS/TS module dependency enrichment. | Not universal; use only as optional JS/TS facts. |
| ast-grep | Structural pattern rules for routes/config/framework/secret fingerprints. | Rule engine only, not a full project understanding engine. |
| ts-morph | TypeScript signatures, exports, JSDoc, and parameter hints. | TS-only enrichment gated by usable project config. |
| Code2Lark-owned logic | Business mapping, Lark workflow design, safety policy, generation, verification. | Must remain the product differentiator; do not outsource product judgment to analyzers. |

The analyzer layer should produce facts and uncertainty, not final product decisions. Any low-confidence or high-risk finding must become a question, a disabled candidate, or a dry-run-only action.

## 5. Required Workflow

### 5.1 Retrofit Workflow

1. Discover project type, language, package/runtime signals, and likely entrypoints.
2. Extract candidate capabilities from routes, commands, jobs, exported handlers, and documented operations.
3. Classify each candidate by risk: read-only, dry-run, state-changing, destructive, external-send, privileged.
4. Ask confirmation questions before writing any integration files.
5. Generate into an isolated location, defaulting to `integrations/lark` for target-project install mode.
6. Produce `.env.example`, local runbook, verification commands, cleanup instructions, and handoff evidence templates.
7. Verify locally before reporting completion.

### 5.2 Co-Build Workflow

1. Activate only when the user asks for a Lark/Feishu-facing business entrypoint.
2. Let the main development agent own business implementation.
3. Code2Lark owns Lark cards, action contracts, adapter glue, validation, audit, and evidence.
4. If required business API/state endpoints do not exist, propose a minimal contract and ask before modifying business code.
5. Keep integration files isolated unless the user explicitly approves touching host project surfaces.
6. Record an ownership split before proposing generated files or target writes.
7. Prefer a target contract-first shape for risky work: `status`, `dry-run`, `execute`, optional `cancel/stop`, and audit fields.
8. Treat `prepare/confirm` as the host-local Lark card pattern unless the business owner explicitly wants target-side prepare/confirm APIs.
9. Treat Co-Build completion as two-part evidence: business contract behavior plus Lark integration behavior.

## 6. Confirmation and Card Principles

Lark cards in the MVP should be action-oriented and risk-aware. The first screen must show what action will happen, which target it affects, and whether it is dry-run or real execution.

| State | Card behavior |
|---|---|
| Candidate proposal | Show capability name, source evidence, inferred inputs, risk level, and required confirmation. |
| Dry-run result | Show planned action, target response, warnings, and a separate confirm button if state change is allowed. |
| Running | Show status, operation id if available, refresh action, and safe cancellation if supported. |
| Success | Show result summary, affected target, timestamp, operator, and next safe action. |
| Failure | Show human-readable error, retry/refresh path, and where to inspect logs without exposing secrets. |
| Dangerous action | Require explicit prepare/confirm split; default button must not execute destructively. |

Design red lines:

- Do not put raw logs or secrets on the card.
- Do not hide the action behind long explanation.
- Do not use color decoratively; header/status color must express risk or state.
- Do not expose destructive operations without dry-run or two-step confirmation.
- Do not assume the operator is authorized because they can see the card.

## 7. Security Requirements

| Requirement | MVP rule |
|---|---|
| Secrets | Real `.env`, app secret, open id, chat id, message id evidence, and raw logs must not be committed. |
| Authorization | Generated integrations must support operator allowlists for action execution. |
| Isolation | Target-project install must default to an isolated integration directory. |
| Side effects | State-changing actions require explicit user confirmation; destructive actions require prepare/confirm split. |
| Debug surfaces | Debug endpoints/tokens must be local or explicitly protected. |
| Audit | Every card action should record action, operator, target, timestamp, result, and correlation id where possible. |

## 8. Evidence and Handoff Deliverables

Every MVP run should produce or update:

| Deliverable | Purpose |
|---|---|
| `README.md` or integration README | How to configure, run, verify, and stop the integration. |
| `.env.example` | Required variables without real values. |
| Verification report | Machine-readable local pass/fail status. |
| Handoff note | What was generated, what was verified, and what remains manual. |
| Cleanup rules | How to remove generated files and which evidence/private files must be preserved or ignored. |
| Level 2 evidence template | Space for real Lark tenant proof without committing secrets. |

## 9. Acceptance Criteria

The MVP skill is acceptable when all of the following are true:

1. Retrofit can analyze at least the existing `image-agent-web` and `calendar-stock-updater` samples and produce candidate Lark operations with source evidence.
2. Co-Build can guide a new small project to expose one safe Lark entrypoint without taking over unrelated business code.
3. Analyzer uncertainty is visible to the user as questions, warnings, or disabled candidates.
4. Generated integration remains isolated and can be reviewed before apply.
5. Dry-run-first and allowlist behavior are present in generated action paths.
6. Local verification passes before handoff.
7. Evidence output is useful without containing real secrets.
8. Failure modes are explicit: missing credentials, unreachable target, unauthorized operator, stale analysis, unsupported framework, and unsafe action.
9. Co-Build can produce a reusable synchronized-design record: ownership split, minimal contract, card/action state plan, QA gates, and handoff evidence plan.

## 10. Product Claim Boundary

Allowed MVP claim:

> Code2Lark helps agents add reviewed, isolated Lark entrypoints to common software projects by combining project analysis, confirmation workflows, code generation, and verification evidence.

Disallowed MVP claim:

> Code2Lark automatically understands any project and safely exposes any capability to Lark without human review.
