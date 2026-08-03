---
name: code2lark
description: Add reviewed Feishu/Lark entrypoints to existing projects or Co-Build new business capabilities with Lark access.
---

# Code2Lark Skill

Code2Lark is a skill-first workflow for adding reviewed Feishu/Lark entrypoints to software projects. It supports two modes:

- **Retrofit**: add Lark entrypoints to an existing project.
- **Co-Build**: design a new business capability and its Lark entrypoint together while another agent or developer owns the business code.

Use this skill when the user asks to connect a project, feature, API, job, workflow, internal tool, or business operation to Feishu/Lark. Do not activate when the user only asks for generic coding help without Lark/Feishu intent.

## Core Principle

Code2Lark is the orchestrator and safety boundary. The existing Code2Lark CLI remains the execution layer; external analysis tools are optional enrichment; `lark-card-designer` owns card information architecture and interaction design.

For the MVP skill experience, both Retrofit and Co-Build default to a target-project incremental module at `integrations/lark` using an embedded-long-connection host. The intended finished state is Level 2 ready: the generated module is ready to connect to Feishu/Lark once the user supplies `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, an operator allowlist, and configures the required Feishu backend events and permissions such as `card.action.trigger`.

Simulator support is QA-only. A local simulator can test card action logic and safety boundaries, but simulator-only output is a failed delivery. A Co-Build or Retrofit handoff is incomplete unless `integrations/lark` contains a real embedded-long-connection runtime path that reads its `.env` values and routes Feishu/Lark `card.action.trigger` events into the action handler.

## Mandatory Routing

1. If the target project already exists and the user wants Lark access added, read `references/retrofit-workflow.md`.
2. If the user is building a new capability and wants Lark access as part of the work, read `references/cobuild-workflow.md` and then `references/cobuild-playbook.md`.
3. Before relying on code analysis or external tools, read `references/analyzer-boundary.md`.
4. Before asking, generating, installing, or enabling actions, read `references/confirmation-policy.md` and `references/safety-and-secrets.md`.
5. Before card layout or interaction-state decisions, delegate or reference `embedded-skills/lark-card-designer/SKILL.md`; do not duplicate its design rules here.
6. Before converting card designs into runtime payloads, sending cards, handling `card.action.trigger`, or reporting Level-2-ready completion, especially for Co-Build `integrations/lark` delivery, read `references/feishu-card-json-2-runtime-spec.md` and `references/feishu-runtime-gates.md`.
7. Before reporting completion, read `references/evidence-handoff.md`.

## CLI Reuse Model

The skill should hide command complexity from the user while reusing the existing CLI as the stable execution layer.

| Layer | Responsibility | Examples |
|---|---|---|
| Code2Lark Skill | Decide mode, ask questions, control risk, orchestrate commands, summarize evidence. | Retrofit/Co-Build routing, ownership split, confirmation gates, handoff. |
| Code2Lark CLI | Execute repeatable operations. | `analyze`, `plan`, `generate`, `install`, `verify`, `doctor`, `evidence`, `handoff`. |
| External analyzers | Produce optional structural facts. | CodeGraph, dependency-cruiser, ast-grep, ts-morph. |
| lark-card-designer | Design card structure and interaction states. | Candidate, dry-run, confirm, running, success, failure, dangerous-action cards. |

## Package Layout

```text
code2lark/
  SKILL.md
  references/
  embedded-skills/
    lark-card-designer/
  tools/
  src/
```

`SKILL.md` is the only public skill entrypoint. `references/` holds process rules. `embedded-skills/lark-card-designer/` is the bundled card-design capability. `tools/` documents executable reuse and local integration plans. The repository's existing `src/` is the real Code2Lark CLI/core implementation that the skill package will progressively wrap and factor into reusable APIs.

## Red Lines

- Do not commit, publish, send cards, delete files, or apply target-project writes without explicit user instruction.
- Do not print or commit secrets, app secrets, open IDs, chat IDs, message IDs, raw tenant logs, or real `.env` values.
- Do not expose destructive or privileged actions without dry-run or prepare/confirm separation.
- Do not assume static analysis knows business intent; turn uncertainty into questions or disabled candidates.
- Do not let Code2Lark take over business code in Co-Build mode.
- Do not claim completion when only a simulator, mock card flow, static JSON, or `.env.example` exists without a real `integrations/lark` embedded-long-connection runtime.
- Do not switch a Co-Build task to Retrofit just because the Lark delivery target was missed; continue Co-Build completion and fill the missing `integrations/lark` delivery.
- Do not treat `lark-card-designer` JSON 2.0-like skeletons as production-sendable JSON; convert through a runtime adapter and pass the Feishu runtime gates first.
- Do not duplicate Lark Card Designer rules in runtime references; preserve Lark Card Designer intent through the runtime adapter and enforce `references/feishu-card-json-2-runtime-spec.md` for Co-Build production payloads.

## Default Output

When planning or reporting, summarize in this shape:

```text
mode:
- retrofit | cobuild

what_was_discovered:
- source evidence and confidence

recommended_lark_entrypoints:
- action, risk, required confirmation

delivery_target:
- `integrations/lark` embedded-long-connection module; remaining user inputs are `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, operator allowlist, and Feishu backend event/permission configuration
- simulator role: QA-only, never the delivery target

ownership_split:
- business owner vs Code2Lark responsibilities, especially in Co-Build

cobuild_design_record:
- activation reason, ownership split, minimal contract, card/action plan, verification and handoff plan

cli_execution_plan:
- commands to run or commands already run

card_design_dependency:
- when/how lark-card-designer is used

verification_and_handoff:
- checks, evidence, remaining manual steps
```
