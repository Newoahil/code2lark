# Evidence and Handoff

Code2Lark work is not complete until the generated integration can be reviewed, verified, and handed off without exposing secrets.

## Required Deliverables

| Deliverable | Purpose |
|---|---|
| Integration README | Configure, run, verify, stop, and troubleshoot the integration. |
| `.env.example` | Lists required configuration without real values. |
| Verification report | Machine-readable local pass/fail evidence. |
| Handoff note | Explains what was generated, what was verified, and what remains manual. |
| Cleanup instructions | Shows how to remove generated files, which local evidence to preserve, and which artifacts must never be committed (`.codex/`, runtime logs, raw callbacks, local evidence, real `.env` files, and temporary agent workspaces). |
| Level 2 evidence template | Captures real Feishu tenant proof without committing secrets. |

MVP handoff for both Retrofit and Co-Build should target `integrations/lark` with an embedded-long-connection host. The only remaining user inputs should be `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, operator allowlist values, and Feishu backend configuration for bot capability, long connection, `card.action.trigger`, required permissions, and test chat membership.

## Verification Loop

Use the existing CLI where possible:

```powershell
node dist/index.js verify <generated-package> --strict
node dist/index.js doctor <generated-package>
node dist/index.js evidence <generated-package>
node dist/index.js handoff <generated-package>
```

Mode-specific commands may add `--mode`, `--runtime-url`, `--simulate`, or `--level2`.

## Completion Report

A completion report should state:

- files generated or changed
- commands run and pass/fail result
- target project writes, if any
- card actions supported
- delivery target: `integrations/lark` embedded-long-connection module
- risk controls present
- Lark action boundary evidence: direct execute bypass rejection, duplicate confirmation idempotency, unauthorized operator rejection, stale/forged preview rejection, and terminal-state replay
- remaining manual Feishu tenant steps
- only remaining user inputs: app id/secret, operator allowlist, Feishu backend event/permission configuration, and test chat setup
- local-only evidence or secret locations, without printing values

## Failure Reporting

When blocked, report the exact missing item and the safe next step. Common blockers:

- missing credentials
- missing `integrations/lark` embedded-long-connection host for a Level 2-ready handoff
- target service unreachable
- unauthorized operator
- direct execute bypass or duplicate confirmation without idempotency
- stale, forged, or expired preview used for confirmation
- stale or unavailable analyzer backend
- unsupported framework pattern
- unsafe action requiring confirmation
