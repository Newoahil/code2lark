# Code2Lark MVP 整合包固化与第二目标验证设计规格

记录时间：2026-07-10
状态：已获设计批准，待实施计划

## 1. 背景与问题陈述

Code2Lark 已具备可运行的 adapter-first CLI、`image-agent-web` 样板、初步 generic HTTP 工作流，并已在 `image-agent-web` 完成 Mode A（外置宿主）和 Mode B（目标项目内增量宿主模块）的部署测试验证。

因此，当前主线**不是重新证明 Mode B 的真实飞书可用性，也不是继续围绕 `image-agent-web` 修补宿主功能**，而是：

```text
提炼 image-agent-web 已验证的 Mode A / Mode B 经验
→ 固化为可信、可交付、可泛用的 MVP 整合包
→ 选择新的非图片目标项目进行接入改造与验证
→ 用第二目标的反馈推进下一轮泛化
```

审计识别出当前阻碍该 MVP 整合包可信交付的问题：

- `handoff --copy-to` 没有模式感知地复制 `adapter/`、`feishu-host/` 或 long-connection sidecar，交付物可能无法运行；
- `generate --out` 对已有目录的清理缺少充分保护；
- generic HTTP 分析会自动将 `/api/stop`、DELETE 等危险端点暴露为可点击动作；
- standalone runtime 默认以 `0.0.0.0` 暴露、允许无凭据 debug；
- embedded long-connection 的卡片协议可能仍使用不兼容的 Card JSON 1.0 形态；
- self-hosted runtime 的 Level 2 验收材料会落入 standalone/webhook 的错误前提；
- 源码 schema 为 `0.2`，但当前 `out/`、`generated/` 有旧 `0.1` 产物，strict verify 未形成有效门禁；
- 当前仓库缺少 CI、测试分层、稳定覆盖率和运行时基线；
- 当前 generic HTTP 路径只完成 package validation，还未通过第二目标的完整接入验证证明其可泛用性。

本设计将工程修复、经验固化和第二目标验证统一为一个可恢复的长任务。

## 2. 目标

将项目推进到以下状态：

1. 已验证的 Mode A / Mode B 经验被准确封存为 MVP 的回归基线；
2. 生成的接入包可按 integration/host mode 完整、安全地交接；
3. 默认运行边界安全，危险外部服务动作不会自动暴露；
4. Card JSON、host mode、权限、配置、context、readiness、doctor 和 Level 2 材料具有一致语义；
5. manifest、重新生成的 package 与文档构成可信且可验证的事实源；
6. CI、分层测试和关键安全回归可持续运行；
7. 一个与 `image-agent-web` 不同的第二目标项目通过 MVP 整合包完成接入改造与验证，并将反馈沉淀为下一阶段输入。

## 3. 非目标

本任务不做：

- 重新开展或重复记录已经完成的 `image-agent-web` Mode A / Mode B 部署测试；
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

- 高风险交付和安全问题必须先于第二目标扩展；
- 每阶段都能独立提交、测试、恢复和审查；
- 第二目标只在 MVP 整合包语义稳定后接入，减少把样板特例带入新项目的风险；
- 已验证的 A/B 路径作为回归锚点，而非本轮等待的外部 blocker；
- 最终状态能明确区分“MVP 整合包工程完成”和“第二目标验证完成”。

执行顺序固定为：

```text
Phase 0：封存 Mode A / Mode B 验证经验并定义 MVP 整合包边界
Phase 1：交付闭包与安全止损
Phase 2：host mode、Card JSON 2.0 与验收材料一致性
Phase 3：schema/事实源/验收语义修复及 MVP 基线重建
Phase 4：测试、CI、安全回归与最小模板去漂移
Phase 5：第二目标项目接入改造、验证与反馈沉淀
```

## 5. 证据与凭据规则

### 5.1 任务状态

