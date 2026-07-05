# Level 2 verification record

Use this record as the generic template when validating MVP-1A against a real Feishu development app. For a generated package, fill the package-local `level2_verification_record.md` instead.

## Environment

- Date:
- Operator:
- Target service:
- Target base URL:
- Generated package path:
- Bot runtime URL:
- Public callback URL:
- Host receive mode: standalone-runtime | embedded-webhook | embedded-long-connection | hybrid
- Integration mode: standalone-runtime | embedded-adapter | self-hosted-runtime
- Long-connection gateway/sidecar:
- Self-hosted feishu-host path:
- Feishu app name:
- Test chat:

## Required Feishu setup

- [ ] Bot capability is enabled.
- [ ] Bot is added to the test chat.
- [ ] App credentials are written to the selected host/runtime secret store: `APP_ID`, `APP_SECRET`.
- [ ] For `standalone-runtime` or `embedded-webhook`, callback token is written to the selected host/runtime secret store: `VERIFICATION_TOKEN`.
- [ ] For `standalone-runtime` or `embedded-webhook`, `ENCRYPT_KEY` is written if encrypted callbacks are enabled.
- [ ] `TEST_CHAT_ID` is written.
- [ ] For `standalone-runtime` or `embedded-webhook`, `PUBLIC_CALLBACK_BASE_URL` is written and publicly reachable by Feishu.
- [ ] For `embedded-long-connection`, Feishu SDK long connection is online and subscribed to `card.action.trigger`; `PUBLIC_CALLBACK_BASE_URL` is optional unless webhook fallback is also enabled.
- [ ] For `self-hosted-runtime`, `feishu-host/.env` is filled with `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_CONNECTION_MODE=websocket`, and `IMAGE_AGENT_BASE_URL`; `PUBLIC_CALLBACK_BASE_URL` and `VERIFICATION_TOKEN` are not required unless webhook fallback is enabled.
- [ ] `DEBUG_ACCESS_TOKEN` or equivalent host guard is set before `/debug/*` endpoints are exposed.
- [ ] `ALLOWED_OPERATOR_OPEN_IDS` is set for real group use, or the operator explicitly accepts that any valid card click can run the service.
- [ ] For `standalone-runtime` or `embedded-webhook`, card callback URL is configured as `<PUBLIC_CALLBACK_BASE_URL>/webhook/card`.
- [ ] For `embedded-long-connection`, the gateway/sidecar routes `card.action.trigger` payloads into the generated adapter.
- [ ] For `self-hosted-runtime`, `python feishu-host/app.py --selfcheck` succeeds with installed `lark-oapi` and prints `card.action.trigger` wiring.

## Preflight evidence

- [ ] `GET <target_base_url>/api/meta` succeeds from the selected host/runtime environment.
- [ ] `GET <host_or_runtime_url>/health` succeeds.
- [ ] For `standalone-runtime` or `embedded-webhook`, `POST <host_or_runtime_url>/webhook/card` answers a local `url_verification` challenge.
- [ ] For `standalone-runtime` or `embedded-webhook`, `POST <PUBLIC_CALLBACK_BASE_URL>/webhook/card` answers a public `url_verification` challenge.
- [ ] For `embedded-long-connection`, host logs show a real or host-owned simulated `card.action.trigger` reaches `adapter/handlers.ts`.
- [ ] For `self-hosted-runtime`, `python feishu-host/local_contract_test.py` succeeds and prints `feishu-host contract: PASS`.
- [ ] For `self-hosted-runtime`, `node dist/index.js verify <generated_package> --mode self-hosted-runtime --strict` succeeds after Python dependencies are installed.
- [ ] For `standalone-runtime` or `embedded-webhook`, signed card-action payloads to local and public `/webhook/card` return success cards when `VERIFICATION_TOKEN` is set.
- [ ] For `standalone-runtime` or `embedded-webhook`, local and public encrypted `url_verification` challenges both succeed if `ENCRYPT_KEY` is enabled.
- [ ] `DEBUG_ACCESS_TOKEN` or equivalent host guard is set before `/debug/*` endpoints are exposed.
- [ ] `GET <host_or_runtime_url>/debug/audit-tail?limit=100` or equivalent host log access returns recent audit events when protected debug access is provided.
- [ ] `ALLOWED_OPERATOR_OPEN_IDS` is set for real group use, or the operator explicitly accepts that any valid card click can run the service.
- [ ] `POST <host_or_runtime_url>/debug/simulate-generate` or equivalent host-owned simulation succeeds before real Feishu card testing.
- [ ] `POST <host_or_runtime_url>/debug/simulate-card-action` or equivalent host-owned simulation succeeds and writes `card_action_received`.
- [ ] `POST <host_or_runtime_url>/debug/simulate-card-action` or equivalent host-owned simulation with `image.iterate.submit` succeeds after a generated `session_id`.
- [ ] `verify --simulate` records card-action, v2 card-action, iterate, batch, batch-refresh, and invalid-input failure-card PASS checks.
- [ ] `node dist/index.js verify <generated_package> --runtime-url <bot_runtime_url> --level2` succeeds.
- [ ] For `self-hosted-runtime`, the generated package has passed local strict verification before the manual Feishu click.
- [ ] `verification_report.md` has no FAIL checks.
- [ ] `/debug/start-card` response does not contain a non-zero Feishu OpenAPI `code`.
- [ ] Feishu app has bot capability enabled.
- [ ] Feishu app has required scopes:
  - [ ] `im:message:send_as_bot`
  - [ ] `im:message:update` if `CARD_ACTION_MODE=async`
  - [ ] `im:resource:upload`
