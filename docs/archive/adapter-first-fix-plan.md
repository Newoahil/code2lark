# Adapter-first 修复计划

记录时间：2026-07-03

本文档用于承接本轮 adapter-first 改造后的代码审查结论，把必须修复的问题、修复顺序、提交边界、验收标准和委派建议固定下来，便于后续多个 session 并行或串行执行。

## 1. 目标

当前 adapter-first 方向已经确立，但本轮代码推进后，仍存在若干会影响 embedded-adapter 正确性、验证可信度和用户引导路径的缺陷。

本计划目标是：

```text
先修 correctness / verification / guidance 问题
再处理模板重复导致的维护性风险
```

最终希望达到：

- embedded-adapter 模式下，验证目标、命令引导、字段映射、batch 参数校验都可靠；
- standalone/reference host 路径继续可用；
- adapter 与 verify 对字段命名、动作语义、宿主模式的理解保持一致；
- JS/TS 生成模板的漂移风险降低。

## 2. 本轮审查得到的关键问题

### P0-1：embedded verification 目标地址混用

**位置**：`src/commands/verify.ts`

**问题**：embedded 模式中，`hostRuntimeUrl` 被 `runtimeUrl` 覆盖或混用，导致检查和报告可能打到错误的服务。

**影响**：

```text
verify --mode embedded-adapter --host-runtime-url <host> --runtime-url <runtime>
```

时，embedded host 检查可能错误访问 standalone runtime，生成误导性 PASS/FAIL 报告。

---

### P0-2：batch 请求缺少本地 size 校验

**位置**：`src/commands/generate.ts` 生成的 adapter handler（TS / JS）

**问题**：单图路径已有 `validateSize(...)`，batch 路径 `buildBatchRequest()` 没有对 `param_batch_size` 执行同等校验。

**影响**：非法尺寸值会直接流入 `/api/batch`，造成下游错误，而不是在 adapter 层返回统一的红色失败卡片。

---

### P0-3：verify 与 adapter 的字段名映射规则不一致

**位置**：`src/commands/verify.ts` 与 `src/commands/generate.ts`

**问题**：verify 构造 form field name 时会把原始模板 key 规范化（例如 `hero-title` → `field_hero_title`），但 adapter 还原字段时只是简单裁掉 `field_` 前缀，无法还原原始 key。

**影响**：

- required field 校验误判；
- alternate-template 验证不可信；
- signed-action verify 结果可能是假失败；
- 模板字段含 `-`、空格、中文、点号、数字前缀时最容易出问题。

---

### P0-4：embedded package 仍输出 standalone 验证命令

**位置**：`src/commands/context.ts`，以及消费这些命令的 `readiness.ts` / `doctor.ts`

**问题**：当前 context template 仍然默认输出：

```text
verify . --runtime-url ... --simulate
verify . --runtime-url ... --level2
```

而不是 embedded-adapter 模式所需的：

```text
verify . --mode embedded-adapter ...
verify . --mode embedded-adapter --host-runtime-url ...
```

**影响**：用户即便生成的是 embedded 包，也会被 CLI / 文档引导去走 standalone 验证路径。

---

### P1-1：JS/TS adapter card 模板重复

**位置**：`src/commands/generate.ts`

`adapterCardsTs` / `adapterCardsJs` 大片重复，后续极易漂移。

---

### P1-2：JS/TS adapter handler 模板重复

**位置**：`src/commands/generate.ts`

`adapterHandlersTs` / `adapterHandlersJs` 也存在同样问题。

## 3. 修复阶段划分

### 第一阶段：correctness / guidance 修复

必须优先完成：

1. embedded verification 目标地址修复；
2. batch size 本地校验补齐；
3. 字段名映射统一；
4. embedded 命令引导修复。

### 第二阶段：模板重复治理

在 correctness 问题落地后，再处理：

5. `adapterCardsTs` / `adapterCardsJs` 重复；
6. `adapterHandlersTs` / `adapterHandlersJs` 重复。

## 4. 推荐执行顺序

