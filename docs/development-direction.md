# 开发方向文档

记录时间：2026-07-02

本文档基于 `docs/project-status.md` 的审计结论，给出后续开发的优先级建议。这是方向性参考，不是排期承诺；具体顺序应随实际交接/验收进度调整。

## P0：解锁 MVP-1A 正式结项

1. **完成真实飞书 Level 2 验证**
   当前所有绿灯都来自本地模拟。需要按 `docs/fde-handoff.md` 的交接顺序，拿到一个真实飞书开发者应用（`APP_ID`/`APP_SECRET`/`VERIFICATION_TOKEN`/测试群），跑通：发起始卡 → 点击卡片 → 调用 `image-agent-web /api/generate` → 图片回传 → 反馈迭代 `/api/iterate` → 批量任务 `/api/batch` 提交/刷新/下载。
   完成后填写生成包内的 `level2_verification_record.md`，并让 `doctor --gate` 转为通过。这是 MVP-1A 能被称为"完成"的唯一硬性门槛。

2. **版本管理常态化**
   本次审计已完成首次提交。后续每个有意义的变更（尤其是 `generate.ts` 里运行时模板的改动）都应该是独立、可追溯的提交，避免再次积累成一次性大 commit。

## P1：修正交互契约的收窄问题

当前 `src/types.ts` 里 `InteractionContract.trigger` 被写死为 `"card_action"` 字面量，`generate.ts` 只生成 `CardActionHandler`，不支持消息类交互。如果下一个目标服务（或 `image-agent-web` 的下一阶段需求）需要"群 @ 命令触发"或"私聊命令触发"，需要：

- 将 `trigger` 字段扩展为真正的联合类型：`"card_action" | "message_command" | "group_at_command"` 等，而不是单一字面量。
- 在 `generate.ts` 中新增运行时代码分支：注册 `im.message.receive_v1` 事件监听（可复用 `docs/lark-permissions-reference.md` 5.4/5.5 节的权限规则：私聊用 `im:message.p2p_msg:readonly`，群 @ 用 `im:message.group_at_msg:readonly`，避免默认申请全量群消息权限）。
- `required_permissions.json` 的生成逻辑需要根据实际选中的 `trigger` 类型动态推断 scope，而不是固定输出卡片相关的权限集。
- 在做这件事之前，先确认是否真的有需要消息触发的目标服务；如果短期内仍然只服务 `image-agent-web` 这种"点按钮"场景，可以把这条降级为技术债记录，不必抢先做。

## P2：降低单目标绑定，向通用生成器演进

`docs/market-research.md` 里设想的产品定位是"read arbitrary code/service → infer capabilities → generate Lark bot"，但当前 `analyze.ts` 的核心函数 `analyzeImageAgentWeb` 完全硬编码。如果要向通用化迈进，建议分两步走，不要一次性重写：

1. 先把 `analyze.ts` 内部拆分成"通用扫描框架 + image-agent-web 专用适配器"两层，让 `service_manifest.json` / `capability_map.json` 的 schema 保持不变，但填充逻辑可插拔。
2. 再实现第二个目标服务的适配器（选一个结构差异较大的服务做验证，例如纯 CLI 脚本类而非 HTTP API 类），以此检验通用扫描框架是否真的通用，而不是"为了通用而通用"。

`docs/market-research.md` 6.1 节已经给出了两种输入形态的方向（CLI/脚本 vs HTTP API），可以直接作为适配器分层的依据。

## P3：工程质量加固（不阻塞交接，但建议逐步推进）

1. **补充单元测试**：优先给 `url-validation.ts`（host 分类逻辑）、`env-utils.ts`（env 文件解析/占位符判断）、权限推断相关的纯函数补单测，降低集成测试的定位成本。集成测试继续保留作为端到端回归，但不应是唯一的测试形态。
2. **拆分 `generate.ts` 的模板字符串**：3311 行里有 2500+ 行是生成运行时源码的模板字符串。可以考虑把每个生成文件的模板拆到独立的 `.ts.template` 或按运行时文件名拆分成多个模块（例如 `templates/cards.ts.tpl`、`templates/index.ts.tpl`），提高可维护性，并探索能否对模板内容做语法级校验（而不是仅靠"生成后再 build"）。
3. **去重/授权状态持久化**：如果未来需要支持多实例部署或运行时重启不丢状态，`cardActionDedupe` 的内存 Map 需要替换成持久化存储（文件、SQLite 或外部 KV）。当前 MVP 阶段可以维持现状，但需要在 `docs/fde-handoff.md` 里明确告知使用者这一限制（目前已经写明，保持即可）。

## 决策留白（暂不建议投入）

- 是否支持除飞书外的其他 IM 平台（Slack/企业微信等）：`docs/market-research.md` 已经明确"Feishu/Lark only for MVP"，在 MVP-1A 真正结项前不建议扩展渠道。
- 是否引入 `user_access_token` 流程：除非出现明确需要"以用户身份操作用户自有资源"的目标能力，否则维持 `tenant_access_token` 优先的现状。
