# Lark-deployer 项目总开发纲领

记录时间：2026-07-02

本文档是 Lark-deployer 当前阶段的最高层开发纲领，用于统一项目定位、边界、产物结构、阶段目标和后续实现方向。若本文档与早期文档中“生成独立 bot-runtime 作为主产物”的描述冲突，以本文档为准。

## 1. 一句话定位

> Lark-deployer 是一个“已有服务交互流程 → 飞书/Lark 机器人交互适配包”的自动化生成器。

它的任务不是新建或接管一个长期运行的飞书机器人服务，而是把已有服务原本发生在 Web 页面、CLI、HTTP API 或其他界面中的交互流程，施工式地迁移到飞书机器人中。

以 `image-agent-web` 为例：

```text
原始流程：
用户在 Web 前端上传图片
→ 选择目标尺寸
→ 填写修改需求
→ image-agent-web 处理
→ Web 页面返回目标图片

Lark-deployer 目标流程：
用户在飞书卡片中上传/填写/选择
→ 飞书卡片回调触发适配逻辑
→ 适配逻辑调用 image-agent-web 原有能力
→ 飞书机器人返回处理后的图片/状态/失败信息
```

核心不是“重做 image-agent-web”，也不是“替用户部署一个新的 bot 服务”，而是生成一层可审查、可嵌入、可验证的飞书交互适配层。

## 2. 与 Code2MCP 的对齐关系

Code2MCP 的理念是：

```text
已有代码仓库 → MCP adapter/service
```

Lark-deployer 的对应理念是：

```text
已有服务交互流程 → 飞书/Lark adapter package
```

两者共同原则：

1. **已有能力转新协议**
   - Code2MCP 把已有代码能力转成 MCP 工具/服务；
   - Lark-deployer 把已有服务交互转成飞书机器人交互。

2. **最小侵入**
   - 不重写原项目；
   - 不要求原项目改变核心实现；
   - 只生成外部适配层、契约、文档和验证材料。

3. **分析 → 生成 → 验证 → 报告**
   - 先理解原服务能力；
   - 再生成适配代码；
   - 再验证适配结果；
   - 最后输出可交接报告。

4. **Adapter-first**
   - Code2MCP 输出 `adapter.py` / `mcp_service.py`；
   - Lark-deployer 应输出 `adapter/handlers.ts` / `adapter/cards.ts` / `adapter/service-client.ts`。

Lark-deployer 不应照搬 Code2MCP 的自动部署目标。Code2MCP README 中包含 HuggingFace Spaces 部署和客户端自动配置，而 Lark-deployer 当前阶段应坚持：

```text
负责适配施工，不负责生产运转。
```

## 3. 最小侵入原则

Lark-deployer 必须遵守最小侵入原则：

```text
不修改目标服务核心代码；
不接管目标服务部署；
不接管用户已有飞书 SDK 服务；
不强制用户运行一个新的 bot runtime；
只生成围绕目标服务的飞书交互适配包。
```

目标服务仍然拥有自己的运行方式、部署方式、日志体系、认证体系和生命周期。

用户已有飞书 SDK 服务时，Lark-deployer 应优先生成可嵌入 adapter，而不是要求用户部署一套新的 `bot-runtime`。

## 4. 核心产物定义

项目核心产物应从“独立 bot-runtime”调整为“飞书适配包”。

推荐生成包结构：

```text
generated/<target>-lark/
  START_HERE.md
  README.md

  manifest/
    service_manifest.json
    capability_map.json
    interaction_contract.json
    required_permissions.json

  adapter/
    handlers.ts
    cards.ts
    service-client.ts
    validation.ts
    types.ts
    audit-events.ts

  standalone-runtime/          # 可选，参考宿主，不是核心业务层
    package.json
    src/index.ts
    .env.example

  docs/
    integration_guide.md
    permission_review.md
    deployment_checklist.md
    context_request.md
    level2_verification_record.md
```

其中：

- `manifest/` 是机器可读契约；
- `adapter/` 是核心代码产物；
- `docs/` 是人类审查、集成、验收、交接材料；
- `standalone-runtime/` 只是可选参考包装器。

## 5. Adapter 的职责

Adapter 应负责业务适配，不负责服务运转。

Adapter 应承担：

1. **动作映射**
   - 飞书 action id → 目标服务能力；
   - 例如 `image.generate.submit` → `/api/generate`。

2. **表单解析与校验**
   - 解析飞书卡片 form value；
   - 校验必填字段、尺寸、模板字段、batch JSON 等。

3. **请求构造**
   - 将飞书输入合并到目标服务请求体；
   - 保留默认 preset；
   - 生成目标 API 调用参数。

4. **目标服务调用**
   - 调用已有服务的 HTTP API、CLI、SDK 或其他接口；
   - 当前 MVP-1A 是 HTTP API 方式。

5. **响应转卡片**
   - 成功卡片；
   - 失败卡片；
   - 运行中卡片；
   - 迭代结果卡片；
   - batch 进度/下载卡片。

6. **业务安全检查**
   - operator allowlist；
   - action/capability enablement；
   - destructive / write 行为标记；
   - timeout 参数由宿主注入。

7. **审计事件声明**
   - Adapter 可以返回结构化 audit events；
   - 但不决定日志写到哪里。

## 6. Adapter 不应承担的职责

Adapter 不应负责：

```text
启动 HTTP server
监听端口
读取 .env
创建飞书 SDK client
注册 webhook route
注册长连接 client
写本地 audit.log
暴露 /debug/* endpoint
管理进程生命周期
部署生产服务
```

这些属于：

- 用户已有飞书 SDK 服务；或
- 可选 standalone runtime wrapper。

## 7. bot-runtime 的新定位

当前项目已经实现了 `bot-runtime`，它不是废代码，但它的定位必须下调：

