# Code2Lark 工程可信交付与 Mode B 验收闭环设计规格

记录时间：2026-07-10
状态：已获设计批准，待实施计划

## 1. 背景与问题陈述

Code2Lark 已具备可运行的 adapter-first CLI、`image-agent-web` 样板、初步 generic HTTP 工作流和 Mode B 本地重放证明。但审计识别出当前阻碍可信交付与完整产品闭环的问题：

- `handoff --copy-to` 没有模式感知地复制 `adapter/`、`feishu-host/` 或 long-connection sidecar，交付物可能无法运行；
- `generate --out` 对已有目录的清理缺少充分保护；
- generic HTTP 分析会自动将 `/api/stop`、DELETE 等危险端点暴露为可点击动作；
- standalone runtime 默认以 `0.0.0.0` 暴露、允许无凭据 debug；
- embedded long-connection 的卡片协议可能仍使用不兼容的 Card JSON 1.0 形态；
- self-hosted runtime 的 Level 2 验收材料会落入 standalone/webhook 的错误前提；
- 源码 schema 为 `0.2`，但当前 `out/`、`generated/` 有旧 `0.1` 产物，strict verify 未形成有效门禁；
- 当前仓库缺少 CI、测试分层、稳定覆盖率和运行时基线；
- Mode B replay 已完成本地生成、迁入与自检，但真实飞书 Level 2 仍需受控人工资料和点击操作。

本设计将现有工程修复与 Mode B 最终真实验收统一为一个可恢复的长任务。

## 2. 目标

将项目推进到以下状态：

1. 生成的接入包可按 integration/host mode 完整、安全地交接；
2. 默认运行边界安全，危险外部服务动作不会自动暴露；
3. Card JSON、host mode、权限、配置、context、readiness、doctor 和 Level 2 材料具有一致语义；
4. manifest、重新生成的 package 与文档构成可信且可验证的事实源；
5. CI、分层测试和关键安全回归可持续运行；
6. Mode B 在 replay 目标内部完成可审计、脱敏的真实飞书 Level 2 验收，或在外部条件缺失时留下精确可续跑 blocker。

## 3. 非目标

本任务不做：

- Slack、企业微信或其他 IM 平台；
- 群 @ 命令、私聊命令等新交互入口；
- 第三个目标项目；
- 自动部署、凭据托管、Secret 管理平台；
- 自动模拟人工在飞书客户端中的点击；
- 大规模重写全部生成器模板；
- 接管目标服务生命周期。

## 4. 选择的编排：分波次长任务 + 阶段门禁

选择“分波次长任务 + 阶段门禁”而非单一线性大任务或完全并行双轨。

原因：

- 高风险交付和安全问题优先于进一步能力扩张；
- 每阶段都能独立提交、测试、恢复和审查；
- 真实飞书验收只在工程语义稳定后执行，减少返工；
- 外部凭据、权限和人工操作窗口不会阻塞 Phase 1–4；
- 最终状态能明确区分“工程完成”与“真实产品验收完成”。

执行顺序固定为：

```text
Phase 0：飞书 Level 2 可用性预检（不提交 secret）
Phase 1：交付闭包与安全止损
Phase 2：host mode、Card JSON 2.0 与验收材料一致性
Phase 3：schema/事实源/验收语义修复及基线重建
Phase 4：测试、CI、安全回归与最小模板去漂移
Phase 5：受控真实飞书 Mode B replay 验收
```

## 5. 状态、凭据与证据规则

### 5.1 任务状态

| 状态 | 定义 | 允许的表述 |
|---|---|---|
| 阶段通过 | 当前阶段的代码、文档、测试和门禁均已满足 | “Phase N 通过” |
| 工程完成 / 真实验收待执行 | Phase 1–4 均通过；Phase 5 尚未执行，仅因受控外部条件不足 | “工程闭环完成；Mode B 真实飞书验收待执行” |
| 外部 blocker | 凭据、权限、测试群、应用配置或人工窗口不足 | 记录缺项和续跑步骤；不得推断产品成功 |
| 完全关闭 | Phase 0–5 均通过，含 replay 内真实飞书脱敏证据 | “Mode B 已完成可重复的真实飞书验证” |

