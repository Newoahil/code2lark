# Lark/Feishu permissions reference for Lark-deployer

Date: 2026-06-30

## 1. Purpose

This document captures the permission model that Lark-deployer should use when generating a runnable Lark/Feishu bot integration package for an existing process, script, API, or service.

The key development requirement is:

> Different target processes require different Lark permissions. Lark-deployer must infer the minimum required bot/app permissions from the capabilities it exposes, then generate a reviewable permission plan before deployment.

This is a summarized development reference, not a mirror of official documentation. Keep the official links in the generated report so users can verify permissions in the Lark/Feishu developer console.

## 2. Official sources checked

Core permission model:

- Application authentication overview: https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/overview
- Access tokens: https://open.feishu.cn/document/ukTMukTMukTM/uMTNz4yM1MjLzUzM
- Choosing token types: https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-choose-which-type-of-token-to-use
- Apply for API permissions: https://open.feishu.cn/document/ukTMukTMukTM/uQjN3QjL0YzN04CN2cDN
- Configure application availability: https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/availability
- Configure application data permissions: https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/configure-app-data-permissions
- Enable bot capability: https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-enable-bot-ability
- Self-built application development process: https://open.feishu.cn/document/home/introduction-to-custom-app-development/self-built-application-development-process

Messaging and bot interaction:

- Send message: https://open.feishu.cn/document/server-docs/im-v1/message/create
- Reply message: https://open.feishu.cn/document/server-docs/im-v1/message/reply
- Edit message: https://open.feishu.cn/document/server-docs/im-v1/message/update
- Upload image: https://open.feishu.cn/document/server-docs/im-v1/image/create
- Upload file: https://open.feishu.cn/document/server-docs/im-v1/file/create
- Receive message event: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive

Event and callback setup:

- Event overview: https://open.feishu.cn/document/server-docs/event-subscription-guide/overview
- Long connection event receiving: https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-/request-url-configuration-case
- Webhook event receiving: https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-/choose-a-subscription-mode/send-notifications-to-developers-server
- Add subscribed events: https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-/subscription-event-case
- Receive events and encrypted push: https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-/encrypt-key-encryption-configuration-case
- Official Node SDK: https://github.com/larksuite/node-sdk

Cards and card actions:

- Develop a card interactive bot: https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/quick-start/develop-a-card-interactive-bot
- Card callback communication: https://open.feishu.cn/document/feishu-cards/card-callback-communication
- Card JSON 2.0 structure: https://open.feishu.cn/document/feishu-cards/card-json-v2-structure
- Feishu CardKit overview: https://open.feishu.cn/document/feishu-cards/feishu-card-cardkit/feishu-cardkit-overview
- Form container: https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-components/containers/form-container
- Button component: https://open.feishu.cn/document/feishu-cards/card-json-v2-components/interactive-components/button?lang=zh-CN
- Card resource overview: https://open.feishu.cn/document/cardkit-v1/feishu-card-resource-overview

## 3. Feishu permission model

Feishu permissions should be treated as four separate layers:

| Layer | Meaning | Lark-deployer implication |
| --- | --- | --- |
| Access token | The identity used to call OpenAPI. Common choices are `tenant_access_token` and `user_access_token`. | Generated code must choose app identity or user identity per capability. |
| API permission / scope | What OpenAPI or event ability the app is allowed to use. | Generated `required_permissions.json` must list exact scopes and the reason for each. |
| Application availability | Which users, departments, or groups can use the app. | Generated deployment report must recommend the minimum availability range. |
| Data permission | Data range available when using app identity for some business resources. | If the target service reads contacts/docs/calendar/Base/etc., the plan must include data permission notes, not only API scopes. |

Practical rule:

```text
Do not infer "bot can do everything" from "bot can receive a click".
Every action behind the click must map to explicit Feishu scopes, availability, data permissions, and target-service permissions.
```

## 4. Access token decision rules

### tenant_access_token

Use app identity when the bot performs work as the application itself.

Typical use:

- Send bot messages or cards.
- Upload images/files for bot messages.
- Read resources owned by or explicitly granted to the app.
- Execute service operations where the business actor is "the bot/app".

Generated runtime implication:

```text
APP_ID + APP_SECRET -> tenant_access_token -> OpenAPI call
```

### user_access_token

Use user identity when the bot must act on behalf of the clicked/user-authorized person.

Typical use:

- Read or modify a user's own resource.
- Perform operations where the result must reflect the user's personal permissions.
- Access APIs that require user authorization.

