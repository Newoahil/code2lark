# calendar-stock-updater Mode B 一键启动长连接改造任务书

记录时间：2026-07-14
状态：已批准，待执行

## 0. 任务结论与目标

`calendar-stock-updater` 当前已经完成 Code2Lark 的 **Mode A** 改造与验证：

```text
Mode A
+ embedded-adapter
+ embedded-long-connection 接入契约
```

该成果保留为 Mode A 基线，不再回头修改或重做。

本任务的新目标是：从原始 `calendar-stock-updater` 创建一份**全新的 Mode B replay 副本**，把 Code2Lark 的飞书能力作为一个目标项目内的独立增量模块迁入，并提供统一启动入口。

目标用户体验是：

```text
复制 .env.example 为 .env
→ 用户填写一次飞书和目标服务配置
→ 执行一个启动命令
→ 原业务服务与飞书长连接模块共同启动
→ 模块自动订阅 card.action.trigger
→ 用户可在飞书中通过卡片驱动 calendar 服务
```

本任务完成的是工程改造、本地验证和人工联调准备；**真实飞书发卡、点击和 Level 2 证据由用户后续人工执行，不计入本任务完成条件。**

---

## 1. 实验对象与目录边界

### 原始参考项目：只读

```text
C:\works\calendar-stock-updater
```

规则：

- 不在原始项目中写入 C2L 生成物、`.env`、宿主模块或实验配置；
- 不将 replay 过程中的修复回写到原始项目；
- 原始项目只用于复制和行为对比。

### 新的 Mode B 实验对象

```text
C:\works\calendar-stock-updater-mode-b-replay
```

创建方式：

```text
C:\works\calendar-stock-updater
→ C:\works\calendar-stock-updater-mode-b-replay
```

复制规则：

- 不复制原项目的真实 `.env`、node_modules、运行日志、临时文件或本地凭据；
- replay 的 `.env` 只能由其自己的 `.env.example` 初始化；
- replay 必须先能在没有飞书模块时按原项目方式独立启动和通过自身测试。

---

## 2. Mode B 产品定义

本任务的 Mode B 不是把飞书 SDK 逻辑散落进业务核心文件。

本任务的 Mode B 是：

```text
目标项目内部
+ 一个独立 integrations/lark/ 增量模块
+ 统一项目启动入口
+ Feishu SDK websocket 长连接
+ card.action.trigger
+ 调用 Code2Lark 生成的 generic adapter
```

推荐的目标目录结构：

```text
calendar-stock-updater-mode-b-replay/
  package.json
  .env.example
  server.js                    # 原业务服务，保持业务职责
  ...原项目文件

  integrations/
    lark/
      app.js                   # 启动长连接模块
      config.js                # 加载和校验 Lark 配置
      host.js                  # Feishu SDK 生命周期与事件路由
      package.json             # 若项目依赖边界要求独立依赖
      .env.example             # 仅在根 .env 不适用时保留
      generated/               # 由 C2L 产出的 adapter / manifest / docs
        adapter/
        manifest/
        docs/
        sidecar-long-connection/
      README.md                # 模块使用和人工联调说明
```

允许调整目录名称以符合原项目惯例，但必须满足：

- 飞书模块是一个可独立理解、可整体删除的目录；
- 业务核心不直接 import 飞书 SDK；
- C2L 生成的 adapter 仍是业务映射的 source of truth；
- 不手工重写 `handleGenericHttpCardAction()` 的业务映射。

---

## 3. 长连接原则

飞书接入采用官方推荐的长连接优先策略：

```text
Mode B
+ embedded-adapter
+ embedded-long-connection
```

必须使用：

```text
Feishu SDK websocket 长连接
card.action.trigger
```

本任务默认不引入：

```text
PUBLIC_CALLBACK_BASE_URL
/webhook/card
VERIFICATION_TOKEN
公网 webhook callback
```

除非用户在未来明确要求 webhook fallback。

---

## 4. 统一配置设计

用户只应填写一个项目级配置文件：

```text
calendar-stock-updater-mode-b-replay/.env
```

必须提供：

```text
calendar-stock-updater-mode-b-replay/.env.example
```

最小配置项：

```dotenv
# Feishu long-connection host
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_CONNECTION_MODE=websocket
TEST_CHAT_ID=

# Calendar target reachable from integrations/lark
TARGET_BASE_URL=http://127.0.0.1:3069
TARGET_TIMEOUT_MS=120000

# Optional group-operation guard
ALLOWED_OPERATOR_OPEN_IDS=
```

要求：

