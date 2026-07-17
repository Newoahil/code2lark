# calendar-stock-updater Mode B 纠偏任务书

记录时间：2026-07-16
状态：本地纠偏、隔离安装、自动化复验与最终复核完成，等待真实飞书 Level 2
适用仓库：`C:\works\Lark-deployer`

本任务书取代旧任务书中的以下方向，但保留旧文件作为历史记录：

- 不再修改目标项目根启动脚本、`package.json`、Docker 或业务文件；
- 不再要求目标实现 `/api/run/prepare`、`/api/run/confirm`、`/api/stop/prepare`、`/api/stop/confirm`；
- 不再把手工复制生成物视为标准安装流程；
- 不再把 replay 的适配性修改回写到原始项目。

## 1. 目标与不变量

Code2Lark 必须完成一条可审查的两阶段 Mode B 流程：

```text
分析目标
-> 生成候选包 generated/<target>-lark
-> 严格验证生成包与目标源码契约
-> install dry-run
-> 用户显式 install --apply
-> 仅写入 <target>/integrations/lark
```

固定不变量：

1. `generated/<target>-lark` 是单一事实来源。
2. `generate` 永远不写入目标项目。
3. `install` 默认只 dry-run；只有 `--apply` 可以写文件。
4. 安装只允许写入 `integrations/lark/**`。
5. 目标根 `package.json`、锁文件、启动脚本、Docker、业务代码、Web UI 必须保持字节不变。
6. 原始项目 `C:\works\calendar-stock-updater` 只读。
7. 真实飞书凭据、目标登录凭据和本地 `.env` 不进入生成包、测试快照或 Git。

## 2. 目标项目真实契约

生成的宿主只允许调用原始项目已经存在的三个有限 HTTP 端点：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/state` | 健康探测、表单默认值、任务状态和最近日志 |
| `POST` | `/api/run` | 以 `mode=dry-run` 预演，或以 `mode=run` 正式执行 |
| `POST` | `/api/stop` | 停止当前任务 |

`GET /api/events` 是浏览器 SSE 支撑端点，只记录为 `supporting`，不得生成飞书动作。

以下路径不存在于原始目标，生成、验证和安装都必须拒绝它们：

```text
/api/run/prepare
/api/run/confirm
/api/run/cancel
/api/stop/prepare
/api/stop/confirm
/api/stop/cancel
```

卡片动作可以保留 `prepare`、`confirm`、`cancel` 语义，但这些是宿主本地状态机，不是目标能力。

## 3. 生成包与安装闭包

calendar Mode B 候选包除现有 manifest 和 adapter 外，还必须包含一个可直接安装的闭包：

```text
generated/calendar-stock-updater-lark/
  generation_summary.json
  manifest/
  adapter/
  docs/
  integrations/
    lark/
      app.js
      config.js
      host.js
      package.json
      package-lock.json          # 仅在生成流程实际固定依赖时生成
      .env.example
      README.md
      install-manifest.json
      generated/
        adapter/
        manifest/
        docs/
        sidecar-long-connection/
      *.test.mjs
```

`integrations/lark` 必须：

- 自包含 Node 宿主和 `@larksuiteoapi/node-sdk` 依赖；
- 使用模块自己的 `.env`，不依赖目标根 `.env`；
- 能整体删除，不要求清理目标根文件；
- 不 import 目标业务模块，只通过 HTTP 调用目标；
- 不要求目标提供统一启动入口。

当前 calendar 实现使用独立 Node 宿主。以后可优先跟随目标语言；没有成熟模板时仍以隔离 Node 模块作为安全回退。

## 4. 飞书卡片与确认流程

### 4.1 信息结构

卡片使用 JSON 2.0，并镜像原 Web 控制台的推荐流程：

- 状态：任务状态、当前消息、日期范围、库存、商品范围、启动时间；
- 参数：目标日期、库存、普通操作停顿、日期组件停顿、可选开始商品 ID、可选结束商品 ID；
- 动作：刷新、普通预演、申请正式执行、申请停止；
- 日志：最近有限条目，单行脱敏并限制长度。

表单默认值必须来自 `GET /api/state` 的 `defaults`，而不是生成时写死。

原项目仅通过环境变量支持、但 Web UI 没有暴露的特殊日期/SKU 模式，只记录为人工 review candidate，本阶段不进入默认飞书卡片。

### 4.2 风险分级

- 刷新：直接 `GET /api/state`。
- 普通预演：校验表单后直接 `POST /api/run`，请求体包含 `mode: "dry-run"`。
- 正式执行：先生成宿主本地、绑定操作者、单次使用、有限 TTL 的确认记录；确认后调用 `POST /api/run`，请求体包含 `mode: "run"`。
- 停止任务：先读取当前状态并生成宿主本地确认记录；确认后调用 `POST /api/stop`。
- 取消确认：删除或放弃本地记录并刷新状态，不调用写端点。

确认值不得包含目标凭据或可伪造的完整业务授权。宿主必须重新校验操作者、确认类型、TTL 和单次使用状态。

### 4.3 回调约束

- 只订阅新版 `card.action.trigger`；
- `action.value` 必须按对象处理，表单读取 `form_value`；
- 回调必须在 3 秒内返回卡片或 toast；
- 同一 `event_id` 或同一确认 token 的重复投递不得重复执行 run/stop；
- 当前设计默认单活宿主。若未来多实例部署，确认和幂等状态必须迁到共享存储。

## 5. 安装命令契约

建议 CLI：

```powershell
node dist/index.js install <generated-package> `
  --target <target-project> `
  [--target-base-url <url>] `
  [--apply]
```