Generated runtime implication:

```text
OAuth authorization flow -> user_access_token -> OpenAPI call
```

MVP recommendation:

Prefer `tenant_access_token` for the first version. Only introduce `user_access_token` when a target capability truly needs per-user authorization.

## 5. Minimum bot permissions by interaction type

### 5.1 Send a bot message or card

Needed when:

- The target process returns a result to a user or group.
- The tool sends a summary, report, alert, or final task status.
- The tool sends an interactive card.

Platform prerequisites:

- Bot capability must be enabled.
- For user messages, the user must be in the bot application's availability range.
- For group messages, the bot must be in the group and allowed to speak.

OpenAPI:

- `POST /open-apis/im/v1/messages`

Common scopes:

- `im:message`
- `im:message:send_as_bot`
- `im:message:send` historical/legacy option

MVP default:

Use `im:message:send_as_bot` where possible, because the generated integration is normally sending as the bot.

### 5.2 Reply to a received message

Needed when:

- The bot responds inside the original thread/message context.
- The user triggers a command by sending a message.

OpenAPI:

- `POST /open-apis/im/v1/messages/:message_id/reply`

Common scopes:

- `im:message`
- `im:message:send_as_bot`
- `im:message:send` historical/legacy option

For user-identity sending:

- `im:message`
- `im:message.send_as_user`

MVP default:

Avoid user-identity sending unless the target process requires it.

### 5.3 Edit or update an existing message

Needed when:

- A long-running task card needs status updates.
- A progress/result message should be replaced instead of sending many new messages.

OpenAPI:

- Text/rich-text message edit: `PUT /open-apis/im/v1/messages/:message_id`
- Card update uses the dedicated card-message update API linked from the official edit-message doc.

Common scopes for editing messages:

- `im:message`
- `im:message:send_as_bot`
- `im:message:update`

Important constraints:

- The bot can only edit messages it sent.
- Edit count and edit time limits apply.
- For group messages, the bot must remain in the group and have speaking permission.

### 5.4 Receive direct messages

Needed when:

- The generated bot supports one-to-one command input.
- The user sends parameters in a private bot chat.

Event:

- `im.message.receive_v1`

Event subscription:

- Subscribe to "receive message v2.0" under the message/group category.

Common scopes:

- `im:message.p2p_msg:readonly`
- `im:message.p2p_msg` historical/legacy option

MVP default:

If the bot only uses cards/buttons and does not parse free-text commands, do not request direct-message receiving.

### 5.5 Receive group messages that @ the bot

Needed when:

- The generated bot supports group command input like `@bot run report`.
- The bot should respond only when explicitly mentioned.

Event:

- `im.message.receive_v1`

Common scopes:

- `im:message.group_at_msg:readonly`
- `im:message.group_at_msg` historical/legacy option

MVP default:

Prefer `im:message.group_at_msg:readonly` over reading all group messages.

### 5.6 Receive all group messages

Needed only when:

- The target integration must monitor every group message.
- The bot is doing moderation, logging, or real-time conversation analysis.

Common scopes:

- `im:message.group_msg`
- `im:message.group_msg:readonly`

Risk:

This is broader and can be sensitive. Lark-deployer should not request it by default.

Generated report rule:

If this scope is inferred, mark it as high review priority and explain why @-only receiving is insufficient.

### 5.7 Receive messages from users and other bots when @ mentioned

Needed when:

- The bot must react to other bots mentioning it.
- Multi-bot workflows are expected.

Common scope:

- `im:message.group_at_msg.include_bot:readonly`

MVP default:

Do not request unless the target service explicitly requires bot-to-bot coordination.

### 5.8 Upload images or files

Needed when:

- The target process outputs images, charts, reports, logs, CSVs, PDFs, or other files that should be sent through Feishu.
- The card contains images that need `image_key`.

OpenAPI:

- Upload image: `POST /open-apis/im/v1/images`
- Upload file: `POST /open-apis/im/v1/files`

Common scopes:

- `im:resource`
- `im:resource:upload`

Important constraints:

- Message images need upload type `message`.
- Images and files have size/type limits.
- Uploaded media must generally be sent by the same app.

### 5.9 Use sensitive sender/user fields

Needed when:

- The generated runtime needs stable user IDs for audit, authorization, or routing.
- The card must mention or display users by user ID.

Common field-level permission:

- `contact:user.employee_id:readonly` for user ID fields in some message/event responses.

Extra event field:

- `im:user_agent:read` if user agent data is needed.

MVP default:

