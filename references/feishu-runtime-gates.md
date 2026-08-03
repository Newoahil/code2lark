# Feishu/Lark Runtime Gates

These gates apply to both Retrofit and Co-Build when the delivery target is Level-2-ready `integrations/lark` with an embedded-long-connection host.

The `lark-card-designer` output is a card design handoff or JSON 2.0-like structure sketch. It is not production-sendable Feishu/Lark JSON. Code2Lark must convert design output through an explicit runtime adapter and verify the runtime payloads before claiming handoff readiness.

For the detailed Lark Card Designer sketch-to-runtime boundary, runtime card shape, banned tags, button pattern, send payload shape, and callback response shape, read `references/feishu-card-json-2-runtime-spec.md` before applying these gates. This is currently most important for Co-Build generated `integrations/lark` delivery.

## 1. Long-Connection Host Gate

The generated `integrations/lark` module must include a real long-connection runtime path:

- Use the official Feishu/Lark SDK long-connection client or a documented equivalent runtime wrapper.
- Subscribe to `card.action.trigger`.
- Route `card.action.trigger` events into the generated action handler.
- Optionally support message receive events only when the business flow requires them.
- Log only sanitized readiness, action names, and non-secret status. Do not print app secrets, chat ids, open ids, message ids, raw callbacks, or access tokens.

Simulator support is allowed only as QA. A simulator cannot replace this host gate.

## 2. Dependency Installation and Transport Downgrade Gate

When Co-Build selects an embedded-long-connection delivery target, dependency installation state must not change the receive transport silently.

Allowed:

- The outbound start-card sender may use Feishu/Lark OpenAPI over HTTPS with Node built-in `fetch` when that is the safest dependency-free send path.
- The generated module may also include SDK-based sender code when dependencies are installed.

Blocked without explicit developer confirmation:

- If `@larksuiteoapi/node-sdk` installation fails, is skipped, or is blocked by agent permission policy, do not silently replace the long-connection runtime with an HTTP callback runtime.
- Do not make `start:lark` point to HTTP callback mode when the selected delivery target is embedded-long-connection.
- Do not claim the long connection is running when the SDK dependency is only declared but not installed.

Required preflight and handoff states:

- `generated`: long-connection code and dependency declaration exist.
- `dependency_pending`: SDK install was not attempted, not permitted, or did not complete.
- `long_connection_blocked`: `card.action.trigger` receive path cannot start until dependency and env preflight pass.
- `sender_ready`: HTTPS OpenAPI sender can send the start card, but this does not prove the receive path.
- `level2_ready`: only after runtime preflight, env requirements, verifier checks, and long-connection startup path are clear.

If dependency installation is blocked, ask the developer to choose one of:

1. Approve/install the SDK dependency, for example `npm --prefix integrations/lark install`.
2. Keep the long-connection code generated and defer runtime start until manual install.
3. Explicitly switch to HTTP callback fallback, accepting public HTTPS URL and Feishu callback configuration requirements.

## 3. Runtime Env Contract Gate

If `.env.example` is generated, the runtime must consume corresponding values in code.

Required checks:

- `.env.example` contains required keys such as `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, target base URL, and operator allowlist.
- Runtime code has a safe env loader or documented host env injection path.
- Config status reports booleans or safe enum values only, for example `appIdConfigured`, `appSecretConfigured`, `targetChatConfigured`, `sendMode`, and `sendOnStart`.
- Real `.env` values are never printed, committed, copied into evidence, or echoed in errors.

`.env.example` without a runtime consumer is incomplete handoff.

## 4. OpenAPI Send-Message Card Payload Gate

For sending an interactive card through message OpenAPI:

- Use `msg_type: "interactive"`.
- Use `content = JSON.stringify(cardJson)`.
- `cardJson.schema` must be `"2.0"`.
- `cardJson.body.elements` must exist.
- `cardJson.header.title` must exist.
- Do not wrap content as `{ "card": cardJson }` for message send.
- Do not send design-only fields such as `note`, `json_2_0_like`, root-level `elements`, or arbitrary sketch metadata.
- The sender may use dependency-free HTTPS OpenAPI via built-in `fetch`, but this is only an outbound send path. It is not a substitute for long-connection `card.action.trigger` receive runtime.

## 5. JSON 2.0 Callback Button Gate

For JSON 2.0 interactive buttons:

- Use `behaviors: [{ type: "callback", value: { action: "..." } }]`.
- `behaviors[].value.action` must map to a known action handler.
- Do not rely on legacy top-level `value` alone for callbacks.
- Preserve any needed card form values in the callback behavior payload or supported input components.

Buttons that render but do not trigger `card.action.trigger` are not acceptable.

## 6. JSON 2.0 Runtime Component Compatibility Gate

The `lark-card-designer` output is a design handoff sketch. Production runtime payloads must be generated by a Code2Lark runtime adapter and must use the verified JSON 2.0 supported subset defined in `references/feishu-card-json-2-runtime-spec.md`.

The verifier must recursively scan every tag-bearing node. At minimum, runtime payloads must reject:

- `tag: "action"` — JSON 2.0 no longer supports the legacy action block; place buttons directly in `body.elements` or inside `column_set` / `column`.
- `tag: "note"` — map design notes/footers to `markdown` or `div` runtime components.
- `schema: "json_2_0_like"`, root-level `elements`, root-level `note`, `sketch`, `metadata`, or other design-only fields.
- Buttons that rely on legacy top-level `value` or `action_type` instead of `behaviors`.

Recommended runtime mappings:

- design `note` / `footer` intent -> `markdown` or `div`.
- design multi-button `action` area -> `column_set` containing `column` elements, each containing JSON 2.0 `button` components.
- design callback intent -> `behaviors: [{ type: "callback", value: { action: "..." } }]` mapped to a known handler.

## 7. `card.action.trigger` Callback Response Gate

For card action responses:

- Returning only `toast` is allowed when no card update is needed.
- If updating or replacing a card, return `card: { type: "raw", data: cardJson }`.
- `card.data` must be official JSON 2.0 card JSON.
- Do not return raw card JSON directly under `card`.
- Do not confuse message OpenAPI `content` with card callback response shape.

## 8. Card Runtime Verifier Gate

Every generated `integrations/lark` module should include `verify:card` or an equivalent local verifier before real tenant testing.

The verifier should check:

- Send-message payload shape.
- Callback response payload shape.
- JSON 2.0 button callback behavior.
- Recursive JSON 2.0 runtime component compatibility, including rejection of `tag: "action"`, `tag: "note"`, design sketches, and unsupported tags.
- Dependency and transport preflight: SDK dependency declared/installed state, `start:lark` receive transport, and no silent HTTP callback downgrade.
- No design-only skeleton fields in production payloads.
- No secret, open id, chat id, message id, raw callback, or token output in generated evidence/log examples.

## 9. Completion Blocker

Do not claim Level-2-ready handoff until all applicable runtime gates pass.

If real sending is expected, also document explicit outbound-send gates:

- target chat configured;
- send mode is `real`;
- send-on-start or equivalent trigger is enabled intentionally;
- logs remain sanitized.

Outbound sender success alone is not Level-2-ready completion. A card can be sent over HTTPS while the long-connection receive path is still `dependency_pending` or `long_connection_blocked`.
