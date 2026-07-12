# Phase 2 Host-Mode And Card JSON Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 host mode、Card JSON 2.0、permissions/context/readiness/doctor 文案和 self-hosted Level 2 材料使用统一的模式语义，不再把 webhook 假设错误套用到 long-connection 或 self-hosted 场景。

**Architecture:** 先用测试锁定 long-connection/hybrid 卡片结构和 self-hosted 文案预期，再最小化调整 generator 模板和上下文生成逻辑。以 host mode 为事实源，避免同一 renderer 或同一模板隐式承担互斥语义。

**Tech Stack:** TypeScript/Node CLI, generated TS/JS/Markdown/JSON artifacts, Node `node:test`

## Global Constraints

- 不得引入新的 host capability、trigger type 或 platform target。
- 不得改变已验证的 image-agent-web Mode A / Mode B 部署测试事实。
- `generated/<target>-lark/` 是标准生成包与 source of truth。
- Mode A = external host / sidecar / gateway。
- Mode B = target-project embedded host module。
- `standalone-runtime` 仅是 reference/fallback host，不是主要产品形态。
- `self-hosted-runtime` 必须被描述为 generated host module，可外置运行，也可迁入目标项目。
- 所有模式定义、文档和代码行为必须与 `docs/development-charter.md` 一致。

---

## File Structure Impact

### Existing files to modify
- `src/commands/generate.ts`
  - generic card emitters, Level 2 template generation, runtime docs text.
- `src/commands/context.ts`
  - host-mode-aware context fields, runtime choices, callback wording.
- `src/commands/readiness.ts`
  - host-mode-aware readiness interpretation.
- `src/commands/doctor.ts`
  - host-mode wording in reports/gates if present.
- `src/commands/verify.ts`
  - embedded/self-hosted package validation wording and/or static checks.
- `tests/cli-smoke.test.mjs`
  - generated docs/template assertions.
- `tests/runtime-local-e2e.test.mjs`
  - generated adapter/runtime card structure assertions if required.

### Responsibility boundaries after this phase
- `generate.ts` → emits host-mode-specific cards, templates, and generated docs.
- `context.ts` / `readiness.ts` / `doctor.ts` → narrate the selected mode consistently.
- tests → prove the generated artifacts express the same model across modes.

---

### Task 1: 为 long-connection / hybrid 路径生成完整 Card JSON 2.0

**Files:**
- Modify: `src/commands/generate.ts`
- Test: `tests/cli-smoke.test.mjs`
- Test: `tests/runtime-local-e2e.test.mjs`

**Interfaces:**
- Consumes:
  - current card builder generation in `genericAdapterCardsTs/Js` and image-specific card emitters
  - current long-connection host-mode generation path
- Produces:
  - card payloads with explicit Card JSON 2.0 shape for long-connection/hybrid

- [ ] **Step 1: Write the failing test**

在 `tests/cli-smoke.test.mjs` 生成 `--mode embedded-adapter --host-mode embedded-long-connection` package 后，读取生成的 `adapter/cards.ts` 并断言包含 Card JSON 2.0 关键结构，例如：

```js
const longCards = fs.readFileSync(path.join(generatedLong, "adapter", "cards.ts"), "utf8");
assert.match(longCards, /schema:\s*["']2\.0["']/);
assert.match(longCards, /body:\s*\{/);
assert.match(longCards, /elements:/);
assert.match(longCards, /behaviors:/);
assert.match(longCards, /value:\s*\{\s*action:/);
```

如果 generic path 也走 long-connection，再补对应断言。

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: FAIL because current long-connection card output still reflects 1.0-era shape or mixed structures.

- [ ] **Step 3: Write minimal implementation**

在 `src/commands/generate.ts` 中为 long-connection/hybrid 分出单独 renderer，例如：

```ts
function buildCardShell(hostReceiveMode: HostReceiveMode, title: string, elements: Record<string, unknown>[]) {
  if (hostReceiveMode === "embedded-long-connection" || hostReceiveMode === "hybrid") {
    return {
      schema: "2.0",
      config: { wide_screen_mode: true },
      header: { template: "blue", title: { tag: "plain_text", content: title } },
      body: { elements },
    };
  }
  return {
    config: { wide_screen_mode: true },
    header: { template: "blue", title: { tag: "plain_text", content: title } },
    elements,
  };
}
```

