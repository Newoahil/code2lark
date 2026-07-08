# Code2Lark 泛用化下一阶段任务书

记录时间：2026-07-07

本文档承接 `image-agent-web` 的 MVP 验证结果：

- `self-hosted-runtime`（Python `feishu-host/`）已经在真实飞书长连接环境中完成了主链路验证；
- 长连接、`card.action.trigger`、Card JSON 2.0、异步 patch card、生成/迭代/批量/刷新已经被真实证明可行；
- 这意味着 Code2Lark 的“飞书宿主接入层”已经证明成立。

下一阶段的主目标，不再是继续证明“能否接飞书”，而是：

> **把当前深度绑定 `image-agent-web` 的业务映射逻辑，提升为真正可面向多个目标项目复用的 manifest-driven 能力。**

换句话说：

```text
通用飞书宿主接入层：已成立
目标服务业务映射层：仍然高度特化 image-agent-web
下一阶段：做业务映射层的泛用化
```

---

## 1. 本阶段总体目标

Code2Lark 下一阶段的核心目标：

> **从“为 image-agent-web 生成飞书接入产物”提升为“为任意具有清晰交互表面的目标应用生成飞书接入方案与宿主产物”。**

注意：

- **不是**再证明长连接 host 可行；这一层已经通过；
- **不是**继续优化卡片 patch 细节；
- **而是**让目标服务能力映射从单目标特化中解耦出来。

---

## 2. 当前泛用性现状（必须正视）

### 已经具备泛用价值的部分

这些已经被证明为“目标无关、可以复用”的宿主/平台层能力：

1. `host-mode-aware` 工作流：
   - `embedded-webhook`
   - `embedded-long-connection`
   - `standalone-runtime`
   - `self-hosted-runtime`
2. `feishu-host/` 长连接宿主生成（Python）
3. Card JSON 2.0 + `card.action.trigger` 回调链路
4. 长连接 callback → running card → patch card 模式
5. `verify` / `doctor` / `readiness` 的 host-mode-aware 验证框架
6. `required_permissions.json` / `permission_review.md` / 文档依赖图 / 飞书官方快照

### 仍然深度特化的部分

这些仍然被 `image-agent-web` 语义绑死：

1. **能力模型**：
   - `image.generate`
   - `image.iterate`
   - `image.batch`
2. **业务动作**：
   - `image.generate.submit`
   - `image.iterate.submit`
   - `image.batch.submit`
   - `image.batch.refresh`
3. **输入字段**：
   - `template_id`
   - `size`
   - `message`
   - 模板字段（`theme` / `selling_points` / `ad_copy` / `style_hint`）
4. **输出语义**：
   - `image_url`
   - `session_id`
   - `batch_id`
   - `downloadUrl`
5. **结果卡结构**：
   - 成功图卡
   - 迭代表单
   - 批量状态卡
   - 刷新按钮

所以现在 Code2Lark 还不能说：

```text
给我一个任意已有应用，我就能较稳定地自动生成飞书接入方案
```

它更准确的状态是：

```text
给我一个 image-agent-web 这类 HTTP 服务，我已经能把飞书宿主接入层和业务适配层一起证明通了；
但业务适配层还没有被抽象成真正的通用能力模型。
```

---

## 3. 下一阶段设计原则

### 原则 A：不碰已经成立的宿主层

这一阶段不要重写：

- `host-mode-aware` 结构
- `feishu-host/` 长连接宿主骨架
- Card JSON 2.0 / patch 模式
- Python self-hosted 宿主的长连接机制

这些已经是可复用底座。

### 原则 B：把泛用化集中到“能力映射层”

也就是让：

```text
manifest/
interaction_contract
adapter/handlers
adapter/service-client
cards/spec
```

从 `image-agent-web` 绑定中脱离。

### 原则 C：以“可接入表面”定义支持范围，不以语言限制

目标不是“支持 Python / Node / Go”，而是：

> **只要一个已有应用是可运行的，并且存在清晰的交互表面（HTTP API / CLI / SDK / 可桥接页面流程），Code2Lark 就应尽量为它生成飞书接入方案。**

自动化深度会因表面清晰度不同而变化，但目标定义不以语言为边界。

### 原则 D：默认保持最小侵入

默认仍然优先：

1. **模式 A：sidecar / gateway / 外置适配**
2. **模式 B：同仓模块化宿主化**

不把“直接深改目标项目核心代码”当成默认能力目标。

---

## 4. 本阶段要解决的根问题

### 4.1 `analyze` 现在是单目标硬编码

当前 `src/commands/analyze.ts` 的核心分析逻辑是：

```text
analyzeImageAgentWeb
```

它会直接读：

- `requirements.txt`
- `main.py`
- `templates.py`

并按 `image-agent-web` 的假设抽能力。

这意味着：

> `analyze` 还不是“通用服务分析器”，只是“image-agent-web 专用分析器”。

