# Code2Lark 结构分析后端纠偏任务书

记录时间：2026-07-16
状态：本地实现、纠偏重放、自动化复验与最终复核完成，等待真实飞书 Level 2
适用仓库：`C:\works\Lark-deployer`
关联任务书：`docs/calendar-stock-updater-mode-b-correction-task-book.md`

本任务书用于纠正 Code2Lark 的源码分析边界：把通用代码结构发现收敛为可插拔后端，同时继续由 Code2Lark 负责业务能力解释、飞书交互设计、生成、严格验证和隔离安装。本任务书不取代 calendar Mode B 任务书；两者共同构成本轮开发与 replay 的验收合同。

## 1. 纠偏目标

目标架构固定为：

```text
internal scanner / codegraph
        -> Normalized StructuralFacts
        -> Code2Lark Profile 与业务能力推断
        -> schema 0.2 manifests
        -> plan / card design / generate
        -> strict verify
        -> dry-run-first install
```

首个外部后端选择 `colbymchenry/codegraph`，理由是其提供：

- Windows 可用的本地 CLI；
- `--json` 查询输出；
- 一等 `route` 节点及路由到 handler 的关系；
- 本地 `.codegraph` SQLite 索引；
- 可检查的索引版本、待同步变化和重建状态。

CodeGraphyV4 保留为未来候选，不进入本轮生产实现。

## 2. 不变量

1. `ServiceManifest`、`CapabilityMap`、`InteractionContract`、`RequiredPermissions` 继续使用 `schema_version: "0.2"`。
2. 外部后端只提供文件、符号、路由、调用、引用等低层结构事实。
3. 外部后端不得决定业务能力、风险等级、卡片动作、权限、宿主代码或安装范围。
4. strict verify 不得因使用外部后端而放宽。
5. 默认流程不得要求用户安装 `codegraph`。
6. Code2Lark 不自动安装、初始化、同步或重建外部索引。
7. 禁止自动执行 `codegraph init`、`codegraph sync` 或等价写索引命令。
8. 原始项目 `C:\works\calendar-stock-updater` 全程只读。
9. 不覆盖既有 replay、generated 或 handoff；新证据使用带时间戳的新目录。
10. calendar Mode B 只允许写入 replay 的 `integrations/lark/**`。
11. 不修改目标根 `package.json`、锁文件、启动脚本、Docker、业务代码或 Web UI。
12. 不提交、不推送，不清理用户已有 dirty work。

## 3. 后端模式合同

`analyze` 增加：

```text
--backend auto|internal|codegraph
```

### 3.1 `auto`

- 默认模式；
- 若存在可执行的 `codegraph`、目标已有索引且索引新鲜，则使用规范化后的 route 事实；
- 若工具缺失、Node 版本不兼容、索引未初始化、索引过期、存在待处理引用、JSON 非法或 route 结果不可用，则记录回退原因并使用 internal scanner；
- 回退不得改变现有分析成功条件。

### 3.2 `internal`

- 只使用 Code2Lark 当前内置扫描器；
- 不探测、不调用 `codegraph`；
- 作为兼容、排障和结果对照基线。

### 3.3 `codegraph`

- 明确要求使用外部索引；
- 工具缺失、Node 版本不兼容、索引未初始化或不新鲜、输出非法时必须清晰失败；
- 错误信息应说明需要用户自行安装或维护索引，但不得自动执行修复命令；
- 不允许静默回退 internal。

## 4. 外部 CLI 与新鲜度合同

只允许调用只读命令：

```powershell
codegraph status <repo> --json
codegraph query route --kind route --path <repo> --json
```

信任 route 结果前检查：

- `initialized === true`；
- `lastIndexed` 存在；
- `pendingChanges` 为空；
- `worktreeMismatch !== true`；
- `index.state` 为完整可用状态；
- `index.pendingRefs` 为 `0`；
- `index.reindexRecommended !== true`；
- 当前 Node 版本满足工具支持范围。

`journalMode` 等非关键字段若缺失不得导致解析崩溃；只有能证明索引不安全或不完整的状态才阻止显式后端。外部 JSON 必须在系统边界做结构校验。

## 5. 规范化边界

外部 schema 不得泄漏到 Profile 或下游命令。内部概念模型至少包含：

```text
StructuralFacts
  backend_requested
  backend_used
  status
  fallback_reason?
  checked_at
  indexed_at?
  index_path?
  routes[]

RouteFact
  method
  path
  file?
  line?
  source = internal | codegraph
```

