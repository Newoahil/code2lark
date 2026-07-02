# 验收审计记录

记录时间：2026-07-02

本文档记录对当前 Lark-deployer 仓库的一次验收审计结果。验收目标包括：确认审计/方向文档是否入库、git 工作区是否干净、当前实现是否与文档记录的关键风险一致，以及新增未提交改动是否影响既有审计结论。

## 1. 验收结论

**结论：FAIL（未通过完整验收）**

原因不是已提交基线本身有问题，而是当前工作区在首次提交后已经出现新的未提交改动，因此不能判定为“当前仓库状态已完全留档且工作区干净”。

当前状态中已确认通过的部分：

- `docs/project-status.md` 已入库。
- `docs/development-direction.md` 已入库。
- 首次提交 `5bd71d7` 已存在，提交内容包括源码、测试、原始文档，以及新增的项目进展/开发方向文档。
- 文档中记录的关键风险与当前代码实现一致。
- 当前新增的 IPv6 私网回调 URL 校验逻辑在 CLI 表面验证中生效。

当前阻塞完整验收的部分：

- git 工作区不干净，存在未提交修改和未跟踪文件。

## 2. Git 状态验收

执行工作区检查时观察到：

```text
 M src/url-validation.ts
?? .omo/
?? tests/unit-pure-functions.test.mjs
```

说明首次提交之后出现了新的工作区漂移：

- `src/url-validation.ts`：已有文件被修改。
- `tests/unit-pure-functions.test.mjs`：新增未跟踪测试文件。
- `.omo/`：新增未跟踪工具状态目录。

因此当前不能声称“仓库工作区干净”。如果要恢复可验收状态，需要后续决定：

1. 将 `src/url-validation.ts` 和 `tests/unit-pure-functions.test.mjs` 作为新一轮功能/测试改动提交；并处理 `.omo/`（通常应忽略或删除）。
2. 或回滚这些未提交改动，恢复到 `HEAD`。

## 3. 文档入库验收

已确认以下两份新增文档在 git 跟踪范围内：

```text
docs/development-direction.md
docs/project-status.md
```

含义：这两份文档不是临时文件，而是已经进入首次提交基线。

## 4. 关键审计结论复核

### 4.1 交互方式仍是卡片-only

当前代码层确实只实现了飞书卡片交互，不是飞书平台本身的能力限制。

代码证据：

```ts
// src/types.ts
trigger: "card_action";
result_mode: "interactive_card";
```

运行时生成逻辑中也只看到 `CardActionHandler` 路径，没有 `EventDispatcher` 或 `im.message.receive_v1` 的消息接收路径。

结论：`docs/project-status.md` 与 `docs/development-direction.md` 中关于“当前实现收窄为卡片交互；如需群 @ / 私聊命令触发，需要扩展 InteractionContract 与 generate.ts 运行时生成逻辑”的判断是准确的。

### 4.2 真实飞书 Level 2 仍未完成

当前没有新的证据表明真实飞书开发者应用已经完成端到端验收。

仍然成立的状态：

- 本地模拟链路已覆盖较多运行时行为。
- 真实飞书开发者应用下的发卡、点击回调、图片上传、反馈迭代、批量任务下载仍未形成完整验收证据。
- `doctor --gate` 真正通过前，MVP-1A 不能视为完成。

### 4.3 单目标绑定仍然存在

`analyze.ts` 的核心分析逻辑仍然面向 `image-agent-web`，当前不是通用服务分析器。

结论：文档中关于“当前是 MVP-1A 单目标 PoC；向通用生成器演进需要拆分通用扫描框架与目标服务适配器”的判断仍成立。

### 4.4 工程质量风险仍然存在

以下风险仍然成立：

- `generate.ts` 体量较大，包含大量生成运行时源码的模板字符串。
- 测试仍以大型集成测试为主。
- 去重状态仍是进程内内存态，不是跨进程/跨重启持久化状态。

## 5. 当前未提交改动的补充审计

当前新增的 `src/url-validation.ts` 改动为 IPv6 私网/链路本地地址判断补充了逻辑：

```ts
function isPrivateIpv6(host: string): boolean {
  if (isIP(host) !== 6) return false;
  const firstHextet = Number.parseInt(host.split(":", 1)[0] || "", 16);
  if (!Number.isInteger(firstHextet)) return false;
  return (firstHextet >= 0xfc00 && firstHextet <= 0xfdff)
    || (firstHextet >= 0xfe80 && firstHextet <= 0xfebf);
}
```

通过 CLI 表面验证确认，该逻辑在真实命令入口中生效：

```bash
npx tsx src/index.ts verify generated/image-agent-web-lark \
  --env <临时env文件，PUBLIC_CALLBACK_BASE_URL=https://[fe80::1]> \
  --report-dir <临时目录> \
  --level2 --strict
```

观察到输出：

```text
[FAIL] env:PUBLIC_CALLBACK_BASE_URL:public-url:
PUBLIC_CALLBACK_BASE_URL points to private host [fe80::1]. Feishu cannot reach it directly; use a public HTTPS tunnel/domain, or --allow-local-callback only for local mock verification.
```

结论：新增 IPv6 link-local / ULA 回调 URL 拦截逻辑从 CLI 表面看是有效的。

## 6. 代码审查补充意见

对当前未提交 diff 做了聚焦审查，未发现 correctness 级别的阻塞 bug。

维护性建议：

1. `src/url-validation.ts` 当前对 IPv6 使用 `node:net.isIP`，但 IPv4 仍保留手写解析逻辑。后续如果继续扩展保留地址范围，可以考虑统一 IP 地址分类抽象，降低 IPv4/IPv6 行为漂移风险。
2. `tests/unit-pure-functions.test.mjs` 中的 URL 校验用例可以改成 table-driven 形式，后续添加更多 host 分类边界时更清晰。

这些建议不阻塞当前功能判断。

## 7. 后续处理建议

建议下一步先处理工作区漂移：

1. 决定是否保留 `src/url-validation.ts` 的 IPv6 私网判断改动。
2. 如果保留，将 `tests/unit-pure-functions.test.mjs` 一并纳入提交。
3. 处理 `.omo/`：如果是工具运行状态目录，应加入 `.gitignore` 或删除，不建议提交。
4. 再次检查 `git status --short`，确保工作区干净。
5. 如需正式归档本次验收文档，也应将本文件纳入一次单独提交或与上述改动一起提交。

## 8. 当前验收判定

- 文档入库：PASS
- 审计结论与实现一致性：PASS
- 当前新增 IPv6 回调 URL 校验：PASS
- 工作区干净：FAIL
- 整体验收：FAIL

最终判定：当前基线提交是可追溯的，但仓库已经产生新的未提交状态；在处理这些改动之前，不应称为“验收完成且状态已完全留档”。
