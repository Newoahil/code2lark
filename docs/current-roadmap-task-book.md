# Code2Lark 当前阶段总任务书（长任务版）

记录时间：2026-07-08

本文档用于派发一个**长任务 session**，目标不是继续修补 `image-agent-web` 的飞书接入细节，而是把当前已经验证成功的样板封存为基线，然后推动 Code2Lark 进入真正的泛用化阶段。

---

## 0. 当前阶段的客观前提

以下事实已经成立，不应再作为当前主任务继续反复证明：

1. `image-agent-web` 的 `self-hosted-runtime`（Python `feishu-host/`）已经在真实飞书环境中跑通：
   - 长连接 WebSocket
   - 新版 `card.action.trigger`
   - Card JSON 2.0
   - async running + patch card
   - generate / iterate / batch / refresh / failure path
2. 当前最大的已解决问题，不再是“飞书怎么接”，而是：
   - Code2Lark 的业务映射层仍深度绑定 `image-agent-web`
3. 因此下一阶段主线是：

```text
把 image-agent-web 这条成功样板固化为回归锚点
→ 再把 Code2Lark 从 image-agent-web 特化推进到 manifest-driven 泛用生成器
→ 再用第二个目标项目验证泛用性
```

---

## 1. 本长任务的目标

本任务分三大块：

### 目标 A：冻结 `image-agent-web` 为已验证样板
不再让它一边当实验对象、一边不断变化；把已通过的飞书宿主层行为固化为后续所有重构的回归锚点。

### 目标 B：把模式 A / 模式 B 正式产品化
也就是把“标准生成产物”和“落地形态”彻底说清楚，避免再混淆：
- 标准产物是什么；
- 模式 A（外置宿主）是什么；
- 模式 B（目标项目内增量模块）是什么；
- 当前 `image-agent-web` 实际属于哪种；
- Code2Lark 现在支持到什么程度。

### 目标 C：开始 manifest-driven 泛用化
把 `analyze` / `generate` / `types` 从 image-agent-web 单目标特化中解耦出来，为第二目标项目做准备。

最终里程碑：

> **Code2Lark 不再只是“为 image-agent-web 生成飞书接入产物的工具”，而开始具备“面向第二个风格不同项目也能工作”的能力。**

---

## 2. 长任务的执行顺序

建议严格按顺序推进：

```text
Phase 1：冻结 image-agent-web 样板
Phase 2：模式 A / 模式 B 产品化
Phase 3：manifest / types / generate / analyze 去 image-agent-web 化
Phase 4：选第二目标项目（calendar-stock-updater）做泛用性验证
```

不要先做第二目标验证，再回头补文档和模型定义。

---

## 3. Phase 1：冻结 `image-agent-web` 为回归锚点

### 目标
把当前 `image-agent-web` 这条样板从“实验中对象”提升为“已验证样板”。

### 要做的事

#### C1.1 `Document image-agent-web self-hosted MVP as regression anchor`

整理并入库（如果尚未完整）：
- `docs/image-agent-web-mvp-verified-summary.md`
- `docs/project-status.md`
- 必要时更新 `docs/mvp-1a-image-agent-web.md`

内容至少应明确：
- 长连接宿主已验证；
- `card.action.trigger` 已验证；
- Card JSON 2.0 已验证；
- async running / patch 已验证；
- generate / iterate / batch / refresh / failure path 已验证；
- 这条线路以后所有重构都必须回归通过。

### 验收标准
文档中能明确回答：
- 这条样板已经验证到什么程度；
- 哪些行为是回归基线；
- 以后任何泛用化改动都不能破坏它。

### 建议提交
```text
Document image-agent-web self-hosted MVP as regression anchor
```

---

## 4. Phase 2：模式 A / 模式 B 产品化

### 目标
不再口头澄清，而是在代码和文档里把 Code2Lark 的产物模型、接入模式正式固定下来。

### 要做的事

#### C2.1 `Document mode A and mode B as first-class delivery modes`

更新：
- `docs/development-charter.md`
- `docs/project-status.md`
- `README.md`

需要明确：

