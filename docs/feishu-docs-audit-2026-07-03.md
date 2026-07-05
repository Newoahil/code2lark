# Feishu 文档一致性审查（2026-07-03）

## 范围

本次审查针对 Code2Lark / Lark-deployer 中所有作为飞书平台知识依赖的本地文档，目标是找出已经被官方文档证明为过时、过宽泛或需要按场景拆分的结论。

同步动作：

- 已将一组官方 Feishu/Open Platform 文档快照保存到 `docs/feishu-official/`。
- 已修正 `docs/lark-permissions-reference.md` 与 `docs/feishu-docs-dependency-map.md` 中关于长连接和卡片回调的错误泛化结论。

## 已完成纠偏

### 1. 长连接与卡片回调的关系

**旧结论（错误/过宽泛）：**

```text
长连接支持事件订阅，但不支持 callback subscriptions。
```

**修正后结论：**

```text
新版 `card.action.trigger` 可通过 SDK 长连接路径接收。
旧版 `card.action.trigger_v1` 不支持长连接，仍应视为 legacy / webhook-oriented。
```

**影响文件：**

- `docs/lark-permissions-reference.md` 已修正
- `docs/feishu-docs-dependency-map.md` 已修正

### 2. “长连接只是未来选项”的说法

**旧结论（不准确）：**

```text
Long-connection receiving is documented as a future option.
```

**修正后结论：**

```text
长连接已是当前官方支持路径之一；对于使用新版 `card.action.trigger` 的宿主，长连接是有效 host mode。
```

**影响文件：**

- `docs/feishu-docs-dependency-map.md` 已修正

## 仍需继续拆分/修订的文档

以下文档不一定“错误”，但它们把 **当前 standalone/webhook 场景** 和 **通用平台结论** 混在了一起，后续应按 host mode 拆开：

### A. `docs/mvp-1a-image-agent-web.md`

当前仍大量假设：

- callback URL 一定是 `<PUBLIC_CALLBACK_BASE_URL>/webhook/card`
- `verify --level2` 以 webhook challenge 为核心
- standalone runtime 是默认宿主

这对 **standalone reference runtime** 是成立的，但对未来 **embedded + long_connection host** 不完整。

**建议修订方向：**

- 明确区分：
  - standalone/webhook 验证路径
  - embedded/webhook 验证路径
  - embedded/long_connection 验证路径
- 把 `PUBLIC_CALLBACK_BASE_URL` 改成：
  - webhook host required
  - long_connection host conditional / optional

### B. `docs/fde-handoff.md`

当前交接顺序默认：

```text
配置 callback URL -> /webhook/card -> verify public challenge -> signed action callback
```

这适合 webhook host，但对 long-connection host 不是唯一交付路径。

**建议修订方向：**

- 增加 host_receive_mode 说明：
  - webhook
  - long_connection
  - hybrid
- 长连接模式下，交接重点从 callback URL 转成：
  - 宿主长连接在线
  - app 权限
  - callback/event 类型
  - 实际卡片动作回传证据

### C. `docs/level-2-verification-record.md`

当前模板默认 checklist 包含：

- `PUBLIC_CALLBACK_BASE_URL`
- `POST <PUBLIC_CALLBACK_BASE_URL>/webhook/card` challenge
- public `/webhook/card` signed action

这些对于 webhook host 成立，但对 long-connection host 并非普适。

**建议修订方向：**

拆成至少两套证据模板：

1. webhook host Level 2 record
2. embedded long-connection host Level 2 record

### D. `docs/project-status.md`

当前对验证状态的描述仍偏向：

- `/webhook/card` challenge
- generated runtime debug path

虽然它作为“当前状态快照”可以接受，但如果它被拿来做长期知识依赖，就需要标注：

```text
这些结论主要针对当前 standalone/webhook 参考实现，不是对所有宿主模式的统一表述。
```

## 建议的文档分层

为了避免以后再次把“某一实现路径”误写成“平台通则”，建议把 docs 分成三层：

### 1. 平台事实层（必须最严格）

放：

- `docs/feishu-official/`
- `docs/feishu-docs-dependency-map.md`
- `docs/lark-permissions-reference.md`

特点：

- 只写官方当前能力边界；
- 必须区分 callback 版本、host mode、事件类型；
- 不写过强的 implementation assumption。

### 2. 架构策略层（Code2Lark 自己的选择）

放：

- `docs/development-charter.md`
- `docs/development-direction-v2-adapter-first.md`
- `docs/next-stage-adapter-migration-plan.md`

特点：

- 描述 Code2Lark 如何利用平台能力；
- 允许写 embedded / standalone / webhook / long_connection / hybrid 策略。

### 3. 场景操作层（具体 MVP 的运行手册）

放：

- `docs/mvp-1a-image-agent-web.md`
- `docs/fde-handoff.md`
- `docs/level-2-verification-record.md`

特点：

- 明确写“这是哪种 host mode 下的操作流程”；
- 不再冒充平台通用真理。

## 下一步建议

1. 保留 `docs/feishu-official/` 作为本地官方快照集。
2. 后续所有涉及飞书能力边界的更改，先查官方快照，再改总结文档。
3. 下一轮应重点修订：
   - `docs/mvp-1a-image-agent-web.md`
   - `docs/fde-handoff.md`
   - `docs/level-2-verification-record.md`
4. 在总纲领或单独文档中引入：

```text
host_receive_mode = webhook | long_connection | hybrid
callback_version = card.action.trigger | card.action.trigger_v1
```

避免以后再把“当前实现路径”误写成“平台唯一能力边界”。

## 结论

本次 docs 审查的核心发现是：

> 当前最危险的知识偏差不是代码，而是把 **某一条宿主实现路径（webhook/standalone）** 错写成了 **飞书平台的统一事实**。

这个偏差已经在平台事实层文档中完成纠偏；剩余待修的是场景操作层文档的模式拆分。