- 不把真实 secret 写入 Git、README、任务书、测试快照或 handoff 包；
- 用户配置只存在于 replay 项目被 `.gitignore` 覆盖的 `.env`；
- host 模块必须在启动时校验：
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET`
  - `FEISHU_CONNECTION_MODE=websocket`
  - `TARGET_BASE_URL`
- 如缺少真实飞书凭据，本地业务服务仍可独立启动；长连接模块必须提供清晰、非敏感的配置缺失错误。

---

## 5. 统一启动入口

### 目标

用户执行一个命令后，业务服务和 Lark 长连接模块一起启动。

推荐外部接口：

```powershell
npm run start:lark
```

如原项目已有合适的 production 启动命令，也可以采用：

```powershell
npm start
```

但必须在 README 和 package scripts 中明确说明其会同时启动：

```text
1. calendar 原业务服务
2. integrations/lark 长连接 host
```

### 启动实现规则

- 不得把飞书 SDK wiring 写进 `server.js` 等核心业务文件；
- 可以在根 `package.json` 中加入并发启动脚本，或新增专门的 launcher；
- 若采用并发启动工具，必须明确依赖、退出行为和日志前缀；
- 任一子进程异常退出时，统一启动入口必须以非零退出并清理另一个子进程；
- 长连接模块启动前必须等待或重试目标 API 可达性；
- 启动日志必须清晰区分：
  - `calendar service ready`
  - `lark long connection starting`
  - `lark long connection online`
  - 配置缺失或目标不可达错误。

---

## 6. C2L 生成与迁入流程

### Phase 1：建立干净 replay 基线

1. 复制原始 cal 项目到 Mode B replay 目录；
2. 清理真实 `.env`、node_modules、日志、临时目录；
3. 使用 `.env.example` 初始化空白 `.env`；
4. 在未添加 Lark 模块前验证 replay 原业务服务可独立运行；
5. 记录原始项目与 replay 业务核心文件的基线差异。

验收：

- replay 独立启动；
- replay 原有测试通过；
- 原项目保持无修改；
- replay 不含复制过来的真实凭据。

建议提交：

```text
Create calendar Mode B replay baseline
```

### Phase 2：生成 generic long-connection adapter package

对 replay 副本 fresh analyze：

```powershell
node dist\index.js analyze `
  "C:\works\calendar-stock-updater-mode-b-replay" `
  --base-url http://127.0.0.1:3069 `
  --out out\calendar-stock-updater-mode-b-replay `
  --name calendar-stock-updater
```

生成 embedded long-connection package：

```powershell
node dist\index.js generate `
  out\calendar-stock-updater-mode-b-replay `
  --out generated\calendar-stock-updater-mode-b-lark `
  --mode embedded-adapter `
  --host-mode embedded-long-connection
```

验收：

```powershell
node dist\index.js verify `
  generated\calendar-stock-updater-mode-b-lark `
  --mode embedded-adapter `
  --host-mode embedded-long-connection `
  --strict
```

必须通过。

建议提交：

```text
Generate calendar Mode B long-connection adapter package
```

### Phase 3：迁入生成产物并实现项目内 host module

将以下生成物迁入 replay：

```text
generated/calendar-stock-updater-mode-b-lark/adapter/
generated/calendar-stock-updater-mode-b-lark/manifest/
generated/calendar-stock-updater-mode-b-lark/docs/
generated/calendar-stock-updater-mode-b-lark/sidecar-long-connection/
```

迁入到：

```text
calendar-stock-updater-mode-b-replay/integrations/lark/generated/
```

然后新增项目内 host module，职责限定为：

1. 读取 replay 根 `.env`；
2. 建立 Feishu SDK websocket 长连接；
3. 订阅 `card.action.trigger`；
4. 标准化事件为 generated adapter context：
   - `action`
   - `formValue`
   - `operatorOpenId`
   - `openMessageId`
   - `openChatId`
5. 调用：

```js
handleGenericHttpCardAction(context, {
  targetBaseUrl,
  timeoutMs,
  allowedOperatorOpenIds,
})
```

6. 使用 generated `buildStartCard()` 发送起始卡；
7. 将 adapter 返回的 card 作为飞书动作结果或后续消息更新内容；
8. 记录脱敏的结构化审计日志。

验收：

- 原业务核心只保留自身 HTTP/API 职责；
- `integrations/lark/` 可独立被理解和移除；
- 模块不重写 generic endpoint/action 映射；
- 宿主 event flow 在本地 mock / contract 环境中可观察。

建议提交：

```text
Embed calendar Lark long-connection host module
```

### Phase 4：统一启动和本地集成验证

新增统一启动命令后，用户只需：

