# Mode A / Mode B Productization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Productize Code2Lark’s two delivery modes so the generated package is consistently understood as the source of truth, Mode A is the explicit external-host/sidecar path, Mode B is the explicit target-project embedded host-module path, and `self-hosted-runtime` is clearly positioned as the host module that can be run externally or embedded later.

**Architecture:** Keep the runtime mechanics unchanged. This phase is about making the product model explicit and internally consistent across CLI output, generated package metadata, and user-facing docs. We add a small amount of metadata and reporting structure, then align all handoff/readiness/doctor language around the same mode vocabulary.

**Tech Stack:** TypeScript/Node CLI, generated Markdown/JSON artifacts, existing Python `feishu-host/` output, Node tests

## Global Constraints

- Do **not** introduce new host capabilities, new trigger types, or new platform targets in this phase.
- Do **not** change the verified `image-agent-web` self-hosted runtime behavior.
- Treat `generated/<target>-lark/` as the source-of-truth package in all docs and outputs.
- Mode A = external host / sidecar / gateway.
- Mode B = target-project embedded host module.
- `standalone-runtime` remains reference/fallback only, not the primary product shape.
- `self-hosted-runtime` must be described as a generated host module that can run externally now and be embedded later.
- Preserve backward CLI compatibility for existing `--mode` / `--host-mode` values.
- All changed commands and docs must remain consistent with `docs/development-charter.md`.
- Every task must end with a clean working tree and a commit.
- Use TDD where code behavior changes; use focused regression checks for doc/metadata tasks.

---

## File Structure Impact

### Existing files to modify
- `README.md`
  - Top-level product description, delivery mode explanation, command examples.
- `docs/development-charter.md`
  - Canonical product-model definition.
- `docs/project-status.md`
  - Current-state snapshot; should explicitly classify `image-agent-web` as the verified Mode A sample.
- `docs/fde-handoff.md`
  - Handoff language for generated packages and host responsibilities.
- `docs/mvp-1a-image-agent-web.md`
  - Sample-specific narrative; must distinguish “verified sample” from “product definition.”
- `src/commands/generate.ts`
  - `generation_summary.json`, `README.md`, `START_HERE.md`, integration guide generation.
- `src/commands/context.ts`
  - Generated context/handoff command wording.
- `src/commands/readiness.ts`
  - Status wording for handoff readiness.
- `src/commands/doctor.ts`
  - Gate explanation text.
- `src/commands/verify.ts`
  - Report wording only where needed for consistent mode naming.
- `tests/cli-smoke.test.mjs`
  - Assertions that generated docs / summaries express the new mode model correctly.

### New files to create
- `docs/mode-b-embedding-guide.md`
  - Dedicated explanation of how a generated host module is embedded into a target project.
- `docs/host-delivery-mode-selection.md`
  - One-page chooser: when to pick Mode A vs Mode B vs standalone reference runtime.

### Responsibility boundaries after this phase
- `generated/<target>-lark/manifest/` → machine-readable truth about target and interaction contract.
- `generated/<target>-lark/adapter/` → target interaction adaptation layer.
- `generated/<target>-lark/feishu-host/` → host module source for Mode A now, Mode B embedding later.
- `generated/<target>-lark/bot-runtime/` → standalone reference host only.
- `docs/*` → product model, handoff, and user decision guides.

---

### Task 1: Make the product model explicit in top-level docs

**Files:**
- Modify: `README.md`
- Modify: `docs/development-charter.md`
- Modify: `docs/project-status.md`
- Modify: `docs/mvp-1a-image-agent-web.md`

**Interfaces:**
- Consumes: current delivery concepts already present in `docs/development-charter.md`
- Produces: stable wording that later tasks and users rely on:
  - “Mode A” = external host / sidecar / gateway
  - “Mode B” = target-project embedded host module
  - “self-hosted-runtime” = generated host module, runnable externally now, embeddable later

