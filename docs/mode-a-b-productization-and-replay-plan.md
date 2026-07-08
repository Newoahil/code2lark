# Code2Lark 模式 A/B 封装与 image-agent-web 重放验证任务书

记录时间：2026-07-08

本文档描述下一阶段的目标：

> **先把 Code2Lark 的模式 A / 模式 B 正式封装为清晰可交付的能力，再复制一份 `image-agent-web` 作为全新样本，按模式 B 从零重放一遍，验证 Code2Lark 是否已经从“实验项目”升级成“真正的工具”。**

这不是继续在当前已经跑通的 `image-agent-web` 样板上修修补补，而是做一次更高标准的“工具成熟度验收”。

---

## 1. 背景

当前 `image-agent-web` 样板已经完成了：

- `self-hosted-runtime`（Python `feishu-host/`）长连接宿主真实飞书验证；
- Card JSON 2.0；
- `card.action.trigger`；
- generate / iterate / batch / refresh / failure path；
- 异步 running + patch card。

这说明 Code2Lark 的飞书宿主接入机制已经成立。

但这并不自动等于：

> Code2Lark 已经封装成“一个拿来就能对新项目复用”的工具。

目前的现实是：

- `image-agent-web` 既是实验对象，又是调试对象；
- 很多能力是在这条样板线上边修边长出来的；
- 因此还不能完全分清：
  - 是 Code2Lark 作为工具真的成熟了；
  - 还是我们在同一个目标上不断扶着它跑通了。

下一阶段就是解决这个问题。

---

## 2. 本阶段目标

本阶段不直接追求“支持第三个外部项目”，而是先做两件事：

### 目标 1：把模式 A / 模式 B 正式封装好

也就是把 Code2Lark 当前已有的两种接入思路，真正整理成清晰、一致、可交付的产品模式：

- **模式 A：外置宿主 / sidecar / gateway**
- **模式 B：目标项目内增量宿主模块**

### 目标 2：复制一份全新的 `image-agent-web` 样本，从零按模式 B 重新做一次接入

这个副本不应该继承当前实验过程中的手工状态，而应作为：

> **一个“普通用户的目标项目”**

从头走一遍：

```text
analyze
→ generate
→ 产出模式 B 产物
→ 接入新样本
→ 本地验证
→ 真实飞书验证
```

如果这一轮也能跑通，就说明：

> Code2Lark 已经具备“模式 B 工具能力”，而不只是“在一个样板上反复修到成功”。

---

## 3. 模式 A / 模式 B 的正式定义

### 模式 A：外置宿主 / sidecar / gateway

定义：

```text
目标项目继续原样运行
+ 由 Code2Lark 生成一个独立的飞书宿主进程/目录
+ 宿主通过 HTTP/CLI/SDK 调目标项目
```

示意：

```text
飞书
→ 外置 feishu-host / gateway
→ 目标应用
```

特点：
- 最小侵入；
- 易回滚；
- 与已有部署解耦；
- 适合作为默认推荐模式。

### 模式 B：目标项目内增量宿主模块

定义：

```text
Code2Lark 生成的飞书宿主能力，不再独立运行在 generated/... 外部，
而是作为一组增量模块嵌入到目标项目仓库中，由目标项目自身启动和维护。
```

示意：

```text
目标项目/
  main.py
  ...
  feishu_host/
    app.py
    cards.py
    handlers.py
    service_client.py
    validation.py
    config.py
    spec/
```

特点：
- 仍坚持最小侵入，不深改业务核心；
- 只新增独立宿主模块；
- 适合用户明确希望“原项目自己成为飞书宿主”的场景；
- 比模式 A 更紧耦合，因此必须具备更完整的交付和验证说明。

---

## 4. 当前状态判断

### 模式 A
当前 Code2Lark 对模式 A 已经：

- **技术上成立**；
- **产物上基本完整**；
- **真实飞书链路已经验证**。

也就是：

> 模式 A 已经接近产品化完成。

### 模式 B
当前 Code2Lark 对模式 B 的情况是：

- 核心代码已经存在（`feishu-host/`）；
- 但它现在仍然更像“独立宿主目录”，不是“可明确迁入目标项目的增量模块包”；
- 对模式 B 的文档、目录语义、迁入步骤、验证路径还不够正式；
- 还没有做一次“从头重放”的验收。

也就是：

> 模式 B 目前是**可做**，但还**没有被产品化证明**。

---

## 5. 这一阶段的成功标准

本阶段完成后，应达到：

1. 模式 A 与模式 B 都有清晰定义；
2. 生成器能够明确输出对应产物；
3. 文档能清楚告诉用户：
   - 哪种模式适合自己；
   - 产物是什么；
   - 配置在哪里；
   - 怎么启动；
   - 怎么验证；
4. 复制出的全新 `image-agent-web` 样本，能够按模式 B 从零接入并再次跑通；
5. 我们可以明确说：
   - “Code2Lark 的模式 B 已经是可重复使用的工具能力”
   - 而不是“当前样板里的人肉成功”。

---

## 6. 执行顺序

### Phase 1：模式 A / B 的产品化封装

#### C1.1 `Document mode A and mode B as first-class delivery modes`

更新：
- `docs/development-charter.md`
- `docs/project-status.md`
- `README.md`

把模式 A / 模式 B 的定义、适用场景、边界写清楚。

要求：
- 明确 `generated/...` 是标准独立产物；
- 明确模式 A 是默认推荐；
- 明确模式 B 是“目标项目内增量宿主模块”路线；
- 明确 `self-hosted-runtime` 当前是模式 B 的核心基础，但还需进一步产品化。

