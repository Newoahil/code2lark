# Safety and Secrets

Safety is part of the product, not an optional implementation detail.

## Secret Handling

Never print, commit, or include real values for:

- `.env` files
- Feishu/Lark app secrets
- open IDs
- chat IDs
- message IDs from real tenants
- raw callback logs
- access tokens
- debug tokens

Use `.env.example` with empty placeholders for handoff.

## Authorization

Generated integrations must support an operator allowlist or equivalent authorization boundary for action execution.

Visibility is not authorization: a user who can see a card is not automatically allowed to execute its action.

## Isolation

Target-project install should default to an isolated directory such as:

```text
integrations/lark
```

Do not modify root package scripts, Docker files, deployment files, or business code unless the user explicitly approves that scope.

## Audit Minimum

Each action should record:

- action name
- operator identity, if available
- target operation
- timestamp
- received/succeeded/failed state
- correlation ID or task ID when available
- sanitized error summary

## Debug Surfaces

Debug endpoints must be local-only or protected by explicit tokens. Never leave debug bypasses enabled by default in handoff instructions.
