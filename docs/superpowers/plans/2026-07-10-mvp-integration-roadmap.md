# Code2Lark MVP 整合包与第二目标验证总路线图

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已完成部署测试验证的 Mode A / Mode B 经验固化为可信、可交付、可泛用的 MVP 整合包，并用第二目标项目完成接入改造与验证。

**Architecture:** 先收口事实源、交付闭包、安全默认值和 host-mode 一致性，再建立 CI 与安全回归，最后把稳定后的 MVP 整合包应用到第二个非图片目标。总路线图只负责分阶段编排与依赖关系；实际实施使用下列 4 份子计划逐个执行和审查。

**Tech Stack:** TypeScript/Node CLI, generated Markdown/JSON artifacts, generated Python `feishu-host/`, Node `node:test`, npm scripts, GitHub Actions

## Global Constraints

- 不得重新开展或重复记录已经完成的 `image-agent-web` Mode A / Mode B 部署测试。
- 不得引入 Slack、企业微信、群 @ 命令、私聊命令、第三个目标项目、自动部署或 Secret 管理能力。
- 不得接管目标服务生命周期。
- `generated/<target>-lark/` 是标准生成包与 source of truth。
- Mode A = external host / sidecar / gateway。
- Mode B = target-project embedded host module。
- `standalone-runtime` 仅是 reference/fallback host，不是主要产品形态。
- `self-hosted-runtime` 必须被描述为 generated host module，可外置运行，也可迁入目标项目。
- 所有模式定义、文档和代码行为必须与 `docs/development-charter.md` 一致。
- 每个子计划都必须遵循 TDD、频繁提交、每阶段结束工作树干净。

---

## File Structure Impact

### Existing files to modify across the full roadmap
- `README.md`
- `docs/development-charter.md`
- `docs/project-status.md`
- `docs/fde-handoff.md`
- `docs/mvp-1a-image-agent-web.md`
- `src/types.ts`
- `src/commands/analyze.ts`
- `src/commands/context.ts`
- `src/commands/doctor.ts`
- `src/commands/generate.ts`
- `src/commands/handoff.ts`
- `src/commands/readiness.ts`
- `src/commands/verify.ts`
- `tests/cli-smoke.test.mjs`
- `tests/runtime-local-e2e.test.mjs`
- `package.json`

### New files to create across the full roadmap
- `docs/mvp-integration-package-and-second-target-task-book.md`
- `docs/mvp-mode-a-b-baseline.md`
- `docs/second-target-validation-plan.md`
- `docs/second-target-blocker-record.md`（仅在受阻时）
- `docs/capability-validation-matrix.md`
- `.github/workflows/ci.yml`
- 可能新增更细粒度测试文件（按子计划决定）

### Responsibility boundaries after the roadmap
- `manifest/` → machine-readable truth about target, capability, interaction, and permission contracts
- `adapter/` → target interaction adaptation layer
- `feishu-host/` → host module source for verified Mode A now and Mode B embedding later
- `bot-runtime/` → standalone reference host only
- `docs/*` → product model, handoff, baseline, second-target validation, and user decision guides

---

### Task 1: 固化 Mode A / Mode B 基线与事实源语义

**Files:**
- Plan: `docs/superpowers/plans/2026-07-10-phase0-phase3-baseline-and-facts.md`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-07-10-engineering-trust-mode-b-closure-design.md`
- Produces:
  - `docs/mvp-mode-a-b-baseline.md`
  - `docs/capability-validation-matrix.md`
  - schema/version/evidence semantics aligned across generated docs and verify

- [ ] **Step 1: Execute the dedicated sub-plan**

Run the plan in:

```text
docs/superpowers/plans/2026-07-10-phase0-phase3-baseline-and-facts.md
```

Expected outcome:
- Mode A / Mode B are recorded as already validated sample experience.
- strict verify rejects outdated/incomplete manifest artifacts.
- canonical MVP package is freshly regenerated and documented as schema `0.2`.

- [ ] **Step 2: Verify phase-level exit criteria**

Run:

```bash
npm test
npm audit --package-lock-only --audit-level=moderate
git diff --check
```

Expected:
- PASS
- 0 vulnerabilities
- no whitespace errors

- [ ] **Step 3: Commit**

```bash
git add README.md docs/development-charter.md docs/project-status.md docs/mvp-1a-image-agent-web.md docs/fde-handoff.md docs/mvp-mode-a-b-baseline.md docs/capability-validation-matrix.md src/commands/context.ts src/commands/readiness.ts src/commands/doctor.ts src/commands/verify.ts src/types.ts tests/cli-smoke.test.mjs
git commit -m "docs: establish MVP validation baseline and capability matrix"
```

---

### Task 2: 完成交付闭包与安全止损

**Files:**
- Plan: `docs/superpowers/plans/2026-07-10-phase1-delivery-and-safety.md`

**Interfaces:**
- Consumes:
  - current generator metadata and handoff manifest behavior
  - generic HTTP capability generation in `src/commands/analyze.ts`
  - runtime env/config generation in `src/commands/generate.ts`
- Produces:
  - mode-aware handoff closure
  - guarded `generate --out` behavior
  - generic HTTP risk gating
  - secure standalone debug defaults

- [ ] **Step 1: Execute the dedicated sub-plan**

Run the plan in:

```text
docs/superpowers/plans/2026-07-10-phase1-delivery-and-safety.md
```

Expected outcome:
- handoff copy includes the correct runtime closure for each mode.
- generate refuses to overwrite non-managed directories without explicit force.
- dangerous generic endpoints are not exposed as immediate actions.
- standalone debug defaults are safe by default.

- [ ] **Step 2: Verify phase-level exit criteria**

Run:

```bash
npm test
npm audit --package-lock-only --audit-level=moderate
git diff --check
```

Expected:
- PASS
- 0 vulnerabilities
- no whitespace errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/handoff.ts src/commands/generate.ts src/commands/analyze.ts src/commands/context.ts src/commands/readiness.ts tests/cli-smoke.test.mjs tests/runtime-local-e2e.test.mjs
git commit -m "fix: secure generated package handoff and runtime defaults"
```

