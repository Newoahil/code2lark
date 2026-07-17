# Phase 1 Delivery And Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 MVP 整合包在交付闭包、生成目录保护、generic HTTP 风险暴露和 standalone debug 默认值上的高优先级安全与正确性问题。

**Architecture:** 先让 handoff 和 generate 的文件系统行为变得安全、可预测，再把 generic HTTP capability 暴露改成 deny-by-default，最后收紧 standalone runtime 默认网络/调试边界。所有行为变更都通过现有 smoke/runtime E2E 测试加回归断言，不扩展新产品能力。

**Tech Stack:** TypeScript/Node CLI, generated TS/JS runtime templates, Node `node:test`

## Global Constraints

- 不得重新开展或重复记录已经完成的 `image-agent-web` Mode A / Mode B 部署测试。
- 不得引入新的 host capability、trigger type 或 platform target。
- `generated/<target>-lark/` 是标准生成包与 source of truth。
- Mode A = external host / sidecar / gateway。
- Mode B = target-project embedded host module。
- `standalone-runtime` 仅是 reference/fallback host，不是主要产品形态。
- 所有模式定义、文档和代码行为必须与 `docs/development-charter.md` 一致。
- 每个行为修复独立 commit；重构与行为修复分离。

---

## File Structure Impact

### Existing files to modify
- `src/commands/handoff.ts`
  - recommended file list, copy closure, copied command wording.
- `src/commands/generate.ts`
  - output-directory behavior, runtime env defaults, generated runtime config defaults.
- `src/commands/analyze.ts`
  - generic HTTP endpoint classification and capability risk selection.
- `src/commands/context.ts`
  - reflected runtime defaults and command wording when defaults change.
- `src/commands/readiness.ts`
  - security warnings / default-value interpretation if needed.
- `tests/cli-smoke.test.mjs`
  - handoff closure, output guard, generic endpoint classification assertions.
- `tests/runtime-local-e2e.test.mjs`
  - runtime default health/debug behavior assertions.

### Responsibility boundaries after this phase
- `handoff.ts` → decides what a safe transferable package contains.
- `generate.ts` → decides how dangerous filesystem updates and runtime defaults behave.
- `analyze.ts` → classifies generic HTTP capabilities and whether they are directly runnable.
- tests → enforce the new safe defaults and transfer closure.

---

### Task 1: 让 handoff 复制模式感知的完整运行闭包

**Files:**
- Modify: `src/commands/handoff.ts`
- Test: `tests/cli-smoke.test.mjs`

**Interfaces:**
- Consumes:
  - `generation_summary.json` already copied in optional evidence files
  - current `RECOMMENDED_FILES`, `OPTIONAL_EVIDENCE_FILES`, `EXCLUDED_PATHS`
- Produces:
  - mode-aware copy set that includes required runtime closure

- [ ] **Step 1: Write the failing test**

在 `tests/cli-smoke.test.mjs` 的 handoff copy 覆盖中增加断言，至少覆盖 standalone 和 self-hosted：

```js
assert.ok(fs.existsSync(path.join(copyDir, "adapter", "handlers.ts")));
assert.ok(fs.existsSync(path.join(copyDir, "adapter", "cards.ts")));
assert.ok(fs.existsSync(path.join(copyDir, "manifest", "service_manifest.json")));
assert.ok(fs.existsSync(path.join(copyDir, "bot-runtime", "src", "index.ts")));
assert.ok(fs.existsSync(path.join(selfHostedCopyDir, "feishu-host", "app.py")));
assert.ok(fs.existsSync(path.join(selfHostedCopyDir, "feishu-host", "handlers.py")));
```

并对 embedded-long-connection package 断言 sidecar 目录存在（如果当前 generator 会产出该目录）。

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: FAIL because current handoff copy omits adapter and self-hosted closure.

- [ ] **Step 3: Write minimal implementation**

在 `src/commands/handoff.ts` 中引入基于 package 内容/summary 的推荐文件集合，例如：