```powershell
Copy-Item .env.example .env
npm run start:lark
```

本地验证至少覆盖：

```text
统一启动入口启动业务服务
统一启动入口启动 Lark host
目标 GET /api/state 可被 host 访问
sidecar/host contract 可调用 http.get.api.state.submit
reviewed http.post.api.run.submit 的失败或安全路径不会留下任务运行状态
非法 action 返回 failure card
配置缺失时 Lark host 清晰失败且业务服务行为可预期
停止统一启动入口时两个进程都退出
```

验收命令按项目实际 scripts 固化，并至少包括：

```powershell
npm run start:lark
node integrations\lark\generated\sidecar-long-connection\local-contract-test.mjs
```

以及 C2L package validation：

```powershell
node "C:\works\Lark-deployer\dist\index.js" verify `
  integrations\lark\generated `
  --mode embedded-adapter `
  --host-mode embedded-long-connection `
  --strict
```

建议提交：

```text
Add unified calendar and Lark host startup
```

### Phase 5：人工联调包准备

本阶段不做真实飞书联调，但必须让人工不需要猜测后续操作。

必须生成或更新：

```text
calendar-stock-updater-mode-b-replay/integrations/lark/README.md
calendar-stock-updater-mode-b-replay/integrations/lark/.env.example
calendar-stock-updater-mode-b-replay/integrations/lark/generated/level2_verification_record.md
```

人工后续操作应固定为：

```powershell
Copy-Item .env.example .env
# 填 FEISHU_APP_ID、FEISHU_APP_SECRET、TEST_CHAT_ID 等
npm run start:lark
```

之后人工在飞书后台和测试群完成：

```text
1. 启用机器人能力
2. 配置长连接
3. 订阅 card.action.trigger
4. 启动项目
5. 发送起始卡
6. 点击 GET /api/state
7. 点击经过批准的 POST /api/run
8. 填写脱敏 Level 2 证据
```

建议提交：

```text
Docs: prepare calendar Mode B long-connection handoff
```

---

## 7. 本任务不等同于真实飞书验收

本任务完成后，允许表述：

> `calendar-stock-updater` 的 Mode B 项目内长连接模块、统一启动入口、配置模板、本地验证和人工联调材料已完成；用户填写 `.env` 后可以启动服务，等待真实飞书联调。

本任务完成后，不允许表述：

> `calendar-stock-updater` 已完成真实飞书长连接验证。

真实飞书联调仍需要用户提供：

```text
FEISHU_APP_ID
FEISHU_APP_SECRET
TEST_CHAT_ID
飞书应用权限
card.action.trigger 长连接订阅
```

这些不得提交到 Git、任务书或 shared handoff 包中。

---

## 8. 最终完成定义

以下全部成立，才算本 Mode B 改造任务完成：

1. 原始 `C:\works\calendar-stock-updater` 未被修改；
2. 新 replay 副本位于 `C:\works\calendar-stock-updater-mode-b-replay`；
3. C2L generated package 使用：

```text
embedded-adapter + embedded-long-connection
```

4. replay 内有独立 `integrations/lark/` host module；
5. 用户只需填项目 `.env`，无需自己写 SDK wiring 或 adapter 事件转换；
6. 一个统一启动命令能拉起原业务与 Lark host；
7. host 自动使用长连接订阅 `card.action.trigger`；
8. host 调用 generated `handleGenericHttpCardAction()` 和 `buildStartCard()`；
9. 本地 contract、配置失败、目标 read、reviewed action 安全路径和统一停止行为均经过验证；
10. 人工真实飞书联调 runbook 完整、无 secret，并清楚记录为后续工作。

---

# Kickoff：calendar-stock-updater Mode B 一键启动长连接改造

```markdown
# Kickoff：calendar-stock-updater Mode B 一键启动长连接改造

## 总目标

从原始项目创建一个全新的 Mode B replay 副本，把 C2L 的 generic adapter 和飞书长连接 host 作为独立模块迁入目标项目；用户填写一次 `.env` 后，通过一个统一启动命令即可拉起原业务服务和飞书 SDK 长连接模块。

## 固定目录

原始项目，只读：

```text
C:\works\calendar-stock-updater
```

新实验对象：

```text
C:\works\calendar-stock-updater-mode-b-replay
```

不要修改原始项目。不要从原始项目复制真实 `.env`、node_modules、日志或本地凭据。

## 固定模式

```text
Mode B
+ embedded-adapter
+ embedded-long-connection
```

飞书接入默认使用：

```text
Feishu SDK websocket long connection
card.action.trigger
```

默认不使用 webhook，不要求：

```text
PUBLIC_CALLBACK_BASE_URL
/webhook/card
VERIFICATION_TOKEN
```

## 用户最终体验

用户应只需要：

```powershell
Copy-Item .env.example .env
# 填 FEISHU_APP_ID、FEISHU_APP_SECRET、TEST_CHAT_ID、TARGET_BASE_URL
npm run start:lark
```

然后系统自动：

```text
启动 calendar 原业务服务
+ 启动 integrations/lark 长连接 host
+ 建立 Feishu SDK websocket 长连接
+ 订阅 card.action.trigger
+ 使用 generated buildStartCard() 发送起始卡
+ 用 generated handleGenericHttpCardAction() 调 calendar API
```

## 结构要求

目标项目中必须新增独立模块，建议：

```text
integrations/lark/
  app.js
  config.js
  host.js
  generated/
    adapter/
    manifest/
    docs/
    sidecar-long-connection/
