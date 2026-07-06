# image-agent-web 真实飞书 Level 2 测试计划

记录时间：2026-07-06
目标：补齐唯一的构建缺口（真正发送起始卡），然后用 `image-agent-web` 的 `self-hosted-runtime`（Python `feishu-host/`）在真实飞书上把长连接机制验穿。

前置认知（本次开发前已验证）：
- `generate --mode self-hosted-runtime` 产物完整；`local_contract_test.py`、`app.py --selfcheck`、`verify --mode self-hosted-runtime --strict` 均真实通过。
- 运行期确定性、`normalize_card_action` 已含真实 `P2CardActionTrigger` 事件对象解析路径（首次真实点击才会被真实驱动）。
- **唯一构建缺口**：`app.py --send-start-card` 只"准备并打印"，不真正发送 → 没有卡进群，飞书测试无法开始。

范围边界：
- 只补"真正发起始卡"这一个能力 + 相关本地校验与文档；不做泛用化/解耦（那是下一个大阶段）。
- 改动落在**生成器** `src/commands/generate.ts` 的 `app.py` 发射器，使所有 `self-hosted-runtime` 包都获得该能力，然后重新生成 `image-agent-web` 包。
- 真实飞书 Level 2 本身是人工步骤（建应用/授权/点卡片），不计入自动完成。

已确认的 lark_oapi 1.7.0 API（执行者按此写）：
```python
import lark_oapi as lark
from lark_oapi.api.im.v1 import CreateMessageRequest, CreateMessageRequestBody
client = lark.Client.builder().app_id(APP_ID).app_secret(APP_SECRET).build()
body = CreateMessageRequestBody.builder().receive_id(chat_id).msg_type("interactive").content(json.dumps(card)).build()
req = CreateMessageRequest.builder().receive_id_type("chat_id").request_body(body).build()
resp = client.im.v1.message.create(req)   # resp.success(), resp.code, resp.msg, resp.data.message_id
```

---

## 通用 commit 门禁
- `npm run build` 通过。
- `node --test tests/*.test.mjs` 全绿（回归门禁，非验收证据）。
- 动了 Python 产物：重新生成后 `python -m py_compile feishu-host/*.py` 通过，且 `verify --mode self-hosted-runtime --strict` 仍 PASS（真实跑 Python，不接受缺依赖 WARN 当绿）。
- commit message 沿用仓库风格：祈使句、首字母大写、无前缀。
- 工作树干净后再进下一步。

---

## Phase 1 — 在生成器里补"真正发起始卡"

### C1 `Emit real start-card sender in self-hosted host`
改动 `src/commands/generate.ts` 的 `app.py` 发射器：

1. 新增纯函数 `build_start_message_request()`（**不联网**）：
   - `chat_id = config.test_chat_id`；缺失则抛出清晰错误。
   - 返回构造 `im.v1.message.create` 所需的 payload 三要素：`receive_id=chat_id`、`receive_id_type="chat_id"`、`msg_type="interactive"`、`content=json.dumps(cards.load_start_card())`。
   - 设计成"可被本地断言检查"的纯数据产出（返回 dict），与真正的网络发送分离。