`codegraph query` 的预期输入形状为数组，每项包含 `{ node, score, highlights? }`。只读取 `node` 中可验证的 route 名称、方法、路径、文件和行号；忽略 score、highlight 和业务推断。

无法安全识别方法或路径的节点不得制造端点。`auto` 可回退 internal；显式 `codegraph` 必须报告结果不可用。

## 6. Manifest 元数据

在不改变 schema 版本和既有必填字段的前提下，可在 `service_manifest.source_scan` 增加可选元数据：

- 请求的后端；
- 实际使用的后端；
- 使用或回退状态；
- 脱敏回退原因；
- 检查时间和索引时间；
- route 来源。

元数据不得包含：

- 原始外部 JSON；
- 私有源码片段；
- 本机账号、凭据或环境变量；
- 对业务能力的未经验证结论。

## 7. calendar Mode B 同步修复

### 7.1 Plan

calendar 的 `deployment_checklist.md` 和 `card_plan.md` 必须使用专用 Profile，不得回落到 image-agent 语义。

必须包含：

- `GET /api/state`；
- `POST /api/run`；
- `POST /api/stop`；
- 默认 install dry-run；
- `install --apply` 只写 `integrations/lark`；
- 模块本地 `.env`、`npm install`、`npm test`；
- 真实飞书 Level 2 是独立状态。

不得包含：

- `/api/meta`、图片生成或 batch；
- 把 generic adapter 挂载到既有宿主作为当前 Mode B 标准流程；
- 修改目标根启动脚本或增加统一启动命令。

### 7.2 卡片结构

卡片属于 Process/Task + Alert/Log，面向操作人员。信息层级固定为：

1. 状态摘要；
2. 任务参数表单；
3. 主要动作；
4. 最近日志和显示范围说明。

设计红线：

- 技术和审批卡不使用 emoji；
- 正式执行确认展示全部提交值：目标日期、库存、两项延迟、开始商品 ID、结束商品 ID；
- 风险由 header template、danger button 和专业文字共同表达；
- stop 确认明确只作用于当前运行任务；
- 日志保留可用时间戳，单行化并限制长度；
- 明示“仅显示最近 8 条，长行会截断”；
- 状态、参数、日志不堆在同一段高密度 Markdown；
- 状态色只表达状态，不作装饰。

### 7.3 授权与确认

- refresh、dry-run、run、stop 和所有确认/取消动作均要求操作者 allowlist；
- 未授权 refresh 不得调用 `GET /api/state`；
- 正式 run/stop 保持操作者绑定、TTL、单次使用和重复回调保护；
- 错误卡不得泄露 operator/chat ID 或凭据。

### 7.4 安装安全

- 生成包和目标路径中的 symlink/junction 必须在首个写操作前拒绝；
- 测试需覆盖生成模块内部链接和目标 `integrations/lark` 链接；
- Windows 无权限创建链接时，测试可以明确 skip，但不得误报通过；
- package/module 镜像、SHA-256、目标在线和托管冲突门禁保持不变。

## 8. TDD 场景

### C2L-CG-001 internal 基线

- `--backend internal` 不调用外部工具；
- 现有 calendar、generic 和 image-agent 分析结果保持兼容；
- manifest 记录实际使用 internal。

### C2L-CG-002 auto 无工具回退

- PATH 中无 `codegraph` 时分析成功；
- manifest 记录 auto -> internal 和安全回退原因。

### C2L-CG-003 显式工具缺失

- `--backend codegraph` 在工具缺失时非零退出；
- 错误可操作且不自动安装。

### C2L-CG-004 索引状态门禁

- `initialized:false`、pending changes、pending refs、建议重建或不完整状态不得被显式后端接受；
- auto 对同样状态回退 internal。

### C2L-CG-005 route 规范化

- 合法 `{ node, score }[]` route JSON 转为内部 route facts；
- 外部 score/highlight 不进入 manifest；
- 非法 JSON 或无法识别的 route 不制造端点。

### C2L-CG-006 严格合同不旁路

- 外部 route 只能作为发现来源；
- calendar capability 仍严格闭包为 `/api/state`、`/api/run`、`/api/stop`；
- 虚构 prepare/confirm/cancel 目标路径继续被 verify/install 拒绝。

### C2L-CG-007 calendar plan

- plan 只输出 calendar Mode B 指引；
- 不包含 image-agent 或 generic host 残留。

### C2L-CG-008 card 设计与授权

