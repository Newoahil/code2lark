# Code2Lark

Code2Lark 是一个可以直接被 coding agent 加载的 Feishu/Lark 接入 skill。标准交付方式是把这个仓库作为 skill root：clone 下来后放到 Claude Code、Codex-like agent 或其他支持本地 skills 的目录中，仓库根目录直接包含 `SKILL.md`。

当前 npm 包名和 CLI bin 仍保留历史名称 `lark-deployer`。这是 skill 内部复用的执行层；用户入口仍是 Code2Lark skill。

## 标准安装方式

把仓库 clone 到 agent 的 skills 目录，或 clone 后复制整个仓库根目录。关键要求是：安装目录本身必须直接包含 `SKILL.md`。

Claude-style local skills 示例：

```powershell
git clone https://github.com/Newoahil/code2lark.git C:\Users\<user>\.claude\skills\code2lark
```

如果你的 agent 使用其他 skills/plugin 目录，把同一个仓库根目录放到对应位置即可：

```text
<agent-skills-dir>/code2lark/
  SKILL.md
  references/
  embedded-skills/lark-card-designer/
  tools/
  src/
  package.json
```

不要把 `dist/`、`out/`、`generated/`、`handoff/` 或真实 `.env` 当作 skill 交付内容提交；这些是本地构建、生成或验证产物。

## 支持模式

| 模式 | 适用场景 | 主要入口 |
|---|---|---|
| Retrofit | 目标业务服务已经存在，需要增加 Feishu/Lark 入口。 | `references/retrofit-workflow.md`，CLI `analyze / plan / generate / install / verify / doctor / evidence / handoff` |
| Co-Build | 新业务能力和 Feishu/Lark 入口一起设计与交付。 | `references/cobuild-workflow.md`、`references/cobuild-playbook.md`、内嵌 Lark Card Designer、runtime gates、demo runner |

Co-Build 默认把目标项目内的 Lark 集成放在隔离目录：

```text
integrations/lark
```

这个模块应包含真实 runtime 边界，而不是只输出卡片草图或本地 mock。

## 本地开发与验证

开发机需要 Node.js `>=24.16.0` 和 npm `11.x`。仅作为 agent skill 被发现和加载时不需要运行 `npm install`；只有要使用本仓库的 CLI、demo runner 或测试时才需要安装依赖。

```powershell
npm install
npm run build
npm test
```

验证 skill 静态合同：

```powershell
node tools/run-cobuild-demo.mjs --static-only
npm run test:cobuild-demo
```

## 常用 CLI 命令

CLI 是 Code2Lark skill 的执行层。需要执行 CLI、demo 或测试时，先安装依赖并构建：

```powershell
npm install
npm run build
node dist/index.js --help
```

Retrofit 典型流程：

```powershell
node dist/index.js analyze <target-project> --out out\<target>
node dist/index.js plan out\<target>
node dist/index.js generate out\<target> --out generated\<target>-lark
node dist/index.js verify generated\<target>-lark --strict
node dist/index.js install generated\<target>-lark --target <target-project>
node dist/index.js install generated\<target>-lark --target <target-project> --apply
```

交接和诊断：

```powershell
node dist/index.js doctor generated\<target>-lark
node dist/index.js readiness generated\<target>-lark
node dist/index.js evidence generated\<target>-lark
node dist/index.js handoff generated\<target>-lark
```

卡片 runtime payload 校验：

```powershell
node dist/index.js verify:card <card-json-file-or-directory>
```

## Lark runtime 边界

Code2Lark 明确区分 outbound sender 和 inbound receiver：

- 发送起始卡可以使用 Feishu/Lark OpenAPI over HTTPS；这只是 outbound sender，不算接收路径降级。
- 选择 embedded-long-connection 时，`card.action.trigger` 接收路径不能因为 SDK 未安装而静默降级到 HTTP callback。
- 如果 SDK 安装被阻止，handoff 必须标记 `dependency_pending` 或 `long_connection_blocked`。
- HTTP callback fallback 必须由开发者显式确认。
- `sender_ready` 不等于 `level2_ready`。

真实 Feishu/Lark Level 2 仍依赖需求方 app、权限、测试群、长连接订阅和真实点击证据。

## 重要文档

- `SKILL.md`：agent 加载的唯一公开入口。
- `references/retrofit-workflow.md`：Retrofit skill 工作流。
- `references/cobuild-workflow.md` 和 `references/cobuild-playbook.md`：Co-Build skill 工作流和交付规则。
- `references/feishu-card-json-2-runtime-spec.md`：Lark Card Designer sketch 到 runtime payload 的边界。
- `references/feishu-runtime-gates.md`：runtime、transport、handoff gates。
- `docs/cobuild-user-runbook.md`：需求方使用 Co-Build 的操作手册。
- `docs/cobuild-acceptance-checklist.md`：需求方验收清单。
- `docs/troubleshooting-feishu-runtime.md`：SDK、sender/runtime、长连接、HTTP callback fallback、JSON 2.0 排障。
- `tools/README.md`：本地工具和 demo runner 说明。

## 测试与验证

```powershell
npm run test:unit
npm run test:smoke
npm run test:mode-b
npm run test:cobuild-demo
npm run test:e2e
```

完整测试：

```powershell
npm test
```

`test:smoke` 覆盖 Retrofit 的 `analyze → plan → generate → verify` 路径；`test:cobuild-demo` 覆盖 Co-Build skill 合同；`test:mode-b` 覆盖 `integrations/lark` 隔离安装边界；`test:e2e` 覆盖本地 runtime 模拟链路。

## 项目边界

Code2Lark 负责构建、安装、验证和交接 Lark 集成包；它不负责启动、停止、重启、部署或监管目标业务服务。所有真实 `.env`、app secret、open id、chat id、message id、租户日志和未脱敏证据都不得提交到 Git。
