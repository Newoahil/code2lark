# Feishu Official Docs Dependency Map

Date: 2026-07-03

## Purpose

Lark-deployer depends on Feishu/Lark platform behavior for permissions, callbacks, card payloads, message APIs, token handling, and verification. This file is the project-level map from official Feishu/Open Platform documentation to local implementation and verification responsibilities.

This is not a raw mirror of official documentation. Keep stable official links, local implications, and recheck triggers here. Before changing generated Feishu behavior, re-open the relevant official document and update this map or `docs/lark-permissions-reference.md` if the platform behavior changed.

## Current Local References

| Local file | Role |
| --- | --- |
| `docs/lark-permissions-reference.md` | Main summarized permission and runtime policy reference. |
| `docs/mvp-1a-image-agent-web.md` | MVP-1A Feishu verification contract and evidence status. |
| `docs/fde-handoff.md` | Operator/FDE handoff sequence for real Feishu setup. |
| `docs/level-2-verification-record.md` | Generic template for real Feishu evidence capture. |
| `README.md` | Command-level operational guide. |

## Official Docs Index

### Authentication, Scopes, And App Setup

| Official doc | Local dependency |
| --- | --- |
| [Authentication and authorization overview](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/overview) | Permission model, scope reasoning, app/user identity split. |
| [Access tokens](https://open.feishu.cn/document/ukTMukTMukTM/uMTNz4yM1MjLzUzM) | `APP_ID` + `APP_SECRET` to tenant token assumptions. |
| [How to choose token type](https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-choose-which-type-of-token-to-use) | Default to app identity unless user-owned resources require user auth. |
| [Apply for API permissions](https://open.feishu.cn/document/ukTMukTMukTM/uQjN3QjL0YzN04CN2cDN) | Generated `permission_review.md` and owner request wording. |
| [Application availability](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/availability) | FDE/admin setup checklist and least-availability guidance. |
| [Application data permissions](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/configure-app-data-permissions) | Future target services that read contacts/docs/calendar/Base/approval. |
| [Enable bot ability](https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-enable-bot-ability) | Generated setup checklist before sending cards. |
| [Self-built application development process](https://open.feishu.cn/document/home/introduction-to-custom-app-development/self-built-application-development-process) | Level 2 setup flow for a test app. |

### Messages, Resources, And Card Updates

| Official doc | Local dependency |
| --- | --- |
| [Send message](https://open.feishu.cn/document/server-docs/im-v1/message/create) | `/debug/start-card`, first-card send, `TEST_CHAT_ID`, send scope checks. |
| [Reply message](https://open.feishu.cn/document/server-docs/im-v1/message/reply) | Future reply-thread interaction mode. |
| [Edit message](https://open.feishu.cn/document/server-docs/im-v1/message/update) | Message update fallback semantics. |
| [Update sent message card](https://open.feishu.cn/document/server-docs/im-v1/message-card/patch) | Async `CARD_ACTION_MODE=async` final card patching. |
| [Upload image](https://open.feishu.cn/document/server-docs/im-v1/image/create) | `UPLOAD_IMAGE_TO_LARK`, result-card image rendering. |
| [Upload file](https://open.feishu.cn/document/server-docs/im-v1/file/create) | Future script/report/file-returning targets. |

### Cards And Card Actions

| Official doc | Local dependency |
| --- | --- |
| [Develop a card interactive bot](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/quick-start/develop-a-card-interactive-bot) | End-to-end card bot flow and app setup assumptions. |
| [Card callback communication](https://open.feishu.cn/document/feishu-cards/card-callback-communication) | Real card-action callback shape, Feishu 2.0 callback compatibility tests. |
| [Card JSON 2.0 structure](https://open.feishu.cn/document/feishu-cards/card-json-v2-structure) | Generated card payload structure and future CardKit alignment. |
| [Feishu Card building tool overview](https://open.feishu.cn/document/feishu-cards/feishu-card-cardkit/feishu-cardkit-overview) | Visual/card-builder source of truth for complex card layouts. |
| [Form container](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-components/containers/form-container) | Start-card parameter inputs and `form_value` parsing. |
| [Button component](https://open.feishu.cn/document/feishu-cards/card-json-v2-components/interactive-components/button?lang=zh-CN) | Submit/refresh button action shape. |
| [Card resource overview](https://open.feishu.cn/document/cardkit-v1/feishu-card-resource-overview) | Future CardKit-specific resource APIs. |

### Events, Callbacks, And Security

| Official doc | Local dependency |
| --- | --- |
| [Event overview](https://open.feishu.cn/document/server-docs/event-subscription-guide/overview) | Event/callback terminology and future event-driven modes. |
| [Webhook event receiving](https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-/choose-a-subscription-mode/send-notifications-to-developers-server) | Public callback URL setup and URL verification behavior. |
| [Long connection event receiving](https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-/request-url-configuration-case) | Long-connection receiving for event subscriptions; also relevant when the host uses newer callback flows through the SDK. |
| [Add subscribed events](https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-/subscription-event-case) | Future message-event interaction modes. |
| [Encrypted push](https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-/encrypt-key-encryption-configuration-case) | `ENCRYPT_KEY`, encrypted URL verification, callback decrypt checks. |

### SDKs

| Official source | Local dependency |
| --- | --- |
| [Official Node SDK](https://github.com/larksuite/node-sdk) | Generated TypeScript runtime and callback/signature helpers. |
| [Official Python SDK](https://github.com/larksuite/oapi-sdk-python) | Future Python runtime/adapter option. |

## Implementation Mapping

| Local module | Feishu docs dependency |
| --- | --- |
| `src/commands/analyze.ts` | Infers service capabilities that later map to Feishu scopes and card forms. |
| `src/commands/context.ts` | Generates owner/FDE request for app credentials, scopes, callback URL, and secure secret channel. |
| `src/commands/configure.ts` | Validates app/context values before writing runtime env. |
| `src/commands/generate.ts` | Emits card builders, webhook handler, message send/update calls, image upload, debug endpoints, and adapter docs. |
| `src/commands/verify.ts` | Tests target reachability, runtime health, URL verification, signed callbacks, encrypted callbacks, debug card action flow, send-start-card, and Level 2 gates. |
| `src/commands/evidence.ts` | Converts verification/audit/manual Feishu observations into redacted evidence. |
| `src/commands/readiness.ts` | Summarizes whether Feishu context and evidence are enough to proceed. |
| `src/commands/doctor.ts` | Final gate explanation, including optional `--probe-target` live target check. |
| `src/commands/handoff.ts` | Sanitized transfer and guidance checks, including `doctor --probe-target --gate` guidance. |
| `src/url-validation.ts` | Rejects local/private callback URLs for real Level 2 unless explicitly allowed for local mock verification. |

## Design Rules That Must Stay Traceable

1. A card click is not permission to call arbitrary Feishu OpenAPI. Every exposed capability must map to explicit scopes, callback configuration, app availability, and data permissions when needed.
2. Default to tenant/app identity for bot-owned work; require user auth only for user-owned resources.
3. Treat send, update, upload, callback, and business-resource access as separate permission surfaces.
4. Real Level 2 requires a public HTTPS callback URL; local/private URLs are only for mock verification.
5. Generated reports must include the required scopes, callback URLs, setup steps, and evidence gates without printing secrets.
6. `doctor --probe-target --gate` is the final local sanity check before sign-off because stale verification snapshots can otherwise hide an offline target service.

## Known Gaps

- Exact Card JSON 2.0 component schemas are not mirrored locally; generated card changes should be checked against the official card docs or the `lark-card-designer` skill before implementation.
- Exact scope names for less common Feishu business resources are not enumerated here; target services that touch contacts, docs, calendar, Base, approval, Drive, or admin APIs must add resource-specific source links before generation is considered safe.
- Long-connection receiving is not just a future option: current official docs and Node SDK docs indicate that the newer `card.action.trigger` callback can be received through the SDK long-connection path, while legacy `card.action.trigger_v1` remains webhook-oriented. MVP-1A documents that still assume webhook-only card callbacks need to distinguish these callback versions explicitly.
- This file records sources and local implications, not official document text. If a Feishu doc changes, update the local implication and test coverage rather than copying the whole page.

## Refresh Triggers

Recheck the relevant official docs when:

- Adding a new Feishu API surface or scope.
- Changing card JSON, CardKit, form, button, callback, or update-card behavior.
- Changing signature, token, encryption, URL verification, or callback validation logic.
- Adding a new interaction mode such as message event, slash-like command, private chat command, long connection, or user-auth workflow.
- Preparing a real FDE/Level 2 verification package for handoff.
