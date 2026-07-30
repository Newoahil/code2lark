# Co-Build Playbook

Co-Build mode is the synchronized-design path for a new business capability and its Feishu/Lark entrypoint. The main developer or coding agent owns the business behavior; Code2Lark owns the Lark contract, card/action design, safety boundary, verification plan, and handoff evidence while proposing only the minimal target contract the business owner must approve.

Use this playbook after `cobuild-workflow.md` confirms that the user is explicitly asking for Lark/Feishu access as part of new capability work.

## 1. Activation Checklist

Activate Co-Build only when all are true:

- The user is building or changing a business capability.
- The user wants that capability reachable from Lark/Feishu, for example via a card, bot action, approval, report, or team-triggered job.
- There is a clear business owner or main development agent separate from Code2Lark's Lark-integration responsibility.

Do not activate Co-Build for ordinary feature work that has no Lark/Feishu intent. If the project already has finished business behavior and the user only wants Lark access added, use Retrofit instead.

## 2. First Response Shape

When Co-Build activates, respond with this structure before proposing files or commands:

```text
mode:
- cobuild

business_capability:
- what the user wants the business system to do
- what is still unknown

ownership_split:
- business owner / main agent owns domain logic, persistence, permissions, and target APIs
- Code2Lark owns Lark contract, cards, validation, audit, evidence, and generated integration boundary

minimal_contract:
- proposed status / dry-run / execute / cancel shape
- missing target APIs or functions, if any

card_confirmation:
- whether the host-local prepare/confirm card pattern is required

card_design_dependency:
- which card states require lark-card-designer input

verification_and_handoff:
- local QA gates
- `integrations/lark` embedded-long-connection delivery target
- simulator role: QA-only, not delivery
- Level 2 ready handoff: user supplies app id/secret and configures Feishu backend events/permissions before real testing
```

## 3. Ownership Contract

Co-Build succeeds only if ownership stays explicit.

| Area | Business owner / main agent | Code2Lark |
|---|---|---|
| Domain behavior | Owns business rules, data model, persistence, target-side permissions, and side effects. | Does not invent or silently change business rules. |
| Target API/function surface | Implements or approves any missing status/dry-run/execute/cancel surface. | Proposes the minimal surface needed for Lark integration. |
| Lark adapter | Provides target operation semantics and safe fields. | Owns card action IDs, adapter boundary, validation, audit fields, and generated integration files. |
| Risk control | Confirms what is read-only, state-changing, destructive, privileged, or external-send. | Defaults uncertain operations to state-changing or dangerous until confirmed. |
| Evidence | Confirms business correctness with its own tests. | Proves Lark integration behavior, local verification, and handoff evidence. |

If the business surface is missing, Code2Lark may propose a contract. It must not modify business code, root scripts, deployment files, databases, or production behavior unless the user explicitly approves that scope.

## 4. Minimal Contract Template

Prefer a small, explicit target contract. Not every capability needs all operations, but risky or long-running work should include `dry-run`, `execute`, and `status` where possible.

Terminology matters:

- Target-side contracts use `status`, `dry-run`, `execute`, and `cancel/stop`.
- `prepare/confirm` is the host-local Lark card action pattern for showing planned effects and then executing after explicit operator confirmation.
- Do not require the target project to implement `/prepare` or `/confirm` endpoints unless the business owner explicitly wants that API shape.

| Contract part | Purpose | Typical shape | Required when |
|---|---|---|---|
| `status` | Read current state or task progress. | `GET /api/<capability>/status` or `getStatus()` | Any long-running, asynchronous, or stateful capability. |
| `dry-run` | Calculate planned effects without side effects. | `POST /api/<capability>/dry-run` or `execute({ dryRun: true })` | State-changing, destructive, privileged, or external-send operations. |
| `execute` | Execute after the host-local confirm action approves it. | `POST /api/<capability>/execute` or `execute({ dryRun: false })` | Any operation that changes state or sends externally. |
| `cancel` / `stop` | Stop or cancel a running operation. | `POST /api/<capability>/cancel` | Long-running work where cancellation is supported and safe. |
| `audit` | Record who did what, when, and with which result. | Adapter audit event plus target task/correlation ID. | All card actions. |

Minimal contract record:

