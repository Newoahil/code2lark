# Code2Lark

Code2Lark（当前 CLI / 包名仍为 `lark-deployer`）是一个**构建时生成器**，用于把一个已有服务的交互流程转换成飞书 / Lark 机器人的接入包。

它不接管目标服务的生命周期。它负责分析目标服务、生成可审查的契约，产出可嵌入的 `adapter/` 作为核心产物，保留 `bot-runtime/` 作为可选的 standalone 参考宿主，并且可以生成一个 Python `feishu-host/` 作为 `self-hosted-runtime` 长连接宿主，同时提供验证与交接所需的检查与文档。

## MVP 范围

MVP-1A 当前围绕一个真实样板展开：

- 目标：`C:\works\image-agent-web`
- 能力：`POST /api/generate`、`POST /api/iterate`、`/api/batch` 进度与下载
- 运行模式：外部目标服务，可产出 `embedded-adapter`、`standalone-runtime` 或 `self-hosted-runtime` 三类宿主形态
- 完成定义：本地 MVP 证明已自动化；真实飞书开发者应用验证仍依赖人工完成 Level 2 证据

生成出的 `adapter/` 负责把飞书卡片动作映射到 `image-agent-web`，构造目标服务请求，并返回卡片 payload 与审计事件，供宿主服务落日志或继续处理。生成出的 `bot-runtime/` 仍然保留为一个 standalone 参考宿主：它能接收飞书卡片动作，调用 `image-agent-web`，在可能时上传生成图片，并把成功或失败结果更新回卡片。生成出的 `self-hosted-runtime` 会产出 `feishu-host/`，这是一个基于 Python `lark-oapi` 的 WebSocket 长连接宿主，订阅新版 `card.action.trigger`，通过 HTTP 调用 `image-agent-web`，而不 import 或修改目标服务本体。起始卡会基于已发现的模板字段，生成包含 `size`、可选 `message` 与模板字段输入的表单；同时还包含一个 batch 表单，可提交到 `/api/batch`、展示批量任务进度卡、支持手动刷新 `/api/batch/{batch_id}/status`，并在完成后给出 `/api/batch/{batch_id}/download` 下载链接。

对于较慢的目标服务，生成出的运行时可以启用 `CARD_ACTION_MODE=async`：它会先立即返回一张“运行中”卡片，再在目标服务完成后异步 patch 原飞书消息为最终结果。

当 `image-agent-web` 在分析阶段没有运行时，MVP 分析器仍会读取 `templates.py` 作为静态兜底，从中提取模板 id、允许的尺寸、默认尺寸和模板字段。生成出的测试卡 preset 将基于这些模板元数据，而不是写死的固定 payload。运行期仍然要求目标服务真实可达。

## 安装

```powershell
npm install
npm run build
npm test
```

## 常用命令

```powershell
node dist/index.js analyze C:\works\image-agent-web --base-url http://127.0.0.1:8000 --out out\image-agent-web
node dist/index.js plan out\image-agent-web
node dist/index.js context out\image-agent-web
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark-embedded --mode embedded-adapter
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark-long --mode embedded-adapter --host-mode embedded-long-connection
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark-self-hosted --mode self-hosted-runtime
node dist/index.js configure generated\image-agent-web-lark --strict --dry-run
node dist/index.js configure generated\image-agent-web-lark --strict
node dist/index.js status generated\image-agent-web-lark
node dist/index.js readiness generated\image-agent-web-lark
node dist/index.js doctor generated\image-agent-web-lark
node dist/index.js verify generated\image-agent-web-lark
node dist/index.js verify generated\image-agent-web-lark --mode embedded-adapter --strict
node dist/index.js verify generated\image-agent-web-lark-self-hosted --mode self-hosted-runtime --strict
node dist/index.js evidence generated\image-agent-web-lark
node dist/index.js handoff generated\image-agent-web-lark
node dist/index.js install generated\calendar-stock-updater-lark --target C:\path\to\calendar-copy
node dist/index.js install generated\calendar-stock-updater-lark --target C:\path\to\calendar-copy --apply
```

## 结构分析后端

`analyze` 支持 `--backend auto|internal|codegraph`，默认使用 `auto`：

