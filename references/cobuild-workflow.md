# Co-Build Workflow

Co-Build mode is used when a new business capability and its Feishu/Lark entrypoint are being designed together.

## Goal

Let the main developer or coding agent own business behavior while Code2Lark owns Lark-facing contracts, cards, validation, audit, evidence, and the target-project `integrations/lark` embedded-long-connection module.

After confirming Co-Build mode, use `cobuild-playbook.md` as the operating manual. This file decides whether Co-Build applies; the playbook defines how to run synchronized design.

## Activation Rule

Activate only when the user expresses Feishu/Lark intent, for example:

- "also expose this in Lark"
- "make a Feishu card for this workflow"
- "let the team trigger this job from Lark"
- "build this internal tool with Lark as the UI"

Do not activate for ordinary feature work without Lark/Feishu intent.

## Workflow

1. **Clarify ownership**
   - Main business agent/developer owns domain logic, persistence, and target API behavior.
   - Code2Lark owns adapter boundary, card actions, validation, audit, and handoff.
   - Record this split before proposing target writes or generated files.

2. **Define minimal contract**
   - If target APIs already exist, reuse them.
   - If missing, propose minimal endpoints or function contracts and ask before changing host code.
   - Prefer explicit `status`, `dry-run`, `execute`, and `cancel/stop` contracts when long-running or risky.
   - Use `cobuild-playbook.md` for the contract template and question rules.

3. **Design Lark interaction**
   - Use `../embedded-skills/lark-card-designer/SKILL.md` for information architecture and card states.
   - Code2Lark supplies action type, risk level, required inputs, audit metadata, and side-effect boundary.
   - Use the playbook card state matrix: candidate, prepare/dry-run, confirm, running, success, failure.
   - Treat lark-card-designer output as design only; production payloads must pass `feishu-runtime-gates.md`.

4. **Generate isolated integration**
   - Default to `integrations/lark` as the target-project incremental module.
   - Generate an embedded-long-connection host as the real Feishu/Lark test entrypoint.
   - Keep local simulator support as QA aid only; simulator-only output is not Co-Build complete.
   - The module must include a runtime startup path, `.env.example` values consumed by code, and a `card.action.trigger` route into the action handler.
   - Include a runtime card adapter and verifier for send-message payloads, JSON 2.0 callback buttons, and `card.action.trigger` callback responses.
   - Do not require a public webhook URL for the MVP route; use Feishu/Lark long connection and `card.action.trigger`.
   - Keep files under the integration boundary unless the user approves host-surface changes.

5. **Verify continuously**
   - Validate contract tests, local action simulation, target reachability, runtime card payloads, and evidence outputs.
   - Separate business correctness evidence from Lark integration evidence.

6. **Recover missed Lark delivery without changing modes**
   - If Co-Build produced business code, cards, or simulator tests but missed the real Feishu/Lark entrypoint, treat it as incomplete Co-Build delivery.
   - Continue from the approved Co-Build contract and fill the missing `integrations/lark` embedded-long-connection module.
   - Do not relabel the task as Retrofit unless the user separately asks to connect an already-finished capability after Co-Build has ended.

## Required Outputs

- `CoBuildDesignRecord`: activation reason, ownership split, target contract, card/action plan, safety questions, verification plan, and handoff plan.
- Ownership split: who owns business behavior and who owns Lark integration.
- Minimal target contract: status/dry-run/execute/cancel/audit availability and gaps.
- Card confirmation model: whether host-local prepare/confirm is required before target execute.
- Card/action plan: states, risk, confirmation model, and audit fields.
- Verification plan: business tests, adapter simulation, safety checks, and handoff evidence.
- Delivery target: `integrations/lark` embedded-long-connection module, `.env.example`, tests, docs, and Level 2-ready handoff.
- Simulator role: QA-only; it may validate action payloads and safety gates, but it must not be the delivery target.
- Runtime card gates: send-message content, JSON 2.0 callback buttons, and `card.action.trigger` callback responses are verified before handoff.

## Terminology

- **Target contract** means business APIs or functions such as `status`, `dry-run`, `execute`, and `cancel/stop`.
- **Prepare/confirm** means the host-local Lark card action pattern: prepare or dry-run shows planned effects; confirm calls the approved execute path.
- Do not require target-side `/prepare` or `/confirm` endpoints unless the business owner explicitly approves that API shape.

## Non-Goals

- Do not invent business requirements.
- Do not silently modify root package scripts, deployment files, or business routes.
- Do not treat the Lark card as proof that the underlying business behavior is correct.

## Acceptance Signals

- A different agent or developer can implement the business contract without guessing Code2Lark intent.
- Code2Lark can design the Lark entrypoint without owning business logic.
- Risky actions have dry-run or prepare/confirm separation before real execution.
- The generated Lark module is Level 2 ready: after the user provides `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, operator allowlist values, and configures Feishu backend bot capability, long connection, `card.action.trigger`, permissions, and a test chat, real Feishu testing can begin.
- `.env.example` corresponds to code that actually reads those values for the long-connection runtime; placeholder documentation alone is not sufficient.
- Handoff states both business evidence and Lark integration evidence.