---

### Task 3: 完成 host-mode / Card JSON / 验收材料一致性

**Files:**
- Plan: `docs/superpowers/plans/2026-07-10-phase2-host-mode-and-card-json.md`

**Interfaces:**
- Consumes:
  - host-mode model from `docs/development-charter.md`
  - existing Level 2 template generation in `src/commands/generate.ts`
  - verify embedded/self-hosted checks in `src/commands/verify.ts`
- Produces:
  - Card JSON 2.0 generation for long-connection/hybrid paths
  - host-mode-aware permissions/context/readiness/doctor wording
  - self-hosted-specific Level 2 verification record

- [ ] **Step 1: Execute the dedicated sub-plan**

Run the plan in:

```text
docs/superpowers/plans/2026-07-10-phase2-host-mode-and-card-json.md
```

Expected outcome:
- long-connection and hybrid cards emit full Card JSON 2.0 structures.
- self-hosted docs/templates no longer inherit webhook-only assumptions.
- permission/context/readiness outputs reflect the selected host mode.

- [ ] **Step 2: Verify phase-level exit criteria**

Run:

```bash
npm test
npm audit --package-lock-only --audit-level=moderate
git diff --check
```

Expected:
- PASS
- 0 vulnerabilities
- no whitespace errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/generate.ts src/commands/context.ts src/commands/readiness.ts src/commands/doctor.ts src/commands/verify.ts tests/cli-smoke.test.mjs tests/runtime-local-e2e.test.mjs
git commit -m "fix: align host-mode contracts and Card JSON output"
```

---

### Task 4: 建立测试/CI 并完成第二目标验证

**Files:**
- Plan: `docs/superpowers/plans/2026-07-10-phase4-phase5-ci-and-second-target.md`

**Interfaces:**
- Consumes:
  - stabilized generator and docs from Tasks 1–3
  - existing `calendar-stock-updater` smoke coverage in `tests/cli-smoke.test.mjs`
  - `package.json` scripts
- Produces:
  - split test scripts
  - CI workflow
  - security regression coverage
  - second-target validation plan/evidence

- [ ] **Step 1: Execute the dedicated sub-plan**

Run the plan in:

```text
docs/superpowers/plans/2026-07-10-phase4-phase5-ci-and-second-target.md
```

Expected outcome:
- package scripts are split into unit/smoke/e2e/coverage.
- CI exists and validates the repository in a clean environment.
- second target runs through the MVP workflow and yields evidence or a non-sensitive blocker record.

- [ ] **Step 2: Verify roadmap exit criteria**

Run:

```bash
npm test
npm audit --package-lock-only --audit-level=moderate
git diff --check
```

If CI files were added, also inspect them with:

```bash
git diff -- .github/workflows/ci.yml
```

Expected:
- PASS
- 0 vulnerabilities
- no whitespace errors
- workflow file present and aligned with package scripts

- [ ] **Step 3: Commit**

```bash
git add package.json .github/workflows/ci.yml docs/second-target-validation-plan.md docs/second-target-blocker-record.md docs/capability-validation-matrix.md tests/cli-smoke.test.mjs tests/runtime-local-e2e.test.mjs
git commit -m "test: validate MVP package against second target"
```

---

## Recommended execution order

1. `2026-07-10-phase0-phase3-baseline-and-facts.md`
2. `2026-07-10-phase1-delivery-and-safety.md`
3. `2026-07-10-phase2-host-mode-and-card-json.md`
4. `2026-07-10-phase4-phase5-ci-and-second-target.md`

## Why the plan is split

The spec spans four reviewable subsystems:

- baseline/facts/docs semantics
- delivery/safety correctness
- host-mode/card/proof consistency
- CI/testing/second-target validation

Each subsystem can be approved or rejected independently and has its own test cycle. Splitting preserves reviewer clarity and reduces context load for execution agents.

## Self-review

- Spec coverage: all spec phases are represented by one sub-plan or a task wrapper in this roadmap.
- Placeholder scan: no TODO/TBD placeholders remain; every task points to an exact plan file and concrete commands.
- Type consistency: this roadmap does not invent new code interfaces beyond plan file paths and existing command names.