| 状态 | 定义 | 允许的表述 |
|---|---|---|
| 阶段通过 | 当前阶段的代码、文档、测试和门禁均已满足 | “Phase N 通过” |
| MVP 整合包完成 | Phase 0–4 通过，A/B 基线被保留且可交付 | “MVP 整合包完成，准备第二目标验证” |
| 第二目标验证受阻 | 新目标的外部服务、权限、测试环境或人工窗口不足 | 记录非敏感缺项、负责人和续跑步骤；不得推断产品成功 |
| 完全关闭 | Phase 0–5 均通过，第二目标有脱敏接入验证证据 | “MVP 已在两个不同目标上完成验证” |

### 5.2 凭据安全

- 不得将 `FEISHU_APP_SECRET`、token、完整 chat ID、`.env` 内容写入 Git、任务书、测试快照、commit、handoff 包或聊天记录。
- 重用现有已验证飞书环境或接入第二目标时，凭据只能保存在本地被 `.gitignore` 保护的 `.env` 或安全环境变量中。
- 自动化产物只保留脱敏的动作、阶段、通过/失败、时间、trace/message ID 安全摘要和必要的人工证据索引。
- 第二目标的外部验证无法执行时，必须产生 blocker record 和精确续跑命令，禁止伪造真实验证成功。

## 6. 阶段设计

### Phase 0：封存 Mode A / Mode B 经验并定义 MVP 边界

**目的：**将已完成的 image-agent-web Mode A / Mode B 部署测试作为事实和回归锚点，明确本轮 MVP 的产品边界，不重复验证已完成的路径。

**工作：**

- 将 Mode A、Mode B 均已通过部署测试的事实写入当前能力矩阵与项目状态；
- 区分“已验证样板经验”与“当前重新生成 package 的静态/本地验证”；
- 明确 MVP 的标准产物为 adapter-first 整合包，Mode A 是默认低侵入落地，Mode B 是可迁入目标项目的增量宿主模块；
- 定义第二目标选择标准：非图片领域、存在清晰 HTTP API 或 CLI/SDK 边界、可在受控环境中运行、具备至少一个读操作和一个受控动作；
- 默认第二目标为已存在的 `calendar-stock-updater`；若执行前发现其不可用，可替换为满足相同标准且可访问的新项目，并记录选择理由；
- 写入不含 secret 的基线与第二目标准备记录。

**门禁：**文档不得再把 Mode B 描述为“待真实验收”或“仅本地重放证明”；所有后续 Phase 必须保持 A/B 样板回归。

**提交边界：**

```text
docs: establish validated Mode A and Mode B MVP baseline
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
- 不得引用 `bot-runtime`、webhook callback 或 verification token；
- 对 image-agent-web 保留其已经完成 Mode A / Mode B 部署测试的证据状态，不重开其验收门禁。

**验收：**对 standalone、embedded webhook、embedded long-connection、hybrid、self-hosted fixtures 断言 card schema、permissions、context 和 Level 2 模板均与模式相符；A/B 样板的 local contract/selfcheck 不回归。

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
- fresh analyze/generate `image-agent-web` MVP 基线包；
- 新 `out/`、`generated/` 全部为 schema `0.2`；
- 明确区分结构/静态验证、本地运行验证、已完成的 A/B 部署测试证据和第二目标的当前验证状态；
- 标记旧计划为历史或已替代；
- 新建单一能力矩阵，记录 target profile、delivery mode、host mode、本地验证、部署测试与证据位置。

**验收：**旧 `0.1` fixture strict verify 失败；重新生成包为 `0.2` 且 strict verify 通过；README、矩阵、summary、Level 2 记录的模式和证据语义一致，明确 Mode A/B 均已验证。

**提交边界：**

```text
fix: enforce manifest schema integrity during verification
docs: regenerate canonical MVP package and clarify evidence states
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

### Phase 5：第二目标项目接入改造、验证与反馈沉淀

**目的：**证明 MVP 整合包不只适用于 image-agent-web，并将新目标暴露的领域差异转为下一轮泛化输入。