### 5.2 凭据安全

- 不得将 `FEISHU_APP_SECRET`、token、完整 chat ID、`.env` 内容写入 Git、任务书、测试快照、commit、handoff 包或聊天记录。
- Phase 0 只记录非敏感的负责人、准备状态、所需权限、事件订阅和操作窗口。
- Phase 5 前，由授权人员仅在 replay 项目受 `.gitignore` 保护的 `.env` 或安全环境变量中注入资料。
- 自动化产物只保留脱敏的动作、阶段、通过/失败、时间、trace/message ID 安全摘要和必要的人工证据索引。
- 若没有外部资料，必须产生 blocker record 和精确续跑命令，禁止伪造 Level 2 成功。

## 6. 阶段设计

### Phase 0：飞书 Level 2 可用性预检

**目的：**提前确认最终人工验收所需应用、权限、群和操作窗口可用，但不收集 secret。

**工作：**

- 确认验收责任人、操作窗口；
- 确认测试飞书应用、机器人能力和测试群存在；
- 确认可配置或已配置新版 `card.action.trigger` 长连接；
- 确认测试环境所需 API 权限；
- 确认 replay 项目的 `.env` 位置、忽略规则和启动方式；
- 写入不含 secret 的 readiness 或 blocker 记录。

**门禁：**Phase 0 未就绪不阻塞 Phase 1–4，但必须明确 Phase 5 状态和续跑责任。

**提交边界：**

```text
docs: record Mode B Level 2 readiness and external prerequisites
```

### Phase 1：交付闭包与安全止损

**目的：**优先修复错误交付、危险动作自动暴露和未鉴权调试入口。

#### 1A. 模式感知 handoff 复制闭包

- 读取生成元数据，按 integration/host mode 复制完整运行产物；
- 所有模式复制 `adapter/`；
- standalone 复制完整 `bot-runtime/` 的必要源码和配置模板；
- self-hosted 复制完整 `feishu-host/`；
- embedded long-connection/hybrid 复制 `sidecar-long-connection/`；
- 对复制结果验证相对 import 与文件引用闭包；
- 保留空目标目录检查、secret 扫描和脱敏排除。

#### 1B. 安全的生成目录更新

- 非空 `--out` 默认拒绝；
- 只有存在匹配生成 marker 的目录可更新；
- 清理旧 mode 目录必须显式 `--force`；
- 删除前显示拟删除列表；
- 优先临时生成，验证后再替换；
- 不得删除生成 manifest 未声明管理的路径。

#### 1C. Generic HTTP deny-by-default

- GET 可作为 query 草稿；
- POST/PUT/PATCH 需要人工批准；
- DELETE 和 `stop`、`delete`、`reset`、`shutdown`、`drop` 等危险语义默认禁用并分类为 destructive；
- 禁用能力不得有直接执行按钮；
- destructive 行为需要二次确认和非空 operator allowlist。

#### 1D. 收紧 standalone debug 默认值

- 默认绑定 `127.0.0.1`；
- 默认关闭无凭据 debug；
- 非 loopback host 必须有 debug token；
- 调试路由由显式开发开关控制，或从生产注册表中排除；
- token 使用恒定时间比较。

**验收：**build、完整测试、lockfile audit；新增 handoff 闭包、输出目录保护、危险 endpoint 和 debug 边界回归。

**提交边界：**

```text
fix: copy complete generated artifacts during handoff
fix: protect existing output directories during generation
fix: require review for risky generic HTTP actions
fix: secure standalone runtime debug defaults
```

### Phase 2：宿主模式、Card JSON 和验收材料一致性

