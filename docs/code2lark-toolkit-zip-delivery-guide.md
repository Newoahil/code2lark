# Code2Lark Toolkit Zip Delivery Guide

This guide is for delivering Code2Lark itself to another team. The chosen delivery shape is a single **skill + CLI/runtime toolkit zip**.

The zip is not just documentation and not just a demo output. It contains both:

- **Skill layer** for external agents: `SKILL.md`, `references/`, and embedded Lark Card Designer.
- **CLI/runtime layer** for deterministic execution: built `dist/`, TypeScript `src/`, package metadata, tools, tests, and docs.

## 1. Supported modes in the toolkit

| Mode | What it is for | Included in zip |
|---|---|---|
| Retrofit | Add Feishu/Lark entrypoints to an existing project or service. | `references/retrofit-workflow.md`, CLI `analyze/plan/generate/install/verify/doctor/evidence/handoff`. |
| Co-Build | Design a new business capability together with its Feishu/Lark entrypoint. | `references/cobuild-workflow.md`, `references/cobuild-playbook.md`, Lark Card Designer, runtime gates, demo runner. |

Both modes are part of the delivery. Co-Build currently has the strongest skill-facing demo path; Retrofit relies more directly on the CLI/generator.

## 2. Build the toolkit zip

From the Code2Lark implementation repository:

```powershell
npm install
npm run package:toolkit
```

Expected output:

```text
dist/code2lark-toolkit-v<version>.zip
```

The package script runs `npm run build` first and then stages the toolkit zip.

## 3. Required zip contents

After unzip, the recipient should see:

```text
SKILL.md
PACKAGE-MANIFEST.md
README.md
package.json
package-lock.json
tsconfig.json
dist/
src/
references/
embedded-skills/lark-card-designer/
tools/
tests/
docs/
```

Required mode-specific files:

```text
references/retrofit-workflow.md
references/cobuild-workflow.md
references/cobuild-playbook.md
references/feishu-card-json-2-runtime-spec.md
references/feishu-runtime-gates.md
embedded-skills/lark-card-designer/references/json-2.0-compatibility-rules.md
tools/run-cobuild-demo.mjs
dist/index.js
```

If any required file is missing, reject the package and request a new zip.

## 4. Install for agent use

For Claude-style local skills, copy or unzip the toolkit root to:

```text
C:\Users\<user>\.claude\skills\code2lark
```

For other agents, install the same root folder in that agent's skill/plugin directory. The root folder must contain `SKILL.md` directly.

## 5. Verify the skill layer

From the unzipped toolkit root:

```powershell
node tools/run-cobuild-demo.mjs --static-only
```

Expected result:

```json
{
  "verification_level": "static-only",
  "static_validation": {
    "status": "pass"
  }
}
```

This proves the Co-Build skill references, runtime specs, and embedded Lark Card Designer compatibility gate are present and readable.

## 6. Verify the CLI/runtime layer

From the unzipped toolkit root:

```powershell
npm install
npm run build
node dist/index.js --help
npm run test:cobuild-demo
```

For a fuller development verification, run:

```powershell
npm run test:unit
npm run test:smoke
npm run test:mode-b
npm run test:e2e
```

## 7. How recipients use Retrofit

Use Retrofit when the target business service already exists and the user wants Feishu/Lark entrypoints added.

Typical CLI flow:

```powershell
node dist/index.js analyze <target-project> --out out\<target>
node dist/index.js plan out\<target>
node dist/index.js generate out\<target> --out generated\<target>-lark
node dist/index.js verify generated\<target>-lark --strict
node dist/index.js install generated\<target>-lark --target <target-project>
node dist/index.js install generated\<target>-lark --target <target-project> --apply
```

Useful follow-up commands:

```powershell
node dist/index.js doctor generated\<target>-lark
node dist/index.js evidence generated\<target>-lark
node dist/index.js handoff generated\<target>-lark
```

The agent should still read `references/retrofit-workflow.md` before proposing or running Retrofit changes.

## 8. How recipients use Co-Build

Use Co-Build when the business capability and the Feishu/Lark entrypoint are being designed together.

The user can write a natural prompt, for example:

```text
我们想做一个门店补货审批助手。

每天系统会整理各门店低库存商品，希望运营同学能在飞书里看到一张卡片：哪些门店缺货、缺什么、建议补多少、风险高不高。运营先看预览，确认没问题后再生成补货计划；没确认前不要真的创建补货单。

你帮我从 0 设计并做出来，最好最后能在飞书里操作。
```

The agent should automatically read:

```text
references/cobuild-workflow.md
references/cobuild-playbook.md
embedded-skills/lark-card-designer/SKILL.md
references/feishu-card-json-2-runtime-spec.md
references/feishu-runtime-gates.md
```

Expected Co-Build output is a target-project `integrations/lark` module with:

- `.env.example` and a real env consumer;
- long-connection receive path for `card.action.trigger`;
- outbound start-card sender;
- card runtime adapter;
- `verify:card` or equivalent;
- local simulator marked QA-only;
- handoff and evidence instructions.

## 9. Dependency and transport rule

The toolkit separates sender and receive runtime:

- Sending a card may use Feishu/Lark OpenAPI over HTTPS with Node built-in `fetch`.
- Receiving card clicks for embedded-long-connection delivery must remain long connection.
- If `@larksuiteoapi/node-sdk` cannot be installed because of permissions, do not silently switch `start:lark` to HTTP callback.

Use these states:

```text
generated
dependency_pending
long_connection_blocked
sender_ready
level2_ready
level2_verified
```

HTTP callback fallback requires explicit developer confirmation and public HTTPS callback configuration.

## 10. Real Feishu/Lark requirements

The toolkit never includes real credentials. For real Level 2 verification, the recipient must provide:

- app ID and app secret;
- test chat or receive ID;
- operator allowlist;
- Feishu/Lark bot capability;
- long connection;
- `card.action.trigger` subscription;
- required message/card permissions;
- sanitized evidence of send, click, callback, business update, and card update.

## 11. Related recipient docs

- `docs/cobuild-user-runbook.md` — Co-Build usage after the toolkit is installed.
- `docs/cobuild-acceptance-checklist.md` — acceptance checklist for skill package and generated integrations.
- `docs/troubleshooting-feishu-runtime.md` — Feishu/Lark runtime troubleshooting.