```json
{
  "capability_id": "business.operation",
  "owner": "business-agent-or-team",
  "risk": "read_only | write | destructive | privileged | external_send",
  "inputs": [
    { "name": "target_id", "required": true, "source": "card_form" }
  ],
  "status": { "available": true, "endpoint_or_function": "GET /api/operation/status" },
  "dry_run": { "available": true, "side_effects": false, "preview_ttl_seconds": 300 },
  "execute": {
    "available": true,
    "requires_host_local_confirm": true,
    "rejects_direct_execute_without_prepare": true,
    "idempotency_key": "confirmation_id"
  },
  "cancel": { "available": false, "reason": "target cannot safely cancel once started" },
  "authorization": { "operator_allowlist_required": true },
  "terminal_state_handling": "return already_processed or existing terminal result without re-executing",
  "audit": ["operator_open_id", "chat_id", "action_id", "confirmation_id", "target", "trace_id", "result"]
}
```

This JSON is a contract sketch for planning and review, not a production schema guarantee.

## 5. Card State Matrix

Before implementing or generating cards, route card design through `embedded-skills/lark-card-designer/SKILL.md`. Code2Lark supplies action semantics and risk; the card designer owns information hierarchy and component choice.

| State | First screen must show | Primary action | Safety rule |
|---|---|---|---|
| Candidate | Capability name, owner, source of intent, risk, missing contract questions. | Select or refine capability. | Do not imply the action is ready if contract is incomplete. |
| Prepare / dry-run | Planned target, inputs, expected effects, warnings, confidence, preview timestamp, and confirmation ID. | Confirm or edit inputs. | Calls only the target dry-run path or equivalent no-side-effect logic; preview must come from the target dry-run result and have a bounded freshness TTL. |
| Confirm | Final action summary, operator, target, irreversible effects, audit note, confirmation ID. | Execute. | Host-local state validates explicit operator confirmation, operator allowlist, preview freshness, and confirmation ID before calling target execute; reject direct execute bypass and duplicate confirmations. |
| Running | Operation ID or trace ID, status, started time, safe refresh. | Refresh or cancel if supported. | Cancel appears only if target contract supports safe cancellation. |
| Success | Result summary, affected target, timestamp, operator, next safe action. | Refresh status or start another safe run. | Do not expose secrets or raw logs; later actions for the same confirmation return the existing terminal result without re-executing. |
| Failure | Human-readable error, safe retry path, where to inspect logs. | Retry prepare or refresh status. | Error text must be sanitized. |
| Already completed | Existing terminal result, original operator, timestamp, and trace ID. | Refresh status or start a new safe run. | Terminal-state checks run before expiry checks so duplicate clicks remain idempotent even after the preview TTL passes. |

## 6. Question Rules

Ask concise questions only when the answer changes the contract or safety boundary. Do not ask broad checklists when a safe default exists.

Ask when:

- Business ownership is unclear.
- A target API/function is missing and Code2Lark would need to propose one.
- The operation may change state, delete, deploy, pay, notify, or send externally.
- The operator allowlist or permission model is unknown.
- The card's primary action would materially differ based on the user's answer.

Proceed without asking for read-only inspection, draft contracts, reviewable plans, and local analysis that does not write target project files.

## 7. Generation Boundary

Generated files must remain isolated and reviewable.