**目的：**以 host mode 为单一事实源，统一卡片协议、权限、上下文与 Level 2 引导。

#### 2A. Card JSON 2.0 按模式生成

- `embedded-long-connection` 与 `hybrid` 生成完整 Card JSON 2.0；
- 让 webhook 与 long-connection 使用明确的 renderer/协议边界；
- 静态验证 card `schema`、`body.elements` 与 callback `behaviors[].value.action`；
- 禁止同一 renderer 隐式兼容互斥协议。

#### 2B. host-mode-aware 权限与上下文

- 将通用飞书能力需求和 webhook 专属 callback 配置分开；
- self-hosted/long-connection 不得无条件要求 `VERIFICATION_TOKEN`、公网 callback 或 `/webhook/card`；
- webhook/hybrid 才要求相应 token、callback 与可达性材料；
- permission/context/readiness/doctor 文档必须同步。

#### 2C. self-hosted 独立 Level 2 模板

- 使用 `feishu-host/.env`、websocket connection、SDK 长连接、`card.action.trigger`、起始卡与真实交互作为验收前提；
- 不得引用 `bot-runtime`、webhook callback 或 verification token。

**验收：**对 standalone、embedded webhook、embedded long-connection、hybrid、self-hosted fixtures 断言 card schema、permissions、context 和 Level 2 模板均与模式相符；原有 image-agent-web local contract/selfcheck 不回归。

**提交边界：**

```text
fix: emit Card JSON 2.0 for long-connection integrations
fix: make generated permissions and context host-mode aware
fix: generate self-hosted Level 2 verification guidance
```

### Phase 3：事实源、schema 与验收语义

**目的：**确保当前源码、生成包、strict verify 与文档对模式和验证状态没有歧义。

**工作：**

- strict verify 验证 schema version、必填字段、交叉引用、target profile；
- 旧 schema 只能经显式 migration；strict 模式必须失败并给升级指引；
- fresh analyze/generate `image-agent-web` 基线包；
- 新 `out/`、`generated/` 全部为 schema `0.2`；
- 明确区分结构/静态验证、本地运行验证、历史真实样板证据和当前包真实验收；
- 标记旧计划为历史或已替代；
- 新建单一能力矩阵，记录 target profile、delivery mode、host mode、本地验证、真实飞书与证据位置。

**验收：**旧 `0.1` fixture strict verify 失败；重新生成包为 `0.2` 且 strict verify 通过；README、矩阵、summary、Level 2 记录的模式和证据语义一致。

**提交边界：**

```text
fix: enforce manifest schema integrity during verification
docs: regenerate canonical package and clarify evidence states
docs: consolidate current capability and validation status
```

### Phase 4：测试、CI 与最小维护性治理

**目的：**让上述修复持续可验证，避免模板继续产生未检测漂移。

#### 4A. 测试与 CI

- 增加 `test:unit`、`test:smoke`、`test:e2e`、`test:coverage`；
- 明确 E2E 中联网安装的边界；
- CI clean install 后执行 build/check、unit/smoke、lockfile audit；E2E 独立 job 或受控触发；
- 设置 `engines` 与 `packageManager`。

#### 4B. 安全回归与覆盖率

覆盖 handoff、危险 endpoint、Card JSON 2.0、schema、output 保护、debug、template/size、private/metadata image URL、图片与 generic response 大小、self-hosted 重复事件/并发和 verify 执行边界。

#### 4C. 最小模板去漂移

- 仅抽取本轮触及的 action risk、字段校验、card spec、host-mode metadata；
- 不进行全量模板重写；
- 新逻辑不能继续以脆弱正则去类型作为长期实现路径；
- 抽取结果必须由跨模式 contract cases 约束。

**验收：**CI 可在干净环境运行；脚本可独立执行；关键安全路径有防回退验证；Node/npm 基线明确；重构不改变既有对外生成行为。

