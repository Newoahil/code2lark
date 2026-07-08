# MVP-1A: image-agent-web Lark integration

Date: 2026-07-01

## Goal

Build a reproducible first MVP where Lark-deployer generates a Feishu/Lark bot integration package for `image-agent-web`.

This document describes the verified sample, not the whole Code2Lark product definition. The verified sample path is Mode A: an external host / sidecar path that keeps `image-agent-web` unchanged while the generated `feishu-host/` calls it over HTTP.

The MVP is considered functionally proven when a real Feishu development app can send a start card, receive card clicks, call `image-agent-web /api/generate`, return a result card with the generated image or fallback image URL, accept result-card feedback and call `image-agent-web /api/iterate`, then submit a batch job through `/api/batch`, refresh `/api/batch/{batch_id}/status`, and show a `/api/batch/{batch_id}/download` link when completed images exist.

## Non-goals

- Lark-deployer does not start or manage `image-agent-web`.
- Lark-deployer does not deploy production infrastructure.
- Lark-deployer does not support `calendar-stock-updater`, `MT-agent`, or `MyLord` in MVP-1A.
- MVP-1A does not cover `/api/history`.
- MVP-1A does not require automatic Feishu app creation.

## Operator workflow

1. Start or otherwise provide `image-agent-web`.
2. Confirm `GET <base_url>/api/meta` works.
3. Run `lark-deployer analyze`.
4. Review generated manifest and analysis report.
5. Run `lark-deployer plan`.
6. Run `lark-deployer context`, send `feishu_context.request.md` to the target operator/app owner to confirm who can provide each Feishu value/permission/callback, and ask them to fill missing Feishu context through a secure channel.
7. Give `permission_review.md` to the Feishu app owner/admin.
8. Run `lark-deployer generate`.
9. For an existing Feishu SDK service, integrate generated `adapter/` using `docs/integration_guide.md` and validate with `verify --mode embedded-adapter --strict`.
10. For a generated Python host, use `--mode self-hosted-runtime`; keep the FastAPI service unchanged, run `feishu-host/` as a separate Python process, subscribe to `card.action.trigger` through `lark-oapi` long connection, and call `image-agent-web` over HTTP.
11. For the adapter sidecar route, keep the FastAPI service unchanged and add a sidecar/gateway host with `--host-mode embedded-long-connection`; the sidecar owns Feishu SDK long connection, subscribes to `card.action.trigger`, sends the start card, and calls `adapter/handlers.ts`.
12. If no existing host is available and Python self-hosting is not selected, run `lark-deployer configure` to write generated `bot-runtime/.env` from filled context, then start the standalone reference runtime.
13. Configure Feishu card callback URL to `<PUBLIC_CALLBACK_BASE_URL>/webhook/card` only for webhook or standalone-runtime host modes.
14. Use `/debug/start-card`, the long-connection sidecar's send-card entry, or `feishu-host` start-card helper to send the first test card.
15. Click the card button in Feishu and confirm success/failure card behavior.
16. Submit feedback from the result card and confirm `/api/iterate` returns an updated result card.
17. Submit a batch job from the start card and confirm the progress card can refresh status and expose a download link after completion.

## Commands

```powershell
npm install
npm run build

node dist/index.js analyze C:\works\image-agent-web --base-url http://127.0.0.1:8000 --out out\image-agent-web
node dist/index.js plan out\image-agent-web
node dist/index.js context out\image-agent-web
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark-embedded --mode embedded-adapter
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark-long --mode embedded-adapter --host-mode embedded-long-connection
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark-self-hosted --mode self-hosted-runtime
node dist/index.js verify generated\image-agent-web-lark --mode embedded-adapter --strict
node dist/index.js verify generated\image-agent-web-lark-long --mode embedded-adapter --host-mode embedded-long-connection --strict
node dist/index.js verify generated\image-agent-web-lark-self-hosted --mode self-hosted-runtime --strict
node dist/index.js configure generated\image-agent-web-lark --strict --dry-run
node dist/index.js configure generated\image-agent-web-lark --strict
node dist/index.js status generated\image-agent-web-lark
node dist/index.js verify generated\image-agent-web-lark
```

After the generated standalone runtime is running, run:

```powershell
node dist/index.js verify generated\image-agent-web-lark --runtime-url http://127.0.0.1:3978 --simulate
```

