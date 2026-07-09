# image-agent-web 模式 B 重放实验任务书

记录时间：2026-07-08

本文档用于启动下一阶段的关键实验：

> **复制一份新的 `image-agent-web` 样本，从零按模式 B（目标项目内增量宿主模块）接入 Code2Lark，验证模式 B 是否已经成为真正可复制、可交付的能力。**

这不是继续在当前已经跑通的样板上修补，而是一次：

> **工具成熟度重放实验**

---

## 1. 前提结论

### 已经成立的事实

当前 `image-agent-web` 已经通过模式 A 跑通：

```text
飞书
→ 外置 feishu-host (generated/.../feishu-host)
→ image-agent-web
```

并且已在真实飞书环境中验证：
- 长连接
- `card.action.trigger`
- Card JSON 2.0
- async patch
- generate / iterate / batch / refresh / failure path

### 还未成立的事实

模式 B（目标项目内增量宿主模块）虽然已经被澄清和定义，但：

- 还没有用一个全新的 `image-agent-web` 副本从零重放过；
- 因此还不能说 Code2Lark 已经具备“模式 B 产品化能力”。

---

## 2. 本实验目标

把一个新的 `image-agent-web` 副本，作为一个“普通目标项目”，从零做模式 B 接入，验证下面这些问题：

1. Code2Lark 当前产物是否适合迁入目标项目内部；
2. `feishu-host/` 是否已经足够像一个独立、可嵌入的宿主模块；
3. 配置/目录/启动/验证文档是否足够清晰；
4. 在不依赖当前样板历史状态的情况下，是否还能再次跑通；
5. 如果能跑通，模式 B 就不再只是概念，而是已具备实操验证的能力。

---

## 3. 实验对象

### 当前样板（只读参考，不直接继续修改）

```text
C:\works\image-agent-web
```

### 新的重放副本（本实验对象）

建议复制到：

```text
C:\works\image-agent-web-mode-b-replay
```

要求：
- 保持和当前 `image-agent-web` 一样的业务能力；
- 但不依赖当前样板在 `generated/...` 中已经存在的运行状态；
- 把它当成“一个普通目标项目”来接入。

---

## 4. 模式 B 的定义（本实验必须遵守）

模式 B 不是：

- 深改目标项目核心业务代码；
- 把飞书逻辑散落进原有业务文件；
- 让目标项目变成一个不可回滚的大杂烩。

模式 B 是：

> **把 Code2Lark 生成的 `feishu-host/` 作为增量宿主模块迁入目标项目内部，由目标项目自己承载飞书宿主能力，但仍保持最小侵入。**

建议目标项目内结构类似：

```text
image-agent-web-mode-b-replay/
  main.py
  agent.py
  batch.py
  sessions.py
  templates.py
  static/
  feishu_host/
    app.py
    cards.py
    handlers.py
    service_client.py
    validation.py
    config.py
    requirements.txt
    .env.example
    spec/
```

注意：
- `main.py` / `agent.py` / `batch.py` 等原业务核心应尽量不改；
- 只新增 `feishu_host/`（或同等语义目录）作为飞书宿主模块；
- 生成包仍然是 source of truth。

---

## 5. 实验顺序

### Phase 1：复制并确认 replay 样本可单独运行

#### C1.1 `Create the replay copy`

操作：
- 复制：
  ```text
  C:\works\image-agent-web
  → C:\works\image-agent-web-mode-b-replay
  ```

要求：
- replay 样本在没有任何飞书集成的情况下，也能按原方式启动；
- `GET /api/meta`、`POST /api/generate` 等业务 API 仍然成立。

### 验收标准
- replay 样本在本地能作为原始服务运行。

### 建议提交
```text
Create image-agent-web mode B replay copy
```

（如果这是外部文件复制，不一定入 Code2Lark 仓库，可作为执行步骤记录）

---

### Phase 2：从 Code2Lark 重新生成模式 B 基础产物

#### C2.1 `Regenerate fresh self-hosted runtime package for replay`

在 `C:\works\Lark-deployer` 下重新生成：

```powershell
node dist\index.js generate out\image-agent-web --out generated\image-agent-web-lark --mode self-hosted-runtime
```