**提交边界：**

```text
test: split verification suites by execution boundary
ci: validate build smoke tests and dependency audit
test: cover generated package security boundaries
refactor: centralize host-mode generation contracts
```

### Phase 5：受控真实飞书 Mode B replay 验收

**前提：**Phase 0 预检已记录；Phase 1–4 已通过；replay 使用当前重新生成的 `feishu_host/`；授权人员仅在本地忽略的环境中注入凭据。

**执行：**

1. 启动 replay 目标服务；
2. 在 replay `feishu_host/` 内运行 local contract 和 selfcheck；
3. 启动 SDK 长连接；
4. 发送真实起始卡；
5. 人工在测试群执行 generate、iterate、batch、refresh、failure path；
6. 归档脱敏动作结果、时间和 trace/message 安全摘要；
7. 重新运行 doctor/readiness/evidence/handoff。

**验收：**host 运行于 replay 内部且不依赖 `generated/...`；事件经 `card.action.trigger` 到达 replay host；五条路径均有证据；无 secret 泄漏。

**外部 blocker：**若资料、权限、测试群或人工窗口不可用，完成并提交 Phase 1–4，写入 `docs/mode-b-level2-blocker-record.md`，列出非敏感缺项、负责人和精确续跑命令。最终只能标记为“工程完成 / 真实验收待执行”。

## 7. 文件与文档结构

新增或维护：

```text
docs/
  engineering-trust-and-mode-b-closure-task-book.md
  mode-b-level2-readiness.md
  mode-b-level2-blocker-record.md          # 仅发生外部阻塞时
  capability-validation-matrix.md
```

- 主任务书定义 Phase 0–5、非目标、提交边界、门禁与 DoD；
- readiness 文件仅记录非敏感外部可用性；
- blocker record 仅在 Phase 5 受阻时维护；
- capability matrix 成为 profile/mode/host/验证状态的当前事实源。

旧计划不删除，但必须注明为历史计划或链接到新任务书，避免它们被误用为当前执行规范。

## 8. 最终 Definition of Done

### 8.1 完全关闭

只有当以下都满足时，长任务完全关闭：

- handoff 可交付完整运行闭包；
- `generate --out` 不会误删或覆写非管理目录；
- generic HTTP 不自动执行危险端点；
- standalone 默认没有非 loopback 未鉴权 debug；
- verify 对不可信包默认不执行代码；
- long-connection/hybrid 生成完整 Card JSON 2.0；
- 所有 host-mode 文档、权限、context、doctor、readiness、Level 2 材料一致；
- strict verify 拒绝过时/不完整 manifest；
- canonical package 已以 schema 0.2 fresh 生成并验证；
- CI、分层测试、运行时基线和关键安全回归就绪；
- replay 内 Mode B 真实飞书长连接和 `card.action.trigger` 已验证；
- generate、iterate、batch、refresh、failure 均有脱敏证据；
- Git、产物、测试输出和 handoff 均无 secret。

### 8.2 可接受的受阻终态

当 Phase 1–4 全部通过，而 Phase 5 仅因外部人工条件无法执行时，允许关闭工程实现，但最终报告必须使用：

> 工程完成 / 真实验收待执行

不得将其表述为 Mode B 已完整产品化或已完成真实飞书验证。

## 9. 实施规则

- 每个明确行为变更或安全修复独立 commit；重构与行为修复分离；
- 每个 Phase 开始前先声明该阶段的验收命令；
- 每个 Phase 结束至少执行：

```bash
npm test
npm audit --package-lock-only --audit-level=moderate
git diff --check
```

- 修改生成逻辑时必须添加 fixture 或回归测试；
- 修改 generated package 行为必须 fresh analyze → generate → strict verify；
- Phase 5 replay 与主仓库代码开发隔离；
- 用户可见行为、模式或证据语义变更必须同时更新 README 和能力矩阵。
