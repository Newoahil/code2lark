# Code2Lark Skill

Code2Lark is a skill-first workflow for adding reviewed Feishu/Lark entrypoints to software projects. It supports two modes:

- **Retrofit**: add Lark entrypoints to an existing project.
- **Co-Build**: design a new business capability and its Lark entrypoint together while another agent or developer owns the business code.

Use this skill when the user asks to connect a project, feature, API, job, workflow, internal tool, or business operation to Feishu/Lark. Do not activate when the user only asks for generic coding help without Lark/Feishu intent.

## Core Principle

Code2Lark is the orchestrator and safety boundary. The existing Code2Lark CLI remains the execution layer; external analysis tools are optional enrichment; `lark-card-designer` owns card information architecture and interaction design.

## Mandatory Routing

1. If the target project already exists and the user wants Lark access added, read `references/retrofit-workflow.md`.
2. If the user is building a new capability and wants Lark access as part of the work, read `references/cobuild-workflow.md`.
3. Before relying on code analysis or external tools, read `references/analyzer-boundary.md`.
4. Before asking, generating, installing, or enabling actions, read `references/confirmation-policy.md` and `references/safety-and-secrets.md`.
5. Before card layout or interaction-state decisions, delegate or reference `embedded-skills/lark-card-designer/SKILL.md`; do not duplicate its design rules here.
6. Before reporting completion, read `references/evidence-handoff.md`.

## CLI Reuse Model

The skill should hide command complexity from the user while reusing the existing CLI as the stable execution layer.

| Layer | Responsibility | Examples |
|---|---|---|
| Code2Lark Skill | Decide mode, ask questions, control risk, orchestrate commands, summarize evidence. | Retrofit/Co-Build routing, confirmation gates, handoff. |
| Code2Lark CLI | Execute repeatable operations. | `analyze`, `plan`, `generate`, `install`, `verify`, `doctor`, `evidence`, `handoff`. |
| External analyzers | Produce optional structural facts. | CodeGraph, dependency-cruiser, ast-grep, ts-morph. |
| lark-card-designer | Design card structure and interaction states. | Candidate, dry-run, running, success, failure, dangerous-action cards. |

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

## Default Output

When planning or reporting, summarize in this shape:

```text
mode:
- retrofit | cobuild

what_was_discovered:
- source evidence and confidence

recommended_lark_entrypoints:
- action, risk, required confirmation

cli_execution_plan:
- commands to run or commands already run

card_design_dependency:
- when/how lark-card-designer is used

verification_and_handoff:
- checks, evidence, remaining manual steps
```
