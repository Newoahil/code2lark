# Phase 0 / Phase 3 Baseline And Facts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已完成部署测试验证的 Mode A / Mode B 样板经验固化为当前 MVP 回归基线，并让 schema、verify、canonical package 和能力矩阵形成可信事实源。

**Architecture:** 先用文档和回归断言锁定“Mode A / Mode B 已验证”的事实语义，再收紧 verify 的 schema 门禁，最后 fresh analyze/generate canonical MVP package 并更新能力矩阵。避免在这一阶段引入新的运行模式或平台能力。

**Tech Stack:** TypeScript/Node CLI, generated JSON/Markdown artifacts, Node `node:test`

## Global Constraints

- 不得重新开展或重复记录已经完成的 `image-agent-web` Mode A / Mode B 部署测试。
- `generated/<target>-lark/` 是标准生成包与 source of truth。
- Mode A = external host / sidecar / gateway。
- Mode B = target-project embedded host module。
- `standalone-runtime` 仅是 reference/fallback host，不是主要产品形态。
- `self-hosted-runtime` 必须被描述为 generated host module，可外置运行，也可迁入目标项目。
- 所有模式定义、文档和代码行为必须与 `docs/development-charter.md` 一致。
- 每个任务结束必须运行对应验证并保持工作树干净。

---

## File Structure Impact

### Existing files to modify
- `README.md`
  - 顶层 MVP 范围、Mode A/B 样板状态、source-of-truth 说明。
- `docs/development-charter.md`
  - 最高层产品模型与 Mode A/B 事实基线。
- `docs/project-status.md`
  - 当前状态快照与能力表述。
- `docs/mvp-1a-image-agent-web.md`
  - 样板验证说明，明确这是已验证样板经验。
- `docs/fde-handoff.md`
  - 交接口径与事实源表述。
- `src/types.ts`
  - manifest 类型与 schema version 唯一来源。
- `src/commands/verify.ts`
  - strict verify schema/version/required-field gate。
- `src/commands/context.ts`
  - context 模板中的模式与证据表述。
- `src/commands/readiness.ts`
  - readiness 文案与完成定义。
- `src/commands/doctor.ts`
  - doctor 文案与 gate 语义。
- `tests/cli-smoke.test.mjs`
  - 顶层文档、模式、manifest、canonical package 回归断言。

### New files to create
- `docs/mvp-mode-a-b-baseline.md`
  - 已验证样板的明确基线文档。
- `docs/capability-validation-matrix.md`
  - 当前事实源矩阵。

### Responsibility boundaries after this phase
- `docs/mvp-mode-a-b-baseline.md` → 记录 image-agent-web 已完成部署测试的 Mode A/Mode B 基线。
- `docs/capability-validation-matrix.md` → 汇总 profile/mode/host/本地验证/部署测试/证据位置。
- `src/types.ts` + `src/commands/verify.ts` → manifest schema 权威定义与 strict gate。
- README / charter / status / handoff docs → 面向用户的统一事实口径。

---

### Task 1: 锁定 Mode A / Mode B 已验证基线语义

**Files:**
- Modify: `README.md`
- Modify: `docs/development-charter.md`
- Modify: `docs/project-status.md`
- Modify: `docs/mvp-1a-image-agent-web.md`
- Modify: `docs/fde-handoff.md`
- Test: `tests/cli-smoke.test.mjs`

**Interfaces:**
- Consumes: 现有文档中的 Mode A / Mode B 段落与 `tests/cli-smoke.test.mjs` 顶层文档断言。
- Produces:
  - “Mode A / Mode B 已完成部署测试验证”的统一文案
  - “不要把 Mode B 写成待真实验收”的回归断言

- [ ] **Step 1: Write the failing test**

在 `tests/cli-smoke.test.mjs` 的 `test("top-level docs define Code2Lark delivery modes", ...)` 中加入或替换断言，要求文档表达下面这些事实：