1. Code2Lark 的**标准产物**永远是：
   ```text
   generated/<target>-lark/
   ```
   这是 source of truth。

2. **模式 A：外置宿主 / sidecar / gateway**
   - 目标项目不动核心
   - 宿主在外部
   - 通过 HTTP/CLI/SDK 调目标服务
   - 当前 `image-agent-web` 已验证样板本质上就是这种落地

3. **模式 B：目标项目内增量宿主模块**
   - 仍保持最小侵入
   - 只是把生成包里的某些宿主模块迁入目标项目内部
   - 不是深改业务代码

4. `standalone-runtime` 是参考/兜底模式，不是主要产品形态。

### 验收标准
- 文档中不再混淆“生成产物”与“部署形态”；
- `image-agent-web` 当前实际属于哪种模式有明确结论；
- 模式 B 被正式定义为可支持目标，而不是模糊想法。

### 建议提交
```text
Document mode A and mode B as first-class delivery modes
```

---

#### C2.2 `Clarify self-hosted output as embeddable host module`

目标：
让当前 `feishu-host/` 目录不仅像一个独立宿主，也像一个**可迁入目标项目的宿主模块**。

做法：
- 不强制改目录名；
- 通过 README / integration guide / runbook 说明：
  - 哪些文件必须迁入；
  - 如果模式 B 迁入目标项目，建议落在什么目录；
  - `.env` 配置怎么迁移；
  - 启动脚本怎么迁移。

如果觉得有必要，也可以加一份：
- `docs/embedded-into-target-app-guide.md`

### 验收标准
- 任何人读文档后都能清楚：`feishu-host/` 不只是独立运行目录，也可以作为目标项目内增量模块迁入。

### 建议提交
```text
Clarify self-hosted output as embeddable host module
```

---

## 5. Phase 3：manifest-driven 泛用化（核心技术主线）

### 目标
真正把 Code2Lark 从 image-agent-web 特化中解耦。

### 要做的事

#### C3.1 `Generalize capability and interaction contracts`

关键文件：
- `src/types.ts`

要做：
- 去掉 `image_generation` 作为唯一能力 kind 的地位；
- 把 capability kind 泛化为：
  - action
  - query
  - artifact_generation
  - long_task
  - 保留 image-generation 作为一个具体 profile 可用 kind
- `InteractionContract` 不再只适合 `image.*` 语义。

### 验收标准
- `types.ts` 能表达现有 image-agent-web，也能表达一个不以图片生成 为核心的第二目标；
- 旧 manifest 能兼容或平滑升级。

### 建议提交
```text
Generalize capability and interaction contracts
```

---

#### C3.2 `Version manifest schemas for generalized targets`

关键文件：
- `src/types.ts`
- `src/commands/analyze.ts`
- `src/commands/generate.ts`

要做：
- schema version 明确化（当前 `0.2` 基础上继续规范）；
- 保证 image-agent-web 旧样板仍可跑；
- 不把 image 专用字段当成通用 schema 顶层事实。

### 验收标准
- 旧 image-agent-web 样板仍能生成/验证；
- 新 schema 能表达非图片类服务的 manifest 草稿。

### 建议提交
```text
Version manifests for generalized targets
```

---

#### C3.3 `Extract generic host and adapter emitters`

关键文件：
- `src/commands/generate.ts`

要做：
- 把已经证明通用的部分抽离：
  - `feishu-host` 长连接宿主骨架
  - Card 2.0 / patch / running card 模式
  - 基础 adapter 壳
  - 验证/doctor/readiness 的通用宿主感知逻辑
- 避免在这些层里继续直接写 `image.generate.submit` 等具体业务语义。

### 验收标准
- `generate.ts` 主体不再直接堆满 image-agent-web 的业务假设；
- 当前样板仍通过回归。

### 建议提交
```text
Extract generic host and adapter emitters
```

---

#### C3.4 `Isolate image-agent-web mapping profile`

关键文件：
- `src/profiles/image-agent-web.ts`
- `src/commands/generate.ts`

要做：
- 把 image-agent-web 的专有内容完全隔离到 profile：
  - generate / iterate / batch / refresh action ids
  - success/failure/batch cards 的业务内容
  - image_url/session_id/batch_id/downloadUrl