```

飞书 SDK wiring 不能散落进 `server.js` 或其他业务核心文件。

## 必须执行的阶段

### Phase 1：建立干净 replay 基线

复制原始项目到：

```text
C:\works\calendar-stock-updater-mode-b-replay
```

清理真实 `.env`、node_modules、日志、缓存；用 `.env.example` 初始化 replay 的空 `.env`。

先证明 replay 在没有 Lark 模块时能独立启动和通过原有测试。

### Phase 2：fresh 生成 C2L 长连接 package

在 C2L 仓库执行：

```powershell
node dist\index.js analyze `
  "C:\works\calendar-stock-updater-mode-b-replay" `
  --base-url http://127.0.0.1:3069 `
  --out out\calendar-stock-updater-mode-b-replay `
  --name calendar-stock-updater

node dist\index.js generate `
  out\calendar-stock-updater-mode-b-replay `
  --out generated\calendar-stock-updater-mode-b-lark `
  --mode embedded-adapter `
  --host-mode embedded-long-connection
```

验证：

```powershell
node dist\index.js verify `
  generated\calendar-stock-updater-mode-b-lark `
  --mode embedded-adapter `
  --host-mode embedded-long-connection `
  --strict
```

### Phase 3：迁入生成物，实现项目内长连接 host

把 generated 的：

```text
adapter/
manifest/
docs/
sidecar-long-connection/
```

迁入：

```text
C:\works\calendar-stock-updater-mode-b-replay\integrations\lark\generated\
```

新增独立 host 模块，职责只有：

```text
读取根 .env
→ 建立 Feishu SDK websocket
→ 订阅 card.action.trigger
→ 标准化事件
→ 调 handleGenericHttpCardAction()
→ 用 buildStartCard() 发卡
→ 回传 adapter card
```

不得重写 adapter 的 endpoint/action 映射。

### Phase 4：实现统一启动入口

用户必须只启动一次：

```powershell
npm run start:lark
```

该命令要同时启动：

```text
calendar 原服务
integrations/lark 长连接 host
```

任一子进程退出时，另一个也必须清理退出，整体以非零状态失败。

### Phase 5：本地验证与人工联调准备

至少验证：

```text
- 统一启动同时拉起两个进程
- 目标 GET /api/state 可达
- host 能调用 generated adapter
- http.get.api.state.submit 合同路径成功
- reviewed http.post.api.run.submit 安全路径不留任务运行
- 非法 action 返回 failure card
- 配置缺失时错误清楚且不泄漏 secret
- 停止统一启动后两个进程都退出
```

准备：

```text
integrations/lark/README.md
.env.example
level2_verification_record.md
```

但不要在本 session 执行真实飞书发卡、点击或填写真实 Level 2 通过证据。

## 禁止事项

- 不修改原始 `C:\works\calendar-stock-updater`
- 不把飞书逻辑写进业务核心文件
- 不添加 webhook fallback
- 不把真实 secret 提交 Git
- 不声称完成真实飞书验证

## 每阶段回报

每一阶段结束报告：

1. 做了什么
2. 修改文件
3. 实际执行命令和结果
4. 当前能否进入下一阶段
5. blocker

## 最终允许结论

只允许：

> calendar-stock-updater 的 Mode B 项目内长连接模块、统一启动入口、本地验证和人工联调准备已完成，等待用户填写真实 `.env` 后进行飞书联调。

不允许：

> calendar-stock-updater 已完成真实飞书长连接验证。
```

这份任务书的核心区别是：**cal 的新 Mode B 成功标准不再是“生成 adapter”，而是“用户填一次 `.env`，启动一次，就获得可运行的飞书长连接服务”。**
```</|DELIM_DA4Ek|>numerusformRGCTXDataന്റjson