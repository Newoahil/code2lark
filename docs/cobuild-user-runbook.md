# Code2Lark Co-Build User Runbook

This runbook is for delivery recipients who already received the Code2Lark skill + CLI/runtime toolkit zip and want to use its Co-Build mode to generate a Feishu/Lark integration.

For the toolkit package itself, start with `docs/code2lark-toolkit-zip-delivery-guide.md`.

## 1. What the zip delivers

The toolkit zip should contain the external-agent-facing Code2Lark skill package and the CLI/runtime layer. This Co-Build runbook focuses on the skill files required by the agent.

Required zip contents:

```text
code2lark/
  SKILL.md
  references/
    cobuild-workflow.md
    cobuild-playbook.md
    feishu-card-json-2-runtime-spec.md
    feishu-runtime-gates.md
    evidence-handoff.md
    safety-and-secrets.md
    confirmation-policy.md
  embedded-skills/
    lark-card-designer/
      SKILL.md
      references/json-2.0-compatibility-rules.md
  tools/
    run-cobuild-demo.mjs
  tests/fixtures/
    cobuild-demo-prompt.md
    cobuild-demo-response.schema.json
```

Optional but recommended zip contents:

```text
docs/
  cobuild-user-runbook.md
  cobuild-acceptance-checklist.md
  troubleshooting-feishu-runtime.md
```

The zip can be produced from the skill package directory, for example:

```powershell
Compress-Archive -Path C:\works\code2lark\* -DestinationPath C:\Temp\code2lark-skill.zip -Force
```

## 2. Install the skill package

Unzip the package into the agent's skill directory. For Claude-style local skills, the target path is typically:

```text
C:\Users\<user>\.claude\skills\code2lark
```

After extraction, confirm these files exist:

```text
SKILL.md
references/feishu-card-json-2-runtime-spec.md
references/feishu-runtime-gates.md
embedded-skills/lark-card-designer/references/json-2.0-compatibility-rules.md
tools/run-cobuild-demo.mjs
```

If any of these files are missing, do not start a real Co-Build delivery. Ask for a new zip package.

## 3. Run a local skill sanity check

From the extracted skill root:

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

This confirms that the Co-Build skill references are readable. It does not prove a real Feishu tenant has been configured.

## 4. Use a natural business prompt

The user should describe the desired business workflow naturally. They do not need to mention JSON 2.0, long connection, callbacks, or verifier details.

Example:

```text
我们想做一个门店补货审批助手。

每天系统会整理各门店低库存商品，希望运营同学能在飞书里看到一张卡片：哪些门店缺货、缺什么、建议补多少、风险高不高。运营先看预览，确认没问题后再生成补货计划；没确认前不要真的创建补货单。

你帮我从 0 设计并做出来，最好最后能在飞书里操作。
```

Code2Lark should automatically choose Co-Build when the business capability and the Lark entrypoint are being designed together.

## 5. Expected generated output

The generated or installed target project should contain:

```text
integrations/lark/
  package.json
  .env.example
  README.md
  HANDOFF.md
  src/
    runtime or host entrypoint
    config/env loader
    card adapter
    sender
    callback/action handler
    card verifier
  test/
  evidence/
```

Minimum requirements:

- `integrations/lark` is isolated from business code.
- `.env.example` exists and generated runtime code actually reads those values.
- A real long-connection receive path exists for `card.action.trigger`.
- A start-card sender exists.
- `verify:card` or equivalent exists.
- Local simulator, if generated, is marked QA-only and not the delivery target.

## 6. Configure the generated integration

Inside the generated target project, copy the env template locally:

```powershell
Copy-Item integrations\lark\.env.example integrations\lark\.env
```

Fill only local, uncommitted values:

```text
FEISHU_APP_ID=
FEISHU_APP_SECRET=
LARK_APP_ID=
LARK_APP_SECRET=
TARGET_BASE_URL=http://localhost:<port>
LARK_TARGET_CHAT_ID=
LARK_OPERATOR_ALLOWLIST=ou_xxx,ou_yyy
SEND_MODE=dry_run
LARK_RUNTIME_MODE=demo
SEND_ON_START=false
```

Never commit `.env`, raw callbacks, runtime logs, access tokens, chat IDs, open IDs, message IDs, or screenshots containing tenant identifiers.

## 7. Install dependencies

For embedded-long-connection runtime, install the integration dependencies explicitly:

```powershell
npm --prefix integrations/lark install
```

or:

```powershell
cd integrations/lark
npm install
```

If the agent cannot run dependency installation because of permission policy, this is not a reason to silently switch the receive path to HTTP callback mode. The correct status is:

```text
dependency_pending
long_connection_blocked
```

The developer must choose one of:

1. Approve/install the SDK dependency.
2. Keep the long-connection code generated and defer runtime start.
3. Explicitly switch to HTTP callback fallback and prepare a public HTTPS URL plus Feishu callback configuration.

## 8. Run local verification

From the target project root:

```powershell
npm test
npm --prefix integrations/lark run verify:card
npm --prefix integrations/lark test
npm --prefix integrations/lark run simulate
```

The exact script names may differ, but the generated README/HANDOFF must document the equivalents.

Local verification should prove:

- No side effects happen before confirmation.
- Direct execute without prepare/dry-run is rejected.
- Duplicate confirmation is idempotent.
- Unauthorized operators are rejected.
- JSON 2.0 runtime payloads reject `tag: "action"`, `tag: "note"`, design-only fields, and legacy button values.

## 9. Configure Feishu/Lark Open Platform

Before real Level 2 verification, the tenant operator must:

1. Enable bot capability.
2. Enable long connection.
3. Subscribe to `card.action.trigger`.
4. Grant required message/card permissions.
5. Add the bot to the test chat.
6. Confirm the operator open IDs used in allowlist belong to the same app/tenant context.

## 10. Start and test real runtime

Start the business service first:

```powershell
npm start
```

Then start the Lark integration runtime:

```powershell
npm --prefix integrations/lark start
```

If a sender command is generated, use it only after confirming the target chat and send mode:

```powershell
npm --prefix integrations/lark run send:lark-card
```

Important distinction:

- HTTPS OpenAPI sender success means the card was sent.
- It does not prove the long-connection receive path is active.
- Real Level 2 requires a click event to arrive through `card.action.trigger` and update business state/card state.

## 11. Completion states

Use these states in handoff and status reports:

| State | Meaning |
|---|---|
| `generated` | Code and dependency declarations exist. |
| `dependency_pending` | SDK install was not attempted, not permitted, or did not complete. |
| `long_connection_blocked` | Receive path cannot start until dependency/env preflight passes. |
| `sender_ready` | HTTPS sender can send the start card, but receive path is not proven. |
| `level2_ready` | Runtime preflight, env, verifier, and startup path are ready for real tenant testing. |
| `level2_verified` | Real card sent, clicked, callback received, business state updated, card updated, and sanitized evidence recorded. |