```ts
function requiredHandoffPaths(packagePath: string): string[] {
  const paths = [
    ".gitignore",
    "START_HERE.md",
    "README.md",
    "deployment_checklist.md",
    "permission_review.md",
    "manifest/service_manifest.json",
    "manifest/capability_map.json",
    "manifest/interaction_contract.json",
    "manifest/required_permissions.json",
    "adapter/handlers.ts",
    "adapter/cards.ts",
    "adapter/service-client.ts",
    "adapter/validation.ts",
    "adapter/types.ts",
    "adapter/audit-events.ts",
  ];
  if (fs.existsSync(path.join(packagePath, "bot-runtime"))) paths.push("bot-runtime");
  if (fs.existsSync(path.join(packagePath, "feishu-host"))) paths.push("feishu-host");
  if (fs.existsSync(path.join(packagePath, "sidecar-long-connection"))) paths.push("sidecar-long-connection");
  return paths;
}
```

并让 copy 逻辑支持复制目录而非只复制部分列举文件。

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: PASS for handoff copy closure assertions.

- [ ] **Step 5: Commit**

```bash
git add src/commands/handoff.ts tests/cli-smoke.test.mjs
git commit -m "fix: copy complete generated artifacts during handoff"
```

---

### Task 2: 保护 `generate --out` 不误删已有非管理目录

**Files:**
- Modify: `src/commands/generate.ts`
- Test: `tests/cli-smoke.test.mjs`

**Interfaces:**
- Consumes: current `generateCommand()` directory creation and cleanup behavior.
- Produces:
  - default refusal for non-empty unmanaged output directories
  - explicit `--force` path for managed cleanup only

- [ ] **Step 1: Write the failing test**

在 `tests/cli-smoke.test.mjs` 新增 fixture：

```js
test("generate refuses to overwrite non-managed non-empty output directories", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-generate-guard-"));
  const target = path.join(temp, "image-agent-web");
  const workspace = path.join(temp, "out");
  const existing = path.join(temp, "existing-output");
  fs.mkdirSync(existing, { recursive: true });
  fs.writeFileSync(path.join(existing, "README.md"), "user-owned content", "utf8");
  writeImageAgentLikeTarget(target);
  run(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace]);
  assert.throws(() => run(["generate", workspace, "--out", existing]), /non-empty|force|managed/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: FAIL because generate currently reuses and cleans directories too freely.

- [ ] **Step 3: Write minimal implementation**

在 `src/commands/generate.ts` 中添加：

```ts
function assertSafeOutputDirectory(outDir: string, force: boolean): void {
  if (!fs.existsSync(outDir)) return;
  const entries = fs.readdirSync(outDir);
  if (!entries.length) return;
  const managedMarker = path.join(outDir, "generation_summary.json");
  if (!fs.existsSync(managedMarker)) {
    throw new Error("Refusing to write into a non-empty directory that is not a managed generated package. Use a new --out path.");
  }
  if (!force) {
    throw new Error("Refusing to update an existing generated package without --force.");
  }
}
```

并只允许删除/替换已知生成目录下的受管理子路径。

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: PASS; unmanaged non-empty output directory is rejected.

- [ ] **Step 5: Commit**

```bash
git add src/commands/generate.ts tests/cli-smoke.test.mjs
git commit -m "fix: protect existing output directories during generation"
```

---

### Task 3: 将 generic HTTP 默认暴露改为 deny-by-default

**Files:**
- Modify: `src/commands/analyze.ts`
- Modify: `src/types.ts` (only if a small new metadata field is truly needed)
- Test: `tests/cli-smoke.test.mjs`

**Interfaces:**
- Consumes:
  - `analyzeGenericHttpApi()` capability and endpoint coverage generation
  - existing `risk` enum in `Capability`
- Produces:
  - safe generic endpoint classification
  - no direct support claim for destructive actions

- [ ] **Step 1: Write the failing test**

在 generic HTTP target smoke 中，对 `/api/stop` 的当前断言改成安全期望：

```js
assert.ok(serviceManifest.source_scan.endpoint_coverage.some((item) => (
  item.method === "POST" && item.path === "/api/stop" && item.status !== "supported"
)));