默认 dry-run 必须：

1. 验证生成包标记、Profile 和安装 manifest；
2. 验证 manifest 中所有相对路径安全且位于 `integrations/lark` 闭包；
3. 验证文件 SHA-256 与 manifest 一致；
4. 验证 capability 端点全部来源于分析发现；
5. 拒绝生成代码中的虚构 prepare/confirm/cancel 目标路径；
6. 实际探测 `GET <target-base-url>/api/state` 并要求 2xx JSON；
7. 完成全部冲突检查；
8. 输出计划写入的文件，但不创建目录或文件。

`--apply` 必须先完成同一套预检，再一次性写入。任何失败都必须发生在首个写操作之前。

## 6. 托管文件与冲突规则

生成的 `install-manifest.json` 列出每个托管文件及 SHA-256。安装后在模块内写入 `.code2lark-install.json`，记录实际安装版本和安装时哈希。

升级规则：

- 目标文件不存在：允许创建；
- 目标文件存在但没有历史托管记录：视为用户文件，停止；
- 目标文件存在且当前哈希等于上次安装哈希：允许更新；
- 目标文件存在且当前哈希不同于上次安装哈希：视为人工修改，停止并列出冲突；
- 不使用 `--force` 绕过人工修改；
- 不静默删除旧文件。本阶段由 README 提供整体删除 `integrations/lark` 的人工清理方式。

## 7. 三层本地成熟度与独立真实飞书状态

本地成熟度固定为前三层；真实飞书验证是独立证据状态，必须分开表述：

1. **候选包已生成**：离线也可达到；只说明静态分析和生成完成。
2. **安装 dry-run 已审查**：目标在线、契约和冲突预检通过，但目标仍未写入。
3. **本地安装已验证**：`--apply` 仅写入 `integrations/lark`，模块测试和本地目标合同通过。
4. **真实飞书已验证**：真实应用、长连接、起始卡和人工点击证据均完成。

前三个状态不得被描述为“真实飞书接入完成”。

## 8. TDD 场景合同

生产代码修改前先建立 RED 测试：

### C2L-MB-001 候选包边界

- calendar 离线分析和生成成功；
- 目标项目没有新增 `integrations/lark`；
- 生成包包含完整安装闭包。

### C2L-MB-002 默认 dry-run

- 不带 `--apply` 时命令成功输出计划；
- 目标在线且合同通过；
- 目标目录无任何新增或修改。

### C2L-MB-003 隔离安装

- `--apply` 仅创建 `integrations/lark/**`；
- 根文件安装前后哈希一致；
- 模块本地测试通过。

### C2L-MB-004 离线阻断

- `GET /api/state` 不可达时 dry-run/apply 失败；
- 失败前没有目标写入。

### C2L-MB-005 托管冲突

- 首次安装成功；
- 人工修改托管文件后再次安装失败；
- 人工内容保持不变。

### C2L-MB-006 真实端点闭包

- capability map 只有 `/api/state`、`/api/run`、`/api/stop`；
- 卡片本地确认动作不增加目标端点；
- 虚构路径导致 strict verify/install 失败。

### C2L-MB-007 相邻回归

- image-agent-web 现有 generate/verify/e2e 通过；
- generic-http-api 现有 generate/verify 通过。

## 9. 实施波次

1. 冻结当前 dirty work 和基线测试结果。
2. 新增 RED 安装与 calendar 合同测试。
3. 纠正 calendar capability、interaction、卡片和 handler。
4. 生成自包含 `integrations/lark` Node 闭包及安装 manifest。
5. 强化 strict verify 的源码发现端点门禁。
6. 增加 dry-run-first `install` 和在线健康门禁。
7. 增加 manifest 范围复制和托管哈希冲突检查。
8. 更新模块 README、`.env.example` 和三层本地成熟度说明。
9. 在全新 replay 上执行真实 CLI 表面验证。
10. 执行自动测试、LSP、代码审查、安全审查和卡片设计审查。

## 10. 全新 replay 验收

从原始项目的当前工作树创建新副本，但排除：

```text
.git/
.env
node_modules/
data/
playwright-profile*/
*.log
coverage/
临时和缓存目录
```

不得覆盖现有 replay；使用新的、空的目标路径。顺序为：