- [ ] **Step 1: Add/update failing doc assertions in CLI smoke test**

```js
import assert from "node:assert/strict";
import fs from "node:fs";

const readme = fs.readFileSync(readmePath, "utf8");
assert.match(readme, /Mode A is the external host, sidecar, or gateway path\./);
assert.match(readme, /Mode B is the target-project embedded host-module path\./);
assert.match(readme, /self-hosted-runtime.*generated host module/i);

const charter = fs.readFileSync(charterPath, "utf8");
assert.match(charter, /Mode A.*external host/i);
assert.match(charter, /Mode B.*embedded host module/i);
assert.match(charter, /self-hosted-runtime.*host module/i);
```

- [ ] **Step 2: Run the focused test to verify it fails before edits**

Run: `node --test tests/cli-smoke.test.mjs`

Expected: FAIL on missing or mismatched wording assertions.

- [ ] **Step 3: Update top-level docs with the explicit model**

Use these exact concepts in the edited docs:

```md
Mode A is the external host / sidecar / gateway path. The target service keeps its own lifecycle and the generated host runs beside it.

Mode B is the target-project embedded host-module path. The generated package remains the source of truth, but selected host files can be copied into the target repository as an incremental module.

self-hosted-runtime is the generated host module. Today it can run externally as the verified sample path; later it can also be embedded into the target project under Mode B.
```

- [ ] **Step 4: Re-run the focused test**

Run: `node --test tests/cli-smoke.test.mjs`

Expected: PASS for the new wording assertions.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/development-charter.md docs/project-status.md docs/mvp-1a-image-agent-web.md tests/cli-smoke.test.mjs
git commit -m "Clarify Code2Lark delivery model"
```

---

### Task 2: Add dedicated Mode B embedding documentation

**Files:**
- Create: `docs/mode-b-embedding-guide.md`
- Create: `docs/host-delivery-mode-selection.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Mode A / Mode B wording from Task 1
- Produces: stable docs users can follow without needing chat explanations

- [ ] **Step 1: Write the Mode B guide with concrete structure**

Create `docs/mode-b-embedding-guide.md` with sections that include these exact examples:

```md
# Mode B Embedding Guide

## What gets copied
- `generated/<target>-lark/feishu-host/`
- `generated/<target>-lark/adapter/`
- `generated/<target>-lark/manifest/`
- selected docs as needed

## Recommended target layout
<target-project>/
  feishu_host/
    app.py
    cards.py
    handlers.py
    service_client.py
    validation.py
    config.py
    spec/
```

```md
## What stays outside the target project
- The original generated package remains the source of truth.
- Regeneration happens in Code2Lark, not in the target repo.
```

- [ ] **Step 2: Write the mode selection guide**

Create `docs/host-delivery-mode-selection.md` with a clear comparison table:

```md
| Mode | Best when | Trade-off |
| --- | --- | --- |
| Mode A | You want minimal intrusion and easy rollback | Separate host process to run |
| Mode B | You want the target project to own the Feishu host module | Slightly tighter coupling to the target repo |
| standalone-runtime | You need a quick reference host or fallback | Not the primary product shape |
```

- [ ] **Step 3: Link the new guides from README**

Add a short section to `README.md` like:

```md
## Delivery Mode Guides
- `docs/host-delivery-mode-selection.md`
- `docs/mode-b-embedding-guide.md`
```

- [ ] **Step 4: Verify the files exist and are linked**

Run: `grep -n "Delivery Mode Guides\|mode-b-embedding-guide\|host-delivery-mode-selection" README.md docs/mode-b-embedding-guide.md docs/host-delivery-mode-selection.md`