This also checks that `POST /webhook/card` can answer a local `url_verification` challenge. That keeps Feishu developer-console callback setup separate from full card-action execution.

For `embedded-long-connection`, use `--host-mode embedded-long-connection` and validate the sidecar/gateway host instead:

```powershell
node dist/index.js verify generated\image-agent-web-lark-long --mode embedded-adapter --host-mode embedded-long-connection --host-runtime-url http://127.0.0.1:3978 --simulate
```

This checks host health and host-owned simulation/manual evidence without requiring a `/webhook/card` URL-verification endpoint.

For `self-hosted-runtime`, use the generated Python host and prove the local MVP before any real Feishu click:

```powershell
cd generated\image-agent-web-lark-self-hosted\feishu-host
Copy-Item .env.example .env
python -m pip install -r requirements.txt
python local_contract_test.py
python app.py --selfcheck
cd ..
node ..\..\dist\index.js verify . --mode self-hosted-runtime --strict
```

This proves the generated specs, Python handlers, HTTP target-call shapes, failure paths, special field-name round trip, and Feishu SDK `card.action.trigger` wiring without opening a live Feishu WebSocket. Real Feishu Level 2 is still manual and is documented in `docs/self-hosted-runtime-level2-runbook.md`.

After Feishu credentials are filled and the bot is in the test chat, run the stricter Level 2 preflight:

```powershell
node dist/index.js verify generated\image-agent-web-lark --runtime-url http://127.0.0.1:3978 --level2
```

This performs runtime health, public callback URL verification, signed webhook card-action verification when `VERIFICATION_TOKEN` is set, encrypted callback URL verification when `ENCRYPT_KEY` is set, target simulation, and first-card sending checks. The card click and result-card observation are recorded manually in `generated/image-agent-web-lark/level2_verification_record.md`.

Real Level 2 requires `PUBLIC_CALLBACK_BASE_URL` to be a public HTTPS URL. `--allow-local-callback` is reserved for local mock verification and must not be used as real Feishu evidence.

## Feishu app requirements

Minimum MVP context:

- `APP_ID`
- `APP_SECRET`
- `VERIFICATION_TOKEN`
- `ENCRYPT_KEY` if encrypted callback is enabled
- `TEST_CHAT_ID`
- `runtime_config.card_action_mode`, `runtime_config.upload_image_to_lark`, `runtime_config.host`, and `runtime_config.port` when defaults are not suitable
- Optional `runtime_config.allowed_operator_open_ids` when only specific Feishu operators should be able to execute card actions
- Optional `runtime_config.target_timeout_seconds` when the target image/model call needs more than the 120 second default
- Bot capability enabled
- Bot added to the test chat
- Card action callback configured

Minimum MVP scopes:

- `im:message:send_as_bot`
- `im:message:update` if `CARD_ACTION_MODE=async`
- `im:resource:upload`

Minimum callback:

- `card.action.trigger`

## Runtime behavior

The generated runtime exposes:

- `GET /health`
- `GET /debug/audit-tail`
- `POST /debug/start-card`
- `POST /debug/simulate-generate`
- `POST /debug/simulate-card-action`
- `POST /webhook/card`

The start card contains a form built from the discovered template fields plus `size` and optional `message`, then submits `image.generate.submit`. The callback merges submitted `form_value` into the preset payload, calls `image-agent-web /api/generate`, attempts to upload the generated image to Feishu, and returns a success card. If upload fails but the target service returns an image URL, the card includes the fallback target output URL.

The start card also contains a batch form for long-running image jobs. It accepts template id, size, and batch items JSON, submits `image.batch.submit`, calls `image-agent-web /api/batch`, and returns a progress card. The progress card shows batch id, done/total, completed count, failed count, and a refresh button that calls `/api/batch/{batch_id}/status`. When completed images exist, the card shows a download link to `/api/batch/{batch_id}/download`.

`/debug/simulate-generate` exists for pre-Feishu local readiness. It calls the target service and returns result card JSON without requiring Feishu credentials or sending a Feishu message.

