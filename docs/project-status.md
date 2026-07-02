# 项目进展文档

记录时间：2026-07-02
记录人：审计对话（Claude Code）

本文档是对当前代码库和 `docs/` 现有资料的一次快照式审计总结，用于给后续开发和交接提供一个"此刻项目处于什么状态"的基准点。请在重大里程碑后更新此文档，而不是频繁小改。

## 1. 项目定位

Lark-deployer 是一个构建时（build-time）生成器：分析一个已有服务或服务交互流程，生成可审查的服务契约（manifest / capability_map / interaction_contract / required_permissions）、飞书/Lark 交互设计、可嵌入适配器代码、权限说明、验证与交接材料。

2026-07-02 的设计纠偏后，项目总方向以 `docs/development-charter.md` 为准：核心产物应是 `adapter/`，而不是必须独立部署的 `bot-runtime`。当前已有 `bot-runtime` 应被保留为 standalone/reference host，用于没有现成飞书服务的用户或本地验证；对已有飞书 SDK 服务的场景，应优先生成可嵌入 adapter。

当前 MVP（MVP-1A）唯一目标服务：`C:\works\image-agent-web`（`docs/mvp-1a-image-agent-web.md`）。

## 2. 代码规模与结构

- TypeScript 源码约 1.16 万行，分布在 `src/index.ts`（命令分发）+ 12 个 `src/commands/*.ts` 子命令模块 + 少量工具模块（`args.ts`、`env-utils.ts`、`fs-utils.ts`、`http-utils.ts`、`url-validation.ts`、`placeholder-utils.ts`、`types.ts`）。
- 体量最大的文件：`generate.ts`（3311 行，含大量生成运行时源码的模板字符串）、`evidence.ts`（1124 行）、`verify.ts`（1092 行）、`readiness.ts`（1027 行）、`handoff.ts`（1052 行）、`configure.ts`（815 行）、`analyze.ts`（884 行）。
- 测试：`tests/cli-smoke.test.mjs`（1715 行）+ `tests/runtime-local-e2e.test.mjs`（1369 行），均为大型集成测试，暂无针对纯函数模块（如 `url-validation.ts`、`env-utils.ts`）的独立单元测试。
- `tsconfig.json` 开启 `strict: true`，构建目标 ES2022 / NodeNext。

## 3. 命令流水线（当前已实现）

```
analyze → plan → context(生成给所有者的凭据请求) → generate → configure(写 bot-runtime/.env)
→ verify(--simulate / --level2) → evidence(生成 Level2 证据草稿) → doctor(--gate 终态门禁)
→ handoff(--copy-to / --check，脱敏交接包)
```

13 个 CLI 子命令均已实现：`analyze`、`plan`、`generate`、`context`、`configure`、`status`、`readiness`、`doctor`、`verify`、`evidence`、`handoff`、`init-local`。

## 4. 验证状态

- `npm run build`：通过（tsc strict 模式无报错）。
- `npm test`（build + 2 个 node --test 集成测试）：全部通过（2 pass / 0 fail）。
  - CLI 冒烟测试覆盖 analyze → plan → generate → verify 全链路。
  - 运行时本地 e2e 测试覆盖：生成运行时包 → 安装/构建 → 启动 → `/webhook/card` URL 校验挑战 → `/debug/simulate-generate` → `/debug/simulate-card-action`（含表单合并、Feishu 2.0 事件形状兼容、非法输入拒绝）→ 批量任务提交/刷新 → 去重窗口 → operator 授权检查 → 签名/加密回调（当 `VERIFICATION_TOKEN` / `ENCRYPT_KEY` 设置时）。
- **真实飞书 Level 2 验证尚未完成**：`docs/mvp-1a-image-agent-web.md` 明确写明"Real Feishu verification is still pending external app credentials, callback URL setup, and a running target service"。目前所有绿灯都来自本地模拟（mock target + 本地 webhook），尚未在真实飞书开发者应用上跑通发卡、点击回调、图片上传、批量任务下载的完整闭环。
- 唯一一次真实目标服务联调记录：2026-07-01，临时启动 `C:\works\image-agent-web`，验证了 `GET /api/meta`、生成运行时 `/health`、本地卡片 URL 挑战等；`POST /api/generate` 之外的真实调用未覆盖（依赖外部图像/模型服务）。

