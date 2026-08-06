# Code2Lark Co-Build Acceptance Checklist

Use this checklist before handing the Code2Lark skill repository or a generated Co-Build integration to a demand-side team.

## 1. Skill repository acceptance

- [ ] Delivery was provided as a repository revision or clone with `SKILL.md` at the skill root.
- [ ] The skill root can be placed directly under the target agent's skills/plugin directory.
- [ ] The repository includes CLI/runtime source files: `package.json`, `src/`, `tools/`, and tests.
- [ ] The skill repository supports both Retrofit and Co-Build references.
- [ ] `references/retrofit-workflow.md` exists.
- [ ] `references/cobuild-workflow.md` exists.
- [ ] `references/cobuild-playbook.md` exists.
- [ ] `references/feishu-card-json-2-runtime-spec.md` exists.
- [ ] `references/feishu-runtime-gates.md` exists.
- [ ] `embedded-skills/lark-card-designer/SKILL.md` exists.
- [ ] `embedded-skills/lark-card-designer/references/json-2.0-compatibility-rules.md` exists.
- [ ] `tools/run-cobuild-demo.mjs --static-only` passes from the skill root.

## 2. Generated project acceptance

- [ ] Generated output includes `integrations/lark`.
- [ ] The Lark integration is isolated from business code.
- [ ] Root business code ownership is explicit and not silently taken over by Code2Lark.
- [ ] Generated `.gitignore` or handoff excludes real `.env`, logs, raw callbacks, local evidence, and temporary agent workspaces.

## 3. Runtime files

- [ ] `.env.example` exists in or near `integrations/lark`.
- [ ] Runtime code actually consumes the env keys documented in `.env.example`.
- [ ] A long-connection runtime entrypoint exists.
- [ ] The long-connection receive path subscribes to `card.action.trigger`.
- [ ] `card.action.trigger` routes to a generated action handler.
- [ ] A start-card sender exists or handoff explains the explicit trigger.
- [ ] Local simulator, if present, is marked QA-only and not the delivery target.

## 4. Dependency and transport gate

- [ ] `@larksuiteoapi/node-sdk` or equivalent long-connection dependency is declared when long connection is selected.
- [ ] Installation command is documented, for example `npm --prefix integrations/lark install`.
- [ ] If install was blocked, status is `dependency_pending` or `long_connection_blocked`.
- [ ] HTTPS OpenAPI sender is not presented as proof of receive-path readiness.
- [ ] `start:lark` or equivalent does not silently point to HTTP callback when embedded-long-connection was selected.
- [ ] HTTP callback fallback, if used, was explicitly confirmed by the developer and documents public HTTPS URL requirements.

## 5. Card JSON 2.0 acceptance

- [ ] Lark Card Designer output is treated as design handoff, not production JSON.
- [ ] Runtime adapter generates official JSON 2.0 card payloads.
- [ ] No production card contains `tag: "action"`.
- [ ] No production card contains `tag: "note"`.
- [ ] No production card contains `schema: "json_2_0_like"`.
- [ ] No root-level `elements`, root-level `note`, `sketch`, or adapter metadata is sent.
- [ ] Buttons use `behaviors: [{ type: "callback", value: { action: "..." } }]`.
- [ ] Every callback action maps to a known generated handler.

## 6. Local verification

- [ ] Business tests pass.
- [ ] Integration tests pass.
- [ ] `verify:card` or equivalent passes.
- [ ] Local simulator covers prepare/preview.
- [ ] Local simulator covers confirm/execute.
- [ ] Local simulator covers duplicate confirmation/idempotency.
- [ ] Local simulator covers unauthorized operator rejection.
- [ ] Local simulator covers stale or forged preview rejection.
- [ ] Logs and verifier output do not print app secrets, open IDs, chat IDs, message IDs, access tokens, or raw callbacks.

## 7. Feishu/Lark tenant readiness

- [ ] Bot capability enabled.
- [ ] Long connection enabled.
- [ ] `card.action.trigger` subscribed.
- [ ] Required message/card permissions granted.
- [ ] Bot added to test chat.
- [ ] Target chat configured locally.
- [ ] Operator allowlist configured with open IDs from the same app context.
- [ ] Real send mode enabled only after chat and allowlist are confirmed.

## 8. Real Level 2 verification

- [ ] Start card sent to the configured test chat.
- [ ] User can see the card in Feishu/Lark.
- [ ] User clicks a supported card action.
- [ ] Runtime receives `card.action.trigger` through the selected receive transport.
- [ ] Handler validates operator allowlist.
- [ ] Handler validates confirmation/provenance/TTL where applicable.
- [ ] Business state changes only after confirmed action.
- [ ] Duplicate click does not execute side effects twice.
- [ ] Card updates or returns a visible final state.
- [ ] Sanitized evidence is captured without secrets or tenant identifiers.

## 9. Signoff labels

Use one of these final labels:

- [ ] `static_ready`: skill and design contract pass static validation.
- [ ] `local_ready`: local tests, simulator, and verifier pass.
- [ ] `level2_ready`: real tenant can be tested after env and Feishu console setup.
- [ ] `level2_verified`: real send/click/callback/update completed with sanitized evidence.
- [ ] `blocked`: describe missing dependency, permission, tenant setup, or business API.
