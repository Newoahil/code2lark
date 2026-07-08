# 任务：self-hosted-runtime 卡片升级到 Card JSON 2.0（修复长连接回调不触发）

记录时间：2026-07-06
可派发给单个 session 执行。颗粒度到 commit 级。

---

## 0. 背景（为什么做）

真实飞书 Level 2 联调已确认一个**阻塞缺陷**：

- `self-hosted-runtime`（Python `feishu-host/`，长连接）生成的飞书卡片是 **Card JSON 1.0**（按钮 `action_type:"form_submit"` + `value`，无 `behaviors`，顶层无 `schema`）。
- 1.0 卡点击触发的是**旧版 `card.action.trigger_v1`**。
- 官方明确：`card.action.trigger_v1` **不支持长连接**（只能 webhook）。原话见 `docs/feishu-official/02-node-sdk-handling-callbacks.md:40`：
  > 消息卡片回传交互（旧）(`card.action.trigger_v1`) 回调不支持「使用长连接接收回调」订阅方式，只能选择「将回调发送至开发者服务器」。
- 实机现象：宿主 `connected to wss://...` 在线，但点卡片按钮**宿主终端零日志** → 回调根本没送达。

**目标**：把 self-hosted-runtime 路径生成的卡片升到 **Card JSON 2.0**（`schema:"2.0"` + `behaviors` 回调），使点击触发**新版 `card.action.trigger`**，长连接可送达宿主。**不改动已验证的 standalone / embedded-webhook（1.0 + webhook，v1 正常）路径。**

---

## 1. 硬约束（不得偏离）

1. **只迁移 self-hosted 卡片发射器**，其它模式的卡片构造函数（`adapterCardsTs`、`adapterCardsJs`、`runtimeCardsTs`）**一律不碰**。
2. 共享**纯数据** helper（`buildAdapterCardTemplateData` / `buildDefaultPreset` / `buildTemplateSpecs` / `buildFieldSpecs` / `buildFormFieldMaps` / `formFieldName`）保持不变，直接复用其数据。
3. 动手前**必读**本地官方快照，不许凭记忆猜 2.0 结构：
   - `docs/feishu-official/10-card-json-v2-structure.md`（`schema`/`config.update_multi`/`body.elements`）
   - `docs/feishu-official/11-form-container.md`（2.0 表单容器 + input 组件确切 tag/属性）
   - `docs/feishu-official/12-button-component.md`（`form_action_type` + `behaviors` 回调按钮）
   - `docs/feishu-official/01/02-*callbacks*.md`、card-callback-communication（新版回调 payload 里 `action.value` / `action.form_value` 字段）
4. `image-agent-web` 已在 `127.0.0.1:8000` 运行（供本地验证目标可达）。

---

## 2. 关键文件与锚点（已勘察）

| 文件 | 符号 / 行 | 作用 | 处理 |
|---|---|---|---|
| `src/commands/generate.ts` | `buildStartCardSpec` (≈1496) | 产出 `spec/start_card.json`（仅 self-hosted） | 改 → 2.0 |
| `src/commands/generate.ts` | `pythonHostCardsPy` (≈403) | 产出 `feishu-host/cards.py`（success/failure/running/batch） | 改 → 2.0 |
| `src/commands/generate.ts` | `pythonHostHandlersPy` / `normalize_card_action` (≈706/780) | 宿主解析回调 | 预期不改，需确认 |
| `src/commands/verify.ts` | `collectCardActionValues` (≈664) | 从卡 JSON 提取 action | 改 → 兼容 `behaviors[].value.action` |
| `src/commands/generate.ts` | `adapterCardsTs`/`adapterCardsJs`/`runtimeCardsTs` | 其它模式卡片 | **不碰** |

---

## 3. 具体改动

### C1 — `buildStartCardSpec` → Card 2.0
- 顶层加 `schema: "2.0"`；`config` 改 `{ update_multi: true, wide_screen_mode: true }`。
- `elements: [...]` 包进 `body: { elements: [...] }`。
- 两个 form 的**提交按钮**：`action_type:"form_submit"` + `value:{...}` → `form_action_type:"submit"` + 保留 `name` + `behaviors:[{ type:"callback", value:{ action:"image.generate.submit", preset } }]`（batch 用 `value:{action:"image.batch.submit"}`）。
- **重置按钮**：`action_type:"form_reset"` → `form_action_type:"reset"`（保留 `name`）。
- `input` 组件保留 `name`（field_map 依赖按 name 提交）；属性以 `11-form-container.md` 为准。