- 全参数确认、无 emoji、日志范围提示、时间戳和信息分组可测试；
- 未授权 refresh 不访问目标。

### C2L-CG-009 链接路径安全

- 生成模块 symlink 和目标 junction 均在写入前阻断；
- 目标快照不变。

### C2L-CG-010 相邻回归

- unit、smoke、Mode B、runtime e2e 和默认 `npm test` 全部通过。

## 9. 实施波次

1. 冻结 dirty work、build 和 Mode B 测试基线。
2. 先增加后端模式、calendar review 和 symlink/junction RED 测试。
3. 新建独立结构分析模块，完成 internal/codegraph 规范化与回退。
4. 把 normalized route facts 接入现有 analyze Profile，保持 schema 0.2。
5. 修复 calendar plan、卡片、授权和日志。
6. 仅在回归测试证明现有路径检查不足时修改 install。
7. 运行 LSP、focused tests 和完整测试套件。
8. 创建全新 calendar replay 并运行完整新流程。
9. 生成新的 timestamped handoff，验证 dry-run、apply、offline 和 conflict 门禁。
10. 更新状态文档并执行代码、安全、QA 和卡片视觉复审。

每一波失败时只回退该波新增改动，不使用 `git reset --hard`、`git checkout --` 或其他破坏性命令。

## 10. 全新 replay 合同

从 `C:\works\calendar-stock-updater` 当前工作树复制到：

```text
C:\works\calendar-stock-updater-code2lark-replay-<timestamp>
```

必须排除：

```text
.git/
.env
node_modules/
data/
coverage/
playwright-profile*/
dist/
build/
.cache/
.next/
*.log
其他运行时、浏览器和临时产物
```

不得复用：

- `C:\works\calendar-stock-updater-mode-b-corrected-replay`；
- `handoff/calendar-stock-updater-lark-long`；
- 任何旧 analysis/generated 目录。

## 11. replay 执行顺序

1. 记录原始 calendar 的 `git status --short` 和 `git diff --stat`。
2. 创建新 replay，确认没有 `.git`、真实 `.env` 或 `node_modules`。
3. 在 replay 内安装依赖并运行目标自身测试。
4. 启动 replay 原有 `npm run ui`，验证 `GET /api/state`。
5. 使用 `analyze --backend auto` 执行 fresh analyze；若没有用户维护的 codegraph 索引，预期安全回退 internal。
6. 运行 fresh `plan`，核对 calendar 专用文档。
7. fresh generate、strict verify 和 timestamped handoff check。
8. install dry-run，比较完整目标快照，必须零写入。
9. install `--apply`，只允许新增 `integrations/lark`。
10. 比较 replay 根文件哈希，必须保持不变。
11. 在模块内运行 `npm install`、`npm test` 和本地 adapter contract。
12. 停止目标，验证在线健康门禁在写入前失败。
13. 恢复目标，修改一个托管文件，验证冲突失败且本地修改保留。
14. 再次核对原始 calendar 状态与步骤 1 完全一致。

## 12. replay 证据

必须保留并报告：

- 新 replay 路径；
- 新 analysis、generated、handoff 路径；
- backend requested/used/fallback 状态；
- 目标自身测试结果；
- strict verify 结果；
- dry-run 零写入比较；
- apply 根文件哈希比较；
- 模块测试和依赖审计；
- offline 与 managed conflict 的预期失败；
- 原始目标前后状态比较。

不得把本地 replay 结论描述为真实飞书完成。

## 13. 自动化门禁

```powershell
npm run build
npm run test:unit
npm run test:smoke
npm run test:mode-b
npm run test:e2e
npm test
```

所有修改的 TypeScript 文件必须通过 LSP diagnostics。生成模块必须运行自己的 `npm test`；安装依赖后运行 `npm audit`，并如实记录结果。

## 14. 完成定义

本任务只有同时满足以下条件才完成：

- 结构后端模式和回退合同有自动测试；
- external schema 不泄漏到业务 Profile；
- schema 0.2 和严格验证保持兼容；
- calendar plan、卡片、授权和日志审查项关闭；
- symlink/junction 回归通过；
- 完整仓库测试通过；
- 全新 replay 和 handoff 完成；
- 原始 calendar 当前工作树未变化；
- 安全、代码质量、独立 QA 和卡片视觉复审通过；
- 没有真实 secret、伪造截图或虚构 Level 2 证据。

## 15. 真实飞书 Level 2 边界