要求：
- 使用当前最新版生成器；
- 不沿用之前已有的宿主目录状态；
- `feishu-host/` 是当前 source of truth。

### 验收标准
- 生成包重新产出成功；
- `verify --mode self-hosted-runtime --strict` 仍通过。

### 建议提交
```text
Refresh self-hosted package for mode B replay
```

---

### Phase 3：把 `feishu-host/` 迁入 replay 样本

#### C3.1 `Embed generated host module into the replay target`

操作：
- 将生成包里的：
  ```text
  generated/image-agent-web-lark/feishu-host/
  ```
  复制到：
  ```text
  C:\works\image-agent-web-mode-b-replay\feishu_host\
  ```
- 如果有必要，同时复制：
  - `spec/`
  - `.env.example`
  - `requirements.txt`

要求：
- 不修改业务核心逻辑；
- 只新增 `feishu_host/` 宿主模块目录；
- replay 样本中能独立运行这个宿主模块。

### 验收标准
- replay 样本目录内出现完整 `feishu_host/`；
- 目录语义清晰，不需要依赖 `generated/...` 继续运行。

### 建议提交
```text
Embed generated host module into replay target
```

（如果改的是 replay 项目仓库，则提交应在 replay 仓库里）

---

### Phase 4：在 replay 样本内部做本地验证

#### C4.1 `Run local host validation inside replay target`

在 replay 目标目录内：

```powershell
cd C:\works\image-agent-web-mode-b-replay\feishu_host
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

填 `.env`：
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_CONNECTION_MODE=websocket`
- `IMAGE_AGENT_BASE_URL`（指向 replay 项目自身）
- `TEST_CHAT_ID`
- 可选 `FEISHU_ALLOWED_USERS`

然后运行：

```powershell
.\.venv\Scripts\python local_contract_test.py
.\.venv\Scripts\python app.py --selfcheck
```

### 验收标准
- contract test 通过；
- selfcheck 通过；
- replay 样本内部能独立完成宿主模块本地验证。

### 建议提交
```text
Verify replay target host module locally
```

---

### Phase 5：在 replay 样本上做真实飞书验证

#### C5.1 `Run real Feishu long-connection validation inside replay target`

操作：
- 运行 replay 版宿主：
  ```powershell
  .\.venv\Scripts\python app.py --send-start-card
  .\.venv\Scripts\python app.py
  ```
- 仍然使用当前飞书应用和测试群；
- 在飞书中重新跑：
  - generate
  - iterate
  - batch
  - refresh
  - failure path

### 验收标准
- 真实飞书里这条线再次跑通；
- 并且这次宿主运行位置是在 replay 样本内部，而不是 `generated/.../feishu-host`。

### 建议提交
```text
Record mode B replay validation evidence
```

---

## 6. 需要重点观察的问题

### 问题 1：生成物是否真的足够自包含
如果迁入 replay 样本后，仍然要不断回头引用：

```text
generated/image-agent-web-lark/
```

才能跑，那说明模式 B 还没真正封装好。

### 问题 2：配置路径是否真的清晰
如果迁入之后还不清楚：
- `.env` 放哪；
- 从哪里读；
- 启动哪个命令；
- 哪些文件必须复制；

那说明模式 B 的交付还不成熟。

### 问题 3：是否需要改动业务核心
如果迁入 replay 样本后，必须大改：
- `main.py`
- `agent.py`
- `batch.py`

那说明它已经偏离“增量模块”定义，模式 B 还不算成功。

---

## 7. 完成定义

当下面这些都满足时，说明模式 B 已经从“概念”进化到“可重放验证的产品能力”：

1. 可以复制一个全新的 `image-agent-web` 样本；
2. 可以把 `feishu-host/` 作为增量宿主模块迁进去；
3. replay 样本内 contract / selfcheck 通过；
4. replay 样本内真实飞书长连接验证通过；
5. 全过程不依赖当前样板里的隐含状态；
6. 不需要深改目标业务核心代码。

---

## 8. 一句话总结

> **这次实验的目标不是再证明飞书能接，而是验证 Code2Lark 现在是不是已经具备“把一个新副本项目按模式 B 从零接起来”的真正工具能力。**
