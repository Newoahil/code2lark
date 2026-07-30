# Confirmation Policy

Code2Lark must ask before actions that materially change a project, expose a business capability, or trigger side effects.

## Proceed Without Asking

Proceed for read-only work:

- Inspecting files and docs.
- Running safe local analysis commands.
- Producing candidate lists and questions.
- Drafting reviewable docs or plans when requested.

## Ask Before Continuing

Ask when the answer changes the output materially:

- Which candidate capabilities should be exposed.
- Which host mode to use.
- Where to install files in the target project.
- Whether to touch business code or only add isolated integration files.
- Which operator allowlist or permission model applies.

## Require Explicit Approval

Require explicit approval for:

- `install --apply` or any target-project write.
- Sending real Lark cards.
- Using real tenant credentials.
- Running destructive, privileged, external-send, payment, deletion, deployment, or notification actions.

## Dangerous Action Pattern

Dangerous actions require a prepare/confirm split:

1. Prepare or dry-run returns planned effects and warnings.
2. Confirm action executes only after explicit operator confirmation.
3. Audit records both stages.

The host must fail closed when the prepare/confirm chain is incomplete or ambiguous:

- Reject direct execute requests for state-changing, destructive, privileged, or external-send actions when there is no prior host-local prepare/dry-run result for the same context. Client-controlled confirmation signals are not authorization: a user-supplied `confirm: true` flag, client-supplied preview object, plain HTTP dry-run token, or equivalent request field is not sufficient proof of confirmation. Confirmation provenance must be server-held, host-local, or otherwise non-forgeably bound before target execution.
- Each prepare/dry-run produces a unique confirmation ID or idempotency key; duplicate confirmations for the same ID must not execute the target twice.
- Dry-run/prepare results have a freshness TTL. Confirm must reject stale or forged previews and require a fresh dry-run.
- Completed operations are terminal. If a later action arrives for the same confirmation or operation, return the existing terminal result or `already_processed` card without re-executing.

## Uncertainty Rule

If the analyzer cannot distinguish whether an action is safe, classify it as state-changing or dangerous until the user confirms otherwise.
