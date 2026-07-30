# Feishu/Lark Runtime Gates

These gates apply to both Retrofit and Co-Build when the delivery target is Level-2-ready `integrations/lark` with an embedded-long-connection host.

The `lark-card-designer` output is a card design handoff or JSON 2.0-like structure sketch. It is not production-sendable Feishu/Lark JSON. Code2Lark must convert design output through an explicit runtime adapter and verify the runtime payloads before claiming handoff readiness.

## 1. Long-Connection Host Gate

The generated `integrations/lark` module must include a real long-connection runtime path:

- Use the official Feishu/Lark SDK long-connection client or a documented equivalent runtime wrapper.
- Subscribe to `card.action.trigger`.
- Route `card.action.trigger` events into the generated action handler.
- Optionally support message receive events only when the business flow requires them.
- Log only sanitized readiness, action names, and non-secret status. Do not print app secrets, chat ids, open ids, message ids, raw callbacks, or access tokens.

Simulator support is allowed only as QA. A simulator cannot replace this host gate.

## 2. Runtime Env Contract Gate

If `.env.example` is generated, the runtime must consume corresponding values in code.

Required checks:

- `.env.example` contains required keys such as `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, target base URL, and operator allowlist.
- Runtime code has a safe env loader or documented host env injection path.
- Config status reports booleans or safe enum values only, for example `appIdConfigured`, `appSecretConfigured`, `targetChatConfigured`, `sendMode`, and `sendOnStart`.
- Real `.env` values are never printed, committed, copied into evidence, or echoed in errors.

`.env.example` without a runtime consumer is incomplete handoff.

## 3. OpenAPI Send-Message Card Payload Gate

For sending an interactive card through message OpenAPI:

- Use `msg_type: "interactive"`.
- Use `content = JSON.stringify(cardJson)`.
- `cardJson.schema` must be `"2.0"`.
- `cardJson.body.elements` must exist.
- `cardJson.header.title` must exist.
- Do not wrap content as `{ "card": cardJson }` for message send.
- Do not send design-only fields such as `note`, `json_2_0_like`, root-level `elements`, or arbitrary sketch metadata.

## 4. JSON 2.0 Callback Button Gate

For JSON 2.0 interactive buttons:

- Use `behaviors: [{ type: "callback", value: { action: "..." } }]`.
- `behaviors[].value.action` must map to a known action handler.
- Do not rely on legacy top-level `value` alone for callbacks.
- Preserve any needed card form values in the callback behavior payload or supported input components.

Buttons that render but do not trigger `card.action.trigger` are not acceptable.

## 5. `card.action.trigger` Callback Response Gate

For card action responses:

- Returning only `toast` is allowed when no card update is needed.
- If updating or replacing a card, return `card: { type: "raw", data: cardJson }`.
- `card.data` must be official JSON 2.0 card JSON.
- Do not return raw card JSON directly under `card`.
- Do not confuse message OpenAPI `content` with card callback response shape.

## 6. Card Runtime Verifier Gate

Every generated `integrations/lark` module should include `verify:card` or an equivalent local verifier before real tenant testing.

The verifier should check:

- Send-message payload shape.
- Callback response payload shape.
- JSON 2.0 button callback behavior.
- No design-only skeleton fields in production payloads.
- No secret, open id, chat id, message id, raw callback, or token output in generated evidence/log examples.

## 7. Completion Blocker

Do not claim Level-2-ready handoff until all applicable runtime gates pass.

If real sending is expected, also document explicit outbound-send gates:

- target chat configured;
- send mode is `real`;
- send-on-start or equivalent trigger is enabled intentionally;
- logs remain sanitized.