- Default Co-Build delivery is a target-project incremental module at `integrations/lark`.
- The module must use an embedded-long-connection host as the MVP real Feishu/Lark test entrypoint.
- Include cards/actions, adapter boundary, local simulator tests, embedded-long-connection startup docs, `.env.example`, and Level 2 runbook content.
- Local simulator output is a QA aid only; simulator-only output is not Co-Build complete.
- The long-connection module must have code that consumes `.env` values such as `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, target base URL, and operator allowlist; `.env.example` without a runtime consumer is incomplete.
- The runtime must expose a real startup path and route Feishu/Lark `card.action.trigger` events to the generated action handler. A mock card preview, static card JSON, or local simulator is not enough.
- `lark-card-designer` output is a design handoff, not production-sendable JSON. Convert it through a runtime adapter and validate with `feishu-runtime-gates.md`.
- Runtime validation must distinguish OpenAPI send-message `content`, JSON 2.0 callback button `behaviors`, and `card.action.trigger` callback response `card: { type: "raw", data }`.
- Legacy or internal generated-package steps may be used for dry-run review, but the skill-facing delivery target remains `integrations/lark`.
- Use dry-run before `install --apply`.
- Do not modify root `package.json`, deployment files, Docker files, business routes, migrations, or production config unless explicitly approved.
- `.env.example` may be generated; real `.env` values must remain local and uncommitted.
- Generated demos must include repository hygiene rules, typically a `.gitignore`, that exclude `.codex/`, runtime logs, raw callbacks, local evidence, real `.env` files, and temporary Codex/agent workspaces from commits.

## 8. QA and Evidence Gates

Co-Build completion requires both business and Lark-side evidence. A Lark card does not prove business correctness.

| Gate | Owner | Evidence |
|---|---|---|
| Business contract test | Business owner / main agent | Target tests or manual proof that status/dry-run/execute/cancel behave as promised. |
| Adapter validation | Code2Lark | Generated adapter tests, schema checks, and action validation. |
| Runtime card validation | Code2Lark | `verify:card` or equivalent proves send-message payload, callback button behavior, callback response card shape, and absence of design-only fields. |
| Local card simulation | Code2Lark | Simulated card action payloads, success/failure paths, and audit event checks. |
| Safety check | Code2Lark + business owner | Destructive/privileged/external-send actions use prepare/confirm and allowlist. |
| Lark action boundary | Code2Lark | Direct execute without prior host-local prepare is rejected. Client-controlled confirmation signals are not authorization: `confirm: true`, client-supplied previews, plain HTTP dry-run tokens, or equivalent request fields are not proof of Lark confirmation. Confirmation provenance must be server-held, host-local, or otherwise non-forgeably bound before target execution; forged or stale previews are rejected; unauthorized operators fail closed. |
| Idempotency | Code2Lark | Duplicate confirmations with the same confirmation ID do not call target execute twice and return a visible already-processed or terminal-state card. |
| Handoff | Code2Lark | Integration README, `.env.example`, verification report, cleanup notes, and Level 2 evidence template. |
| Level 2 readiness | Code2Lark | `integrations/lark` embedded-long-connection host exists, can be started locally, documents `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, operator allowlist, Feishu backend bot capability, long connection, `card.action.trigger`, permissions, and test chat setup. |
| Real Feishu Level 2 | User/operator, when requested | Sanitized proof of card sent, clicked, callback/action received, target invoked, result updated, and audit recorded. |

Use `references/evidence-handoff.md` for the shared handoff checklist and `references/safety-and-secrets.md` for secret handling.

## 9. Red Lines

- Do not let Code2Lark become the business feature owner.
- Do not hide missing business APIs behind generated card UI.
- Do not expose destructive, privileged, payment, deployment, deletion, or external-send operations as one-click actions.
- Do not treat card visibility as authorization.
- Do not commit or print real app secrets, open IDs, chat IDs, message IDs, raw callbacks, access tokens, debug tokens, or `.env` values.
- Do not present simulator-only output, mock card flows, static card JSON, or unused `.env.example` files as Co-Build completion.
- Do not use `lark-card-designer` skeletons, root-level `elements`, `{ card: cardJson }` message content wrappers, legacy button `value` alone, or raw card JSON directly under callback `card` as production runtime output.
- Do not switch to Retrofit or hand-write an ad-hoc Lark patch when Co-Build missed its delivery target; continue Co-Build completion against the approved contract.
- Do not claim Co-Build is complete until both the business contract and the Lark integration path have evidence.

## 10. Completion Report

Report Co-Build work in this shape:

```text
mode:
- cobuild

business_contract:
- implemented, proposed, or blocked

lark_entrypoints:
- cards/actions, risk, confirmation model
- delivery target: `integrations/lark` embedded-long-connection module

ownership:
- what business owner owns
- what Code2Lark owns

verification:
- business tests or missing business evidence
- adapter/card simulation/verify results
- runtime card gates: send-message payload, JSON 2.0 callback button behavior, and `card.action.trigger` callback response shape
- Lark QA boundary evidence: direct execute bypass, duplicate confirm, unauthorized operator, stale/forged preview, and terminal-state replay

handoff:
- generated files, local-only secrets/evidence, remaining real Feishu steps
- remaining user inputs: `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, operator allowlist, Feishu backend bot capability, long connection, `card.action.trigger`, permissions, and test chat configuration
- cleanup and repository hygiene: files to keep, files to remove, and local-only artifacts that must not be committed
```

This report is the conversational form of a `CoBuildDesignRecord`: activation reason, ownership split, minimal target contract, card/action plan, safety questions, verification plan, and handoff plan.