- `internal`：只使用 Code2Lark 内置源码扫描；
- `auto`：优先尝试用户自行维护的 codegraph 索引；如果 CLI 不可用、索引未初始化、陈旧、不完整或输出无效，则安全回退到 internal，并把 requested / used / fallback 原因写入分析产物；
- `codegraph`：显式要求新鲜可用的外部索引；条件不满足时直接报错，不静默回退。

Code2Lark 只允许调用以下只读命令：

```text
codegraph status <repo> --json
codegraph query route --kind route --path <repo> --json
```

Code2Lark 不会安装 codegraph，也不会运行 `init`、`sync`、reindex 或其他索引写入操作。外部结果只提供文件、符号和路由等低层结构事实；业务 Profile、能力推断、卡片动作、权限和安装范围仍由 Code2Lark 决定。

calendar-stock-updater 的最终 replay 使用 `--backend auto`，由于目标没有用户维护的新鲜 codegraph 索引，记录结果为 requested=`auto`、used=`internal`、status=`fallback`；分析与后续严格验证正常完成。

## 交付模式（Delivery Modes）

Code2Lark 的标准输出始终是：

```text
generated/<target>-lark/
```

把这个生成目录视为**单一事实来源（source of truth）**：其中包含 manifest、adapter 代码、宿主模块、文档和验证记录。

The canonical MVP package is freshly generated from current schema 0.2 manifests.

### Mode A：外置宿主 / sidecar / gateway

Mode A is the external host, sidecar, or gateway path. Mode A is a validated deployment-test baseline in the verified `image-agent-web` sample.

Mode A 是**外置宿主**路线。目标服务继续保持自己的生命周期，Code2Lark 生成的宿主在目标服务外部运行，通过 HTTP / CLI / SDK 去调用目标能力。

当前已经验证通过的 `image-agent-web` long-connection 样板，在实际落地上属于 **Mode A**：`feishu-host/` 作为外置 Python 宿主接入飞书，再通过 HTTP 调 `image-agent-web`。

### Mode B：目标项目内增量宿主模块

Mode B is the target-project embedded host-module path. Mode B is a validated deployment-test baseline in the verified `image-agent-web` sample.

Mode B 是**目标项目内增量宿主模块**路线。生成包依然是 source of truth；标准流程使用显式 `install` 命令把生成包中的闭包安装到目标项目，默认只做 dry-run，只有 `--apply` 会写入。

Mode B 不是重写目标项目业务代码，而是：
- 只写入 `integrations/lark/` 隔离模块
- 使用模块自己的 `.env.example`、依赖、启动方式、测试和交接契约
- 不修改目标根 `package.json`、启动脚本、Docker、业务代码或 Web UI
- 安装前要求目标健康端点在线，并通过生成包契约与托管文件冲突检查

calendar-stock-updater 的两阶段示例：

```powershell
# 1. 候选包仍位于 generated/，generate 不写目标项目
node dist/index.js generate out\calendar-stock-updater --out generated\calendar-stock-updater-lark --mode embedded-adapter --host-mode embedded-long-connection

# 2. 默认 dry-run：在线探测、契约校验、冲突检查，零写入
node dist/index.js install generated\calendar-stock-updater-lark --target C:\path\to\calendar-copy

# 3. 人工审查后显式安装，只写 integrations/lark
node dist/index.js install generated\calendar-stock-updater-lark --target C:\path\to\calendar-copy --apply
```

#### calendar-stock-updater 当前状态

当前 calendar Mode B 路线已经完成本地工程闭环：

- 原始 `calendar-stock-updater` 项目保持只读，没有修改根 `package.json`、启动脚本、Docker、业务代码或 Web UI；
- 安装验证使用独立 replay，只通过 `install --apply` 写入 `integrations/lark/**`；
- 目标调用仍严格限制为 `GET /api/state`、`POST /api/run` 和 `POST /api/stop`；
- strict verify 为 32 PASS / 0 WARN / 0 FAIL；Code2Lark 完整测试 41/41、replay 根测试 49/49、安装模块测试 8/8；
- 真实飞书长连接已成功建立并发送起始卡，真实 `card.action.trigger` 也已到达宿主；
- 当前真实联调阻塞在 `ALLOWED_OPERATOR_OPEN_IDS`：配置值与回调中的当前应用维度 `operator.open_id` 不一致，因此安全门禁按预期拒绝了操作；
- 真实 Level 2 尚未完成，仍需修正白名单后重新验证刷新、普通预演、停止流程，并补齐截图、message ID、脱敏日志和签字证据。