Prefer `open_id` for user identity inside one app. Request user ID field permission only when cross-app/user-directory integration requires it.

## 6. Interactive card callback permissions

Interactive cards involve two separate concerns:

1. Sending or updating the card.
2. Receiving user actions from the card.

For sending cards:

- Use the same message-sending permission path as normal bot messages.
- `msg_type` is `interactive`.
- Card JSON or template data is sent as message content.

For receiving card actions:

- Configure card callback handling in the app.
- The official Node SDK exposes `CardActionHandler`.
- The SDK `registerApp` helper supports callback addons such as `card.action.trigger`.
- Webhook callbacks may need `verificationToken` and `encryptKey` depending on security configuration.

Runtime rule:

```text
Card click -> callback handler -> action id -> interaction_contract -> permission check -> service adapter -> card/message update
```

Security rule:

Never treat a card button as authorization by itself. The runtime still needs to check:

- Who clicked.
- Whether the user is in the allowed operator set.
- Whether the capability is enabled.
- Whether the action is read-only, write, or destructive.
- Whether confirmation/approval is required.

## 7. Event subscription mode and deployment impact

### Long connection

Good for:

- MVP development.
- Local testing without public callback URL.
- Faster setup using official SDK.

Constraints:

- The runtime must be able to access the public network.
- Events are received by one client in clustered deployment, not broadcast to all clients.
- Official SDK notes that event processing should complete quickly to avoid timeout/retry behavior.
- Long connection can receive callback subscriptions in the newer callback flow, including `card.action.trigger`.
- The older `card.action.trigger_v1` callback flow does not support long connection; treat it as legacy/webhook-oriented.

Lark-deployer implication:

Use long connection for `im.message.receive_v1` when it fits the host architecture.
For interactive card actions, distinguish callback versions explicitly:

- If the host uses `card.action.trigger`, long-connection receiving is a valid host mode.
- If the host uses `card.action.trigger_v1`, keep webhook callback assumptions.
- Until the generated host mode is explicit, do not hard-code webhook-only assumptions into generic platform docs.

### Webhook

Good for:

- Production deployment with a stable public HTTPS endpoint.
- Explicit callback routing.
- Card action callback handling.

Requirements:

- Public request URL.
- Challenge response during URL verification.
- Optional but recommended encrypted push using `Encrypt Key`.
- Verification token checking when configured.

Lark-deployer implication:

If using webhook mode, generated runtime must include:

- `/webhook/event`
- `/webhook/card`
- challenge handling
- verification token handling
- decrypt/encrypt handling or SDK adapter configuration

## 8. Process capability to Feishu permission mapping

Lark-deployer should classify target process capabilities before deciding Feishu permissions.

| Target process behavior | Bot interaction | Feishu requirement |
| --- | --- | --- |
| Returns short text result | Send/reply text | Bot enabled, send/reply message scope |
| Returns structured report | Send interactive card | Bot enabled, send message scope |
| Returns image/chart | Upload image, then send card/message | `im:resource:upload` or `im:resource` plus send scope |
| Returns file/log/PDF/CSV | Upload file, then send message/card | `im:resource:upload` or `im:resource` plus send scope |
| Needs user command in private chat | Receive direct messages | `im.message.receive_v1` plus direct-message scope |
| Needs group command by @ | Receive group @ messages | `im.message.receive_v1` plus group @ scope |
| Needs monitor all group content | Receive all group messages | all-group-message scope, high review |
| Long-running task | Send initial card, update progress/final result | send scope plus update/card callback path |
| Button/form action | Card action callback | card callback config, verification, runtime authorization |
| Reads Feishu contact/user data | Contact API | contact scopes and possibly data permissions |
| Reads/writes docs/calendar/Base/approval | Business OpenAPI | resource-specific scopes, token decision, data permissions |
| Acts as the clicked user | User identity flow | OAuth/user access token and user scopes |

## 9. Generated permission artifact

Every generation run should produce `required_permissions.json`.

Suggested schema:

```json
{
  "app": {
    "type": "custom_app",
    "bot_required": true,
    "availability": {
      "recommended_scope": "specific_users_or_department",
      "reason": "Only operators who can run this service should access the bot."
    }
  },
  "token_strategy": {
    "default": "tenant_access_token",
    "user_access_token_required": false,
    "reasons": []
  },
  "scopes": [
    {
      "scope": "im:message:send_as_bot",
      "identity": "tenant",
      "required_by": ["capability.report.daily"],
      "reason": "Send generated report card to a chat.",
      "risk": "low"
    }
  ],
  "events": [
    {
      "event": "im.message.receive_v1",
      "required_by": ["trigger.group_at_command"],
      "reason": "Receive @bot commands in group chat.",
      "preferred_scope": "im:message.group_at_msg:readonly",
      "risk": "medium"
    }
  ],
  "callbacks": [
    {
      "callback": "card.action.trigger",
      "required_by": ["interaction.run_button"],
      "reason": "Receive interactive card button clicks.",
      "security": ["verification_token", "encrypt_key"]
    }
  ],
  "data_permissions": [],
  "manual_steps": [
    "Enable bot capability.",
    "Set app availability to the operator group.",
    "Publish app version after changing permissions."
  ],
  "review_flags": []
}
```

## 10. Permission review rules for the agent

The build-time agent should apply these rules:

1. Use the minimum scope that enables the interaction.
2. Prefer group @ receiving over all-group-message receiving.
3. Prefer app identity over user identity unless user-owned resources require user authorization.
4. Treat file/image outputs as a separate resource-upload permission.
5. Treat contact/user ID access as field-level sensitive permission.
6. Treat destructive service actions as runtime authorization problems, not only Feishu scope problems.
7. For every requested scope, record which target capability caused it.
8. If a scope is sensitive or broad, add a review flag and suggest a narrower alternative.
9. If a capability requires a Feishu business resource, include both API scope and data permission notes.
10. Do not proceed to real deployment until the permission report is reviewed or explicitly accepted.

## 11. Permission plans by MVP scenario

### Scenario A: Report script -> manual card button -> result card

Example:

```text
User clicks "Generate daily report" card button.
Bot server runs a local script.
Bot updates or sends a result card.
```

Likely requirements:

- Bot capability enabled.
- Send card/message scope, typically `im:message:send_as_bot`.
- Card action callback configuration, such as `card.action.trigger`.
- Availability limited to the operator group.

No need for:

- Receive message event.
- Read all group messages.
- User access token.

### Scenario B: Group @ command -> script execution -> reply

Example:

```text
@bot run report date=2026-06-30
Bot parses the command.
Bot runs the script.
Bot replies in the group.
```

Likely requirements:

- Bot capability enabled.
- Event `im.message.receive_v1`.
- Group @ message scope, preferably `im:message.group_at_msg:readonly`.
- Reply/send message scope, typically `im:message:send_as_bot`.
- Bot added to the group and allowed to speak.

Avoid:

- All-group-message scope unless the bot must process messages without @.

### Scenario C: Long-running process with progress card

Example:

```text
User clicks "Start sync".
Bot starts a long task.
Bot updates progress and final result.
```

Likely requirements:

- Bot capability enabled.
- Send message/card scope.
- Message/card update mechanism.
- Card callback configuration.
- Runtime state and audit storage.

Feishu-side permission is only part of the story. Runtime must also enforce task cancellation, timeout, idempotency, and operator authorization.

### Scenario D: Service returns charts/files

Example:

```text
Service generates chart.png and result.csv.
Bot sends an image preview and file attachment.
```

Likely requirements:

- Bot capability enabled.
- Send message/card scope.
- Resource upload scope: `im:resource:upload` or `im:resource`.
- Size/type checks before upload.

### Scenario E: Feishu business data integration

Example:

```text
Target service reads Feishu contacts, docs, calendar, Base, approval, or Drive resources.
```

Likely requirements:

- Resource-specific API scopes.
- Token strategy decision: app identity or user identity.
- Data permissions if using app identity for supported business resources.
- Human review because the target service is no longer just a local process wrapper.

## 12. Development implications for Lark-deployer

Add a permission inference phase after capability mapping:

```text
capability_map
-> interaction_contract
-> permission_inference
-> required_permissions.json
-> human review
-> app registration/config generation
-> deployment verification
```

The deployment task is only done when:

```text
1. Required permissions are known.
2. Permissions are granted/configured in Feishu.
3. Bot ability and availability are configured.
4. Callback/event mode works.
5. Each exposed capability passes end-to-end verification through Feishu.
```

Recommended generated files:

```text
generated/manifest/required_permissions.json
generated/manifest/permission_review.md
generated/manifest/deployment_checklist.md
```

`permission_review.md` should be written for humans. It should answer:

- What permissions will be requested?
- Why is each permission needed?
- Which service feature caused it?
- Is there a narrower alternative?
- What happens if this permission is not granted?
- Which permissions are broad or sensitive?
