# Code2Lark

Code2Lark 是一个面向 Feishu/Lark 接入交付的 **skill + CLI/runtime toolkit**。它既能作为外部 agent 可加载的 skill，指导 Retrofit / Co-Build 工作流，也能通过本仓库内的 TypeScript CLI 生成、安装、验证和交接 Lark 集成包。

当前 npm 包名和 CLI bin 仍保留历史名称 `lark-deployer`，但交付品牌和 skill 入口统一为 Code2Lark。

## 当前交付形态

当前推荐交付物是一个 toolkit zip：

```text
dist/code2lark-toolkit-v<version>.zip
```

这个 zip 同时包含：

- **Skill layer**：`SKILL.md`、`references/`、内嵌 `embedded-skills/lark-card-designer/`。
- **CLI/runtime layer**：`dist/`、`src/`、`package.json`、`tools/`、`tests/`、`docs/`。
- **Retrofit + Co-Build 两种模式**：既能给已有项目补 Lark 入口，也能在新业务能力设计时同步设计 Lark 入口。

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

## 快速开始

开发机需要 Node.js `>=24.16.0` 和 npm `11.x`。

```powershell
npm install
npm run build
npm test
```

生成可交付 toolkit zip：

```powershell
npm run package:toolkit
```

解压后的需求方自检：

```powershell
npm install --ignore-scripts
npm run build
node dist/index.js --help
node tools/run-cobuild-demo.mjs --static-only
```

## 需求方安装

Claude-style local skills 可以把 zip 解压后的 toolkit root 放到：

```text
C:\Users\<user>\.claude\skills\code2lark
```

其他 agent 使用时，把同一个 root folder 安装到对应 skill/plugin 目录即可。该 root 必须直接包含 `SKILL.md`。

## 常用 CLI 命令

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

Co-Build skill 合同自检：

```powershell
node tools/run-cobuild-demo.mjs --static-only
npm run test:cobuild-demo
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

- `docs/code2lark-toolkit-zip-delivery-guide.md`：toolkit zip 打包、安装、自检、Retrofit / Co-Build 使用入口。
- `docs/cobuild-user-runbook.md`：需求方使用 Co-Build 的操作手册。
- `docs/cobuild-acceptance-checklist.md`：需求方验收清单。
- `docs/troubleshooting-feishu-runtime.md`：SDK、sender/runtime、长连接、HTTP callback fallback、JSON 2.0 排障。
- `references/retrofit-workflow.md`：Retrofit skill 工作流。
- `references/cobuild-workflow.md` 和 `references/cobuild-playbook.md`：Co-Build skill 工作流和交付规则。
- `references/feishu-card-json-2-runtime-spec.md`：Lark Card Designer sketch 到 runtime payload 的边界。
- `references/feishu-runtime-gates.md`：runtime、transport、handoff gates。

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
