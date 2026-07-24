# Retrofit Workflow

Retrofit mode is used when a project already exists and the user wants to add Feishu/Lark entrypoints without rewriting the target service.

## Goal

Discover candidate capabilities, classify risk, ask for confirmation, generate an isolated integration, verify locally, and produce handoff evidence.

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
   - Generate into a reviewable output directory first.
   - For target-project installs, default to `integrations/lark` and dry-run before `--apply`.

7. **Verify and hand off**
   - Run relevant verify/doctor/evidence commands.
   - Report what was verified, what remains manual, and where secrets/evidence must stay local.

## Acceptance Signals

- User can see why each Lark entrypoint was proposed.
- Dangerous actions are not directly executable.
- Generated files are isolated and reviewable.
- Local verification passes before handoff.
