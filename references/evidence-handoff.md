# Evidence and Handoff

Code2Lark work is not complete until the generated integration can be reviewed, verified, and handed off without exposing secrets.

## Required Deliverables

| Deliverable | Purpose |
|---|---|
| Integration README | Configure, run, verify, stop, and troubleshoot the integration. |
| `.env.example` | Lists required configuration without real values. |
| Verification report | Machine-readable local pass/fail evidence. |
| Handoff note | Explains what was generated, what was verified, and what remains manual. |
| Cleanup instructions | Shows how to remove generated files and which local evidence to preserve. |
| Level 2 evidence template | Captures real Feishu tenant proof without committing secrets. |

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
- risk controls present
- remaining manual Feishu tenant steps
- local-only evidence or secret locations, without printing values

## Failure Reporting

When blocked, report the exact missing item and the safe next step. Common blockers:

- missing credentials
- target service unreachable
- unauthorized operator
- stale or unavailable analyzer backend
- unsupported framework pattern
- unsafe action requiring confirmation
