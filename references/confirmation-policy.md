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

## Uncertainty Rule

If the analyzer cannot distinguish whether an action is safe, classify it as state-changing or dangerous until the user confirms otherwise.
