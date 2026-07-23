# Co-Build Workflow

Co-Build mode is used when a new business capability and its Feishu/Lark entrypoint are being designed together.

## Goal

Let the main developer or coding agent own business behavior while Code2Lark owns Lark-facing contracts, cards, validation, audit, and evidence.

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

2. **Define minimal contract**
   - If target APIs already exist, reuse them.
   - If missing, propose minimal endpoints or function contracts and ask before changing host code.
   - Prefer explicit `status`, `dry-run`, `execute`, and `cancel/stop` contracts when long-running or risky.

3. **Design Lark interaction**
   - Use `../embedded-skills/lark-card-designer/SKILL.md` for information architecture and card states.
   - Code2Lark supplies action type, risk level, required inputs, audit metadata, and side-effect boundary.

4. **Generate isolated integration**
   - Keep files under an integration boundary such as `integrations/lark` unless the user approves host-surface changes.

5. **Verify continuously**
   - Validate contract tests, local action simulation, target reachability, and evidence outputs.

## Non-Goals

- Do not invent business requirements.
- Do not silently modify root package scripts, deployment files, or business routes.
- Do not treat the Lark card as proof that the underlying business behavior is correct.