### 4.2 `generate` 现在是单目标业务模板

虽然 `generate.ts` 已经很强，但内部仍然大量写死：

- image.generate / iterate / batch
- image_url / session_id / batch_id
- 图片类成功卡和失败卡
- 特定表单字段和动作 id

这意味着：

> `generate` 目前不是“manifest-driven 通用生成器”，而是“读 manifest 但仍假定 manifest 来自 image-agent-web 这一类服务的生成器”。

### 4.3 契约模型还太窄

当前 `src/types.ts` 里：

```ts
trigger: "card_action"
result_mode: "interactive_card"
kind: "image_generation"
```

这些都还不够通用。

---

## 5. 下一阶段实施目标

### 目标 1：把 manifest 变成真正的一等中间表示

Code2Lark 的长期稳定点，不应该是某个目标项目，而应该是：

```text
manifest / capability_map / interaction_contract / required_permissions
```

这些 JSON 的 schema 必须升级成：

- 不绑定 `image_generation`
- 不绑定 `generate/iterate/batch`
- 不绑定固定输出字段（`image_url` / `session_id`）
- 能表达更一般的：
  - action
  - query
  - long-running task
  - artifact return
  - state update

### 目标 2：把 `generate` 拆成“通用壳 + 目标能力插件”

也就是：

```text
通用飞书宿主层
+ 通用适配器壳
+ 某个目标能力映射模板
```

而不是全部塞在一个 `image-agent-web` 业务模板里。

### 目标 3：引入第二个风格差异明显的目标项目

`image-agent-web` 不能再作为唯一样板。

建议第二个目标至少满足：

- 不以图片生成为核心；
- 最好是 CLI 或不同风格的 HTTP API；
- 让 Code2Lark 的 manifest / generate 被迫走出 image-agent-web 的舒适区。

只有这样，才能真正验证“泛用性”。

---

## 6. 任务分阶段

### Phase 0：冻结当前 image-agent-web 样板为回归锚点

**目标**：在进入泛用化前，把当前这条已经验证成功的路线固定成黄金样板。

#### C0.1 `Record image-agent-web self-hosted MVP as regression anchor`

更新文档：
- `docs/project-status.md`
- 新增 `docs/image-agent-web-mvp-verified-summary.md`

写明：
- self-hosted-runtime 已跑通：
  - 长连接
  - `card.action.trigger`
  - Card JSON 2.0
  - async running + patch
  - generate / iterate / batch / refresh / failure path
- 这是后续泛用化重构的回归基准。

**验收标准**：文档中明确列出已通过的宿主层行为，作为后续回归目标。

**提交建议**：
```text
Document image-agent-web self-hosted MVP as regression anchor
```

---

### Phase 1：重构类型与契约（去 image-agent-web 绑定）

**目标**：先从 TypeScript 类型系统和 JSON 契约上解耦，不直接改运行时。

#### C1.1 `Generalize capability and interaction contracts`

关键文件：
- `src/types.ts`

要做的事：
- 将 `Capability.kind` 从 `image_generation` 泛化，例如：
  - `task`
  - `query`
  - `artifact_generation`
  - `long_task`
- 将输出 artifacts 从图片专用表达，提升成更一般的 artifact / structured result 描述。
- `InteractionContract` 的 action / input / result 表达不再写死 `image.*` 语义。

**验收标准**：
- `types.ts` 不再以 `image_generation` 作为唯一 kind。
- 现有 image-agent-web manifest 仍能被表示。

**提交建议**：
```text
Generalize capability and interaction contracts
```

#### C1.2 `Version manifest schemas for generalized targets`

关键文件：
- `src/commands/analyze.ts`
- `src/commands/generate.ts`
- `src/types.ts`
- 生成的 JSON schema 文档（如有）

要做的事：
- 提升 schema version；
- 把 image 专用字段留在目标特化层，不留在总 schema 顶层。

**验收标准**：
- 旧样板仍能通过；
- 新 schema 能表达非图片类目标。

**提交建议**：
```text
Version manifests for generalized targets
```

---

### Phase 2：把 `generate` 拆成“宿主层模板 + 目标特化模板”

**目标**：不再让 `generate.ts` 直接把 image-agent-web 语义写满所有产物。

#### C2.1 `Extract generic host/runtime emitters`

关键文件：
- `src/commands/generate.ts`

要做的事：
- 把通用部分抽出来：
  - `feishu-host` 骨架
  - 长连接 wiring
  - 发卡/patch
  - 基础 card envelope
  - 校验/审计/verify hooks
- 让这些部分不依赖 `image.generate.submit` 等具体业务动作。

**验收标准**：
- `feishu-host` 框架本身不再直接引用 image-agent-web 专有 action 名。

**提交建议**：
```text
Extract generic self-hosted host emitters
```

#### C2.2 `Isolate image-agent-web mapping as a target-specific profile`