**默认目标：**`calendar-stock-updater`。如该目标在执行时不可访问或不满足 Phase 0 的选择标准，可替换为另一个非图片、具备明确交互边界的项目，并在能力矩阵记录原因。

**执行：**

1. 对第二目标执行 fresh `analyze`，人工审查 capability、risk、输入/输出 schema 和 endpoint exposure；
2. 按目标既有运行时和飞书宿主条件选择 Mode A 或 Mode B；默认优先 Mode A，只有目标明确要求内部模块时选择 Mode B；
3. fresh `generate`，并执行 strict verify、doctor、readiness、handoff；
4. 将 adapter 或增量 host 模块接入第二目标，禁止接管其生命周期或深改业务核心；
5. 执行目标本地功能验证，至少覆盖一个 read/query 和一个经过批准的 action；
6. 在可复用的受控飞书环境完成真实交互验证；如需人工点击，记录脱敏证据；
7. 将新目标暴露的 schema、卡片、权限、配置或交付缺口写入能力矩阵和后续改进列表。

**验收：**第二目标生成物不含 image 专属 action、字段或 card 文案；接入不依赖 image-agent-web 的隐含状态；至少一条 query 与一条经审查 action 完成端到端验证；无 secret 泄漏；A/B 样板回归仍通过。

**外部 blocker：**若第二目标运行环境、权限或人工操作窗口不可用，Phase 0–4 仍可标记为“MVP 整合包完成”，并写入第二目标 blocker record、非敏感缺项、负责人和精确续跑命令。不得将 generic package validation 表述成第二目标的完整接入成功。

**提交边界：**

```text
test: validate MVP integration package against calendar-stock-updater
docs: record second-target integration evidence and generalization gaps
```

## 7. 文件与文档结构

新增或维护：

```text
docs/
  mvp-integration-package-and-second-target-task-book.md
  mvp-mode-a-b-baseline.md
  second-target-validation-plan.md
  second-target-blocker-record.md            # 仅第二目标发生外部阻塞时
  capability-validation-matrix.md
```

- 主任务书定义 Phase 0–5、非目标、提交边界、门禁与 DoD；
- A/B baseline 文件封存已完成的 image-agent-web Mode A / Mode B 部署测试；
- second-target plan 记录所选目标、模式、风险审查与验证范围；
- blocker record 仅在第二目标外部验证受阻时维护；
- capability matrix 成为 profile/mode/host/验证状态的当前事实源。

旧计划不删除，但必须注明为历史计划或链接到新任务书，避免它们被误用为当前执行规范。

## 8. 最终 Definition of Done

### 8.1 完全关闭

只有当以下都满足时，长任务完全关闭：

- Mode A / Mode B 已验证经验被准确记录为 MVP 回归基线；
- handoff 可交付完整运行闭包；
- `generate --out` 不会误删或覆写非管理目录；
- generic HTTP 不自动执行危险端点；
- standalone 默认没有非 loopback 未鉴权 debug；
- verify 对不可信包默认不执行代码；
- long-connection/hybrid 生成完整 Card JSON 2.0；
- 所有 host-mode 文档、权限、context、doctor、readiness、Level 2 材料一致；
- strict verify 拒绝过时/不完整 manifest；
- canonical MVP package 已以 schema 0.2 fresh 生成并验证；
- CI、分层测试、运行时基线和关键安全回归就绪；
- 第二目标通过 MVP 整合包完成接入改造；
- 第二目标至少有一条 query 和一条经批准 action 的脱敏端到端验证证据；
- Git、产物、测试输出和 handoff 均无 secret。

### 8.2 可接受的受阻终态

当 Phase 0–4 全部通过，而 Phase 5 仅因第二目标外部运行环境、权限或人工验证窗口无法执行时，允许关闭 MVP 工程实现，但最终报告必须使用：

> MVP 整合包完成 / 第二目标验证待执行

不得将其表述为已经完成第二目标的完整接入验证。

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
- 第二目标接入环境与主仓库代码开发隔离；
- 用户可见行为、模式或证据语义变更必须同时更新 README 和能力矩阵。
