# Self-Hosted Runtime Design

记录时间：2026-07-04

本文档锁定 `self-hosted-runtime` 的 MVP 设计。若本文档与早期 webhook-only 或 bot-runtime-only 描述冲突，以 `docs/mvp-self-hosting-task-book.md` 和本文档为准。

## 1. 目标

`self-hosted-runtime` 给已部署目标应用生成一个可独立运行的飞书宿主产物。首个目标是 `C:\works\image-agent-web`，宿主语言为 Python。

生成目录：

```text
generated/<target>-lark/feishu-host/
```

该宿主使用飞书官方 Python SDK `lark-oapi` 长连接接收 `card.action.trigger`，再通过 HTTP 调用目标应用。它不 import 目标应用内部代码，不改写目标业务逻辑。

真实飞书点击是人工 Level 2；本 MVP 自动完成范围是本地可验证的生成、合同测试和 SDK wiring selfcheck。

## 2. 锁定决策

1. 新增一等产物模式 `self-hosted-runtime`。
2. 现有 `embedded-adapter` 与 `standalone-runtime` 保持不动，不得回归。
3. `self-hosted-runtime` 默认 `host_receive_mode=embedded-long-connection`。
4. 该模式不强制要求 `PUBLIC_CALLBACK_BASE_URL`、`/webhook/card` 或 `VERIFICATION_TOKEN`。
5. 宿主使用 `lark-oapi` WebSocket 长连接订阅 `card.action.trigger`。
6. 宿主通过 `IMAGE_AGENT_BASE_URL` 调用目标 HTTP API。
7. 业务数据在生成期从 manifest 派生；Python 只加载静态起始卡并最小组装运行时结果卡。
8. 配置全部走 `.env`，生成物可复制进目标仓库作为子目录独立运行。

## 3. 目录结构

```text
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
  docs/
    integration_guide.md
  spec/
    start_card.json
    field_map.json
    endpoints.json
    preset.json
    template_specs.json
    field_specs.json
```

`spec/start_card.json` 必须由现有 TypeScript 卡片/manifest 逻辑完整渲染。Python 不重新组装起始卡。

## 4. 配置

必需：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_CONNECTION_MODE=websocket`
- `IMAGE_AGENT_BASE_URL`

可选：

- `FEISHU_ALLOWED_USERS`
- `IMAGE_AGENT_TIMEOUT_MS`
- `TEST_CHAT_ID`

生成文档和验证报告不得打印 secret 值。

## 5. Target API Contract

`image-agent-web` HTTP 合同如下：

| Action | HTTP | Transport | Target |
|---|---|---|---|
| `image.generate.submit` | `POST /api/generate` | multipart form | generate image |
| `image.iterate.submit` | `POST /api/iterate` | JSON body | iterate image |
| `image.batch.submit` | `POST /api/batch` | multipart form | create batch |
| `image.batch.refresh` | `GET /api/batch/{batch_id}/status` | none | refresh batch |

下载链接由 `/api/batch/{batch_id}/download` 派生，不单独作为 card action。

Generate/batch 表单必须传 `reference_types_json="[]"`。MVP 不通过卡片上传参考图。

## 6. Spec Files

生成器必须复用现有 TypeScript 派生逻辑：

- `buildDefaultPreset`
- `buildTemplateSpecs`
- `buildFieldSpecs`
- `buildFormFieldMaps`

`field_map.json` 必须支持 Python 从飞书表单键恢复目标字段原名，包括 `hero-title`、中文键、点号键等特殊字段名。

`endpoints.json` 必须覆盖四个 action id，并作为 Python handler 的路由来源。

## 7. Python Runtime Responsibilities

`config.py` 读取 env、校验 websocket 模式、解析 allowlist 和 timeout。

`cards.py` 加载起始卡并构造成功、失败、运行中、批量状态卡。

`service_client.py` 使用 `requests` 调用目标服务。generate/batch 使用 `data=`，iterate 使用 `json=`。

`validation.py` 校验尺寸、必填字段、batch item、operator allowlist。

`handlers.py` 解析 card action、恢复字段名、调用目标服务并返回卡片与 audit event。非法输入、未授权 operator、不支持 action 必须本地失败且不得调用目标服务。

`app.py` 构建 `lark-oapi` client 和 WebSocket client，注册 `card.action.trigger`，并提供 `--selfcheck`。selfcheck 必须证明 wiring 和事件注册，不要求真实连接飞书。

## 8. SDK Boundary

官方文档示例使用如下形态：

```python
event_handler = lark.EventDispatcherHandler.builder("", "") \
    .register_p1_customized_event("app_ticket", do_customized_event) \
    .build()

cli = lark.ws.Client("APP_ID", "APP_SECRET", event_handler=event_handler, log_level=lark.LogLevel.DEBUG)
cli.start()
```

本地 spike 使用 `lark-oapi==1.7.0` 验证到专用注册方法：

```python
import lark_oapi as lark
from lark_oapi.event.callback.model.p2_card_action_trigger import (
    P2CardActionTrigger,
    P2CardActionTriggerResponse,
)

event_handler = lark.EventDispatcherHandler.builder("", "") \
    .register_p2_card_action_trigger(handle_card_action) \
    .build()

cli = lark.ws.Client("APP_ID", "APP_SECRET", event_handler=event_handler, log_level=lark.LogLevel.INFO)
```

`register_p2_card_action_trigger` 的回调签名是 `Callable[[P2CardActionTrigger], P2CardActionTriggerResponse]`。`P2CardActionTrigger.event.action.form_value` 保存表单值，`P2CardActionTrigger.event.action.value` 保存 action value，`P2CardActionTrigger.event.operator.open_id` 保存操作者 open id，`P2CardActionTrigger.event.context.open_message_id/open_chat_id` 保存消息和会话信息。

`app.py --selfcheck` 可以构建 handler 与 `lark.ws.Client` 并打印 `card.action.trigger` wiring，不调用 `cli.start()`，因此不需要真实连接飞书。

## 9. Verification Strategy

每个行为阶段至少运行：

```powershell
npm run build
node --test tests/*.test.mjs
```

生成 Python 后还必须运行：

```powershell
python -m py_compile generated/image-agent-web-lark/feishu-host/*.py
python generated/image-agent-web-lark/feishu-host/local_contract_test.py
python generated/image-agent-web-lark/feishu-host/app.py --selfcheck
```

`local_contract_test.py` 必须证明：

- generate/iterate/batch/refresh 的目标调用 shape；
- special field key round-trip；
- invalid size、missing fields、unauthorized operator、unsupported action 不调用目标；
- target 500 和 timeout 返回失败卡；
- batch download URL 正确派生。

`verify --mode self-hosted-runtime --strict` 在最终 MVP 证据中必须真实执行 Python 检查。缺 Python/依赖可在非最终上下文 WARN，但不能作为最终完成证据。

## 10. Level 2 Boundary

真实飞书 Level 2 需要人工配置飞书应用、开启长连接、订阅 `card.action.trigger`、把 bot 加入测试会话并点击卡片。仓库必须提供 runbook 和证据模板，但自动验收不依赖真实点击。
