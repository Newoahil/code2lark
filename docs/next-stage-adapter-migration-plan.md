# 下一阶段开发计划：Adapter-first 迁移

记录时间：2026-07-02

本文档承接 `docs/development-charter.md`，把 adapter-first 总纲领拆成下一阶段可执行任务。目标是把当前以 `bot-runtime` 为核心的生成物，迁移为以 `adapter/` 为核心、`standalone-runtime` 为可选包装器的结构，同时尽量保持现有 MVP 行为不破坏。

## 阶段目标

下一阶段目标不是新增更多飞书交互形态，而是完成架构纠偏：

```text
当前：generate → bot-runtime 内含业务逻辑
目标：generate → adapter 内含业务逻辑 + standalone-runtime 引用 adapter
```

完成后，项目应支持：

1. 继续生成可独立运行的 standalone runtime（兼容已有本地验证路径）；
2. 同时生成可嵌入用户已有飞书 SDK 服务的 adapter；
3. 文档明确告诉用户如何选择 embedded adapter 或 standalone runtime；
4. verify / doctor 至少能区分 package validation 与 runtime/host validation 的边界。

## 任务 0：确认宿主飞书服务接口形态

**目的**：避免凭空设计 adapter API。

需要确认用户已有飞书 SDK 服务的实际形态：

- 使用的语言和 SDK 版本；
- 当前如何注册 card action callback；
- callback handler 收到的数据结构；
- 是否已有图片上传封装；
- 是否已有 message update 封装；
- 是否已有 audit/logging；
- 是否已有 health/debug/simulate endpoint；
- 配置如何注入（env/config file/DI）；
- TypeScript adapter 是否能直接复用，还是需要生成语言无关 JSON + TS 示例。

**输出**：一份简短记录，可写入 `docs/existing-feishu-host-notes.md` 或补充到后续开发文档。

**验收标准**：能明确 adapter handler 的预期函数签名和宿主需要注入的依赖。

**建议提交**：docs-only commit。

## 任务 1：冻结当前 generated runtime 行为作为回归基线

**目的**：重构前先锁住当前可工作的行为。

操作：

- 记录当前 generated runtime 的关键能力：generate / iterate / batch / batch-refresh / failure-card / duplicate guard / operator allowlist / debug token；
- 确认可通过现有 `verify --simulate` 或本地 CLI 表面观察复核；
- 不在本任务中改结构。

**输出**：更新 `docs/project-status.md` 或新增 `docs/runtime-baseline-before-adapter.md`。

**验收标准**：后续抽 adapter 时，可以逐项对照“不应丢失哪些行为”。

**建议提交**：docs-only commit。

## 任务 2：在生成包中新增 `adapter/` 目录，但暂不移除 `bot-runtime`

**目的**：先引入核心产物，不破坏现有 standalone 路径。

建议生成文件：

```text
generated/image-agent-web-lark/adapter/
  cards.ts
  image-agent-client.ts
  handlers.ts
  validation.ts
  types.ts
  audit-events.ts
```

第一步可以允许 adapter 与 bot-runtime 暂时有部分重复逻辑，但应控制范围：

- 优先抽出纯业务逻辑；
- 不抽 HTTP server；
- 不抽 `.env` 读取；
- 不抽 `CardActionHandler` 初始化；
- 不抽 `/debug/*` route。

**输出**：`generate` 命令生成新的 `adapter/` 文件。

**验收标准**：

- 生成包中出现 `adapter/`；
- adapter 文件可以被 TypeScript 编译；
- 当前 `bot-runtime` 仍可按原路径工作；
- README / START_HERE 提到 adapter 是核心产物。

**建议提交**：单独实现 commit。

## 任务 3：让 `bot-runtime` 改为引用 `adapter/`

**目的**：消除业务逻辑双实现，让 standalone runtime 变成 adapter 的包装器。

重构方向：

```text
adapter/
  build cards
  parse form values
  validate inputs
  call image-agent-web
  produce result card + audit events

bot-runtime/
  load env
  create Feishu client
  expose HTTP routes
  run CardActionHandler
  call adapter handlers
  write audit.log
  expose debug endpoints
```

**重点**：行为不变，只改分层。

**验收标准**：

- `bot-runtime` 的 generated `index.ts` 不再包含核心 generate/iterate/batch 业务实现；
- `bot-runtime` 调用 adapter handler；
- 现有本地模拟路径仍能观察到同样的结果；
- 失败卡片、operator allowlist、duplicate guard 的归属被明确：
  - operator allowlist：adapter 或 wrapper 均可，但要有清晰边界；
  - duplicate guard：更偏 wrapper/host runtime，adapter 不应强依赖内存 Map；
  - audit 写入：wrapper 负责，adapter 只返回 audit events。

**建议提交**：单独重构 commit，避免混入新功能。

## 任务 4：新增 embedded integration guide

**目的**：让用户已有飞书 SDK 服务知道如何接入 adapter。

生成文档：

```text
generated/image-agent-web-lark/docs/integration_guide.md
```

内容应包括：

- adapter 文件说明；
- handler 函数签名；
- 宿主服务必须注入的依赖；
- 如何在已有 `CardActionHandler` 中调用 adapter；
- 需要的飞书权限；
- 图片上传由谁负责；
- audit events 如何落地；
- 如何处理错误卡片；
- 如何做真实 Level 2 验收。

