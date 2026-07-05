# Code2Lark MVP 任务书：目标应用自宿主化（self-hosted-runtime）

记录时间：2026-07-04
文档性质：可派发给单个 session 长任务执行的实施任务书。颗粒度到 commit 级。

---

## 0. 这份任务书要交付什么

一句话 MVP 目标：

> **给定一个已部署的应用（首个目标 `C:\works\image-agent-web`），Code2Lark 能直接生成一个"可运行、自带 env 配置、用飞书 SDK 长连接接入飞书"的宿主产物（Python），让这个应用的能力可以在飞书机器人里被使用。**

也就是把当前"只会生成 Node adapter / Node 参考 runtime"的能力，补上最后一跃：

> **生成目标语言（Python）的飞书长连接宿主，带 `.env` 配置，可本地跑通、可交接给人做真实飞书 Level 2。**

这份任务书覆盖到 **本地可验证的 MVP 形态**。真实飞书点击验证是人工步骤，本任务书提供 runbook 与证据模板，但不计入自动完成。

---

## 1. 架构锁定决策（执行者不得擅自更改，除非先回来澄清）

这些决策是这次澄清的结论，必须作为硬约束：

1. **新增一种一等产物模式：`self-hosted-runtime`。**
   - 它产出一个**目标语言宿主**。对 `image-agent-web` 即 **Python** 宿主。
   - 现有 `embedded-adapter`（给已有宿主挂 adapter）与 `standalone-runtime`（Node 参考宿主）保持不动、不得回归。

2. **宿主用飞书官方 Python SDK `lark-oapi` 的长连接（WebSocket）能力**，订阅新版 `card.action.trigger`，参照 `C:\works\MyLord` 的既有模式（`FEISHU_CONNECTION_MODE=websocket`）。

3. **宿主通过 HTTP 调用目标应用**（读 `IMAGE_AGENT_BASE_URL`），不 import 目标内部代码，不改目标核心。对应"模式 A / 模式 B"，禁止"模式 C 入侵式深改"。

4. **默认 host_receive_mode = `embedded-long-connection`**，`self-hosted-runtime` 下不得把 `PUBLIC_CALLBACK_BASE_URL` / `/webhook/card` 作为强制前置。

5. **业务数据在生成期从 manifest 派生**（复用 `buildDefaultPreset` / `buildTemplateSpecs` / `buildFieldSpecs` / `buildFormFieldMaps`）。
   - 起始卡是静态的 → 在生成期**完整渲染**成 `spec/start_card.json`，Python 端只加载不组装。
   - 只有结果卡（成功/失败/运行中/批量）依赖运行时响应 → 由 Python 端最小组装。
   - 目的：把 TS↔Python 的重复逻辑压到最小。