- `generate` 只通过 manifest / profile 路由，不再直接了解 image-agent-web 细节。

### 验收标准
- `generate` 主体里 image-agent-web 痕迹明显减少；
- `src/profiles/image-agent-web.ts` 成为目标特化层；
- 样板回归通过。

### 建议提交
```text
Isolate image-agent-web mapping profile
```

---

#### C3.5 `Split analyze into strategy-based analyzers`

关键文件：
- `src/commands/analyze.ts`

要做：
- 不再只有 `analyzeImageAgentWeb`；
- 拆成：
  - `http_api_python_image_agent_web`
  - `generic_http_api`
  - `generic_cli`（先 skeleton 也可以）
- analyze 上层按策略选择，不再单目标硬编码。

### 验收标准
- `analyze.ts` 结构上不再是单函数特化；
- 对 image-agent-web 仍走原策略；
- 可以明确看到 generic analyzer 的入口。

### 建议提交
```text
Split analyze into strategy-based analyzers
```

---

#### C3.6 `Add generic HTTP API analysis path`

关键目标：
给一个不是 image-agent-web 的 HTTP 服务，也至少能产出一个粗粒度 manifest，而不是直接失败。

要求：
- 不一定完美；
- 但至少能识别：
  - endpoints
  - method
  - path
  - 粗粒度 input/output
- 后续交给 generate / profile 路由。

### 验收标准
- 第二目标项目能走通 analyze → 产出 manifest。

### 建议提交
```text
Add generic HTTP API analysis path
```

---

## 6. Phase 4：第二目标项目验证（推荐 `calendar-stock-updater`）

### 为什么选它
相较于 `image-agent-web`：
- 不是图片生成
- 更像“任务触发 / 状态跟踪 / 长任务控制”
- 适合验证泛用 manifest 和 card interaction 是否真的独立于 image-domain

### 要做的事

#### C4.1 `Validate calendar-stock-updater through the generalized workflow`

最小目标：
- `analyze`
- `generate`
- `verify` / package validation

不强求立刻做真实飞书 Level 2，但要证明：

> 它已经不是只能服务 image-agent-web 的工具了。

### 验收标准
- `calendar-stock-updater` 能进入新的泛用工作流；
- 生成结果不再依赖图片领域假设才能成立；
- image-agent-web 样板仍不回归。

### 建议提交
```text
Validate calendar-stock-updater through the generalized workflow
```

---

## 7. 这一阶段不做什么

这轮长任务里明确**不做**：

- 继续扩展更多消息触发（群 @ / 私聊命令）
- Slack / 企业微信等多平台
- 全自动部署
- skill 交付形态
- 第三个外部项目
- 对 image-agent-web 继续做宿主层功能增强

原因：
当前最关键的是**业务映射层的泛用化**，不是入口层的再包装。

---

## 8. 每个 commit / 阶段门禁

- `npm run build` 通过
- `node --test tests/*.test.mjs` 全绿
- `verify --mode self-hosted-runtime --strict` 对 `image-agent-web` 样板继续通过
- 真实宿主链路已证明的行为不回归
- 文档中的模式定义和代码行为一致
- 工作树干净

---

## 9. 这一阶段的完成定义

当以下都成立时，说明当前阶段完成：

1. `image-agent-web` 样板被正式封存为回归基线；
2. 模式 A / B 在文档和产物语义上正式产品化；
3. `types` / manifest / generate / analyze 都不再深度绑定 image-agent-web；
4. `calendar-stock-updater` 能进入新的泛用工作流；
5. 我们可以合理地说：

> Code2Lark 已经从“围绕一个样板修出来的飞书接入器”，进入“真正开始泛用化的接入生成器”阶段。

---

## 10. 一句话总结

> **本长任务的意义，不是继续把 image-agent-web 做得更好，而是把它固定为回归锚点，然后把 Code2Lark 的业务映射层从单目标实现抽成 manifest-driven 泛用机制，并用 `calendar-stock-updater` 作为第二目标证明这件事。**