**验收标准**：一个已有飞书 SDK 服务的维护者只看该文档，就能知道接入步骤。

**建议提交**：docs + generator output change commit。

## 任务 5：引入 `integration_mode`

**目的**：让生成器明确区分嵌入模式与独立运行模式。

建议先支持 CLI option：

```bash
lark-deployer generate <workspace> --mode embedded-adapter
lark-deployer generate <workspace> --mode standalone-runtime
```

初始默认建议：

```text
standalone-runtime  # 为兼容当前测试和用户已有生成流程
```

但 README / charter 中标明战略默认是 embedded adapter。

后续可切换默认值。

**输出差异**：

- `embedded-adapter`：生成 `adapter/` + docs + manifest，不强制生成完整 `bot-runtime`；
- `standalone-runtime`：生成 `adapter/` + `bot-runtime/` wrapper。

**验收标准**：两种 mode 都能生成清晰结构；`--help` 中说明 mode 选项。

**建议提交**：单独 feature commit。

## 任务 6：调整 `verify` / `doctor` 的边界

**目的**：避免所有验收都假设 generated `bot-runtime` 存在。

建议拆分检查：

### Package validation

```bash
lark-deployer verify <generated-package> --mode embedded-adapter
```

检查：

- manifest 存在且可解析；
- adapter 文件存在；
- interaction_contract action id 与 handler 支持项一致；
- required_permissions 与 interaction_contract 一致；
- integration guide 存在；
- level2 record 存在。

### Host validation

```bash
lark-deployer verify <generated-package> \
  --mode embedded-adapter \
  --host-runtime-url http://127.0.0.1:3978
```

检查：

- 宿主 health endpoint（如果指定）；
- 宿主 callback simulation endpoint（如果指定）；
- 若没有 debug endpoint，生成手动 checklist，不直接 FAIL。

**验收标准**：embedded mode 不再因为缺少 `bot-runtime/.env` 或 `/debug/*` 自动失败。

**建议提交**：单独 verification commit。

## 任务 7：更新 README 与旧文档表述

**目的**：清除“bot-runtime 是主产物”的旧叙述。

需要更新：

- `README.md`；
- `docs/project-status.md`；
- `docs/archive/development-direction.md`；
- `docs/mvp-1a-image-agent-web.md` 中与生成 runtime 相关的表述；
- 交接文档中增加 embedded adapter 路径。

注意不要删除 standalone runtime 的说明，而是重新定位为 optional reference host。

**验收标准**：用户读文档时不会误解 Lark-deployer 必须部署新 bot 服务。

**建议提交**：docs commit，可与任务 4 合并，但不要和核心重构混在一起。

## 任务 8：用用户已有飞书 SDK 服务做真实集成验证

**目的**：证明 adapter-first 方向真正符合使用场景。

前置：任务 0-6 完成。

验证路径：

```text
已有飞书 SDK 服务
→ 接入 generated adapter
→ 飞书卡片点击
→ adapter 调 image-agent-web
→ 飞书返回结果卡片
→ 填写 Level 2 证据
```

**验收标准**：

- 不启动 generated standalone runtime；
- 用户已有服务收到真实飞书回调；
- adapter 完成 generate / iterate / batch 至少主路径；
- `level2_verification_record.md` 填入真实证据；
- `doctor` 或新的 embedded gate 能正确表达完成状态。

**建议提交**：验证文档 commit，不提交真实敏感值。

## 非目标（本阶段不做）

本阶段不要做：

- 群 @ 命令；
- 私聊命令；
- 长连接模式；
- 多平台（Slack/企业微信）；
- 自动部署；
- 改写 image-agent-web；
- 彻底删除 standalone runtime；
- 一次性重写 `generate.ts` 全部模板体系。

## 推荐执行顺序

```text
0. 确认已有飞书 SDK 服务接口形态
1. 冻结当前 runtime 行为基线
2. 生成 adapter/ 目录
3. bot-runtime 引用 adapter
4. 生成 embedded integration guide
5. 增加 integration_mode
6. 调整 verify / doctor embedded 边界
7. 更新 README/旧文档
8. 用已有飞书服务做真实 Level 2
```

## 推荐提交边界

```text
commit 1: docs: add adapter-first charter and next-stage plan
commit 2: docs: record existing Feishu host shape
commit 3: generate: emit adapter package alongside bot-runtime
commit 4: runtime: wrap generated adapter from standalone runtime
commit 5: generate: add embedded integration guide
commit 6: generate: add integration mode option
commit 7: verify: support embedded adapter package validation
commit 8: docs: update README and MVP docs for adapter-first
commit 9: docs: record embedded Level 2 verification evidence
```

## 风险控制

- 每一步都保持现有 standalone runtime 可用，直到 embedded adapter 验证通过。
- 不在同一个提交里同时做目录重构、行为修改和文档大改。
- adapter handler API 先基于用户已有飞书服务真实形态设计，不凭空抽象。
- package validation 和 host validation 分开，避免把“用户没有 debug endpoint”误判为 adapter 失败。
- 真实飞书证据文档只记录安全摘要，不提交 secret、chat id、operator open id 原值。
