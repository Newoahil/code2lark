# Retrofit Workflow

Retrofit mode is used when a project already exists and the user wants to add Feishu/Lark entrypoints without rewriting the target service.

## Goal

Discover candidate capabilities, classify risk, ask for confirmation, generate an isolated `integrations/lark` embedded-long-connection module, verify locally, and produce handoff evidence. MVP completion means the only remaining user inputs are `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, operator allowlist values, and Feishu backend event/permission configuration.

## Workflow

1. **Establish target and scope**
   - Identify target project path, runtime, base URL if needed, and desired capability area.
   - If the user asks for broad analysis, analyze first and propose candidates rather than writing files immediately.

2. **Run Code2Lark analysis**
   - Prefer the existing CLI execution layer:
     ```powershell
     node dist/index.js analyze <target> --out <out>
     node dist/index.js plan <out>
     ```
   - Use `--backend auto` unless the user explicitly requests a strict backend.
   - Do not run external tool initialization, indexing, syncing, or installation without explicit permission.

3. **Enrich only when useful**
   - Use CodeGraph facts if a user-maintained index exists.
   - Use dependency-cruiser for JS/TS dependency graph enrichment.
   - Use ast-grep for structural fingerprints.
   - Use ts-morph for TS exports, signatures, and JSDoc.

4. **Produce candidate operations**
   - For each candidate, include source evidence, confidence, input fields, side effects, required env, and risk level.
   - Disable or question candidates with unclear business intent or unsafe side effects.

5. **Ask before writing**
   - Confirm selected capabilities, host mode, install location, permission/allowlist model, and whether writes are allowed.

6. **Generate and install**
   - Default to a target-project incremental module at `integrations/lark`.
   - The module should include an embedded-long-connection host, cards/actions, adapter boundary, tests, docs, and `.env.example`.
   - Apply `feishu-runtime-gates.md` before treating generated cards, callback handlers, or outbound send behavior as real Feishu/Lark runtime output.
   - If the existing CLI still needs a reviewable output directory internally, treat it as a dry-run or legacy execution detail; the skill-facing target remains `integrations/lark`.
   - Dry-run before any target-project write or `--apply`.

7. **Verify and hand off**
   - Run relevant verify/doctor/evidence commands.
   - Run `verify:card` or equivalent runtime payload checks when cards or callbacks are generated.
   - Report whether the embedded-long-connection host is Level 2 ready.
   - The handoff must state that the user only needs to provide `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, operator allowlist values, and configure Feishu backend bot capability, long connection, `card.action.trigger`, permissions, and test chat membership before real testing.

## Acceptance Signals

- User can see why each Lark entrypoint was proposed.
- Dangerous actions are not directly executable.
- Generated files are isolated and reviewable.
- Default delivery target is `integrations/lark` with an embedded-long-connection host.
- Handoff is Level 2 ready: app id/secret and Feishu backend event/permission configuration are the remaining user inputs.
- Local verification passes before handoff.
- Runtime card gates pass: message send content, JSON 2.0 callback buttons, and `card.action.trigger` callback responses are validated.