6. **配置全部走 `.env`**：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_CONNECTION_MODE=websocket`、`IMAGE_AGENT_BASE_URL`、可选 `FEISHU_ALLOWED_USERS`、`IMAGE_AGENT_TIMEOUT_MS`、可选 `TEST_CHAT_ID`（用于主动发起始卡）。

7. **最小侵入**：生成物落在 `generated/<target>-lark/feishu-host/`，是独立进程/独立 Python 包，可被复制进目标仓库作为子目录（模式 B），但不改写目标业务代码。

---

## 2. 目标应用接口事实（来自 `image-agent-web/main.py`，执行者按此写，不要猜）

| 动作 | HTTP | 传输 | 关键参数 |
|---|---|---|---|
| meta | `GET /api/meta` | - | 返回 templates / sizes / fields |
| 生成 | `POST /api/generate` | multipart Form | `template_id`,`size`,`fields_json`,`message`,`reference_types_json="[]"`(,可选 `session_id`,`images`) |
| 迭代 | `POST /api/iterate` | JSON body(dict) | `{session_id, feedback}` |
| 批量 | `POST /api/batch` | multipart Form | `template_id`,`size`,`items_json`,`reference_types_json="[]"` |
| 批量状态 | `GET /api/batch/{batch_id}/status` | - | 进度/完成/失败 |
| 批量下载 | `GET /api/batch/{batch_id}/download` | - | 完成后 zip |

含义：Python 宿主的 service client 需要 `requests`：generate/batch 用 `data=`(form)，iterate 用 `json=`。MVP 不通过卡片上传参考图（`images` 不填）。

action id ↔ 端点映射（写进 `spec/endpoints.json`）：
- `image.generate.submit` → generate
- `image.iterate.submit` → iterate
- `image.batch.submit` → batch
- `image.batch.refresh` → batch status
- 下载链接由 batch_id 解析，不单独作为 action

---

## 3. 边界与明确不做项（本长任务内）

不做：
- 真实飞书点击的自动化（人工 Level 2，见 §8）。
- 群 @ / 私聊命令、消息事件触发。
- 多平台（Slack / 企业微信）。
- 其它语言宿主（Go/Java/Node 原生宿主）——只做 Python。
- `hybrid` 模式的完整实现（保留枚举位即可）。
- 改写 `image-agent-web` 业务核心代码。
- `generate.ts` 大模板整体重构（只新增 Python 发射器，不顺手重构历史）。

---

## 4. 通用 commit 门禁（每个 commit 都必须满足）

- `npm run build` 通过（tsc strict）。
- `node --test tests/*.test.mjs` 全绿（作为回归门禁，不作为 MVP 验收证据）。
- 若该 commit 生成/改动了 Python 文件：对生成产物执行 `python -m py_compile` 通过。
- 一个 commit 只做一件逻辑事；不得把"文档整改"和"行为变更"混进同一 commit。
- commit 后工作树干净。
- commit message 沿用仓库风格：**祈使句、首字母大写、无 `feat:` 前缀**（如现有 "Validate generated adapter batch sizes"）。

Python 运行环境约定：本地建 venv，`pip install lark-oapi requests`。verify 在缺 Python/依赖时对相关检查记 **WARN 不判 FAIL**（结构类检查仍 PASS）；但执行者做 MVP 收尾验收时**必须真实装好 Python 依赖并实跑**，不能停留在 WARN。

---

## 5. 阶段与 commit 清单

### Phase 0 — 基线与设计锁定

**C0.1 Commit host-mode-aware baseline**
- 目标：把当前已验证但未提交的 host-mode-aware 工作提交成基线。
- 改动：`git add` 现有 `M`/`??`（`src/host-mode.ts`、`src/commands/*`、`src/index.ts`、`tests/cli-smoke.test.mjs`、`README.md`、`docs/*`、`docs/feishu-official/`、`docs/feishu-docs-*`、`docs/adapter-first-fix-plan.md`）。
- 前置门禁：`npm run build` OK 且 `npm test` 全绿后再提交。
- 验收：`git status` 干净；`git log` 出现该基线 commit。
- message：`Commit host-mode-aware baseline`

**C0.2 Define self-hosted-runtime mode and Python host target**
- 目标：把 §1 架构决策写进项目纲领，成为后续实现的权威依据。
- 改动：更新 `docs/development-charter.md`（新增 `self-hosted-runtime` 模式与"目标语言宿主"定义、最小侵入边界）；新增 `docs/self-hosted-runtime-design.md`（详细设计：目录结构、endpoints 映射、spec 派生、配置项、验证策略）。
- 验收：文档中明确写出 §1 的 7 条锁定决策与 §2 端点映射。
- message：`Define self-hosted-runtime mode and Python host target`

---

### Phase 1 — 模式管线打通

**C1.1 Add self-hosted-runtime integration mode plumbing**
- 目标：CLI 端到端接受 `--mode self-hosted-runtime`，但暂不产出宿主实体（先打通枚举/校验/summary/help）。
- 改动：
  - `src/host-mode.ts`：`IntegrationMode` 增加 `"self-hosted-runtime"`；`normalizeHostReceiveMode` 对该 mode 默认返回 `embedded-long-connection`。
  - `src/commands/generate.ts`：`normalizeIntegrationMode` 接受新值；`generation_summary.json` 的 `integration_mode` 能反映它；暂时创建空 `feishu-host/` 目录并写 `generation_summary`。
  - `src/index.ts`：help 文案补 `self-hosted-runtime`。
  - verify/doctor/context 的 mode 解析容错（不崩，允许该 mode）。
- 验收：`generate out/image-agent-web --mode self-hosted-runtime` 成功，`generation_summary.json` 里 `integration_mode=self-hosted-runtime`、`host_receive_mode=embedded-long-connection`；build/test 绿。
- message：`Add self-hosted-runtime integration mode plumbing`

---

### Phase 2 — Python 宿主生成器（核心新能力）

> 每个 C2.x：build 绿 + `generate` 能产出对应文件 + 新 `.py` 通过 `python -m py_compile`。

**C2.1 Emit Python feishu-host scaffold and config**
- 产物：`feishu-host/.env.example`、`feishu-host/requirements.txt`（`lark-oapi`、`requests`）、`feishu-host/config.py`（读取 §1.6 env）、`feishu-host/README.md`（如何 venv、装依赖、填 .env、启动）。
- 改动：`src/commands/generate.ts` 新增 `writePythonHost*` 系列发射函数，仅在 `integration_mode==="self-hosted-runtime"` 时写。
- 验收：`config.py` py_compile 通过；`.env.example` 含全部 §1.6 键。
- message：`Emit Python feishu-host scaffold and config`

**C2.2 Emit manifest-derived feishu-host spec artifacts**
- 产物：`feishu-host/spec/preset.json`、`spec/field_map.json`（templateKey↔formField 双向）、`spec/endpoints.json`（§2 映射）、`spec/start_card.json`（生成期**完整渲染**的起始卡）、`spec/template_specs.json`、`spec/field_specs.json`。
- 改动：复用 `buildDefaultPreset`/`buildTemplateSpecs`/`buildFieldSpecs`/`buildFormFieldMaps`，`writeJson` 到 `feishu-host/spec/`。
- 验收：所有 spec JSON 可被 Node 与 Python 解析；`start_card.json` 含 generate 与 batch 两个 form 且 action 值正确。
- message：`Emit manifest-derived feishu-host spec artifacts`

**C2.3 Emit Python card renderer for feishu-host**
- 产物：`feishu-host/cards.py`：`load_start_card()`（读 spec）、`build_success_card()`、`build_failure_card()`、`build_running_card()`、`build_batch_status_card()`。
- 约束：结果卡结构与现有 TS 卡对齐（成功卡含图片/trace/iterate 表单；失败卡红色 + 下一步；批量卡含 done/total/completed/failed/下载/refresh）。
- 验收：`python -c "import cards; cards.load_start_card()"` 及各 build 函数用假数据可运行返回 dict。
- message：`Emit Python card renderer for feishu-host`

**C2.4 Emit Python image-agent service client for feishu-host**
- 产物：`feishu-host/service_client.py`：`call_generate`、`call_iterate`、`call_batch_create`、`call_batch_status`、`resolve_download_url`；按 §2 用 form/json；带 `IMAGE_AGENT_TIMEOUT_MS` 超时与可读错误。
- 验收：py_compile 通过；函数签名与 endpoints.json 一致。
- message：`Emit Python image-agent service client for feishu-host`

**C2.5 Emit Python action handlers and validation for feishu-host**
- 产物：
  - `feishu-host/validation.py`：`validate_size`（WIDTHxHEIGHT）、必填字段校验、operator allowlist（`FEISHU_ALLOWED_USERS`）、batch size 校验（与单图一致）。
  - `feishu-host/handlers.py`：`handle_card_action(ctx, deps)` — 解析 action、用 field_map 还原模板键、校验、调 service_client、返回卡片 + 结构化 audit events；不支持的 action 返回失败卡。
- 约束：字段名映射必须走 `spec/field_map.json`，覆盖 `hero-title`/中文/点号等特殊键（对齐已修复的 TS 行为）。
- 验收：py_compile 通过；对非法 size、缺字段、未授权 operator 返回失败卡且不调用目标。
- message：`Emit Python action handlers and validation for feishu-host`

**C2.6 Emit Feishu long-connection host entrypoint**
- 产物：`feishu-host/app.py`：
  - 用 `lark-oapi` 构建 `Client` + `ws.Client`（WSClient）+ `EventDispatcher`，注册 `card.action.trigger` → `handlers.handle_card_action` → 回卡/patch。
  - `send_start_card()`：用 `TEST_CHAT_ID` 主动发 `spec/start_card.json`。
  - `--selfcheck` 干跑模式：构建 client + dispatcher、打印已注册事件与（脱敏）配置摘要、**不开真实 socket 或短超时尝试后优雅退出**；缺凭据时给出清晰提示而非崩溃。
  - `audit` 落地由宿主负责（写本地文件或 stdout）。
- 验收：`python feishu-host/app.py --selfcheck` 在装了 `lark-oapi` 的 venv 里能构建并打印已注册 `card.action.trigger`，退出码 0。
- message：`Emit Feishu long-connection host entrypoint`

---

### Phase 3 — 本地验证（不接真实飞书）

**C3.1 Emit Python local contract test for feishu-host**
- 产物：`feishu-host/local_contract_test.py`：内起 mock `image-agent-web`（stdlib http.server），直接驱动 `handlers.handle_card_action` 跑：
  - generate → `/api/generate` → 成功卡（含图片 URL）
  - iterate → `/api/iterate` → 结果卡
  - batch submit → `/api/batch` → 批量卡
  - batch refresh → `/api/batch/{id}/status` → 更新卡（含下载）
  - 失败路径：非法 size 本地失败、未授权 operator 拒绝、目标 500
  - 特殊字段键（`hero-title` / 中文）round-trip 正确
- 验收：`python feishu-host/local_contract_test.py` 全部断言 PASS 并打印 `feishu-host contract: PASS`。
- message：`Emit Python local contract test for feishu-host`

**C3.2 Add self-hosted-runtime package validation to verify**
- 改动：`src/commands/verify.ts` 增加 `--mode self-hosted-runtime` 分支：
  - 结构检查：`feishu-host/{config.py,cards.py,service_client.py,validation.py,handlers.py,app.py,requirements.txt,.env.example}` + `spec/*.json` 齐全。
  - `spec/*.json` 可解析；`endpoints.json` 覆盖 4 个 action；`.env.example` 含必需键。
  - 若本机有 python：跑 `python -m py_compile feishu-host/*.py` 与 `python feishu-host/local_contract_test.py`，PASS/FAIL 计入；无 python/依赖 → WARN。
  - 报告头显示 `integration_mode=self-hosted-runtime`、`host_receive_mode=embedded-long-connection`；不因缺 `/webhook/card`、缺 `PUBLIC_CALLBACK_BASE_URL` 判 FAIL。
- 验收：`verify <pkg> --mode self-hosted-runtime --strict`：装了 python 依赖时 Overall=pass 且包含 contract PASS 行。
- message：`Add self-hosted-runtime package validation to verify`

**C3.3 Make context, readiness, doctor self-hosted-runtime aware**
- 改动：三命令按新 mode 出必需项与引导：
  - 必需：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`IMAGE_AGENT_BASE_URL`、长连接在线、`card.action.trigger` 订阅。
  - `PUBLIC_CALLBACK_BASE_URL`/`VERIFICATION_TOKEN` 标记为该 mode 下可选/不适用。
  - next actions 指向"填 feishu-host/.env → 装依赖 → app.py --selfcheck → 真实飞书 Level 2 runbook"。
- 验收：`readiness/doctor <pkg> --mode self-hosted-runtime` 不把缺公网回调判成 blocker；引导命令与 feishu-host 一致。
- message：`Make context, readiness, doctor self-hosted-runtime aware`

---

### Phase 4 — 接入冒烟测试并对 image-agent-web 实产

**C4.1 Cover self-hosted-runtime generation in smoke test**
- 改动：`tests/cli-smoke.test.mjs` 增加：generate `--mode self-hosted-runtime` → 断言 `feishu-host/` 结构与 `spec/*.json`；若 python 可用则 spawn `python feishu-host/local_contract_test.py` 断言 PASS（python 不可用则 skip 并打印原因，不假绿）。
- 验收：`npm test` 全绿；有 python 的环境里确实跑到 contract PASS。
- message：`Cover self-hosted-runtime generation in smoke test`

---

### Phase 5 — 文档与交接

**C5.1 Add self-hosted-runtime integration guide and Level 2 runbook**
- 改动：
  - 生成物 `docs/integration_guide.md` 增加 self-hosted-runtime 段（venv、装依赖、填 .env、`app.py --selfcheck`、飞书后台开长连接订阅 `card.action.trigger`、真实点击）。
  - 仓库级新增 `docs/self-hosted-runtime-level2-runbook.md`：人工真实飞书验证步骤 + 证据模板（起始卡/generate/iterate/batch/refresh/失败路径/截图/trace）。
- 验收：runbook 步骤与 feishu-host 实际 env/命令逐一对应。
- message：`Add self-hosted-runtime integration guide and Level 2 runbook`

**C5.2 Reconcile charter, MVP, status docs for self-hosted-runtime**
- 改动：更新 `docs/development-charter.md`（模式清单收尾）、`docs/mvp-1a-image-agent-web.md`、`docs/project-status.md`：把 self-hosted-runtime 列为已落地的一等模式，说明真实 Level 2 仍人工。
- 验收：全 docs 无"webhook-only / bot-runtime 是唯一主产物"的残留表述冲突。
- message：`Reconcile charter, MVP, status docs for self-hosted-runtime`

---

## 6. MVP 完成定义（本长任务的验收标准）

全部满足才算达到 MVP 形态：

1. `node dist/index.js generate out/image-agent-web --mode self-hosted-runtime` 产出完整可运行 `feishu-host/`（Python）。
2. venv 内 `pip install -r feishu-host/requirements.txt` 后：
   - `python feishu-host/local_contract_test.py` → 全 PASS（含失败路径与特殊字段键）。
   - `python feishu-host/app.py --selfcheck` → 构建 WSClient+dispatcher、打印已注册 `card.action.trigger`、退出码 0。
3. `node dist/index.js verify generated/... --mode self-hosted-runtime --strict` → Overall=pass（python 依赖已装时含 contract PASS）。
4. `embedded-adapter` / `standalone-runtime` / `embedded-webhook` / `embedded-long-connection` 无回归（各自 verify 仍 PASS）。
5. `npm run build` 与 `npm test` 全绿。
6. 文档、runbook、证据模板齐全；真实飞书 Level 2 作为**人工步骤**明确标注为待办，不计入自动完成。

---

## 7. 每 commit 后的自检脚本（执行者可固定跑）

```bash
npm run build
node --test tests/*.test.mjs
# 若本 commit 动了 Python 产物：
#   python -m venv .venv && . .venv/Scripts/activate  (Windows Git Bash)
#   pip install lark-oapi requests
#   python -m py_compile <generated>/feishu-host/*.py
git status --short   # 必须干净
```

---

## 8. 真实飞书 Level 2（人工，收尾用，不在自动完成内）

前置：真实飞书自建应用，开启机器人能力，事件订阅选"使用长连接接收"，订阅 `card.action.trigger`，权限至少 `im:message:send_as_bot` + `im:resource:upload`（异步更新再加 `im:message:update`）。

步骤：
1. 填 `feishu-host/.env`：`FEISHU_APP_ID`/`FEISHU_APP_SECRET`/`FEISHU_CONNECTION_MODE=websocket`/`IMAGE_AGENT_BASE_URL`/`TEST_CHAT_ID`/可选 `FEISHU_ALLOWED_USERS`。
2. 确保 `image-agent-web` 可达（`GET /api/meta` 通）。
3. `python feishu-host/app.py`（真实启动，控制台应出现 `connected to wss://...`）。
4. `send_start_card` 或触发发起始卡到测试群。
5. 点击生成 → 观察宿主日志收到 `card.action.trigger`、调用 `/api/generate`、飞书回结果卡。
6. 依次验 iterate / batch / refresh / 失败路径。
7. 证据填入 `level2_verification_record.md`。

---

## 9. 风险与回滚

| 风险 | 处理 |
|---|---|
| TS 卡逻辑与 Python 卡逻辑双份，易漂移 | MVP 接受；起始卡走 spec 静态渲染，仅结果卡在 Python 组装，重复面已最小化；后续再考虑统一 spec 渲染器（本任务不做）。 |
| CI/本机无 Python | verify/smoke 缺 python 记 WARN/skip 不假绿；收尾验收必须真实装 python 实跑。 |
| `lark-oapi` API 漂移 | requirements 固定可用版本；参照 `docs/feishu-official/` 与 MyLord 现用法；仅用长连接 + `card.action.trigger` 最小面。 |
| 误改 image-agent-web 核心 | 硬约束：feishu-host 只走 HTTP 调用，禁止改目标业务代码；违反即回退。 |
| 单 commit 破坏 build | 每 commit 门禁 §4；C2.x 半成品阶段以"文件存在 + py_compile"为界，不依赖尚未产出的 app.py。 |

---

## 10. 执行顺序小结

```
C0.1 提交基线
C0.2 锁定设计
C1.1 打通 self-hosted-runtime 模式
C2.1~C2.6 生成 Python 宿主（scaffold→spec→cards→client→handlers→app）
C3.1 Python 契约测试
C3.2 verify 支持新模式
C3.3 context/readiness/doctor 感知新模式
C4.1 冒烟测试接入
C5.1 集成指南 + Level 2 runbook
C5.2 文档收尾
→ 收尾人工真实飞书 Level 2
```