安装模块的本地配置位于目标 replay 的 `integrations/lark/.env`。不要把真实值提交到 Git：

```dotenv
FEISHU_APP_ID=
FEISHU_APP_SECRET=
TEST_CHAT_ID=
ALLOWED_OPERATOR_OPEN_IDS=<current-app-operator-open-id>
TARGET_BASE_URL=http://127.0.0.1:3069
```

`ALLOWED_OPERATOR_OPEN_IDS` 是允许操作卡片的飞书用户 `open_id` 白名单，多个值使用英文逗号分隔。`open_id` 是应用维度标识，必须取自同一个飞书应用的 `card.action.trigger` 回调字段 `event.operator.operator_id.open_id`，不能使用手机号、chat id、user_id 或另一个应用下的 open_id。飞书应用、机器人能力、权限和长连接订阅在 [飞书开放平台开发者后台](https://open.feishu.cn/app) 配置。

### `self-hosted-runtime`

self-hosted-runtime is the generated host module.

`self-hosted-runtime` 是生成出来的宿主模块产物。它当前可以像已验证样板一样**在目标项目外部运行**，未来也可以迁入目标项目内部作为 **Mode B** 的基础宿主模块。

### `standalone-runtime`

`standalone-runtime` 仍然保留为一个参考 / 兜底模式，适合没有现成飞书 SDK 服务的团队。它不是当前阶段的主要产品形态。

## 模式选择指南

- `docs/host-delivery-mode-selection.md`
- `docs/mode-b-embedding-guide.md`

如果你已经有一个现成的飞书 SDK 服务，建议优先从：

```text
generated\image-agent-web-lark\adapter\
generated\image-agent-web-lark\docs\integration_guide.md
```

开始。这个嵌入式路径的包级验证命令是：

```powershell
node dist/index.js verify generated\image-agent-web-lark --mode embedded-adapter --strict
node dist/index.js doctor generated\image-agent-web-lark --mode embedded-adapter
```

其中：
- `--mode` 描述的是**生成产物形态**；
- `--host-mode` 描述的是**飞书事件如何到达宿主**。

例如：
- `embedded-webhook`：embedded 包的默认宿主接收方式
- `embedded-long-connection`：用于 sidecar / gateway 或已有 SDK 宿主，通过 `card.action.trigger` + 长连接接收飞书动作

对 `image-agent-web` 来说，在把飞书 SDK 直接嵌进 FastAPI 服务本体之前，更推荐先走 **sidecar / gateway** 方式。

## Python `self-hosted-runtime`（长连接宿主）

生成 Python 长连接宿主：

```powershell
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark-self-hosted --mode self-hosted-runtime
cd generated\image-agent-web-lark-self-hosted\feishu-host
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe local_contract_test.py
.\.venv\Scripts\python.exe app.py --selfcheck
cd ..
node ..\..\dist\index.js verify . --mode self-hosted-runtime --strict
```

`self-hosted-runtime` 默认使用：

```text
host_receive_mode = embedded-long-connection
```

它的自动化 MVP 证明范围是本地的：
- 生成的 `spec/*.json`
- Python 编译通过
- `local_contract_test.py`
- `app.py --selfcheck`

在这个模式下，默认**不要求**：
- `PUBLIC_CALLBACK_BASE_URL`
- `/webhook/card`
- `VERIFICATION_TOKEN`

除非使用者显式增加 webhook fallback。

这个模式的真实飞书 Level 2 需要人工完成：
- 在飞书后台配置长连接
- 订阅 `card.action.trigger`
- 运行 `feishu-host/app.py`
- 发送起始卡
- 在飞书里点击卡片
- 把证据写入 `docs/self-hosted-runtime-level2-runbook.md` 和包内的 `level2_verification_record.md`

## `standalone-runtime` 参考宿主

如果需要参考 / 兜底宿主，可以使用：

```powershell
cd generated\image-agent-web-lark\bot-runtime
Copy-Item .env.example .env
npm install
npm run build
npm start
```

当 runtime 运行起来，并且 `APP_ID` / `APP_SECRET` / `TEST_CHAT_ID` 已经填写后，可以先发一张测试卡：

```powershell
Invoke-WebRequest -Method POST http://127.0.0.1:3978/debug/start-card
```

`/debug/start-card` 会把 `start_card_sent` 或 `start_card_failed` 写进 `bot-runtime/audit.log`，供后续 `evidence` 命令回收 start-card 的 message id 与 trace id。

在飞书凭据还没准备好之前，也可以先做本地目标服务模拟：

```powershell
Invoke-WebRequest -Method POST http://127.0.0.1:3978/debug/simulate-generate
Invoke-WebRequest -Method POST http://127.0.0.1:3978/debug/simulate-card-action
Invoke-WebRequest -Method POST http://127.0.0.1:3978/debug/simulate-card-action -Body '{"action":"image.batch.submit"}' -ContentType 'application/json'
```

这些检查覆盖：
- 直接目标服务调用
- 飞书卡片动作路径
- batch submit / refresh
- Feishu 2.0 风格 callback payload
- 非法输入失败卡

当 runtime 运行起来后，可以用：

```powershell
node dist/index.js verify generated\image-agent-web-lark --runtime-url http://127.0.0.1:3978 --simulate
```

这一步会：
- 检查 runtime `/health`
- 检查 `/webhook/card` 本地 challenge
- 在 `--simulate` 下提交：
  - 普通 card action
  - Feishu 2.0 payload
  - 非法输入路径
  - signed webhook card action（若配置了 `VERIFICATION_TOKEN`）

## 证据与报告

本地或 Level 2 验证完成后，可生成一份不改动状态的证据草稿：

```powershell
node dist/index.js evidence generated\image-agent-web-lark
```

它会从：
- `verification_report.json`
- `bot-runtime/audit.log`

生成 `level2_evidence_draft.md`。

如果已经拿到真实飞书证据，可通过 `evidence --update-record` 把手工字段填入 `level2_verification_record.md`，例如：

```powershell
node dist/index.js evidence generated\image-agent-web-lark --runtime-url http://127.0.0.1:3978 --update-record --start-message-id <message-id> --result-message-id <message-id> --result-screenshot <path-or-url> --generated-image-url <url> --batch-id <batch-id> --batch-status-message-id <message-id> --batch-status-screenshot <path-or-url> --batch-download-url <url> --batch-download-screenshot <path-or-url> --trace-id <trace-id> --operator <name> --test-chat <chat-name>
```

也可以先初始化一个本地人工证据文件：

```powershell
node dist/index.js init-local generated\image-agent-web-lark --manual-evidence
node dist/index.js evidence generated\image-agent-web-lark --runtime-url http://127.0.0.1:3978 --manual-evidence generated\image-agent-web-lark\level2_manual_evidence.local.json --update-record
```

如果 `level2_verification_record.md` 里已经有人手填写过证据，再次 `generate` 时不会覆盖，而是保留现有记录，并把新的空白模板写到 `level2_verification_record.template.md`。

## Level 2

当飞书凭据齐全、机器人已进测试群后，可用更严格的验证模式：

```powershell
node dist/index.js verify generated\image-agent-web-lark --runtime-url http://127.0.0.1:3978 --level2
```

`--level2` 会自动包含：
- `--simulate`
- `--send-start-card`
- `--strict`

对于 `standalone-runtime` 和 `embedded-webhook`，它会额外探测：
- `<PUBLIC_CALLBACK_BASE_URL>/webhook/card`
- 签名动作
- 加密 challenge

对于 `embedded-long-connection` / `self-hosted-runtime`，重点转向：
- Feishu SDK 长连接在线证据
- `card.action.trigger` 订阅证据
- 真实点击证据

Webhook / standalone 的真实 Level 2 仍要求 `PUBLIC_CALLBACK_BASE_URL` 是公网 HTTPS 地址。`--allow-local-callback` 只应用于本地 mock 验证，不能拿来当真实飞书证据。

`--strict` 在任一 WARN / FAIL 时都会返回非零退出码，适合做 handoff gate 或真实 Level 2 preflight。

## 外部上下文需求

在真实飞书验证前，操作者仍需提供：

- 目标服务的可达地址（对当前样板是 `image-agent-web`）
- 飞书应用的 `APP_ID` / `APP_SECRET`
- webhook / standalone 模式下的 `VERIFICATION_TOKEN` / 可选 `ENCRYPT_KEY`
- 测试群 chat id
- 生成包文档中要求的飞书权限与回调 / 长连接配置

运行时配置按用途划分：
- callback 验证：`VERIFICATION_TOKEN`、可选 `ENCRYPT_KEY`
- 发送第一张卡：`APP_ID`、`APP_SECRET`、`TEST_CHAT_ID`
- 上传结果图片：`APP_ID`、`APP_SECRET`
- 完整 Level 2：模式相关的飞书配置 + 可达的目标服务；webhook / standalone 模式还需要 `PUBLIC_CALLBACK_BASE_URL`

可以用 `context` 命令生成一套交接模板：

```powershell
node dist/index.js context out\image-agent-web
```

它会生成：
- `feishu_context.template.json`
- `feishu_context.template.md`
- `feishu_context.request.md`
- `feishu_context.reply.template.json/md`

这个 owner-facing request 文件可以发给飞书应用 owner 或操作者，用来确认：
- app context
- scopes
- webhook callback 或长连接 `card.action.trigger` 订阅
- 测试群
- 所需宿主路径

`runtime_config` 中可记录 handoff 期配置，如：
- `CARD_ACTION_MODE`
- `UPLOAD_IMAGE_TO_LARK`
- `HOST`
- `PORT`
- `FEISHU_OPENAPI_BASE_URL`
- `DEBUG_ACCESS_TOKEN`
- `ALLOWED_OPERATOR_OPEN_IDS`
- `ALLOW_DEBUG_WITHOUT_FEISHU`

如果需要快速看当前状态：

```powershell
node dist/index.js status generated\image-agent-web-lark
```

如果要写一份不探网的 readiness 状态：

```powershell
node dist/index.js readiness generated\image-agent-web-lark
```

如果要解释为什么还没达到 handoff ready，可以用：

```powershell
node dist/index.js doctor generated\image-agent-web-lark
node dist/index.js doctor generated\image-agent-web-lark --out generated\image-agent-web-lark\doctor_report.json
node dist/index.js doctor generated\image-agent-web-lark --gate
node dist/index.js doctor generated\image-agent-web-lark --probe-target --gate
```

## 生成产物结构

```text
generated/image-agent-web-lark/
  START_HERE.md
  README.md
  permission_review.md
  deployment_checklist.md
  card_plan.md
  context_readiness.md
    feishu_context.request.md
    feishu_context.reply.template.json
    feishu_context.reply.template.md
  handoff_status.md          # written by `readiness`
  handoff_manifest.md        # written by `handoff`
  level2_evidence_draft.md   # written by `evidence`
  level2_verification_record.md
  level2_manual_evidence.template.json
  manifest/
    service_manifest.json
    capability_map.json
    interaction_contract.json
    required_permissions.json
  adapter/
    handlers.ts
    cards.ts
    service-client.ts
    validation.ts
    types.ts
    audit-events.ts
  docs/
    integration_guide.md
  bot-runtime/
    src/
    package.json
    .env.example

generated/image-agent-web-lark-self-hosted/
  START_HERE.md
  README.md
  docs/
    integration_guide.md
  feishu-host/
    .env.example
    requirements.txt
    config.py
    cards.py
    service_client.py
    validation.py
    handlers.py
    app.py
    local_contract_test.py
    README.md
    spec/
      start_card.json
      field_map.json
      endpoints.json
      preset.json
      template_specs.json
      field_specs.json
```

## 项目边界

Code2Lark 负责构建接入包，也可以探测目标服务是否可达；但它**不负责**：
- 启动目标服务
- 停止目标服务
- 重启目标服务
- 监管目标服务
- 部署目标服务

## 当前证据状态

目前自动化测试能证明的部分包括：

- CLI smoke 路径：analyze → plan → generate → verify
- embedded adapter 包级验证
- self-hosted-runtime 包级验证
- standalone runtime 本地 e2e
- webhook challenge / signed callback / encrypted challenge 本地验证
- Feishu 2.0 callback 兼容
- 非法输入失败卡
- batch submit / refresh 路径
- debug token 保护
- 目标服务 timeout
- operator allowlist
- duplicate-action 去重
- `image-agent-web` 的真实长连接样板已经完成真人飞书验证
- `calendar-stock-updater` 已具备专用业务 Profile 和 dry-run-first Mode B 隔离安装流程；全新 replay 的本地安装、离线阻断、冲突阻断与模块合同已验证；真实长连接、发卡和回调到达已观察，当前需修正当前应用维度的 operator open_id 白名单后继续 Level 2

但 webhook / standalone 的真实 Level 2，以及更多目标项目的真实飞书接入，仍然是后续阶段的工作。