```js
assert.match(readme, /Mode A.*已验证|validated/i);
assert.match(readme, /Mode B.*已验证|validated/i);
assert.doesNotMatch(readme, /Mode B.*pending real/i);
assert.doesNotMatch(readme, /Mode B.*待真实验收/);

assert.match(charter, /Mode A.*external host/i);
assert.match(charter, /Mode B.*embedded host module/i);
assert.doesNotMatch(charter, /Mode B.*not considered productized until/i);

assert.match(status, /Mode A/i);
assert.match(status, /Mode B/i);
assert.match(mvp, /verified sample/i);
assert.doesNotMatch(mvp, /Real Feishu verification is still pending/);
assert.match(fdeHandoff, /source-of-truth handoff package/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: FAIL on wording assertions that still describe Mode B as pending or incomplete.

- [ ] **Step 3: Write minimal implementation**

在以下文件中统一使用明确措辞：

```md
Mode A is the external host, sidecar, or gateway path, and the verified image-agent-web sample has completed deployment-test validation in this mode.

Mode B is the target-project embedded host-module path, and the verified image-agent-web sample has also completed deployment-test validation in this mode.

The current roadmap does not re-prove these sample validations. It consolidates them into a reusable MVP integration package.
```

同时删除或改写仍将 Mode B 描述为“待真实验收”“仅本地重放证明”“直到未来某个 replay 才算完成”的旧句式。

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: PASS for the top-level docs test.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/development-charter.md docs/project-status.md docs/mvp-1a-image-agent-web.md docs/fde-handoff.md tests/cli-smoke.test.mjs
git commit -m "docs: establish validated Mode A and Mode B baseline"
```

---

### Task 2: 新建 MVP baseline 和 capability matrix 文档

**Files:**
- Create: `docs/mvp-mode-a-b-baseline.md`
- Create: `docs/capability-validation-matrix.md`
- Test: `tests/cli-smoke.test.mjs`

**Interfaces:**
- Consumes: Task 1 的统一文案。
- Produces:
  - `docs/mvp-mode-a-b-baseline.md`
  - `docs/capability-validation-matrix.md`

- [ ] **Step 1: Write the failing test**

在 `tests/cli-smoke.test.mjs` 顶层文档测试中新增文件存在与关键内容断言：

```js
const baseline = fs.readFileSync(path.join(root, "docs", "mvp-mode-a-b-baseline.md"), "utf8");
const matrix = fs.readFileSync(path.join(root, "docs", "capability-validation-matrix.md"), "utf8");

assert.match(baseline, /Mode A/);
assert.match(baseline, /Mode B/);
assert.match(baseline, /deployment-test validation/i);
assert.match(matrix, /image-agent-web/);
assert.match(matrix, /calendar-stock-updater/);
assert.match(matrix, /Mode A/);
assert.match(matrix, /Mode B/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: FAIL because the files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

创建 `docs/mvp-mode-a-b-baseline.md`，至少包含：

```md
# Code2Lark MVP Mode A / Mode B Baseline

- `image-agent-web` has completed deployment-test validation in Mode A.
- `image-agent-web` has completed deployment-test validation in Mode B.
- These validations are treated as the current MVP sample baseline.
- This roadmap consolidates the validated experience into a reusable MVP integration package.
```

创建 `docs/capability-validation-matrix.md`，至少包含一个 Markdown 表：

```md
| Target | Delivery mode | Host mode | Local validation | Deployment-test validation | Notes |
| --- | --- | --- | --- | --- | --- |
| image-agent-web | Mode A | self-hosted / long connection | yes | yes | verified sample baseline |
| image-agent-web | Mode B | embedded host module | yes | yes | verified sample baseline |
| calendar-stock-updater | generic target candidate | TBD | package validation only | no | second-target validation pending |
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: PASS for the new file assertions.

- [ ] **Step 5: Commit**

```bash
git add docs/mvp-mode-a-b-baseline.md docs/capability-validation-matrix.md tests/cli-smoke.test.mjs
git commit -m "docs: add MVP baseline and validation matrix"
```

---

### Task 3: 让 strict verify 严格拒绝旧 schema 和不完整 manifest

**Files:**
- Modify: `src/commands/verify.ts`
- Modify: `src/types.ts`
- Test: `tests/cli-smoke.test.mjs`

**Interfaces:**
- Consumes:
  - `ManifestSchemaVersion = "0.2"` in `src/types.ts`
  - existing verify parsing in `src/commands/verify.ts`
- Produces:
  - strict-mode manifest integrity check that fails on `0.1` or missing `target_profile`

- [ ] **Step 1: Write the failing test**

在 `tests/cli-smoke.test.mjs` 中新增一个 focused strict-verify fixture：