2. 改写 `--send-start-card`：
   - `require` `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `TEST_CHAT_ID`，任一缺失打印清晰错误并非零退出。
   - `lark.Client.builder().app_id().app_secret().build()` + 上面的 `CreateMessageRequest`。
   - 调 `client.im.v1.message.create(req)`：
     - `resp.success()` → 打印 `sent start card: message_id=<id>`，退出 0。
     - 否则 → 打印 `send failed: code=<code> msg=<msg>`，非零退出（便于诊断权限/群成员问题）。
   - `--selfcheck` 保持不变（仍不联网）。
3. 保持 `send_start_card()` 与网络发送解耦：selfcheck / 本地测试只碰 `build_start_message_request()`，绝不触发真实 `create()`。

**验收**：重新生成后 `python -m py_compile` 通过；`app.py --selfcheck` 仍 0；`app.py --send-start-card` 在**缺凭据**时给出清晰 `require` 错误而非崩溃（本地即可验证这一分支）。

**commit**：`Emit real start-card sender in self-hosted host`

---

## Phase 2 — 本地校验缝（不联网也能证明发卡请求正确）

### C2 `Cover start-card request builder in host contract test`
改动 `src/commands/generate.ts` 的 `local_contract_test.py` 发射器：
- 追加断言：设置 dummy `FEISHU_APP_ID/SECRET/TEST_CHAT_ID` 环境后，调 `app.build_start_message_request()`，断言：
  - `receive_id_type == "chat_id"`、`receive_id == <dummy chat>`、`msg_type == "interactive"`；
  - `json.loads(content)` 等于 `cards.load_start_card()`（起始卡内容一致）；
  - 缺 `TEST_CHAT_ID` 时抛出清晰错误。
- **不联网、不构造真实 Client、不调用 create**。

**验收**：`python local_contract_test.py` 仍打印 `feishu-host contract: PASS`；`verify --mode self-hosted-runtime --strict` 仍 PASS（新增断言被 verify 真实执行覆盖）。

**commit**：`Cover start-card request builder in host contract test`

---

## Phase 3 — 文档收口（去掉"手动拼 API"的临时缺口说明）

### C3 `Document built-in start-card send for self-hosted Level 2`
- 生成器的 `README.md` / `docs/integration_guide.md` 发射器：把发起始卡步骤写成 `python app.py --send-start-card`（真实发送），删去"仅准备/打印"的旧描述。
- 更新 `docs/self-hosted-runtime-level2-runbook.md`：发卡步骤改为内置命令，移除手动 `im/v1/messages` 兜底（可保留为"排障备选"一行）。

**验收**：重新生成的包里，集成指南与 runbook 的发卡步骤一致且指向 `--send-start-card`。

**commit**：`Document built-in start-card send for self-hosted Level 2`

---

## Phase 4 — 重新生成并交付给人工飞书 Level 2（人工，不计入自动完成）

### 4.1 重新生成
```powershell
node dist\index.js generate out\image-agent-web --out generated\image-agent-web-lark --mode self-hosted-runtime
node dist\index.js verify generated\image-agent-web-lark --mode self-hosted-runtime --strict
```
期望 verify Overall=pass，含真实 Python 契约与 selfcheck PASS。

### 4.2 飞书控制台（一次性）
- 建/选自建应用，开机器人能力。
- 权限：`im:message:send_as_bot`、`im:resource:upload`。
- 事件与回调 → **使用长连接接收** → 订阅 `card.action.trigger`。
- 机器人加入测试群；记录 `APP_ID` / `APP_SECRET` / 测试群 `chat_id`。
- 发布/安装应用版本。

### 4.3 启动与发卡
```powershell
cd generated\image-agent-web-lark\feishu-host
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
#  填 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_CONNECTION_MODE=websocket
#     IMAGE_AGENT_BASE_URL=<宿主机可达的 image-agent-web> / TEST_CHAT_ID=<测试群>
.\.venv\Scripts\python app.py --send-start-card    # 期望: sent start card: message_id=...
.\.venv\Scripts\python app.py                      # 期望日志: connected to wss://...
```

### 4.4 真实点击验证（按顺序）
1. **生成**：点"生成" → 宿主收到 `card.action.trigger`、调 `/api/generate` → 卡片更新为成功卡（含图片）。
2. **迭代**：成功卡提交反馈 → `image.iterate.submit` → `/api/iterate`。
3. **批量**：提交 batch → `image.batch.submit` → `/api/batch`。
4. **刷新**：点刷新 → `image.batch.refresh` → `/api/batch/{id}/status`（完成后出下载链接）。
5. **失败路径**：非法尺寸（如 `1024*1024`）→ 红色失败卡且不调目标；非白名单 operator → 被拒。
6. 证据填入 `generated\image-agent-web-lark\level2_verification_record.md`。

### 4.5 首击重点盯防
- **第一次真实点击**是 `normalize_card_action` 解析真实 `P2CardActionTrigger` 事件对象的首次真实驱动。若首击异常：
  - 看宿主日志里解析出的 `action` / `form_value` / `operator.open_id` 是否正确；
  - 如事件形状与 `normalize_card_action` 假设不符，这是**唯一预期可能需要小修**的点 → 修 `generate.ts` 的 `normalize_card_action` 发射逻辑，重生成，回归。
- 起始卡若发送失败：按 `resp.code/msg` 排查机器人是否在群内、是否有 `im:message:send_as_bot`、应用是否已发布。
- Card JSON 在飞书渲染异常：核对生成的 `spec/start_card.json` 是否符合当前 Card JSON 2.0（参照 `docs/feishu-official/10-card-json-v2-structure.md`）。

---

## 完成定义
- Phase 1–3 三个 commit 落地，`verify --mode self-hosted-runtime --strict` 真实通过。
- 重新生成的 `image-agent-web-lark` 具备一条命令发起始卡的能力。
- 人工飞书 Level 2 至少跑通：发卡 → 生成 → 迭代 → 批量 → 刷新 → 一条失败路径，并在 `level2_verification_record.md` 留证。
- 达成后：**长连接 + card.action.trigger + 卡片渲染 + 回调响应 + 权限** 这套通用平台机制被真实验穿 → 成为后续解耦的回归锚点。

## 价值定位（为什么现在做不亏）
- 本计划验证的核心是**通用平台机制**，解耦后所有目标共享，不会被浪费。
- image-agent-web 通过真实 Level 2 后，成为解耦阶段的**黄金回归基准**。
- 图片专用的流程/字段是廉价可替换部分，不是本次投入的重点。