本轮可以证明结构分析、候选包、隔离安装和本地合同。真实飞书仍要求应用 owner 提供安全配置，启用长连接和 `card.action.trigger`，加入测试群并完成人工点击与脱敏证据。

在此之前最终状态只能表述为：

> Code2Lark 的可插拔结构分析后端、calendar-stock-updater Mode B 候选包、隔离安装与本地 replay 已完成验证；真实飞书 Level 2 仍待人工联调。

## 16. 2026-07-16 至 2026-07-17 执行结果

- 全新 replay：`C:\works\calendar-stock-updater-code2lark-replay-20260716-211227`。
- 最终 fresh analysis：`out/calendar-stock-updater-codegraph-replay-20260717-0159`。
- 结构后端：requested=`auto`，used=`internal`，status=`fallback`；原因是目标没有由用户维护的新鲜 codegraph 索引。分析成功且未自动安装、初始化或同步索引。
- 最终候选包：`generated/calendar-stock-updater-codegraph-replay-20260717-0218-v6-lark`。
- 最终脱敏交接包：`handoff/calendar-stock-updater-codegraph-replay-20260717-0218-v7-lark`；共复制 74 个文件，`handoff --check` 通过，warnings=`0`、recommended missing=`0`、excluded present=`0`。
- strict verify：32 项 PASS、0 WARN、0 FAIL；schema 0.2、calendar target contract 和全部 8 个 card action 均通过。
- readiness / doctor：readiness=`external_context_missing`；doctor 确认 package valid，本地最终 gate 仅因真实宿主接入、飞书配置和 Level 2 证据缺失而未通过。
- 仓库自动化：unit `4/4`、smoke `25/25`、Mode B `11/11`、runtime e2e `1/1`；完整 `npm test` 共 `41/41` 通过。
- 最终纠偏重装：install dry-run 对现有 replay 零写入；`--apply` 写入 32 个托管文件且所有变化仍限于 `integrations/lark/**`，目标非 integration 文件 hash change=`0`，验证后端口 3069 已关闭。
- 安装模块：模块测试 `8/8`、replay 根测试 `49/49`；Code2Lark、replay 根和安装模块的 `npm audit` 均为 `0 vulnerabilities`；install manifest 中 31 个源文件与最终生成包及已安装文件 SHA-256 mismatch=`0`。
- 复审纠偏：生成的 calendar TypeScript 已移除文件级抑制并通过 strict `tsc --noEmit`；`journalMode` 被收敛为非关键元数据且全部新鲜度门禁已有测试；卡片状态、日志和失败文本已限长、换行归一和敏感模式脱敏，裸 `auth=...` 在状态、日志、停止确认和失败卡四个表面均会降级，生成产物运行探针通过；generic HTTP adapter 的非 2xx 错误不再携带原始响应正文；calendar context/handoff 已移除图片上传、`bot-runtime` 和 `/api/meta` 残留；根 `AGENT.md` 已改为当前纠偏合同。
- 最终专项复核：CJK/卡片完整性 PASS、hands-on QA PASS、隐私 Oracle PASS；无 MAJOR/HIGH 本地发现。
- 负向门禁：目标离线时 `--apply` 以 exit 1 在首个写入前阻断且目标快照不变；人工修改托管 `README.md` 后再次 `--apply` 以 exit 1 报 managed-file conflict，人工 marker 保留且其余快照不变，随后测试 marker 已移除并恢复生成包哈希。
- 根完整性：排除 `.git`、真实 `.env`、依赖、浏览器/运行时目录和已批准的 `integrations/lark` 后，原始项目与 replay 的 23 个根文件 SHA-256 mismatch=`0`；原始项目仍保持任务开始前的预存 dirty 文件集合。
- 截至本地闭环时，真实飞书 Level 2 尚未执行；当时仍缺 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`TEST_CHAT_ID`、`ALLOWED_OPERATOR_OPEN_IDS`、真实长连接、人工点击、截图/message ID、脱敏日志和签字证据。

### 2026-07-17 真实飞书预联调更新

- 本地私密配置已就绪，但不进入仓库、生成包或交接包。
- 真实飞书 WebSocket 长连接已达到 ready，起始卡已成功发送并由用户确认收到。
- 真实 `card.action.trigger` 已到达宿主；操作因当前应用维度的 operator open_id 与 `ALLOWED_OPERATOR_OPEN_IDS` 不匹配而被安全门禁拒绝。
- 未触发正式执行。修正白名单并完成刷新、普通预演、停止和证据签字前，真实 Level 2 仍为未完成。