Expected: matching lines in all three files.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/mode-b-embedding-guide.md docs/host-delivery-mode-selection.md
git commit -m "Add mode B embedding and selection guides"
```

---

### Task 3: Make generated package metadata and docs product-model-aware

**Files:**
- Modify: `src/commands/generate.ts`
- Modify: `tests/cli-smoke.test.mjs`

**Interfaces:**
- Consumes: mode definitions from Tasks 1–2
- Produces: generated package metadata and docs that describe the selected mode consistently

- [ ] **Step 1: Add failing assertions for generated summaries/docs**

Extend `tests/cli-smoke.test.mjs` with checks like:

```js
const summary = JSON.parse(fs.readFileSync(path.join(pkg, "generation_summary.json"), "utf8"));
assert.equal(summary.core_artifact, "adapter");
assert.match(summary.integration_mode, /embedded-adapter|standalone-runtime|self-hosted-runtime/);

const generatedReadme = fs.readFileSync(path.join(pkg, "README.md"), "utf8");
assert.match(generatedReadme, /Mode A is the external host, sidecar, or gateway path\./);
assert.match(generatedReadme, /Mode B is the target-project embedded host-module path\./);
```

- [ ] **Step 2: Run the focused test to see the failures**

Run: `node --test tests/cli-smoke.test.mjs`

Expected: FAIL on missing generated-package wording.

- [ ] **Step 3: Update generator text emitters**

In `src/commands/generate.ts`, make sure the emitters that write:
- `generation_summary.json`
- generated `README.md`
- generated `START_HERE.md`
- generated `docs/integration_guide.md`

all include language consistent with Tasks 1–2. Use explicit wording like:

```ts
runtime: integrationMode === "standalone-runtime" ? "node-lark-bot-runtime" : integrationMode === "self-hosted-runtime" ? "python-feishu-host" : "none"
```

and in markdown emitters:

```md
Mode A is the external host, sidecar, or gateway path.
Mode B is the target-project embedded host-module path.
self-hosted-runtime produces the host module used by the verified sample and by future Mode B embedding.
```

- [ ] **Step 4: Re-run the focused test**

Run: `node --test tests/cli-smoke.test.mjs`

Expected: PASS for the new generated-doc assertions.

- [ ] **Step 5: Commit**

```bash
git add src/commands/generate.ts tests/cli-smoke.test.mjs
git commit -m "Align generated package metadata with delivery modes"
```

---

### Task 4: Make context, readiness, and doctor explicitly mode-aware for A/B language

**Files:**
- Modify: `src/commands/context.ts`
- Modify: `src/commands/readiness.ts`
- Modify: `src/commands/doctor.ts`

**Interfaces:**
- Consumes: host mode / integration mode metadata already present in the commands
- Produces: command output that consistently explains whether the package is Mode A, Mode B-ready, or standalone-reference

- [ ] **Step 1: Add failing string assertions for doctor/readiness output**

Extend the smoke test with checks for generated or written output:

```js
assert.match(doctorMarkdown, /Mode A|external host|sidecar|gateway/);
assert.match(readinessMarkdown, /Mode B|embedded host module/);
```

Only add assertions where the output genuinely should mention those concepts.

- [ ] **Step 2: Run the focused test to verify the mismatch**

Run: `node --test tests/cli-smoke.test.mjs`

Expected: FAIL if the output still uses mixed or ambiguous terminology.

- [ ] **Step 3: Update wording in the command emitters**

Refine the text generation in:
- `buildContextTemplate` / markdown builders
- readiness summary text
- doctor blockers / next-step text

Use explicit distinctions such as:

```text
Mode A external host / sidecar path
Mode B embedded host-module path
self-hosted-runtime host module verified externally today
```

and avoid implying that `self-hosted-runtime` already equals completed Mode B embedding.

- [ ] **Step 4: Re-run the focused test**

Run: `node --test tests/cli-smoke.test.mjs`

Expected: PASS for wording assertions.

- [ ] **Step 5: Commit**

```bash
git add src/commands/context.ts src/commands/readiness.ts src/commands/doctor.ts tests/cli-smoke.test.mjs
git commit -m "Make command outputs mode-aware"
```

---

### Task 5: Reclassify the verified sample explicitly as Mode A and self-hosted-runtime as Mode B foundation

**Files:**
- Modify: `docs/development-charter.md`
- Modify: `docs/project-status.md`
- Modify: `docs/image-agent-web-mvp-verified-summary.md` (if present; otherwise create it)

**Interfaces:**
- Consumes: validated facts from prior real Feishu verification
- Produces: a stable statement of what is verified now and what remains to prove later

- [ ] **Step 1: Add/update the verified summary file**

If `docs/image-agent-web-mvp-verified-summary.md` does not exist, create it with content like:

```md
# image-agent-web Verified Sample