`/debug/simulate-card-action` uses the same action parsing, form-value merge, validation, and audit path as a real Feishu card click. It records `card_action_received` with operator/chat/message context, supports Feishu 2.0-shaped callback payloads and JSON-string callback values, rejects invalid size or cleared required fields with a red failure card, and only calls the target service after validation passes.
Real card callbacks also use a short in-memory duplicate-action window keyed by message, operator, action, and submitted form payload. It protects against repeated delivery and rapid double-clicks, but it is not durable cross-process job storage.

With `ALLOW_DEBUG_WITHOUT_FEISHU=1`, the runtime can start before Feishu credentials are filled. In that state, `/health` reports `feishuConfigured: false` and lists missing keys. Real Feishu send/callback verification still requires the missing values.
When the runtime is exposed through a public callback URL, set `DEBUG_ACCESS_TOKEN` so `/debug/*` endpoints require `Authorization: Bearer <token>` or `x-lark-deployer-debug-token`. `verify` reads the token from `.env` automatically.
`/debug/audit-tail` returns recent audit events for `evidence --runtime-url` so a verifier can collect trace IDs and result evidence without direct filesystem access to `bot-runtime/audit.log`. The evidence draft summarizes recent audit details and redacts submitted field values, operator ids, and chat ids from shared Markdown output.

The runtime also reports finer-grained readiness:

- `callbackConfigured`: `VERIFICATION_TOKEN` is present, so non-challenge card callbacks can be verified.
- `sendConfigured`: `APP_ID`, `APP_SECRET`, and `TEST_CHAT_ID` are present, so `/debug/start-card` can send the first card.
- `feishuApiConfigured`: `APP_ID` and `APP_SECRET` are present, so image upload can be attempted.
- `feishuConfigured`: all Level 2 Feishu values are present.

## Static analysis fallback

If `GET /api/meta` is unavailable during analysis, MVP-1A reads `templates.py` and extracts:

- template ids
- allowed sizes
- default size
- template fields
- reference type ids

This improves the generated capability contract when the target service is not running. It does not replace runtime verification: `/api/generate`, `/api/iterate`, and `/api/batch` still require a reachable `image-agent-web` service.

The generated start-card preset is derived from the selected template metadata. If the first template changes, the generated `adapter/handlers.ts` default preset and standalone `bot-runtime/src/cards.ts` change their `template_id`, `size`, and field payload with it.

The generated start card also creates one input per discovered template field, plus required `Size`, optional `Message`, and batch items JSON inputs. Required template fields are marked as required in the Feishu form container.

## Current implementation status