```js
test("strict verify rejects outdated manifest schemas", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-old-schema-"));
  fs.mkdirSync(path.join(temp, "manifest"), { recursive: true });
  fs.writeFileSync(path.join(temp, "manifest", "service_manifest.json"), JSON.stringify({ schema_version: "0.1" }));
  fs.writeFileSync(path.join(temp, "manifest", "capability_map.json"), JSON.stringify({ schema_version: "0.1", service_name: "x", capabilities: [] }));
  fs.writeFileSync(path.join(temp, "manifest", "interaction_contract.json"), JSON.stringify({ schema_version: "0.1", channel: "lark", service_name: "x", supported_triggers: [], supported_result_modes: [], interactions: [] }));
  fs.writeFileSync(path.join(temp, "manifest", "required_permissions.json"), JSON.stringify({ schema_version: "0.1", app: { type: "custom_app", bot_required: true, availability_recommendation: "" }, context_requirements: [], token_strategy: { default: "tenant_access_token", user_access_token_required: false }, scopes: [], events: [], callbacks: [], manual_steps: [], review_flags: [] }));

  assert.throws(() => run(["verify", temp, "--strict"]), /schema|0\.2|target_profile/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: FAIL because strict verify currently does not reject the old schema fixture.

- [ ] **Step 3: Write minimal implementation**

在 `src/commands/verify.ts` 增加 manifest strict checks，至少验证：

```ts
function assertManifestSchemaVersion(name: string, value: { schema_version?: string }): void {
  if (value.schema_version !== "0.2") {
    throw new Error(`${name} must use schema_version 0.2.`);
  }
}

function assertCapabilityMapTargetProfile(value: { target_profile?: unknown }): void {
  if (typeof value.target_profile !== "string" || !value.target_profile) {
    throw new Error("capability_map.json must include target_profile in strict mode.");
  }
}
```

并在 strict verify 路径上对 4 个 manifest 统一调用这些检查。

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: PASS for the outdated-manifest rejection test.

- [ ] **Step 5: Commit**

```bash
git add src/commands/verify.ts src/types.ts tests/cli-smoke.test.mjs
git commit -m "fix: reject outdated manifests in strict verification"
```

---

### Task 4: fresh 重建 canonical MVP package 并把 schema 0.2 固化为回归断言

**Files:**
- Modify: `tests/cli-smoke.test.mjs`
- Modify: `README.md`
- Modify: `docs/project-status.md`
- Optionally Modify: generated-package-facing summary wording if touched by tests through generator commands

**Interfaces:**
- Consumes: Tasks 1–3 的文案与 strict gate。
- Produces:
  - fresh generated package assertions using current analyze/generate path
  - docs that describe canonical MVP package as current schema `0.2`

- [ ] **Step 1: Write the failing test**

在现有 image-agent-web smoke test 中补充/强化断言：

```js
const serviceManifest = JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "service_manifest.json"), "utf8"));
assert.equal(serviceManifest.schema_version, "0.2");

const capabilityMap = JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "capability_map.json"), "utf8"));
assert.equal(capabilityMap.schema_version, "0.2");
assert.ok(capabilityMap.target_profile);
```

并在生成 package 后读取相应 manifest 再断言一次。

- [ ] **Step 2: Run test to verify it fails if generated facts drift**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: If current generator or docs still drift, FAIL on missing generated assertions or schema wording.

- [ ] **Step 3: Write minimal implementation**

只在必要处更新文档与生成摘要相关文案，确保：

```md
The canonical MVP package is freshly generated from current schema 0.2 manifests.
```

并保证 smoke test 的 fresh analyze → generate 路径输出满足断言。

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test
```

Expected:
- all smoke and runtime tests PASS
- fresh generated manifests report schema `0.2`

- [ ] **Step 5: Commit**

```bash
git add README.md docs/project-status.md tests/cli-smoke.test.mjs
git commit -m "docs: align canonical MVP package with schema 0.2"
```

---

## Self-review

- Spec coverage: covers Phase 0 baseline semantics and Phase 3 fact-source/schema tightening from the approved spec.
- Placeholder scan: no TBD/TODO placeholders remain; all steps include exact files, test code, commands, and commit messages.
- Type consistency: `schema_version` remains `"0.2"`; strict checks reference existing manifest file names and `target_profile` from `CapabilityMap`.
