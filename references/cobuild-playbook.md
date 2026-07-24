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
- real Feishu Level 2 evidence plan, if requested
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
  "dry_run": { "available": true, "side_effects": false },
  "execute": { "available": true, "requires_host_local_confirm": true },
  "cancel": { "available": false, "reason": "target cannot safely cancel once started" },
  "audit": ["operator_open_id", "chat_id", "action_id", "target", "trace_id", "result"]
}
```

This JSON is a contract sketch for planning and review, not a production schema guarantee.

## 5. Card State Matrix

Before implementing or generating cards, route card design through `embedded-skills/lark-card-designer/SKILL.md`. Code2Lark supplies action semantics and risk; the card designer owns information hierarchy and component choice.

| State | First screen must show | Primary action | Safety rule |
|---|---|---|---|
| Candidate | Capability name, owner, source of intent, risk, missing contract questions. | Select or refine capability. | Do not imply the action is ready if contract is incomplete. |
| Prepare / dry-run | Planned target, inputs, expected effects, warnings, and confidence. | Confirm or edit inputs. | Calls only the target dry-run path or equivalent no-side-effect logic. |
| Confirm | Final action summary, operator, target, irreversible effects, audit note. | Execute. | Host-local state validates explicit operator confirmation before calling target execute. |
| Running | Operation ID or trace ID, status, started time, safe refresh. | Refresh or cancel if supported. | Cancel appears only if target contract supports safe cancellation. |
| Success | Result summary, affected target, timestamp, operator, next safe action. | Refresh status or start another safe run. | Do not expose secrets or raw logs. |
| Failure | Human-readable error, safe retry path, where to inspect logs. | Retry prepare or refresh status. | Error text must be sanitized. |

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

- Prefer a generated package first.
- For target-project install mode, default to `integrations/lark`.
- Use dry-run before `install --apply`.
- Do not modify root `package.json`, deployment files, Docker files, business routes, migrations, or production config unless explicitly approved.
- `.env.example` may be generated; real `.env` values must remain local and uncommitted.

## 8. QA and Evidence Gates

Co-Build completion requires both business and Lark-side evidence. A Lark card does not prove business correctness.

| Gate | Owner | Evidence |
|---|---|---|
| Business contract test | Business owner / main agent | Target tests or manual proof that status/dry-run/execute/cancel behave as promised. |
| Adapter validation | Code2Lark | Generated adapter tests, schema checks, and action validation. |
| Local card simulation | Code2Lark | Simulated card action payloads, success/failure paths, and audit event checks. |
| Safety check | Code2Lark + business owner | Destructive/privileged/external-send actions use prepare/confirm and allowlist. |
| Handoff | Code2Lark | Integration README, `.env.example`, verification report, cleanup notes, and Level 2 evidence template. |
| Real Feishu Level 2 | User/operator, when requested | Sanitized proof of card sent, clicked, callback/action received, target invoked, result updated, and audit recorded. |

Use `references/evidence-handoff.md` for the shared handoff checklist and `references/safety-and-secrets.md` for secret handling.

## 9. Red Lines

- Do not let Code2Lark become the business feature owner.
- Do not hide missing business APIs behind generated card UI.
- Do not expose destructive, privileged, payment, deployment, deletion, or external-send operations as one-click actions.
- Do not treat card visibility as authorization.
- Do not commit or print real app secrets, open IDs, chat IDs, message IDs, raw callbacks, access tokens, debug tokens, or `.env` values.
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

ownership:
- what business owner owns
- what Code2Lark owns

verification:
- business tests or missing business evidence
- adapter/card simulation/verify results

handoff:
- generated files, local-only secrets/evidence, remaining real Feishu steps
```

This report is the conversational form of a `CoBuildDesignRecord`: activation reason, ownership split, minimal target contract, card/action plan, safety questions, verification plan, and handoff plan.