- CLI commands implemented: `analyze`, `plan`, `context`, `configure`, `generate`, `status`, `verify`, `readiness`, `doctor`, `evidence`, and `handoff`. `generate` now emits `adapter/` as the core artifact and supports `--mode embedded-adapter` for packages that do not include standalone `bot-runtime/`. `verify --mode embedded-adapter --strict` validates manifest + adapter package structure without requiring runtime debug endpoints. `evidence --runtime-url --update-record` can fetch protected runtime audit-tail events and fill blank machine-supported artifact fields in the package-local Level 2 record without checking completion boxes; it also accepts manual Level 2 fields through CLI options or `--manual-evidence level2_manual_evidence.local.json`.
- Root TypeScript build passes.
- Automated CLI smoke test passes.
- Automated local runtime e2e test passes: it starts an `image-agent-web`-compatible mock target, generates a bot runtime package, installs/builds the runtime, starts it in debug mode, confirms `/webhook/card` answers URL verification challenges, confirms missing Feishu config is rejected for non-challenge callbacks, calls `/debug/simulate-generate`, calls `/debug/simulate-card-action`, verifies field, size, and message form-value merge into the target request, verifies Feishu 2.0-shaped card-action parsing with JSON-string callback value, verifies batch submit/refresh calls and batch audit events, verifies invalid size and cleared required fields return red failure cards without calling the target service, verifies card-action audit context, verifies protected and unprotected `/debug/audit-tail`, confirms `verify --simulate` records passing target/runtime checks including v2 callback compatibility, batch submit/refresh, invalid-input rejection, encrypted URL verification when `ENCRYPT_KEY` is set, and SDK-validated signed webhook card-action execution when `VERIFICATION_TOKEN` is set, and verifies `verify --level2` can check public plaintext/encrypted callback URLs and public signed card-action callbacks against a mock runtime.
- Static template fallback is covered by CLI smoke test and by the refreshed `out/image-agent-web/manifest/capability_map.json`.
- Batch endpoint coverage is included in `service_manifest.json`, `capability_map.json`, `interaction_contract.json`, `required_permissions.json`, generated runtime code, `verify --simulate`, `evidence`, and the package-local Level 2 checklist.
- Generated card preset is covered by CLI smoke test using a non-`product-image` template.
- Generated bot runtime TypeScript build passes after dependency install.
- Generated bot runtime can start in debug mode without Feishu credentials and return `/health`.
- `verify --runtime-url` compares `/health` configuration fields against the env/context values, catching stale runtime processes after `.env` changes.
- Real target preflight passed on 2026-07-01: temporarily started `C:\works\image-agent-web`, confirmed `GET /api/meta` against the actual target, started the generated bot runtime, and verified `/health`, `/webhook/card` URL challenge, target base URL, card action mode, image upload flag, and debug flag. `POST /api/generate` remains outside this local preflight because it calls the external image/model service.
- Sanitized handoff copy preflight passed on 2026-07-01: `handoff --copy-to out\handoff\image-agent-web-lark` copied a clean package without `bot-runtime/.env`, `feishu_context.local.json`, `bot-runtime/node_modules`, `bot-runtime/dist`, or audit/log files; the copied `bot-runtime` then passed `npm install --ignore-scripts --no-audit --no-fund`, `npm run build`, and `npm audit --audit-level=high`.
- Generated bot runtime returns 404 for unknown routes instead of leaving requests open.
- Generated bot runtime treats non-zero Feishu OpenAPI `code` responses from `/debug/start-card` as HTTP 500 failures, so Level 2 preflight catches missing send permission or chat access.
- `verify --level2` rejects local/private/http callback URLs by default and checks that public debug endpoints are token-protected.
- Generated runtime supports optional operator authorization through `ALLOWED_OPERATOR_OPEN_IDS`; unlisted card-click operators receive a red failure card before the target service is called.
- Generated runtime detects duplicate card actions in memory and does not call the target service twice for the same message/operator/action/form payload inside the short duplicate window.
- Generated runtime enforces `IMAGE_AGENT_TIMEOUT_MS` for target generation and result-image download, returning a readable failure card on timeout.
- Generated `feishu_context.template.json` stays secret-free; filled values are kept in excluded local context or `.env`, and `handoff --copy-to` refuses copied files that contain known local secret values.
- Shared evidence drafts are protected: `evidence` redacts manual Feishu values in `level2_evidence_draft.md`, `handoff --copy-to` redacts legacy manual-evidence rows during copy, and `handoff --check` fails if a shared Level 2 draft still contains unredacted manual evidence rows.
- Handoff path freshness is protected: `handoff --copy-to` refreshes package-path fields after copying, and `handoff --check` fails if copied shared files still point at an old generated package path or stale `generated_package_hint`.
- `status --json` and `readiness` report whether `level2_manual_evidence.template.json` exists, whether ignored `level2_manual_evidence.local.json` parses, and which filled field names are imported or pending import, without printing the local evidence values.
- Generated bot runtime supports `CARD_ACTION_MODE=async`, returning a running card immediately and patching the original message with the final card through Feishu `message.patch`.
- Generated `self-hosted-runtime` supports a Python `feishu-host/` package with `.env.example`, `lark-oapi`/`requests` requirements, manifest-derived specs, local contract test, and `app.py --selfcheck`; strict verify can execute the Python proof when dependencies are installed.
- Real Feishu verification is still pending external app credentials, callback URL setup, and a running target service.

## Completion split

MVP-1A has two evidence layers:

- Local build evidence: covered by `npm test`, plus `verify --mode self-hosted-runtime --strict` with installed Python dependencies for the generated Python host path.
- Real Feishu evidence: covered by the package-local `generated/image-agent-web-lark/level2_verification_record.md` after the operator provides app credentials, required scopes, callback URL, and a reachable target service. `evidence --runtime-url --update-record` can prefill machine-supported fields from `verification_report.json` and `bot-runtime/audit.log` or protected `/debug/audit-tail`, then accept manual result-card and batch-card evidence through CLI options or ignored `level2_manual_evidence.local.json`; its shared Markdown output redacts submitted field values, operator ids, chat ids, and raw manual evidence values. The completion checkboxes remain manual. `docs/level-2-verification-record.md` remains only the generic template.
