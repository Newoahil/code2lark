# Phase 4 / Phase 5 CI And Second Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立分层测试和 CI 门禁，补齐关键安全回归，并让 MVP 整合包在第二个非图片目标项目上完成接入改造与验证。

**Architecture:** 先拆测试脚本和 CI，保证后续第二目标验证有稳定门禁；再为本轮已识别的安全/交付风险补回归测试；最后以 `calendar-stock-updater` 为默认第二目标执行 analyze → generate → verify → integration validation，并沉淀证据或 blocker。整个阶段避免引入第三目标或新平台能力。

**Tech Stack:** TypeScript/Node CLI, GitHub Actions workflow YAML, Node `node:test`, npm scripts, generated package docs

## Global Constraints

- 不得重新开展或重复记录已经完成的 `image-agent-web` Mode A / Mode B 部署测试。
- 不得引入 Slack、企业微信、群 @ 命令、私聊命令、第三个目标项目、自动部署或 Secret 管理能力。
- `generated/<target>-lark/` 是标准生成包与 source of truth。
- Mode A = external host / sidecar / gateway。
- Mode B = target-project embedded host module。
- `standalone-runtime` 仅是 reference/fallback host，不是主要产品形态。
- 所有模式定义、文档和代码行为必须与 `docs/development-charter.md` 一致。
- 第二目标默认优先 Mode A；只有目标明确要求内部模块时才选择 Mode B。

---

## File Structure Impact

### Existing files to modify
- `package.json`
  - split test scripts, optional coverage script, engine/packageManager metadata.
- `tests/cli-smoke.test.mjs`
  - second-target assertions, security regressions.
- `tests/runtime-local-e2e.test.mjs`
  - runtime-boundary and security regressions.
- `docs/capability-validation-matrix.md`
  - second-target validation state.

### New files to create
- `.github/workflows/ci.yml`
- `docs/second-target-validation-plan.md`
- `docs/second-target-blocker-record.md` (only if blocked)

### Responsibility boundaries after this phase
- `package.json` → authoritative local verification entrypoints.
- `.github/workflows/ci.yml` → clean-environment enforcement.
- `docs/second-target-validation-plan.md` → second-target decision, mode, scope, and evidence location.
- tests → prevent regression in the newly hardened generator/runtime behavior.

---

### Task 1: 拆分 package scripts 并建立 CI

**Files:**
- Modify: `package.json`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes:
  - current scripts: `build`, `check`, `test`
  - repository currently has no workflow files
- Produces:
  - `test:unit`, `test:smoke`, `test:e2e`, `test:coverage`
  - CI workflow calling clean install + build/check + unit/smoke + audit

- [ ] **Step 1: Write the failing test**

Use file-based assertions in `tests/cli-smoke.test.mjs` or a new tiny test section that checks package scripts and workflow presence:

```js
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(typeof packageJson.scripts["test:unit"], "string");
assert.equal(typeof packageJson.scripts["test:smoke"], "string");
assert.equal(typeof packageJson.scripts["test:e2e"], "string");
assert.equal(typeof packageJson.scripts["test:coverage"], "string");
assert.ok(fs.existsSync(path.join(root, ".github", "workflows", "ci.yml")));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: FAIL because the scripts and workflow do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Update `package.json` scripts minimally, for example:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "check": "npm run build",
    "test:unit": "node --test tests/unit-pure-functions.test.mjs",
    "test:smoke": "node --test tests/cli-smoke.test.mjs",
    "test:e2e": "node --test tests/runtime-local-e2e.test.mjs",
    "test:coverage": "node --experimental-test-coverage --test tests/unit-pure-functions.test.mjs tests/cli-smoke.test.mjs",
    "test": "npm run build && npm run test:unit && npm run test:smoke && npm run test:e2e"
  },
  "engines": {
    "node": ">=24.16.0"
  },
  "packageManager": "npm@11.15.0"
}
```

Create `.github/workflows/ci.yml` with a single workflow that runs:

```yaml
name: ci
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24.16.0
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run test:unit
      - run: npm run test:smoke
      - run: npm audit --package-lock-only --audit-level=moderate
```

Do not run `test:e2e` in the first minimal CI unless you also explicitly account for its dependency-installing behavior and runtime.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/cli-smoke.test.mjs
npm run test:unit
npm run test:smoke
```

Expected: PASS; scripts resolve and workflow file exists.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/ci.yml tests/cli-smoke.test.mjs
git commit -m "ci: validate build smoke tests and dependency audit"
```

---

### Task 2: 为关键安全/交付路径补回归测试

**Files:**
- Modify: `tests/cli-smoke.test.mjs`
- Modify: `tests/runtime-local-e2e.test.mjs`

**Interfaces:**
- Consumes: earlier phases’ code changes and current test helpers.
- Produces:
  - regression tests for handoff, output guard, generic endpoint risk, debug defaults, manifest gate, host-mode card semantics

- [ ] **Step 1: Write the failing tests**

在现有两个测试文件中新增 focused cases，至少覆盖：

