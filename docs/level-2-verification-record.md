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
- Feishu app name:
- Test chat:

## Required Feishu setup

- [ ] Bot capability is enabled.
- [ ] Bot is added to the test chat.
- [ ] App credentials are written to `bot-runtime/.env`: `APP_ID`, `APP_SECRET`.
- [ ] Callback token is written to `bot-runtime/.env`: `VERIFICATION_TOKEN`.
- [ ] `ENCRYPT_KEY` is written if encrypted callbacks are enabled.
- [ ] `TEST_CHAT_ID` is written.
- [ ] `PUBLIC_CALLBACK_BASE_URL` is written and publicly reachable by Feishu.
- [ ] `DEBUG_ACCESS_TOKEN` is set before `/debug/*` endpoints are exposed through a public runtime URL.
- [ ] `ALLOWED_OPERATOR_OPEN_IDS` is set for real group use, or the operator explicitly accepts that any valid card click can run the service.
- [ ] Card callback URL is configured as `<PUBLIC_CALLBACK_BASE_URL>/webhook/card`.

## Preflight evidence

- [ ] `GET <target_base_url>/api/meta` succeeds from the bot runtime environment.
- [ ] `GET <bot_runtime_url>/health` succeeds.
- [ ] `POST <bot_runtime_url>/webhook/card` answers a local `url_verification` challenge.
- [ ] `POST <PUBLIC_CALLBACK_BASE_URL>/webhook/card` answers a public `url_verification` challenge.
- [ ] Signed card-action payloads to local and public `/webhook/card` return success cards when `VERIFICATION_TOKEN` is set.
- [ ] If `ENCRYPT_KEY` is enabled, local and public encrypted `url_verification` challenges both succeed.
- [ ] `DEBUG_ACCESS_TOKEN` is set before `/debug/*` endpoints are exposed through a public runtime URL.
- [ ] `GET <bot_runtime_url>/debug/audit-tail?limit=100` returns recent audit events when `DEBUG_ACCESS_TOKEN` is provided.
- [ ] `ALLOWED_OPERATOR_OPEN_IDS` is set for real group use, or the operator explicitly accepts that any valid card click can run the service.
- [ ] `POST <bot_runtime_url>/debug/simulate-generate` succeeds before real Feishu card testing.
- [ ] `POST <bot_runtime_url>/debug/simulate-card-action` succeeds and writes `card_action_received`.
- [ ] `POST <bot_runtime_url>/debug/simulate-card-action` with `image.iterate.submit` succeeds after a generated `session_id`.
- [ ] `verify --simulate` records card-action, v2 card-action, iterate, batch, batch-refresh, and invalid-input failure-card PASS checks.
- [ ] `node dist/index.js verify <generated_package> --runtime-url <bot_runtime_url> --level2` succeeds.
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