严格按以下顺序推进：

```text
1. 修复 embedded verify 目标地址选择
2. 修复 batch size 本地校验缺失
3. 修复字段名映射不一致
4. 修复 embedded 命令引导
5. 再做模板去重重构
```

原因：

- 1/2/3/4 直接影响当前功能正确性和验收可信度；
- 5 属于后续维护性改善，不应阻塞 correctness 修复。

## 5. 任务拆解与验收标准

### 任务 A：修复 embedded verify 目标地址选择

**目标**：在 `--mode embedded-adapter` / `embedded` 下，只使用 `hostRuntimeUrl`；`runtimeUrl` 仅用于 standalone-runtime。

**建议改动**：

- `verifyCommand()` 中拆清 `hostRuntimeUrl` 与 `runtimeUrl`；
- embedded 分支调用：
  - `buildEmbeddedHostValidationChecks({ hostRuntimeUrl, ... })`
- `writeReports()` 对 embedded 分支传：
  - `hostRuntimeUrl` = 宿主地址；
  - `runtimeUrl` = 空值或 standalone-only 值；
- markdown report 应优先体现 `hostRuntimeUrl`，避免把 embedded 误标为 Runtime URL。

**验收标准**：

```bash
verify pkg --mode embedded-adapter \
  --host-runtime-url http://host:3978 \
  --runtime-url http://runtime:3978
```

时，所有 embedded host 检查都只访问 `http://host:3978`，报告中不再混淆。

**推荐提交边界**：单独一个 commit。

**建议 commit message**：

```text
fix: use host runtime url consistently in embedded verification
```

---

### 任务 B：给 batch 请求补本地 size 校验

**目标**：让 batch 表单与单图表单保持一致，非法 size 在 adapter 层直接失败。

**建议改动**：

- 在 TS / JS 生成的 `buildBatchRequest()` 中添加：

```ts
validateSize(size)
```

**验收标准**：

当提交：

```text
param_batch_size=1024*1024
```

或空值时：

- adapter 返回 failure card；
- 不调用 `/api/batch`；
- 错误提示风格与单图路径一致。

**推荐提交边界**：单独一个 commit。

**建议 commit message**：

```text
fix: validate batch size in generated adapter
```

---

### 任务 C：统一 verify 与 adapter 的字段名映射机制

**目标**：模板原始字段 key 与飞书表单字段名之间的映射成为单一来源，双向可恢复。

**建议改动**：

在生成时输出共享映射，例如：

```ts
export const templateKeyToFormField = { ... }
export const formFieldToTemplateKey = { ... }
```

然后：

- `cards.ts` 用 `templateKeyToFormField` 生成字段名；
- `handlers.ts` 用 `formFieldToTemplateKey` 还原原始模板 key；
- `verify.ts` 构造 formValue 时复用同样规则，而不是自己维护一套 `formFieldName()`。

**必须覆盖的边界 key**：

```text
hero-title
hero_title
主题
field.with.dot
1st-field
```

**验收标准**：

```text
模板 key → 表单字段名 → adapter 还原 → 原始模板 key
```

全程一致；required field 不再误判。

**推荐提交边界**：单独一个 commit。

**建议 commit message**：

```text
fix: share template field mapping between adapter and verifier
```

---

### 任务 D：修复 embedded package 的命令引导

**目标**：embedded-adapter 包中所有用户可见的命令都应指向正确模式。

**建议改动**：

- 让 `buildContextTemplate()` 感知 `integrationMode`；
- embedded mode 下输出：

```text
verify . --mode embedded-adapter
verify . --mode embedded-adapter --host-runtime-url ...
doctor . --mode embedded-adapter
```

- standalone mode 保持现有路径；
- 检查 `readiness.ts`、`doctor.ts`、`status.ts` 等是否消费这些命令模板并确保结果一致。

**验收标准**：

生成 embedded 包后，`context` / `readiness` / `doctor` / README 中不会再引导用户跑 standalone-runtime 验证路径。

**推荐提交边界**：单独一个 commit。