```js
// cli-smoke
assert.throws(() => run(["generate", workspace, "--out", existingOutput]), /non-empty|force/i);
assert.ok(serviceManifest.source_scan.endpoint_coverage.some((item) => item.path === "/api/stop" && item.status !== "supported"));
assert.ok(fs.existsSync(path.join(copyDir, "adapter", "handlers.ts")));

// runtime-local-e2e
assert.equal(health.debugEnabled, false);
assert.equal(health.debugProtected, true);
```

并复用 earlier-plan 新增的 schema/card assertions，不重复造 helper。

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:smoke
npm run test:e2e
```

Expected: FAIL if any hardened behavior regresses or remains unimplemented.

- [ ] **Step 3: Write minimal implementation if any regression test still points to missing behavior**

This task is primarily test coverage. Only add tiny helpers if the test files need cleanup, for example:

```js
function assertFileExists(p) {
  assert.ok(fs.existsSync(p), `Expected file to exist: ${p}`);
}
```

Do not change generator/runtime behavior here unless a previous phase intentionally deferred a tiny missing hook that the new test needs.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:smoke
npm run test:e2e
npm run test:coverage
```

Expected: PASS; coverage command completes and key regressions are covered.

- [ ] **Step 5: Commit**

```bash
git add tests/cli-smoke.test.mjs tests/runtime-local-e2e.test.mjs
git commit -m "test: cover generated package security boundaries"
```

---

### Task 3: 记录第二目标方案并在生成链路中完成验证

**Files:**
- Create: `docs/second-target-validation-plan.md`
- Modify: `tests/cli-smoke.test.mjs`
- Modify: `docs/capability-validation-matrix.md`

**Interfaces:**
- Consumes:
  - current `calendar-stock-updater` smoke fixture already present in `tests/cli-smoke.test.mjs`
  - MVP package semantics stabilized by previous phases
- Produces:
  - explicit second-target validation plan
  - evidence that the second target is not image-domain-coupled

- [ ] **Step 1: Write the failing test**

Add or strengthen assertions in the `calendar-stock-updater` smoke section:

```js
assert.equal(serviceManifest.source_scan.analysis_strategy, "generic_http_api");
assert.equal(capabilityMap.target_profile, "generic-http-api");
assert.ok(!generatedReadme.includes("image.generate"));
assert.ok(!generatedAdapterCards.includes("image.batch.submit"));
```

Add doc existence assertions:

```js
const secondTargetPlan = fs.readFileSync(path.join(root, "docs", "second-target-validation-plan.md"), "utf8");
assert.match(secondTargetPlan, /calendar-stock-updater/);
assert.match(secondTargetPlan, /Mode A/);
assert.match(secondTargetPlan, /query/i);
assert.match(secondTargetPlan, /action/i);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:smoke
```

Expected: FAIL if the second-target plan file is missing or generated artifacts still leak image-specific assumptions.

- [ ] **Step 3: Write minimal implementation**

Create `docs/second-target-validation-plan.md` with concrete structure:

```md
# Second Target Validation Plan

## Selected target
- `calendar-stock-updater`
- Why: non-image, task/status oriented, already has generic HTTP fixture coverage

## Delivery choice
- Default: Mode A
- Rationale: verify the MVP integration package without forcing an embedded-host migration first

## Minimum validation scope
- One query/read path
- One reviewed action path
- Strict verify, readiness, doctor, handoff
```

Update `docs/capability-validation-matrix.md` row for `calendar-stock-updater` to reflect current phase outcome accurately.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:smoke
```

Expected: PASS; second-target plan exists and generated artifacts stay generic.

- [ ] **Step 5: Commit**

```bash
git add docs/second-target-validation-plan.md docs/capability-validation-matrix.md tests/cli-smoke.test.mjs
git commit -m "test: validate MVP integration package against calendar-stock-updater"
```

---

### Task 4: 记录第二目标验证证据或 blocker

**Files:**
- Modify: `docs/capability-validation-matrix.md`
- Create: `docs/second-target-blocker-record.md` (only if blocked)

**Interfaces:**
- Consumes:
  - second-target validation results from Task 3 and any real/manual follow-up
- Produces:
  - final matrix state
  - blocker record when verification cannot complete externally

- [ ] **Step 1: Write the outcome file**

If validation succeeded enough for the current scope, update the matrix row with exact outcome wording, for example:

```md
| calendar-stock-updater | Mode A | embedded/adapter-first | yes | partial / yes | query + reviewed action validated via MVP package |
```

If blocked, create `docs/second-target-blocker-record.md` with:

```md
# Second Target Validation Blocker Record

- Target: calendar-stock-updater
- Missing prerequisite:
- Responsible owner:
- Safe next command:
- Evidence already collected:
```

- [ ] **Step 2: Run repository verification**

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

If success path:

```bash
git add docs/capability-validation-matrix.md
git commit -m "docs: record second-target integration evidence"
```

If blocked path:

```bash
git add docs/capability-validation-matrix.md docs/second-target-blocker-record.md
git commit -m "docs: record second-target validation blocker"
```

---

## Self-review

- Spec coverage: covers Phase 4 CI/testing and Phase 5 second-target validation from the approved spec.
- Placeholder scan: no TODO/TBD placeholders remain; all tasks include exact files, commands, and concrete content.
- Type consistency: reuses existing script names, smoke fixture structure, and the approved `calendar-stock-updater` second-target direction.
