# Lark-deployer 开发方向 v2：Adapter-first

记录时间：2026-07-02

本文档基于新的产品边界澄清：Lark-deployer 的目标不是创建、部署或长期运行一个新的飞书机器人服务，而是把已有服务的交互流程施工式地迁移到飞书机器人中，生成可嵌入、可审查、可验证的飞书交互适配包。

## 1. 设计初衷

以 `image-agent-web` 为例，原始服务能力是：

```text
用户在 Web 前端上传图片
→ 选择目标尺寸
→ 填写修改需求
→ image-agent-web 处理
→ 页面返回目标尺寸图片
```

Lark-deployer 要做的是把这套交互流程迁移为：

```text
用户在飞书机器人卡片中上传/填写/选择
→ 飞书卡片回调触发适配逻辑
→ 适配逻辑调用 image-agent-web 原有接口
→ 飞书机器人返回处理后的图片/状态/失败信息
```

因此，Lark-deployer 的核心职责是：

```text
已有服务交互分析
→ 飞书交互设计
→ 权限/卡片/回调/服务调用适配代码生成
→ 验证与交接材料生成
```

它不应该默认承担：

```text
运行 image-agent-web
部署 image-agent-web
长期运行飞书 bot 服务
替用户维护服务生命周期
替用户管理生产环境
```

一句话定位：

> Lark-deployer 是“已有服务 → 飞书机器人交互适配包”的生成器。

## 2. 核心纠偏：`bot-runtime` 的位置

当前实现把 `bot-runtime` 作为主要生成产物，这对没有现成飞书服务的用户有价值，但与当前设计初衷存在偏差。

新的定位应该是：

```text
adapter/               # 核心产物：可嵌入用户已有飞书 SDK 服务
bot-runtime/           # 可选产物：基于 adapter 的 standalone 参考包装器
```

也就是说：

- `adapter` 是核心。
- `bot-runtime` 只是 adapter 的一个示例宿主或兜底运行方式。
- 如果用户已有飞书 SDK 服务，应优先集成 `adapter`，而不是再部署一套独立 `bot-runtime`。

## 3. 两种输出模式

### 3.1 Embedded adapter mode（默认主模式）

适合：用户已经有飞书 SDK 服务、已有卡片回调、已有部署和日志体系。

生成内容示例：

```text
generated/image-agent-web-lark/
  manifest/
    service_manifest.json
    capability_map.json
    interaction_contract.json
    required_permissions.json

  adapter/
    cards.ts
    image-agent-client.ts
    handlers.ts
    validation.ts
    types.ts
    audit-events.ts

  docs/
    integration_guide.md
    permission_review.md
    deployment_checklist.md
    level2_verification_record.md
```

用户现有飞书服务中的集成方式应类似：

```ts
import { handleImageAgentCardAction } from "./adapter/handlers";

cardActionHandler.onAction(async (ctx) => {
  return await handleImageAgentCardAction(ctx, {
    imageAgentBaseUrl,
    uploadImageToFeishu,
    audit,
    allowedOperatorOpenIds,
  });
});
```

这里由用户已有服务负责：

- SDK 初始化；
- webhook route 或长连接接入；
- token/encrypt 校验；
- 服务部署；
- 日志落地；
- 运行时配置加载；
- 进程生命周期管理。

Lark-deployer 只负责生成业务适配层。

### 3.2 Standalone runtime mode（可选参考模式）

适合：用户没有现成飞书服务，希望快速拿到一个可运行的 Node runtime 做验证。

生成内容仍可包括：

```text
bot-runtime/
  src/index.ts
  package.json
  .env.example
```

但 `bot-runtime` 内部不应再复制业务逻辑，而应导入 `adapter`：

```text
bot-runtime/src/index.ts
→ 负责 HTTP server / CardActionHandler / debug endpoint / health endpoint
→ 调用 ../adapter/handlers.ts
```

目标是让 standalone runtime 成为：

```text
adapter 的参考宿主
```

而不是另一个独立业务实现。

