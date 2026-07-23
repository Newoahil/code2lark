# Code2Lark 产品形态决策

记录时间：2026-07-08
更新：2026-07-21

## 结论

当前阶段，Code2Lark 采用：

> **长期产品入口要做成 skill；CLI 保留为可验证、可脚本化的能力内核。**

也就是说：

- **当前主交付形态**：CLI 工具 + 可生成的 Lark 接入包
- **当前主工作重心**：模式 A / 模式 B 产品化 + manifest-driven 泛用化 + skill 化前的能力内核稳定
- **后续产品入口**：skill / agent 入口，面向“把外部项目变成飞书工作流”的交互式交付体验

## 为什么是 CLI-first

当前已经成立的能力，本质上都属于 CLI 内核：

- `analyze`
- `generate`
- `verify`
- `doctor`
- `readiness`
- `handoff`

并且项目当前的主要风险和主要工作，不在“入口怎么用”，而在：

1. 模式 A / 模式 B 的正式封装
2. `image-agent-web` 样板冻结为回归锚点
3. `manifest` / `types` / `generate` / `analyze` 的去 image-agent-web 绑定
4. 第二目标项目（当前推荐 `calendar-stock-updater`）验证

这些都属于：

> **能力内核工程**

在这个阶段过早做 skill，只会让：

- 入口变好看；
- 但底层仍在快速变化；
- skill 不断追着 CLI 变化跑；
- 容易误判“已经产品化”，实际只是包装层更顺手。

因此：

> 现在做 skill 的收益主要是体验收益，不是能力收益。

calendar-stock-updater 的真实演示链路跑通后，这个判断需要调整：CLI-first 仍适合作为工程内核，但对外展示、需求澄清、项目扫描、交付引导和证据收集更适合由 skill 承载。后续 skill 不应替代 CLI，而应编排 CLI：让用户通过对话完成目标项目选择、能力识别、卡片方案确认、安装 dry-run、真实飞书联调和脱敏证据归档。

## Skill 方向

不做 skill 曾经只是**阶段性优先级选择**，不是长期否定。现在方向已经明确：Code2Lark 后续要形成 skill 入口。

做 skill 入口前仍需保留以下前置条件：

1. 模式 A / 模式 B 已稳定
2. `manifest-driven` 泛用化基本成立
3. 第二目标项目验证通过，且可解释哪些 replay/证据应保留
4. analyze / generate / verify 主路径稳定
5. 文档、术语、产物语义不再持续漂移

skill 应被定义成：

> **Code2Lark CLI 内核之上的交付编排层**

而不是本体。

## 当前阶段的正式定位

当前 Code2Lark 的产品形态应理解为：

> **一个以 CLI 为内核、未来以 skill 为主入口的飞书接入交付工具。**

它未来可以演化成：

```text
skill / agent 入口
→ Code2Lark CLI 内核
→ generated adapter / feishu-host / docs / manifests
```

下一阶段的设计应把 skill 作为产品入口来规划，但实现上仍先加固 CLI 内核，避免 skill 只包装不可靠能力。

## 推荐路线

### 现在

- 继续以 CLI 为主
- 参考归档的 `docs/archive/current-roadmap-task-book.md`，当前状态以 `docs/project-status.md` 为准
- 完成模式 A / B 封装
- 推进泛用化
- 同步整理 skill 入口的职责边界：项目扫描、问题澄清、生成方案解释、安装 dry-run 审查、飞书联调 runbook、证据归档

### 之后

- 把 skill 入口落成第一层产品体验
- 让 skill 调用 CLI，而不是复制 CLI 逻辑
- 用 calendar 和 image-agent 两个样板作为 skill 回归演示

## 一句话总结

> **Code2Lark 后续产品形态是 skill-first 体验、CLI-core 内核：用户通过 skill 完成交付决策和演示闭环，CLI 负责可重复、可验证、可脚本化的生成与检查。**