assert.ok(capabilityMap.capabilities.some((capability) => (
  capability.id.includes("stop") && capability.risk === "destructive"
)));
```

如果决定直接不生成 capability，则改成：

```js
assert.ok(!capabilityMap.capabilities.some((capability) => capability.id.includes("stop")));
```

但全计划建议保留 capability、禁用直接执行、并标注 destructive。

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: FAIL because current generic analyzer marks `/api/stop` as supported write action.

- [ ] **Step 3: Write minimal implementation**

在 `src/commands/analyze.ts` 增加辅助函数：

```ts
function inferGenericEndpointRisk(endpoint: { method: string; path: string }): "read_only" | "write" | "destructive" {
  if (endpoint.method === "GET") return "read_only";
  if (endpoint.method === "DELETE") return "destructive";
  return /(stop|delete|reset|shutdown|drop|destroy)/i.test(endpoint.path) ? "destructive" : "write";
}

function genericEndpointStatus(endpoint: { method: string; path: string }): "supported" | "discovered_not_generated" {
  return inferGenericEndpointRisk(endpoint) === "destructive" ? "discovered_not_generated" : "supported";
}
```

并在 `endpoint_coverage` 和 `capabilities` 生成中使用该逻辑。

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: PASS; `/api/stop` is no longer presented as a directly supported action.

- [ ] **Step 5: Commit**

```bash
git add src/commands/analyze.ts tests/cli-smoke.test.mjs
git commit -m "fix: require review for risky generic HTTP actions"
```

---

### Task 4: 收紧 standalone runtime debug 默认值

**Files:**
- Modify: `src/commands/generate.ts`
- Modify: `src/commands/context.ts`
- Possibly Modify: `src/commands/readiness.ts`
- Test: `tests/runtime-local-e2e.test.mjs`

**Interfaces:**
- Consumes:
  - `runtimeEnvExample()` and `runtimeConfigTs()` in `src/commands/generate.ts`
  - health/debug assertions in `tests/runtime-local-e2e.test.mjs`
- Produces:
  - safe default host bind and debug gating

- [ ] **Step 1: Write the failing test**

在 `tests/runtime-local-e2e.test.mjs` 中将默认期望改为安全默认值：

```js
assert.equal(health.debugEnabled, false);
assert.equal(health.debugProtected, true);
```

并对 placeholder runtime / default runtime 的 env 断言收紧，例如要求默认 `HOST=127.0.0.1`、`ALLOW_DEBUG_WITHOUT_FEISHU=0`。

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/runtime-local-e2e.test.mjs
```

Expected: FAIL because current defaults are permissive.

- [ ] **Step 3: Write minimal implementation**

在 `src/commands/generate.ts` 修改生成默认值：

```ts
HOST=127.0.0.1
ALLOW_DEBUG_WITHOUT_FEISHU=0
```

并在 `runtimeConfigTs()` 中默认：

```ts
host: envValue("HOST", "127.0.0.1"),
allowDebugWithoutFeishu: parseFlag(envValue("ALLOW_DEBUG_WITHOUT_FEISHU", "0"), "ALLOW_DEBUG_WITHOUT_FEISHU"),
```

如果 runtime 当前把 debug 路由默认视为 enabled，则让其只在显式允许时启用，或至少在未配置时对外返回 403/disabled 状态。

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/runtime-local-e2e.test.mjs
```

Expected: PASS; runtime defaults are no longer permissive.

- [ ] **Step 5: Commit**

```bash
git add src/commands/generate.ts src/commands/context.ts src/commands/readiness.ts tests/runtime-local-e2e.test.mjs
git commit -m "fix: secure standalone runtime debug defaults"
```

---

## Self-review

- Spec coverage: covers Phase 1 delivery closure and safety requirements from the approved spec.
- Placeholder scan: every task includes exact files, code snippets, commands, and commit messages.
- Type consistency: uses existing `risk` enum values (`read_only`, `write`, `destructive`) and current command names.