关键文件：
- `src/commands/generate.ts`
- 可能新增：`src/profiles/image-agent-web.ts`

要做的事：
- 把以下内容搬到目标特化 profile：
  - `image.generate.submit`
  - `image.iterate.submit`
  - `image.batch.submit`
  - `image.batch.refresh`
  - 对应 service client / cards / batch status / success card 逻辑
- 让 `generate.ts` 只是按 manifest 选择 profile/strategy。

**验收标准**：
- image-agent-web 样板仍通过；
- generate 主体不再直接堆满 image-agent-web 业务语义。

**提交建议**：
```text
Isolate image-agent-web mapping profile
```

---

### Phase 3：重构 `analyze`，让它不再只会 `analyzeImageAgentWeb`

**目标**：从“单目标分析器”走向“多策略分析器”。

#### C3.1 `Split analyze into strategy-based analyzers`

关键文件：
- `src/commands/analyze.ts`

要做的事：
- 把当前 `analyzeImageAgentWeb` 变成一种 strategy / adapter；
- 上层至少支持：
  - `http_api_python_image_agent_web`（现有）
  - `generic_http_api`
  - `generic_cli`（先空骨架也可以）

**验收标准**：
- analyze 不再只有一个主函数写死 image-agent-web。

**提交建议**：
```text
Split analyze into strategy-based analyzers
```

#### C3.2 `Implement a generic HTTP API analysis path`

目标：
- 对有明确 HTTP API/README/OpenAPI 的目标，至少能产出一个粗粒度 manifest，而不是直接失败。

这一步不要求一开始就很聪明，但要能形成：

```text
可观察接口
→ manifest 草稿
→ 交给 generate/profile 进一步处理
```

**验收标准**：
- 对一个非 image-agent-web 的 HTTP 服务样板，能产出可解析 manifest，而不是只会 image-agent-web。

**提交建议**：
```text
Add generic HTTP API analysis path
```

---

### Phase 4：引入第二个目标项目验证泛用性

**目标**：证明不是只对 image-agent-web 有效。

#### C4.1 `Validate a second target through the generalized workflow`

要求：
- 选一个风格明显不同于 image-agent-web 的目标：
  - 简单 CLI
  - 或不同风格 HTTP API
- 至少完成：
  - analyze
  - generate
  - verify/package validation
- 不要求一开始就做真实飞书 Level 2，但要证明生成器不会再只认 image-agent-web。

**验收标准**：
- 第二目标能进入生成/验证链路。

**提交建议**：
```text
Validate a second target through the generalized workflow
```

---

### Phase 5：再考虑 skill 形态

这一阶段之前，不要把“skill 化”当主任务。

当满足以下条件后，skill 形态才有意义：

1. `analyze` 已不是单目标硬编码；
2. `generate` 已 manifest-driven；
3. 至少两个风格不同的目标已跑通；
4. verify / doctor / handoff 能处理多目标、多宿主模式。

届时再加：

#### C5.1 `Expose Code2Lark as a Claude skill over the CLI core`

也就是：
- skill 做意图入口；
- CLI 做确定性内核；
- 运行期宿主仍然是生成产物，不是 skill 自己。

这一步不属于当前阶段。

---

## 7. 哪些必须先补，哪些可以后补

### 必须先补
1. `types.ts` / manifest 契约泛化
2. `generate.ts` 去 image-agent-web 绑定
3. `analyze.ts` 去单目标绑定
4. 第二目标验证

### 可以后补
1. `hybrid` 模式完整实现
2. 更多目标语言宿主模板（Go/Java/Node self-hosted）
3. 文档进一步细分为更多 mode-specific runbook

### 暂时不补
1. 群 @ / 私聊命令扩展
2. 多平台（Slack/企业微信）
3. 彻底重写所有模板体系
4. 全自动部署/平台化能力
5. “零人工接入任何程序”的不现实目标

---

## 8. 每个 commit 的门禁

- `npm run build` 通过
- `node --test tests/*.test.mjs` 全绿
- 不得回归 image-agent-web 当前已验证的 self-hosted-runtime 样板
- `verify --mode self-hosted-runtime --strict` 继续通过
- 工作树干净
- commit message 保持祈使句、首字母大写、无前缀

---

## 9. 当前阶段的完成定义

这一轮泛用化阶段完成时，Code2Lark 应达到：

1. 不再只能分析/生成 image-agent-web；
2. `manifest` 真正成为通用中间表示；
3. `generate` 拆成：
   - 通用宿主层
   - 目标特化 profile
4. 至少两个不同风格的目标能进入飞书化工作流；
5. image-agent-web 继续保持已验证的长连接 self-hosted-runtime 样板身份。

---

## 10. 一句话总结

> **下一阶段不是继续证明“能接飞书”，而是把已经跑通的飞书宿主接入层固定下来，然后把 image-agent-web 的业务映射从单目标实现，抽象成真正可复用的 manifest-driven 生成机制。**
