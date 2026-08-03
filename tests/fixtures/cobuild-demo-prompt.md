# Co-Build Demo Prompt

You are validating a safe, deterministic Co-Build design response. This is a fictional capability named **Moonlit Pantry Inventory Reorder Approval Job**. It is not connected to a real tenant, service, warehouse, account, chat, message, or operator.

## Required reading and routing

1. Inspect `SKILL.md` before answering.
2. Follow the Co-Build routing in `SKILL.md` by reading `references/cobuild-workflow.md` and then `references/cobuild-playbook.md`.
3. Apply the ownership and safety boundaries in those files. Preserve the boundary that Code2Lark supplies action semantics, risk, required inputs, audit metadata, and side-effect boundaries, while Lark Card Designer owns information architecture and component choices.
4. Apply `references/feishu-card-json-2-runtime-spec.md` and `references/feishu-runtime-gates.md`: Lark Card Designer skeletons are not production-sendable JSON, and Level-2-ready Co-Build delivery requires runtime payload verification.

## Fictional capability

The business owner wants a future job that reviews fictional low-stock pantry items and, only after explicit approval, creates a fictional reorder plan. Treat the capability as state-changing and potentially long-running. The response must propose, without implementing, a minimal contract with `status`, `dry-run`, `execute`, `cancel`, and audit semantics. `prepare/confirm` is a host-local Lark card action pattern. `target_prepare_endpoint_required` and `target_confirm_endpoint_required` must both be false. Do not set `execute.available: true` for this state-changing capability unless `dry_run.available` is also true and the execute path requires host-local confirmation.

The response must describe Lark action QA boundaries: direct execute without prior host-local prepare is rejected; client-controlled confirmation signals are not authorization; `confirm: true`, client-supplied previews, plain HTTP dry-run tokens, or equivalent request fields are not sufficient proof of Lark confirmation; confirmation provenance must be server-held, host-local, or otherwise non-forgeably bound before target execution; duplicate confirmations are idempotent through a confirmation ID or idempotency key; unauthorized operators are rejected before target execution; stale or forged previews are rejected by timestamp/TTL/source checks; action requests for already-completed operations return an existing terminal result or `already_processed` without re-executing.

The response must use the MVP delivery target for Co-Build: a target-project incremental module at `integrations/lark` with an `embedded-long-connection` host. It must be Level 2 ready, not local-simulator-only: after the user supplies `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, an operator allowlist, and configures Feishu backend bot capability, long connection, `card.action.trigger`, required permissions, and test chat membership, real Feishu testing can begin. Simulator support, if mentioned, must be marked QA-only and not the delivery target. `.env.example` must correspond to a real runtime consumer, and `card.action.trigger` must route to the action handler.

## Safety boundary

This is a static black-box design exercise. Do not modify files, call external services, send Lark messages, write target project files, install packages, configure Codex, or perform target writes. The response must contain no secrets, no real tenant IDs, no chat IDs, no open IDs, no message IDs, no callback payloads, and no tokens. Use placeholders only when a field is needed for the contract, and keep them clearly fictional.

## Required response

Return JSON only, matching `tests/fixtures/cobuild-demo-response.schema.json`. The JSON must include:

- `mode: - cobuild` as the represented Co-Build mode value.
- An explicit `ownership_split` between the business owner or main agent and Code2Lark.
- A `minimal_contract` containing `status`, `dry_run`, `execute`, and `cancel`, plus the host-local confirmation boundary.
- `card_confirmation` and `card_design_dependency`, including the Lark Card Designer ownership boundary.
- `delivery_target` with `path: integrations/lark`, `module_type: embedded-long-connection`, `level2_ready: true`, `local_simulator_only: false`, `simulator_role: QA-only`, a runtime startup path, env values consumed by code, `card.action.trigger` routing, required env keys, and Feishu backend configuration steps.
- `verification_and_handoff` or equivalent evidence that includes runtime gates for OpenAPI send-message content, JSON 2.0 callback button behavior, and `card.action.trigger` callback response shape.
- `safety_boundary` with no target writes, no secrets, and both target prepare and confirm endpoints disabled.
- `safety_boundary` with an operator allowlist requirement for action execution.
- `lark_qa_gates` covering direct execute bypass, duplicate confirmation, unauthorized operator, stale or forged preview, and terminal-state replay tests.
- `verification_and_handoff` covering the verification handoff without claiming live Feishu Level 2 completion, including cleanup and repository hygiene instructions for `.codex/`, runtime logs, raw callbacks, local evidence, real `.env` files, and temporary agent workspaces.
- `external_agent_validation` describing static validation and the absence of external calls.

Keep the response a planning artifact. Do not output production-sendable Feishu JSON, SDK calls, webhook payloads, credentials, or implementation patches.