- [ ] Feishu app has card callback configured:
  - [ ] `card.action.trigger`
- [ ] Bot is in the test chat and can send messages.

## Interaction evidence

- [ ] `POST <bot_runtime_url>/debug/start-card` returns success.
- [ ] Test chat receives the start card.
- [ ] Start card shows expected input fields from `image-agent-web` template metadata.
- [ ] Start card shows `Template ID`, `Size`, optional `Message`, and batch items JSON inputs.
- [ ] Operator clicks "Generate test image".
- [ ] Bot runtime receives the card callback.
- [ ] For `self-hosted-runtime`, `feishu-host` logs show the `card.action.trigger` event was received through long connection.
- [ ] Bot runtime writes an audit event with `card_action_received`.
- [ ] If `ALLOWED_OPERATOR_OPEN_IDS` is set, an unlisted operator gets a red failure card and the target service is not called.
- [ ] Repeating the same card action immediately writes `card_action_duplicate` and does not call the target service twice.
- [ ] Bot runtime calls `image-agent-web /api/generate`.
- [ ] Submitted template id, field, size, and message values appear in the target request or output behavior.
- [ ] Target service returns `image_url`.
- [ ] Bot runtime uploads image to Feishu or records fallback URL.
- [ ] Test chat card updates to success.
- [ ] Success card shows `Feedback` input and `Iterate image` action when the target returns `session_id`.
- [ ] Operator submits feedback from the success card.
- [ ] Bot runtime calls `image-agent-web /api/iterate`.
- [ ] Test chat receives an iterated result card with trace ID and result summary.
- [ ] Operator submits a batch job from Feishu.
- [ ] Bot runtime calls `image-agent-web /api/batch`.
- [ ] Batch progress card shows batch id, done/total, completed count, failed count, and refresh action.
- [ ] Operator refreshes the batch progress card from Feishu.
- [ ] Bot runtime calls `image-agent-web /api/batch/{batch_id}/status`.
- [ ] Completed batch card shows a download link for `image-agent-web /api/batch/{batch_id}/download` when completed images exist.
- [ ] If `CARD_ACTION_MODE=async`, `bot-runtime/audit.log` includes `async_generation_queued` and `message_patch_succeeded`.
- [ ] Success card includes trace ID and result summary.

## Failure-path evidence

At least one failure path should be observed before considering MVP-1A stable:

- [ ] Missing/invalid target base URL returns a readable failure card.
- [ ] Slow or stuck target response returns a readable timeout failure card.
- [ ] Invalid card input returns a red failure card and does not call the target service.
- [ ] Missing Feishu `.env` values are caught before runtime starts.
- [ ] Image upload failure falls back to target output URL when available.

## Artifacts

- `verification_report.md` path:
- `audit.log` path:
- Start card message ID:
- Result card message ID or screenshot:
- Generated image URL or image key:
- Batch ID:
- Batch status card message ID or screenshot:
- Batch download URL or screenshot:
- Trace ID:
- Notes:

## Completion decision

- [ ] Level 2 verified.
- [ ] Remaining issues documented.
- [ ] MVP-1A can be handed to another FDE using `README.md` and `docs/fde-handoff.md`.