**建议 commit message**：

```text
fix: emit embedded-adapter verification guidance
```

---

### 任务 E：降低 JS/TS 模板重复

**目标**：降低未来 `cards.ts`/`cards.js` 和 `handlers.ts`/`handlers.js` 的漂移风险，但不改变对外行为。

**建议策略**：

#### E1. 先抽共享 card spec

例如：

```ts
buildStartCardSpec(...)
buildBatchCardSpec(...)
```

然后分别渲染成 TS / JS 模板。

#### E2. 再抽共享 handler spec

例如：

```ts
buildActionDispatchSpec(...)
buildAuditEventSpec(...)
```

#### E3. 如条件允许，进一步减少 JS/TS 双份业务逻辑

优先考虑“单一 TS 逻辑 + JS 派生”或“共享中间结构”，而不是继续手写两份完整模板。

**验收标准**：

- 增加一个 action / 字段 / 文案时，不需要在 4 个大模板里重复修改；
- standalone 行为不变；
- adapter 生成物行为不变。

**推荐提交边界**：单独一个 refactor commit，必须在 correctness 修复之后。

**建议 commit message**：

```text
refactor: reduce duplicated adapter template emitters
```

## 6. 推荐提交边界（必须遵守）

建议拆成以下提交：

```text
commit 1: fix: use host runtime url consistently in embedded verification
commit 2: fix: validate batch size in generated adapter
commit 3: fix: share template field mapping between adapter and verifier
commit 4: fix: emit embedded-adapter verification guidance
commit 5: refactor: reduce duplicated adapter template emitters
```

原则：

- 一个 correctness 修复一个 commit；
- 不要把多个问题混成一个“大杂烩修复”；
- refactor 与 bugfix 分开；
- 文档更新可以跟对应 bugfix commit 走，但不要跨问题捆绑。

## 7. session 派发建议

如果要派发给不同 session，建议：

### Session 1
负责：**任务 A**

理由：改动局部，风险低，先稳定 embedded verify 路径。

### Session 2
负责：**任务 B**

理由：单点业务校验，容易独立完成。

### Session 3
负责：**任务 C**

理由：这是最复杂、最容易引入新回归的问题，最好单独处理。

### Session 4
负责：**任务 D**

理由：主要涉及命令模板和文档/提示链路，适合单独推进。

### Session 5（最后）
负责：**任务 E**

理由：必须等前面 correctness 修复完成后再做，不然容易在重构里把问题隐藏掉。

## 8. 每个 session 的交付要求

每个 session 完成后，至少应交付：

1. 代码变更；
2. 简短改动说明；
3. 它所修复的问题编号（如 P0-1 / 任务 A）；
4. 它新增或更新了哪些验证路径；
5. 单独 commit（不要只停留在工作区）。

## 9. 合并前复核清单

在所有任务完成并准备合并前，应统一复核：

- embedded-adapter 验证不会打错服务；
- batch 非法 size 会在 adapter 层失败；
- 特殊模板字段 key 不会在 verify / adapter 中丢失；
- embedded package 的命令引导完全不再指向 standalone runtime；
- standalone/reference host 原有路径仍可用；
- `docs/project-status.md` / `docs/development-charter.md` / `docs/next-stage-adapter-migration-plan.md` 如有必要已同步。

## 10. 当前执行建议

如果你准备立刻派发 session，我建议的派发顺序是：

```text
先派 Session 1（任务 A）
再派 Session 2（任务 B）
再派 Session 3（任务 C）
再派 Session 4（任务 D）
最后派 Session 5（任务 E）
```

如果只能派 1 个 session，优先顺序是：

```text
C > A > D > B > E
```

因为：

- **任务 C（字段映射）** 最容易导致 verify 结果失真；
- **任务 A（host/runtime 混用）** 会让 embedded 验收检查错对象；
- **任务 D（命令引导）** 会把用户引到错误路径；
- **任务 B（batch size）** 是业务一致性问题；
- **任务 E（模板去重）** 重要，但不是立即 blocker。