并确保 callback button 使用 `behaviors[].value.action`。

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/cli-smoke.test.mjs
node --test tests/runtime-local-e2e.test.mjs
```

Expected: PASS; long-connection/hybrid generated cards now expose Card JSON 2.0 structure.

- [ ] **Step 5: Commit**

```bash
git add src/commands/generate.ts tests/cli-smoke.test.mjs tests/runtime-local-e2e.test.mjs
git commit -m "fix: emit Card JSON 2.0 for long-connection integrations"
```

---

### Task 2: 让 permissions/context/readiness/doctor 真正 host-mode-aware

**Files:**
- Modify: `src/commands/context.ts`
- Modify: `src/commands/readiness.ts`
- Modify: `src/commands/doctor.ts`
- Modify: `src/commands/generate.ts`
- Test: `tests/cli-smoke.test.mjs`

**Interfaces:**
- Consumes:
  - `buildContextTemplate()` in `src/commands/context.ts`
  - generated permission/context wording
  - host mode fields in generated package metadata
- Produces:
  - host-mode-aware callback/security/verification wording

- [ ] **Step 1: Write the failing test**

在 `tests/cli-smoke.test.mjs` 中针对 self-hosted 和 long-connection package 的生成文档增加断言：

```js
const selfHostedReadme = fs.readFileSync(path.join(generatedSelfHosted, "README.md"), "utf8");
assert.doesNotMatch(selfHostedReadme, /PUBLIC_CALLBACK_BASE_URL/);
assert.doesNotMatch(selfHostedReadme, /VERIFICATION_TOKEN/);
assert.match(selfHostedReadme, /card\.action\.trigger/);
assert.match(selfHostedReadme, /websocket/i);

const longContext = fs.readFileSync(path.join(generatedLong, "feishu_context.template.md"), "utf8");
assert.doesNotMatch(longContext, /Public callback URL: <PUBLIC_CALLBACK_BASE_URL>\/webhook\/card/);
assert.match(longContext, /card\.action\.trigger/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: FAIL because current docs/context still inherit webhook assumptions too broadly.

- [ ] **Step 3: Write minimal implementation**

在 `src/commands/context.ts` 与相关生成路径中，按 host mode 分流：

```ts
const usesWebhook = hostReceiveMode !== "embedded-long-connection" && hostReceiveMode !== "self-hosted-runtime";
const usesLongConnection = hostReceiveMode === "embedded-long-connection" || hostReceiveMode === "hybrid" || integrationMode === "self-hosted-runtime";
```

并确保：

- self-hosted 不再默认列出 `PUBLIC_CALLBACK_BASE_URL` / `VERIFICATION_TOKEN`
- embedded-long-connection 不再把 `/webhook/card` 写为强制前提
- hybrid 同时列出 webhook 和 long-connection 要求

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: PASS; generated docs/context now follow the selected host mode.

- [ ] **Step 5: Commit**

```bash
git add src/commands/context.ts src/commands/readiness.ts src/commands/doctor.ts src/commands/generate.ts tests/cli-smoke.test.mjs
git commit -m "fix: make generated permissions and context host-mode aware"
```

---

### Task 3: 生成 self-hosted 专用 Level 2 模板

**Files:**
- Modify: `src/commands/generate.ts`
- Test: `tests/cli-smoke.test.mjs`

**Interfaces:**
- Consumes:
  - `buildLevel2VerificationRecord(...)` in `src/commands/generate.ts`
  - self-hosted generation path already producing `feishu-host/`
- Produces:
  - self-hosted-specific `level2_verification_record.md`

- [ ] **Step 1: Write the failing test**

在 `tests/cli-smoke.test.mjs` 的 self-hosted generation 覆盖中新增断言：

```js
const selfHostedLevel2 = fs.readFileSync(path.join(generatedSelfHosted, "level2_verification_record.md"), "utf8");
assert.match(selfHostedLevel2, /feishu-host\/\.env/);
assert.match(selfHostedLevel2, /FEISHU_CONNECTION_MODE=websocket/);
assert.match(selfHostedLevel2, /card\.action\.trigger/);
assert.doesNotMatch(selfHostedLevel2, /bot-runtime\/\.env/);
assert.doesNotMatch(selfHostedLevel2, /PUBLIC_CALLBACK_BASE_URL/);
assert.doesNotMatch(selfHostedLevel2, /VERIFICATION_TOKEN/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: FAIL because self-hosted still falls into the wrong template branch.

- [ ] **Step 3: Write minimal implementation**

在 `buildLevel2VerificationRecord(...)` 中给 `integrationMode === "self-hosted-runtime"` 增加独立分支，返回类似：

```ts
if (integrationMode === "self-hosted-runtime") {
  return `# Level 2 Verification Record

- Runtime path: feishu-host/
- Required local env file: feishu-host/.env
- FEISHU_CONNECTION_MODE=websocket
- Event subscription: card.action.trigger
- Target base URL: ${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}
`;
}
```

并补充 self-hosted 所需 preflight / interaction / failure-path evidence checklist。

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/cli-smoke.test.mjs
```

Expected: PASS; self-hosted Level 2 file no longer references webhook-only prerequisites.

- [ ] **Step 5: Commit**

```bash
git add src/commands/generate.ts tests/cli-smoke.test.mjs
git commit -m "fix: generate self-hosted Level 2 verification guidance"
```

---

## Self-review

- Spec coverage: covers Phase 2 card/protocol/host-mode/template consistency from the approved spec.
- Placeholder scan: each task includes exact files, assertions, commands, and commit messages.
- Type consistency: uses existing `HostReceiveMode`, `integrationMode`, and generated artifact file names already present in the codebase.