## 5. 审计结论：优点

1. **文档与代码高度一致**：`docs/lark-permissions-reference.md` 定义的最小权限规则（`tenant_access_token` 优先、群 @ 优先于全量群消息、卡片按钮不等于授权等）都能在生成的运行时代码中找到对应实现。
2. **安全边界意识强**：
   - `url-validation.ts` 拒绝把内网/本地地址当作 Level2 公网回调（`--allow-local-callback` 仅限本地 mock）。
   - `DEBUG_ACCESS_TOKEN` 保护 `/debug/*` 端点。
   - 生成的 `feishu_context.template.json` 强制无密钥，密钥只写入被 `.gitignore` 排除的 `*.local.json` / `.env`。
   - `handoff --copy-to` 扫描已知密钥字面量，拒绝拷贝含密钥的文件；`evidence` 对分享出去的 Markdown 做字段级脱敏（不打印 operator id、chat id、原始人工证据值）。
   - 回调签名/加密校验直接用官方 SDK 的 `CardActionHandler`，未自行实现 crypto 逻辑。
3. **验证分层清晰**：本地模拟 → 本地 webhook 挑战 → 公网 Level2（签名/加密/operator 授权）→ 人工证据记录 → `doctor --gate` 终态门禁，避免"本地模拟通过"被误当成"真实验收完成"。
4. **集成测试扎实**：两个大型 e2e 测试覆盖了从生成到运行时全链路的关键路径，且均通过。

## 6. 审计结论：风险与不足

1. **未提交到 git**：审计时 `git log` 显示当前分支无任何提交，全部文件为 untracked。已有 1.6 万+ 行代码和 5 篇文档缺少版本历史，无法追溯设计决策、无法回滚。**（本次审计后已通过首次提交解决，见下方"处理记录"）**
2. **交互方式当前只实现了"卡片交互"这一种，是代码层收窄，不是飞书平台限制**：
   - `docs/lark-permissions-reference.md` 中定义的权限推断模型是通用的，覆盖发送/回复消息、私聊命令、群 @ 命令、全量群消息监听等多种交互形态。
   - 但 `src/types.ts` 中 `InteractionContract.trigger` 字段的类型被写死为字面量 `"card_action"`（唯一取值，不是枚举选项之一），`result_mode` 同样写死为 `"interactive_card"`。
   - `generate.ts` 生成的运行时代码中只注册了 `lark.CardActionHandler`，没有 `EventDispatcher` 或 `im.message.receive_v1` 相关的消息接收/回复代码路径。
   - 结论：这是 MVP-1A 针对"点按钮生成图片"场景做的合理简化，但如果后续要支持群 @ 命令等触发方式，`types.ts` 的契约类型和 `generate.ts` 的运行时生成逻辑都需要扩展，目前完全不支持。
3. **强绑定单一目标服务**：`analyze.ts` 中 `analyzeImageAgentWeb` 是硬编码函数名，读取 `requirements.txt` / `main.py` / `templates.py` 的逻辑都是针对 `image-agent-web` 定制的。距离 `docs/market-research.md` 设想的"通用服务能力推断"还有较大差距，属于预期内的 MVP 范围。
4. **测试策略单一**：只有两个超大型集成测试（合计约 3000 行），缺少对权限推断、URL 校验、env 解析等纯函数逻辑的单元测试；单次运行耗时约 15 秒/测试，失败定位成本较高。
5. **生成运行时代码以字符串模板形式内嵌**：`generate.ts` 中超过 2500 行是拼接生成 TS 源码的模板字符串，可读性和可维护性较差，模板变更容易引入转义错误，且这部分代码本身不能被 lint/typecheck，只能靠"生成后再 build"间接验证。
6. **安全状态依赖内存**：卡片去重窗口（`cardActionDedupe`）和 operator 授权检查都是进程内内存态，重启或多实例部署会丢失去重状态。文档中已如实标注"not durable cross-process job storage"，是诚实的自我定位，但生产化时需要升级为持久化存储。

## 7. 处理记录

- 2026-07-02：完成首次代码审计（本文档）；创建 `docs/development-direction.md` 记录后续开发方向；执行 `git init` 首次提交，锁定当前基线。