1. 记录原始项目状态和关键文件哈希；
2. 创建 replay，并先运行目标自己的测试；
3. 启动 replay 的现有 `npm run ui`，确认 `GET /api/state`；
4. fresh analyze、generate、strict verify；
5. install dry-run，确认零写入；
6. install `--apply`；
7. 比较目标根关键文件哈希，只允许 `integrations/lark` 新增；
8. 运行模块测试和 adapter contract；
9. 停止目标后验证离线阻断；
10. 恢复目标、修改一个托管文件并验证冲突阻断；
11. 删除实验 replay 或按用户要求保留证据。

## 11. 最终自动化门禁

```powershell
npm run build
npm run test:unit
npm run test:smoke
npm run test:mode-b
npm run test:e2e
```

并必须证明：

- 原始 calendar 项目状态未因本任务变化；
- C2L 所有改动均可解释且没有回退既有用户修改；
- dry-run 零写入；
- apply 只写 `integrations/lark`；
- run/stop 重复确认不会产生重复目标调用；
- 模块文档包含本地配置、启动、测试、整体删除和 Level 2 后续步骤；
- 没有真实 secret 或虚构验证证据。

## 12. 真实飞书 Level 2 边界

本任务可以完成候选包、本地安装和本地合同验证。真实 Level 2 仍要求操作者安全提供应用配置，并人工完成：

1. 启用机器人；
2. 启用长连接；
3. 订阅 `card.action.trigger`；
4. 把机器人加入测试群；
5. 启动 `integrations/lark/app.js`；
6. 发送并点击真实卡片；
7. 记录脱敏 message id、截图和操作结果。

在这些证据完成前，最终结论只能是：

> calendar-stock-updater 的 Mode B 候选包、隔离安装流程和本地合同验证已完成，等待真实飞书 Level 2 联调。

## 13. 2026-07-17 执行结果

- 最终候选包：`generated/calendar-stock-updater-codegraph-replay-20260717-0218-v6-lark`。
- 最终脱敏交接包：`handoff/calendar-stock-updater-codegraph-replay-20260717-0218-v7-lark`；共复制 74 个文件，`handoff --check` 通过，warnings=`0`、recommended missing=`0`、excluded present=`0`。
- strict verify：32 项 PASS，0 WARN，0 FAIL；schema 0.2、三个目标端点和八个卡片动作均通过。
- readiness / doctor：readiness=`external_context_missing`；doctor 确认 package valid，本地最终 gate 仅因真实宿主接入、飞书配置和 Level 2 证据缺失而未通过。
- 生成 adapter：TypeScript 不含 `@ts-nocheck`、`@ts-ignore` 或 `@ts-expect-error`，并通过 strict `tsc --noEmit`；JavaScript adapter 实际执行通过。
- 卡片纠偏：状态与停止确认消息限长并归一换行；状态和最近日志对 URL、HTML、secret/token/password、裸 `auth=...`、operator/chat ID 等敏感模式降级；裸 auth 的状态、日志、停止确认和失败卡运行探针通过；目标 HTTP 错误不再展示原始响应正文；授权和延迟字段使用中文业务标签。
- replay 重装：dry-run 零写入；`--apply` 写入 32 个托管文件且仅位于 `integrations/lark/**`，目标非 integration 文件 hash change=`0`；31 个 manifest 文件与生成包和安装结果 SHA-256 mismatch=`0`。
- 自动化：Code2Lark unit `4/4`、smoke `25/25`、Mode B `11/11`、e2e `1/1`，完整 `npm test` 为 `41/41`；replay 根 `49/49`，模块 `8/8`。
- 安全与完整性：Code2Lark、replay 根和安装模块 `npm audit` 均为 0 vulnerabilities；离线和托管文件冲突均在写入前阻断；原始项目与 replay 的 23 个批准范围文件 mismatch=`0`；端口 3069 在验证后关闭。
- 最终专项复核：CJK/卡片完整性 PASS、hands-on QA PASS、隐私 Oracle PASS；无 MAJOR/HIGH 本地发现。
- 截至本地闭环时，真实飞书 Level 2 尚未执行；当时仍缺 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`TEST_CHAT_ID`、`ALLOWED_OPERATOR_OPEN_IDS`、真实长连接、人工点击、截图/message ID、脱敏日志与签字。

### 2026-07-17 真实飞书预联调更新

- 本地 `.env` 已完成私密配置，真实值不进入 Git、生成包、交接包或共享日志。
- 长连接 ready、起始卡发送和用户收卡均已确认，真实 `card.action.trigger` 也已到达隔离宿主。
- 当前点击因回调中的当前应用维度 operator open_id 与本地 `ALLOWED_OPERATOR_OPEN_IDS` 不匹配而被授权门禁拒绝；这是预期的安全失败。
- 未发生正式库存执行。修正白名单并重新取得刷新、普通预演、停止和人工证据前，真实 Level 2 仍未完成。
