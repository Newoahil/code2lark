# Code2Lark 产品形态决策

记录时间：2026-07-08

## 结论

当前阶段，Code2Lark 采用：

> **方案 A：CLI-first，skill 暂缓。**

也就是说：

- **当前主交付形态**：CLI 工具
- **当前主工作重心**：模式 A / 模式 B 产品化 + manifest-driven 泛用化
- **暂不优先做的形态**：skill 入口 / agent 入口

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

## 这不代表以后不做 skill

不做 skill 只是**当前阶段的优先级选择**，不是长期否定。

未来当这些条件成立后，再做 skill 入口：

1. 模式 A / 模式 B 已稳定
2. `manifest-driven` 泛用化基本成立
3. 第二目标项目验证通过
4. analyze / generate / verify 主路径稳定
5. 文档、术语、产物语义不再持续漂移

届时，skill 应被定义成：

> **Code2Lark CLI 内核之上的入口层**

而不是本体。

## 当前阶段的正式定位

当前 Code2Lark 的产品形态应理解为：

> **一个以 CLI 为内核的、用于生成飞书接入产物的构建时工具。**

它未来可以演化成：

```text
skill / agent 入口
→ Code2Lark CLI 内核
→ generated adapter / feishu-host / docs / manifests
```

但这不是这一阶段的主任务。

## 推荐路线

### 现在

- 继续以 CLI 为主
- 推进 `docs/current-roadmap-task-book.md`
- 完成模式 A / B 封装
- 推进泛用化

### 之后

- 当第二目标验证通过后
- 再评估 skill 入口

## 一句话总结

> **当前阶段，Code2Lark 先做成成熟的 CLI 内核工具；skill 作为未来入口层，等泛用化与模式封装稳定后再做。**