commit：`Generate Card JSON 2.0 start card for self-hosted host`

### C2 — `pythonHostCardsPy` → 结果卡 2.0
- `build_success_card`：外层 2.0（`schema/config/body`）；迭代 form 提交按钮 → `form_action_type:"submit"` + `behaviors:[{type:"callback", value:{action:"image.iterate.submit", session_id}}]`。
- `build_batch_status_card`：外层 2.0；刷新按钮 → `behaviors:[{type:"callback", value:{action:"image.batch.refresh", batch_id}}]`（1.0 的 `tag:"action"` 容器若 2.0 不适用，按文档改为 `body.elements` 内直接放 button）。
- `build_failure_card` / `build_running_card`：纯展示，套 2.0 外层，无 `behaviors`。
- `load_start_card`：不变。
- 若确认 2.0 回调 payload 字段与 `normalize_card_action` 现有取值有出入，最小调整（预期无需）。

commit：`Render self-hosted result cards as Card JSON 2.0`

### C3 — `verify.ts collectCardActionValues` → 兼容 2.0
- 现只读 `record.value.action`；补充递归读取 `record.behaviors[].value.action`，否则 `self-hosted:start-card-actions` 会误判 FAIL。
- 保留对 1.0 的兼容。
- 如 `tests/cli-smoke.test.mjs` 有 self-hosted 卡片结构断言需同步，并入本 commit。

commit：`Accept Card 2.0 behaviors in self-hosted start-card verify`

---

## 4. 每个 commit 门禁
- `npm run build` 通过。
- 重新生成 self-hosted 包后 `python -m py_compile feishu-host/*.py` 通过。
- `verify --mode self-hosted-runtime --strict` Overall=pass，且 `self-hosted:start-card-actions` / `self-hosted:python:local-contract` / `self-hosted:python:selfcheck` 全 PASS（真跑 Python，不接受缺依赖 WARN 当绿）。
- `node --test tests/*.test.mjs` 全绿。
- commit message：祈使句、首字母大写、无前缀。工作树干净后再进下一步。

---

## 5. 验证

### 本地（session 可自证）
1. `node dist/index.js generate out/image-agent-web --out generated/image-agent-web-lark --mode self-hosted-runtime`
2. 断言 `feishu-host/spec/start_card.json` 含 `"schema":"2.0"`、`body.elements`、两个提交按钮的 `behaviors[].value.action`（`image.generate.submit` + `image.batch.submit`）、reset 用 `form_action_type:"reset"`。
3. `verify --mode self-hosted-runtime --strict` → Overall=pass（重点 `self-hosted:start-card-actions` 仍 PASS）。
4. `python feishu-host/local_contract_test.py` → PASS；`python feishu-host/app.py --selfcheck` → exit 0。
5. `npm test` 全绿；抽查 standalone/embedded 生成物仍是 1.0（未被波及）。

### 真机（人工，第二轮点击，不计入自动完成）
- 重新生成 → `python app.py --send-start-card` 发新卡 → `python app.py` 起长连接 → 飞书点"生成"。
- **判定**：宿主终端出现收到 `card.action.trigger` 日志 + 调 `/api/generate`，卡片更新为结果卡；再验 迭代/批量/刷新/非法尺寸失败卡。
- 若仍无日志：核对飞书后台该应用回调订阅为**新版** `card.action.trigger`（非 v1）、长连接在线。

---

## 6. 风险
- **2.0 组件细节猜错** → 以 `11-form-container.md`/`12-button-component.md` 为准（最可能返工点）。
- **结果卡也须 2.0**（回调返回的卡与 2.0 不一致可能不更新）→ success/failure/running/batch 一并迁移。
- **本地只能证明卡是 2.0 + 宿主逻辑不回归**；"长连接真收到回调"仍须第二轮人工点击。
- **严禁波及其它模式**：edits 限定 self-hosted 发射器 + verify 的 action 提取。

---

## 7. 完成定义
- C1–C3 三个 commit 落地，`verify --mode self-hosted-runtime --strict` 真实 pass。
- 重新生成的 `start_card.json` 与 `cards.py` 均为 Card 2.0（含 `behaviors` 回调）。
- standalone/embedded 无回归。
- 人工第二轮：飞书点卡片，宿主真实收到 `card.action.trigger` 并回结果卡（此步人工，达成即真实 Level 2 打通）。