## 4. 新的生成包概念

“生成包”不再被理解为“一个新 bot 服务”，而是一个针对某个目标服务的飞书适配交付物。

它包含：

```text
机器可读契约
权限说明
卡片设计
可嵌入适配器代码
可选 standalone runtime
配置/验收/交接文档
```

推荐结构：

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
    cards.ts
    handlers.ts
    service-client.ts
    validation.ts
    types.ts

  standalone-runtime/          # 可选
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

注意：当前项目已有生成结构可以逐步迁移，不要求一次性改完目录。

## 5. Adapter 应承担的职责

Adapter 是核心产物，应负责：

1. **飞书动作到目标服务能力的映射**
   - `image.generate.submit` → `/api/generate`
   - `image.iterate.submit` → `/api/iterate`
   - `image.batch.submit` → `/api/batch`
   - `image.batch.refresh` → `/api/batch/{batch_id}/status`

2. **卡片表单解析与校验**
   - template id；
   - size；
   - message；
   - 模板字段；
   - feedback；
   - batch items JSON。

3. **目标服务请求构造**
   - 合并默认 preset；
   - 合并用户提交的 form value；
   - 生成目标 API 请求体。

4. **目标服务响应转飞书卡片**
   - 成功卡片；
   - 失败卡片；
   - 运行中卡片；
   - 批量任务状态卡片；
   - 下载链接展示。

5. **安全边界检查的业务部分**
   - operator allowlist 判断可以放在 adapter 中，但 operator 身份来源由宿主服务提供；
   - timeout 参数由宿主配置注入；
   - debug endpoint 不应属于 adapter。

6. **审计事件声明**
   Adapter 可以返回结构化 audit events，但不直接决定日志写到哪里。

## 6. Adapter 不应承担的职责

Adapter 不应负责：

```text
启动 HTTP server
监听端口
读取 .env
创建 Feishu SDK client
注册 webhook route
注册长连接 client
写本地 audit.log
管理进程生命周期
暴露 /debug/* endpoint
部署生产服务
```

这些属于宿主服务（existing Feishu service）或 standalone runtime wrapper 的职责。

## 7. InteractionContract 的调整方向

当前 `src/types.ts` 中：

```ts
trigger: "card_action";
result_mode: "interactive_card";
```

这反映了 MVP-1A 的卡片-only 实现，但不应长期作为唯一交互抽象。

建议逐步改为：

```ts
type InteractionTrigger =
  | { type: "card_action"; action_id: string }
  | { type: "message_command"; command: string }
  | { type: "group_at_command"; command: string };
```

但注意优先级：

- 对当前 `image-agent-web`，卡片交互仍然是最合理路径；
- 不应为了抽象而提前实现群 @ / 私聊命令；
- 只有当第二个目标服务明确需要消息触发时，再扩展运行时/adapter 生成能力。

## 8. 权限推断调整方向

权限推断应从“固定卡片 bot runtime 权限”改成“按交互模式和宿主模式推断”。

### Adapter mode 下

需要输出：

```text
adapter 自身需要宿主具备哪些 Feishu 能力
```

例如：

- 如果使用卡片回调：宿主服务必须已配置 `card.action.trigger`；
- 如果需要发消息：宿主必须有 `im:message:send_as_bot`；
- 如果 adapter 要上传图片：宿主必须有 `im:resource:upload`；
- 如果 adapter 要更新消息：宿主必须有 `im:message:update`。

### Standalone mode 下

仍可生成完整 `.env.example` 和部署清单，因为 runtime 自己负责 SDK client 和 webhook。

## 9. Verify / Doctor 的调整方向

当前 `verify` / `doctor` 假设生成包里有 `bot-runtime`。在 adapter-first 架构下，需要支持两类验收：

### 9.1 Adapter package validation

验证生成物是否完整：

```text
manifest 存在且可解析
adapter 文件存在
interaction_contract 与 handler action id 一致
required_permissions 与 interaction_contract 一致
卡片 JSON skeleton 可构造
```

这类验证不需要启动 runtime。