建议提交：
```text
Document mode A and mode B as first-class delivery modes
```

---

#### C1.2 `Restructure self-hosted-runtime output to read as embeddable host module`

关键目标：
不要再让 `feishu-host/` 看起来只是一个“独立 Python 小项目”，而要让它看起来像一个：

> **可迁入目标项目的宿主模块包**

可选方式：
- 保持目录名为 `feishu-host/`，但文档里明确它可独立运行也可迁入；
- 或进一步引入语义更强的结构（例如 `host-module/` + `standalone-launcher/`），但这会涉及较大改动，需谨慎。

本阶段建议优先采取保守方案：
- 不急着改目录名；
- 先通过 README / integration guide / runbook 强化它的“可迁入模块”语义；
- 明确列出“复制到目标项目内时需要哪些文件”。

建议提交：
```text
Clarify self-hosted output as embeddable host module
```

---

#### C1.3 `Add mode B integration guide`

新增或重写：

- `docs/embedded-into-target-app-guide.md`
- 或在现有生成物 docs 下新增模式 B 专章

需要回答这些问题：
- 如果要把 `feishu-host/` 迁入目标项目，复制哪些文件；
- 目标项目中建议落在哪个目录；
- `.env` 配置放哪里；
- Docker/Compose 如何改；
- 长连接宿主由谁启动；
- 哪些文件是运行必须，哪些是验证辅助；
- 如何继续做 `app.py --send-start-card` / `app.py` / Level 2。

建议提交：
```text
Add mode B integration guide
```

---

### Phase 2：复制新的 `image-agent-web` 样本并重放

#### C2.1 `Create a clean image-agent-web replay copy`

操作：
- 在 `C:\works\` 下复制一份全新样本，例如：

```text
C:\works\image-agent-web-2lark-replay
```

要求：
- 尽量保持和当前 `image-agent-web` 同源、但不复用当前测试中生成出来的 `generated/...` 状态；
- 作为一个“普通目标项目”重新接入。

注意：
- 这一步不一定要由 Code2Lark 自动完成，可以手工复制；
- 重点是让重放过程脱离当前样板状态。

建议提交：
```text
Create clean image-agent-web replay copy
```

（如不适合入本仓库，可作为执行步骤而非 commit）

---

#### C2.2 `Run mode B generation against the clean replay copy`

从全新样本重新走：

```text
analyze
→ generate (模式 B)
→ context / verify / doctor
```

这一步要检查的是：
- Code2Lark 产物是否足够支撑“重新接入”；
- 不依赖我们之前在当前样板里留下的隐含状态。

建议提交：
```text
Run mode B generation against clean image-agent-web replay
```

（同样更像执行里程碑，不一定入本仓）

---

#### C2.3 `Migrate generated host module into the replay target`

把生成的 `feishu-host/` 作为增量模块迁入新的 `image-agent-web-2lark-replay`。

关键点：
- 不改动业务核心文件；
- 只新增宿主模块目录；
- 把 `.env` / requirements / 启动方式在新样本里跑起来；
- 保持 `IMAGE_AGENT_BASE_URL` 指向 replay 样本自己。

这一步是模式 B 的核心验证。

建议提交：
```text
Integrate generated host module into replay target
```

---

### Phase 3：模式 B 的本地与真实验证

#### C3.1 `Verify mode B locally in the replay target`

在新样本里验证：
- `python app.py --selfcheck`
- `python app.py --send-start-card`
- 长连接启动
- 本地 contract
- 目标服务调用链

要求：
- 不借助旧样板的宿主环境假设；
- 证明模式 B 在一个新的目标项目副本里也能自洽。

建议提交：
```text
Verify mode B locally in replay target
```

---

#### C3.2 `Run real Feishu validation on the replay target`

用新样本再次跑真实飞书验证：
- 发卡
- generate
- iterate
- batch
- refresh
- failure path

这一轮成功后，才能说明：

> 模式 B 不是当前样板上的偶然成功，而是可重放、可交付的产品能力。

建议提交：
```text
Record replay target Feishu validation evidence
```

---

## 7. 每个 commit / 阶段门禁

- `npm run build` 通过
- `node --test tests/*.test.mjs` 通过
- 现有 `image-agent-web` 样板的 `self-hosted-runtime` 不回归
- `verify --mode self-hosted-runtime --strict` 继续通过
- 工作树干净
- 文档与实际运行方式一致

对重放样本的本地验证：
- `app.py --selfcheck` 通过
- `app.py --send-start-card` 能发卡
- 宿主长连接能在线
- 真实卡片点击后，宿主收到 `card.action.trigger`

---

## 8. 这一阶段的判断标准

### 达标
如果最后你能说：

```text
我把一个新的 image-agent-web 副本，按照模式 B 从零接入，
它也能用 Code2Lark 生成的产物在飞书里跑通。
```

那就说明：

> **Code2Lark 的模式 B 已经产品化成立。**

### 不达标
如果还必须依赖：
- 当前样板里的隐性状态
- 手工补很多没文档化的东西
- 一堆无法复现的试错

那就说明：

> 它现在还只是“有能力做”，还不是“已封装好可交付”。

---

## 9. 一句话总结

> **这一阶段不是继续救 `image-agent-web`，而是把 Code2Lark 的模式 A / 模式 B 正式产品化，再用一份新的 `image-agent-web` 样本从零重放模式 B，验证它已经是一种真正可复制的工具能力。**