Current classification:
- Verified sample path: Mode A
- Host implementation used: self-hosted-runtime Python `feishu-host/`
- Why not Mode B yet: the host module has not been re-embedded into a fresh target-project copy and replayed from zero.
```

- [ ] **Step 2: Update charter and status docs**

Add concise, explicit wording such as:

```md
The verified image-agent-web sample currently proves Mode A with a Python self-hosted host module run externally.
self-hosted-runtime is the foundation for Mode B, but Mode B is not considered productized until the generated host module is replayed inside a fresh target-project copy.
```

- [ ] **Step 3: Verify the classification language exists**

Run: `grep -n "Mode A\|Mode B\|self-hosted-runtime is the foundation" docs/development-charter.md docs/project-status.md docs/image-agent-web-mvp-verified-summary.md`

Expected: matching lines in all updated docs.

- [ ] **Step 4: Commit**

```bash
git add docs/development-charter.md docs/project-status.md docs/image-agent-web-mvp-verified-summary.md
git commit -m "Reclassify image-agent-web sample and self-hosted role"
```

---

### Task 6: Run full regression gates

**Files:**
- Modify: none (verification only)
- Test: `tests/cli-smoke.test.mjs`

**Interfaces:**
- Consumes: all prior tasks
- Produces: confidence that the product model is stable without regressions

- [ ] **Step 1: Run build**

Run: `npm run build`

Expected: exit 0

- [ ] **Step 2: Run full Node test suite**

Run: `node --test tests/*.test.mjs`

Expected: all PASS

- [ ] **Step 3: Run the self-hosted regression anchor**

Run:

```bash
node dist/index.js generate out/image-agent-web --out /tmp/code2lark-regression-image --mode self-hosted-runtime
node dist/index.js verify /tmp/code2lark-regression-image --mode self-hosted-runtime --strict
```

Expected:
- generation succeeds
- `Overall status: pass`
- self-hosted Python checks still PASS

- [ ] **Step 4: Run an embedded sample check**

Run:

```bash
node dist/index.js generate out/image-agent-web --out /tmp/code2lark-regression-embedded --mode embedded-adapter
node dist/index.js verify /tmp/code2lark-regression-embedded --mode embedded-adapter --strict
```

Expected:
- generation succeeds
- embedded package validation still PASS

- [ ] **Step 5: Commit verification evidence note (optional)**

If the repo is keeping verification evidence commits in docs/status, record it there; otherwise skip the commit.

```bash
# only if a doc was updated
git add docs/project-status.md
git commit -m "Record mode A/B productization verification"
```

---

## Spec Self-Review

1. **Spec coverage:** This plan covers the productization-only scope:
- standard product model
- Mode A formalization
- Mode B formalization
- self-hosted-runtime role clarification
- current sample reclassification
It intentionally does NOT include generic manifest refactors or second-target validation.

2. **Placeholder scan:** No TODO/TBD placeholders remain in tasks. Commands, files, wording, and commit messages are concrete.

3. **Type/interface consistency:** Tasks refer consistently to:
- standard generated package = `generated/<target>-lark/`
- Mode A = external host / sidecar / gateway
- Mode B = embedded host module
- `self-hosted-runtime` = generated host module used externally now, embeddable later

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-08-mode-a-b-productization-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**