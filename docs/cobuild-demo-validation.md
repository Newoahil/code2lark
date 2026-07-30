# Co-Build Demo Validation Runbook

This runbook validates the static Co-Build demo contract. The demo describes the fictional Moonlit Pantry Inventory Reorder Approval Job. It is a planning exercise only, not a live Lark integration and not proof of business behavior.

## Scope and safety

The demo must not send Lark messages, call Feishu or other external services, modify a target project, write target files, install packages, or expose secrets. Keep any generated output and diagnostic evidence under a temporary directory. Do not use real tenant IDs, chat IDs, open IDs, message IDs, callback payloads, tokens, or credentials.

`prepare/confirm` is host-local. The target contract does not require `/prepare` or `/confirm` endpoints. `target_prepare_endpoint_required` and `target_confirm_endpoint_required` must remain false.

State-changing demo contracts must also prove the Lark action boundary: direct execute without a prepared confirmation is rejected; duplicate confirmations are idempotent; unauthorized operators fail closed; stale or forged previews are rejected by TTL/timestamp/source checks; already-completed operations return a terminal or `already_processed` result before any expiry logic can change the outcome.

Code2Lark owns action semantics, risk, required inputs, audit metadata, and the side-effect boundary. `lark-card-designer`, or the card designer, owns information architecture and component choices. Do not blur this ownership split.

## Local QA

From the repository root, run the focused static test:

```powershell
node --test tests/cobuild-skill-demo.test.mjs
```

Also check that the schema parses as JSON without writing project files. A local validator may inspect the schema-like contract, but it must not send requests or invoke a target service. Confirm that the prompt requires reading `SKILL.md`, `references/cobuild-workflow.md`, and `references/cobuild-playbook.md`.

The focused test also checks that the demo runner exists. If the runner-presence assertion fails while the three fixture assets and all static contract assertions pass, the executable validation surface is incomplete and should be fixed before calling the slice ready.

## Codex CLI black-box validation

If the Codex CLI is already installed and configured by the operator, run the external-agent prompt as a black-box check from a temporary working directory. Provide the prompt and schema as inputs, capture only sanitized stdout and the exit status under that temporary directory, and inspect the returned JSON against the schema contract.

The external agent must:

1. Read the required skill and Co-Build references.
2. Return JSON with `mode` equal to `cobuild` and the required ownership, contract, card, safety, verification, and handoff fields.
3. Keep prepare/confirm host-local and both target endpoint flags false.
4. Include Lark QA gates for direct execute bypass, duplicate confirmation, unauthorized operator, stale or forged preview, and terminal-state replay.
5. Avoid file changes, target writes, external calls, Lark sends, secrets, and production-sendable Feishu JSON.

Do not install or configure Codex automatically. Do not add credentials, alter shell profiles, change repository configuration, or turn on network access to make this check pass.

## Fallback when Codex is missing

If Codex is unavailable, do not install it. Treat local Node test output, JSON parsing, prompt inspection, and a manually reviewed contract-shaped sample as the black-box readiness evidence. Mark external-agent execution as unavailable, not as passed. The fallback validates deterministic fixture readiness only.

## Evidence handling

Store temporary command output, returned JSON, screenshots, and logs only below the system or operator-selected temporary directory. Static-only and skipped runs should clean up temporary files automatically. If a real Codex response is produced, the runner may report a temporary output path for review; sanitize copied output and delete that temporary evidence when it is no longer needed. Never commit `.codex/`, evidence, runtime logs, raw callbacks, credentials, real `.env` files, temporary agent workspaces, or real identifiers.

## Acceptance criteria

- The three requested assets exist at their documented paths.
- The prompt routes the agent through `SKILL.md`, `cobuild-workflow.md`, and `cobuild-playbook.md`.
- The prompt states the ownership split, minimal contract, card designer dependency, no target writes, and no secrets.
- The schema is valid JSON, has top-level `mode` equal to `cobuild`, and requires the stated Co-Build sections.
- The minimal contract includes `status`, `dry_run`, `execute`, and `cancel`.
- Card confirmation is host-local, with both target prepare and confirm endpoint requirements false.
- Lark QA gates cover direct execute bypass rejection, duplicate confirmation idempotency, unauthorized operator rejection, stale or forged preview rejection, and terminal-state replay.
- Local QA is deterministic and makes no external calls.
- Codex is used only when already available. It is never installed or configured automatically.
- Evidence remains temporary and sanitized, and repository hygiene excludes `.codex/`, runtime logs, local evidence, raw callbacks, real `.env` files, and temporary agent workspaces.
- No claim is made that live Feishu Level 2 is complete.