### 9.2 Host integration validation

由用户提供现有服务地址：

```bash
lark-deployer verify generated/image-agent-web-lark \
  --host-runtime-url http://127.0.0.1:3978 \
  --mode embedded
```

验证项应变为：

```text
GET <host-runtime-url>/health 或用户指定 health endpoint
POST 用户现有服务的 callback 模拟入口
真实飞书 Level 2 时观察宿主服务收到回调
```

如果用户服务没有统一 debug endpoint，Lark-deployer 可以生成一份手动验证 checklist，而不是强制要求宿主实现 `/debug/*`。

## 10. Handoff 的调整方向

Handoff 文档应区分：

```text
你拿到的是 adapter 包，不是一个必须独立部署的 runtime。
```

应提供两套说明：

1. **嵌入已有飞书服务**
   - 复制 adapter 文件；
   - 注册 handler；
   - 注入配置；
   - 确认权限；
   - 跑手动/自动验收。

2. **使用 standalone runtime**
   - 安装依赖；
   - 填 `.env`；
   - 启动服务；
   - 配置 webhook；
   - 跑 Level 2。

## 11. 迁移计划

### P0：文档和概念纠偏

- 更新 README / 项目状态文档，明确：核心目标是 adapter generation，不是 runtime ownership。
- 将 `bot-runtime` 描述为 optional standalone reference runtime。
- 新增 `integration_mode` 概念：`embedded_adapter` / `standalone_runtime`。

### P1：从现有 `bot-runtime` 抽出 adapter 层

从 `generate.ts` 生成的运行时代码中抽离：

```text
cards.ts
image-agent-client.ts
form parsing
validation
runGeneration / runIteration / runBatchSubmission / runBatchStatus
failure/success card construction
```

生成到：

```text
adapter/
```

然后让 `bot-runtime` 引用 adapter。

目标：行为不变，但架构上 adapter 成为核心。

### P2：新增 embedded adapter 输出模式

CLI 增加选项：

```bash
lark-deployer generate out/image-agent-web \
  --out generated/image-agent-web-lark \
  --mode embedded-adapter
```

或在 context 中写：

```json
{
  "integration_mode": "embedded_adapter"
}
```

输出时不生成完整 `bot-runtime`，而是生成 adapter + integration guide。

### P3：适配已有飞书 SDK 服务的验收路径

新增或调整：

```bash
lark-deployer verify <generated-package> --mode embedded --host-runtime-url <url>
```

允许用户指定：

```text
health endpoint
callback simulation endpoint
manual evidence path
```

避免强制用户实现当前 `bot-runtime` 的 `/debug/*` 接口。

### P4：再考虑非卡片交互

只有当出现明确目标服务需要群 @ / 私聊命令时，再扩展：

```text
message_command
group_at_command
long-connection mode
```

当前不要提前做。

## 12. 短期推荐路线

接下来最合理的推进顺序是：

```text
1. 先确认用户现有飞书 SDK 服务的接口形态
   - 如何注册 card action handler
   - 是否已有 upload image 能力
   - 是否已有 audit/logging
   - 是否已有 debug/simulate endpoint

2. 从现有 bot-runtime 中抽 adapter
   - 保持现有 standalone 行为不变
   - 让业务逻辑先变成可复用模块

3. 生成 embedded integration guide
   - 告诉用户如何把 adapter 接进已有服务

4. 用用户现有服务做一次真实 Level 2
   - 不再强制启动 generated bot-runtime

5. 再决定是否保留/弱化 standalone runtime
```

## 13. 成功标准

Adapter-first 版本达到设计要求的标准：

```text
给定一个已有服务 image-agent-web
以及一个已有飞书 SDK 服务
Lark-deployer 能生成一个 adapter 包
用户把 adapter 接入已有飞书服务后
能在飞书卡片里完成原 Web 前端中的图片处理交互
且 Lark-deployer 不接管 image-agent-web 或飞书服务的运行生命周期
```

这才是符合当前设计初衷的完成定义。