```text
旧定位：核心生成产物，一个新的完整 bot 服务。
新定位：adapter 的 standalone/reference host，用于没有现成飞书服务的用户或本地验证。
```

保留 `bot-runtime` 的价值：

- 可以作为端到端参考实现；
- 可以帮助没有现成飞书服务的用户快速验证；
- 可以作为 adapter 的集成示例；
- 可以保留现有 debug/verify/audit 经验。

但后续演进中：

```text
业务逻辑必须从 bot-runtime 抽出到 adapter/；
bot-runtime 只负责 SDK wiring / HTTP server / debug endpoint / health endpoint；
bot-runtime 不再复制业务实现。
```

## 8. 两种集成模式

### 8.1 embedded_adapter（默认主模式）

适合已有飞书 SDK 服务的用户。

宿主服务负责：

- 飞书 SDK 初始化；
- webhook 或长连接接入；
- token/encrypt 校验；
- 图片上传 API 封装；
- 日志和审计落地；
- 运行时配置；
- 部署与进程管理。

Lark-deployer 输出：

```text
adapter/
manifest/
docs/
```

示例集成方式：

```ts
import { handleImageAgentCardAction } from "./adapter/handlers";

cardActionHandler.onAction(async (ctx) => {
  return await handleImageAgentCardAction(ctx, {
    imageAgentBaseUrl,
    timeoutMs,
    allowedOperatorOpenIds,
  });
});
```

### 8.2 standalone_runtime（可选参考模式）

适合没有现成飞书服务的用户。

Lark-deployer 可以生成一个完整可运行的包装器，但包装器必须调用 adapter，而不是内嵌业务逻辑。

## 9. 契约模型方向

当前 MVP-1A 的 `InteractionContract` 被写死为：

```ts
trigger: "card_action";
result_mode: "interactive_card";
```

短期可接受，因为 `image-agent-web` 最适合卡片表单交互。

长期应演进为：

```ts
type InteractionTrigger =
  | { type: "card_action"; action_id: string }
  | { type: "message_command"; command: string }
  | { type: "group_at_command"; command: string };
```

但不要为了抽象提前实现消息触发。只有当第二个目标服务明确需要群 @ / 私聊命令时，再扩展。

## 10. 权限推断方向

权限推断必须同时考虑：

```text
目标服务能力
飞书交互方式
宿主模式 embedded / standalone
```

例如：

- 卡片回调 → 需要宿主配置 `card.action.trigger`；
- 发消息 → 需要 `im:message:send_as_bot`；
- 上传图片 → 需要 `im:resource:upload`；
- 更新消息 → 需要 `im:message:update`；
- 群 @ 命令 → 需要 `im.message.receive_v1` + `im:message.group_at_msg:readonly`；
- 私聊命令 → 需要 `im.message.receive_v1` + `im:message.p2p_msg:readonly`。

Adapter mode 下，`required_permissions.json` 应表达“宿主服务必须已具备这些飞书能力”；standalone mode 下，才需要完整 `.env.example`、callback URL 和启动说明。

## 11. 验证体系方向

现有 `verify` / `doctor` 主要围绕 generated `bot-runtime`。后续应拆成两类：

### 11.1 package validation

不需要启动 runtime，验证生成包自洽：

```text
manifest 可解析；
adapter 文件存在；
handler action id 与 interaction_contract 一致；
required_permissions 与 interaction_contract 一致；
card skeleton 可生成；
integration_guide 存在。
```

### 11.2 host integration validation

用户已有飞书服务提供宿主地址或手动证据：

```bash
lark-deployer verify <generated-package> \
  --mode embedded \
  --host-runtime-url http://127.0.0.1:3978
```

验证项可包括：

```text
宿主 health endpoint；
宿主 callback simulation endpoint（如果有）；
真实飞书 Level 2 人工证据；
宿主日志/审计字段；
飞书消息 ID / 图片结果 / batch 下载结果。
```

如果宿主服务没有 debug endpoint，Lark-deployer 不应强制要求，而应生成手动验收 checklist。

## 12. 当前阶段的阶段目标

当前阶段不再以“跑通 generated bot-runtime”为最终目标，而以 adapter-first 架构落地为目标。

阶段目标：

```text
从当前 bot-runtime 中抽出 adapter；
保留 standalone runtime 作为包装器；
新增 embedded adapter 输出与集成文档；
用用户现有飞书 SDK 服务完成真实集成验证。
```

## 13. 成功标准

Adapter-first 版本的完成标准：

```text
给定一个已有服务 image-agent-web；
给定一个已有飞书 SDK 服务；
Lark-deployer 能生成一个 adapter 包；
用户把 adapter 接入已有飞书服务；
飞书卡片内可完成原 Web 前端的图片处理交互；
Lark-deployer 不接管 image-agent-web 或飞书服务的运行生命周期；
生成包包含权限说明、契约、集成说明和验收材料。
```

当上述条件成立，项目才真正符合当前设计初衷。

## 14. 开发原则

1. **Adapter-first**：业务适配逻辑优先生成到 `adapter/`。
2. **Standalone optional**：`bot-runtime` 只作为参考宿主。
3. **Minimal intrusion**：不改目标服务核心代码。
4. **Host-owned runtime**：运行、部署、日志、SDK 初始化由宿主负责。
5. **Manifest-driven**：生成代码必须由 manifest / interaction contract 驱动。
6. **Reviewable permissions**：所有飞书权限必须说明原因与触发能力。
7. **Verification over claims**：是否完成以真实飞书/宿主集成证据为准。
8. **No premature channel expansion**：未出现明确需求前，不扩展 Slack/企业微信/群 @ / 私聊命令。
9. **Small commits**：架构纠偏必须拆成可审查的小提交。
