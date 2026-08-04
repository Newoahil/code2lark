# Troubleshooting Feishu/Lark Runtime Delivery

This guide covers common Co-Build delivery failures after Code2Lark generates `integrations/lark`.

## 1. SDK dependency was not installed

Symptoms:

- Long-connection host fails to start.
- Error mentions `@larksuiteoapi/node-sdk` is missing.
- Agent says dependency installation was blocked by permission policy.

Correct response:

- Do not silently downgrade to HTTP callback.
- Mark status as `dependency_pending` or `long_connection_blocked`.
- Ask the developer to choose:
  1. approve/install SDK dependency;
  2. defer runtime start and install manually later;
  3. explicitly switch to HTTP callback fallback.

Recommended install command:

```powershell
npm --prefix integrations/lark install
```

## 2. HTTPS sender can send a card, but clicks do not arrive

Likely cause:

- Sender and receive runtime were confused.
- OpenAPI HTTPS send path works, but long connection is not running or `card.action.trigger` is not subscribed.

Checks:

- Confirm long-connection dependency is installed.
- Confirm `start:lark` or equivalent starts the long-connection runtime, not HTTP callback.
- Confirm Feishu Open Platform has long connection enabled.
- Confirm `card.action.trigger` is subscribed.
- Confirm the process logs sanitized `longConnection: started` or equivalent.

Important rule:

```text
sender_ready != level2_ready
```

## 3. Agent switched to HTTP callback automatically

This is a delivery defect unless the developer explicitly approved callback fallback.

Required correction:

- Restore or keep the long-connection runtime.
- Mark long connection as blocked if SDK install is not available.
- Ask for explicit developer confirmation before callback fallback.
- If callback fallback is chosen, document public HTTPS URL, verification token/encrypt key, and Feishu callback console configuration.

## 4. Card send fails with JSON 2.0 component error

Common causes:

- `tag: "action"` copied from older card schema.
- `tag: "note"` copied from design vocabulary.
- `schema: "json_2_0_like"` or sketch metadata sent as production JSON.
- Root-level `elements` sent instead of `body.elements`.

Fix:

- Run Lark Card Designer JSON 2.0 compatibility gate.
- Convert design notes/footers to `markdown` or `div`.
- Convert multi-button areas to `column_set` / `column` / `button`.
- Run `verify:card` again before real send.

## 5. Buttons render but do not trigger callbacks

Likely cause:

- Button uses legacy top-level `value` or `action_type`.
- Button lacks JSON 2.0 `behaviors` callback.
- Action ID does not map to a known handler.

Required pattern:

```json
{
  "tag": "button",
  "text": { "tag": "plain_text", "content": "Confirm" },
  "behaviors": [
    {
      "type": "callback",
      "value": { "action": "business.operation.confirm" }
    }
  ]
}
```

Then confirm:

- `behaviors[].value.action` exists.
- Action ID is in the generated known action catalog.
- Handler routes the action to the correct business operation.

## 6. Callback response does not update the card

Correct response shape for card update:

```json
{
  "card": {
    "type": "raw",
    "data": { "schema": "2.0", "header": {}, "body": { "elements": [] } }
  }
}
```

Do not return raw card JSON directly under `card`.

Do not confuse callback response shape with OpenAPI message send `content`.

## 7. Operator is rejected unexpectedly

Checks:

- Confirm allowlist uses Feishu/Lark `open_id` from the same app context.
- Do not use phone number, chat ID, user ID, or open ID from another app.
- Confirm the callback event exposes the operator ID shape expected by the generated parser.
- For demo only, `*` may be used if explicitly documented; do not use `*` in production.

## 8. Token request fails

Checks:

- Confirm app ID and app secret are from the same Feishu/Lark app.
- Confirm env loader is reading the file you edited.
- Confirm logs only print sanitized booleans such as `appIdConfigured` and `appSecretConfigured`.
- Confirm token parser supports the response shape used by the API or SDK.

Do not print raw token responses, access tokens, app secrets, chat IDs, or open IDs in troubleshooting output.

## 9. Old process consumes events

Symptoms:

- Clicks appear in an older terminal or old demo directory.
- Current runtime logs show no callback while card clicks seem accepted.

Fix:

- Stop older Node processes running previous demo directories.
- Start only the current `integrations/lark` runtime.
- Log sanitized runtime identity: project path hash or safe app label, never app secret or raw IDs.

## 10. Final status wording

Use precise status labels:

| Status | Use when |
|---|---|
| `generated` | Code exists but install/runtime was not proven. |
| `dependency_pending` | SDK install is missing or blocked. |
| `long_connection_blocked` | Receive path cannot start. |
| `sender_ready` | HTTPS sender can send a card. |
| `level2_ready` | Ready for real tenant test after env/console setup. |
| `level2_verified` | Real send/click/callback/update evidence exists. |

Never use `level2_ready` just because the start card was sent.
