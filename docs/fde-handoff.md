# FDE handoff guide

This project should be usable by a teammate without relying on a specific Codex chat history.

## What to prepare

- A running target service URL for `image-agent-web`.
- A Feishu custom app with bot capability enabled.
- Permission to configure app scopes and either card callbacks or the SDK long-connection event subscription.
- A test group where the bot can send messages.

## What Lark-deployer gives you

- `generated/<target>-lark/` is the source-of-truth handoff package. Treat its manifests, adapter code, host modules, docs, context files, verification reports, and evidence records as the canonical handoff state.
- Mode A is the external host, sidecar, or gateway path. The target service keeps its own lifecycle and the generated host runs beside it.
- Mode B is the target-project embedded host-module path. The generated package remains the source of truth, but selected host files can be copied into the target repository as an incremental module, and the verified `image-agent-web` sample has completed deployment-test validation in this mode.
- The verified `image-agent-web` sample has completed deployment-test validation in both Mode A and Mode B; this handoff guide preserves that baseline and does not reopen it.
- self-hosted-runtime is the generated host module. Today it can run externally as the verified sample path; later it can also be embedded into the target project under Mode B.
- Machine-readable service and interaction contracts.
- Human-readable permission review.
- Deployment checklist.
- An embeddable `adapter/` package, an optional standalone Node runtime reference host, and a Python `feishu-host/` self-hosted long-connection runtime when generated with `--mode self-hosted-runtime`.
- Verification checks that explain missing context.
- A package-local `level2_verification_record.md` for real Feishu evidence collection.
- Static `templates.py` fallback for `image-agent-web` template ids, sizes, and fields when `/api/meta` is not available during analysis.
- A generated start-card preset based on the discovered template metadata rather than a fixed hard-coded payload.
- Generated Feishu card-action handlers for generate, iterate, batch submit, and batch refresh, with submitted values mapped into the target service requests.

## What Lark-deployer does not do

- It does not start the target service.
- It does not keep the target service alive.
- It does not own production deployment.
- It does not guess Feishu credentials.

## Runtime config boundaries

- Callback URL setup needs `VERIFICATION_TOKEN`, plus `ENCRYPT_KEY` if encrypted callbacks are enabled.
- `/debug/start-card` needs `APP_ID`, `APP_SECRET`, and `TEST_CHAT_ID`.
- Result image upload needs `APP_ID` and `APP_SECRET`.
- Async card updates need `APP_ID`, `APP_SECRET`, and the message update scope.
- Slow target calls should tune `target_timeout_seconds` in context, which writes `IMAGE_AGENT_TIMEOUT_MS` into the runtime `.env`.
- Runtime startup validates `PORT`, `CARD_ACTION_MODE`, and boolean flags, so fix `.env` typos before rerunning.
- Full Level 2 in `embedded-webhook` or `standalone-runtime` needs all of the above plus a public HTTPS `PUBLIC_CALLBACK_BASE_URL` and a reachable target service. In `embedded-long-connection`, the host/gateway instead needs `APP_ID`, `APP_SECRET`, an online Feishu SDK long connection subscribed to `card.action.trigger`, and a reachable target service.
- Full Level 2 in `self-hosted-runtime` uses the generated Python `feishu-host/`: fill `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_CONNECTION_MODE=websocket`, `IMAGE_AGENT_BASE_URL`, and optional `TEST_CHAT_ID`/allowlist/timeout in `feishu-host/.env`; no public webhook callback is required unless a webhook fallback is added.
- `ALLOWED_OPERATOR_OPEN_IDS` is optional but recommended for real group use. It limits card-action execution to listed Feishu operator `open_id` values and is enforced before the target service is called.

## Recommended handoff sequence

1. Run `npm install`, `npm run build`, and `npm test` in the project root.
2. Review `out/image-agent-web/permission_review.md`.
3. Run `node dist/index.js context out\image-agent-web`, send `feishu_context.request.md` to the Feishu app owner or FDE to confirm who can provide each value, permission, callback, and test-chat setup, then use `feishu_context.reply.template.json/md` as the non-secret intake form for the reply. Run `node dist/index.js init-local generated\image-agent-web-lark --context --reply` to create ignored local intake files, then fill the local context including `runtime_config` if the runtime should use async card updates, a non-default port, or a Feishu OpenAPI override.
4. Generate `generated/image-agent-web-lark`.
5. For an existing Feishu SDK service, integrate `generated/image-agent-web-lark/adapter/` using `docs/integration_guide.md`, then run `node dist/index.js verify generated\image-agent-web-lark --mode embedded-adapter --strict` and `node dist/index.js doctor generated\image-agent-web-lark --mode embedded-adapter`. For the `image-agent-web` sidecar-long-connection route, generate with `--mode embedded-adapter --host-mode embedded-long-connection` and run the same verify/doctor commands with `--host-mode embedded-long-connection`. For the generated Python host route, generate with `--mode self-hosted-runtime`, install `feishu-host/requirements.txt`, run `python feishu-host/local_contract_test.py`, run `python feishu-host/app.py --selfcheck`, then run `node dist/index.js verify <package> --mode self-hosted-runtime --strict`.
   If `feishu_context.reply.local.json` exists, this strict dry run also fails when the owner reply is invalid, contains blockers, has blocked/unknown/missing permission confirmations, has negative answers, or omits `secure_secret_channel`.
6. If you do not already have a Feishu SDK host, use the optional standalone reference runtime: run `node dist/index.js configure generated\image-agent-web-lark --strict` to validate the context and write `bot-runtime/.env`. Blank context fields preserve existing non-empty `.env` values; strict mode fails if required Level 2 values are still missing.
   If `feishu_context.local.json` leaves public fields blank, non-secret owner reply values may fill `TEST_CHAT_ID`, `PUBLIC_CALLBACK_BASE_URL`, and `IMAGE_AGENT_BASE_URL`; `configure_report.*` marks those rows as `context_reply` and prints only field names.
   Placeholder-shaped values such as `<APP_ID>`, `{{VERIFICATION_TOKEN}}`, or `${TEST_CHAT_ID}` are treated as missing, so replace them completely before real Level 2 verification.
   Generated `feishu_context.template.json` is intended to stay secret-free; filled values belong in `feishu_context.local.json` or `.env`. If the owner reply includes internal contacts, blocked-by notes, or handoff comments, use `init-local --reply` or copy `feishu_context.reply.template.json/md` to `feishu_context.reply.local.json/md` first.
   If `status` or `readiness` still reports `external_context_missing`, send the package-local `feishu_context.request.md` to the owner listed in the file before changing runtime settings.
   If `feishu_context.reply.local.json` exists, `status`, `readiness`, and `doctor` summarize only answer counts, blocked counts, permission status counts, and filled field names; they do not print owner reply values.
7. If using the optional standalone runtime, start it after configuration.
8. If Feishu credentials are not ready yet and you are using the optional standalone runtime, call `/debug/simulate-generate` to test target-service integration locally.
   Call `/debug/simulate-card-action` to test the same action parsing, form-value merge, and audit path used by a real Feishu card click.
   You can also run `node dist/index.js verify generated\image-agent-web-lark --runtime-url http://127.0.0.1:3978 --simulate`.
   The same verify command checks the `/webhook/card` URL verification response, simulated card-action path, Feishu 2.0-shaped card-action path, and invalid-input failure card locally.
   The real webhook path also keeps a short in-memory duplicate-action window to avoid double-calling the target service on repeated delivery or rapid double-clicks.
   If `/health` returns `feishuConfigured: false`, continue local debug only; real Feishu verification still needs the listed missing keys.
   Before exposing the runtime through a public callback URL, set `DEBUG_ACCESS_TOKEN`; `verify` and `evidence --runtime-url` will use it automatically, and manual `/debug/*` calls must include it as `Authorization: Bearer <token>` or `x-lark-deployer-debug-token`.
   `GET /debug/audit-tail?limit=100` returns recent audit events for evidence collection when the runtime is on another machine.
9. Configure Feishu card callback URL as `<PUBLIC_CALLBACK_BASE_URL>/webhook/card` for webhook/standalone modes. For `embedded-long-connection`, keep the sidecar/gateway online, subscribe to `card.action.trigger`, and route events into `adapter/handlers.ts` without modifying `image-agent-web` FastAPI routes. For `self-hosted-runtime`, run `feishu-host/app.py` after local contract/selfcheck passes; it owns the `lark-oapi` WebSocket long connection and calls `image-agent-web` through `IMAGE_AGENT_BASE_URL`.
10. After credentials, scopes, callback URL, and test chat are ready, run `node dist/index.js verify generated\image-agent-web-lark --runtime-url http://127.0.0.1:3978 --level2`.
   Real Feishu Level 2 should not use `--allow-local-callback`; that flag is only for automated local mock verification.
   This also posts a URL verification challenge to `<PUBLIC_CALLBACK_BASE_URL>/webhook/card`; if that check fails, fix the tunnel, reverse proxy, or callback path before continuing.
   When `VERIFICATION_TOKEN` is set, the command also posts signed card-action payloads through `/webhook/card`; signed-action failures usually mean token mismatch, body/header rewriting, or target execution failure.
   If `ENCRYPT_KEY` is set, the same command also posts encrypted URL verification payloads; encrypted failures usually mean the runtime `.env` key and Feishu callback encryption key do not match.
   If `/debug/start-card` fails with a Feishu `code`, fix bot permission, app availability, receive id, or chat membership before continuing.
11. Run `node dist/index.js evidence generated\image-agent-web-lark --runtime-url http://127.0.0.1:3978 --update-record` to generate `level2_evidence_draft.md` from the verification report and local or remote runtime audit events, and to copy machine-supported artifact fields into blank lines in `level2_verification_record.md`.
    After capturing real Feishu evidence, rerun the same command with manual fields such as `--start-message-id`, `--result-message-id`, `--result-screenshot`, `--generated-image-url`, `--batch-id`, `--batch-status-message-id`, `--batch-status-screenshot`, `--batch-download-url`, `--batch-download-screenshot`, `--trace-id`, `--operator`, `--feishu-app-name`, and `--test-chat` to fill blank record lines.
    For repeated handoff, run `node dist/index.js init-local generated\image-agent-web-lark --manual-evidence` to create ignored `level2_manual_evidence.local.json`, fill it, then import it with `--manual-evidence level2_manual_evidence.local.json --update-record`.
    `status --json` and `readiness` report whether this local manual evidence file exists, whether it parses, which field names are filled, which have already been imported into `level2_verification_record.md`, and which remain pending, but do not print the evidence values.
    Treat it as a draft/update helper only: final operator confirmation and completion checkboxes still belong to the human verifier.
    The evidence draft summarizes recent audit details and redacts submitted field values, operator ids, chat ids, and raw manual evidence values from the shared Markdown output. The real values are written only into `level2_verification_record.md` when `--update-record` is used.
12. Click the generated Feishu card buttons: submit the single-image form, submit feedback iteration, submit a batch job, then refresh the batch progress card.
13. Capture the result card screenshot or message ID, generated image URL or Feishu image key, batch ID, batch status card screenshot or message ID, and batch download URL or screenshot as verification evidence.
14. Keep `verification_report.md` with the handoff notes.
   Failed runtime checks include response-body detail when available; read that before changing permissions or callback settings.
15. Fill `generated\image-agent-web-lark\level2_verification_record.md` when the real Feishu test is complete. Use `docs/level-2-verification-record.md` only as the generic template.
    If the package is regenerated after this record contains checked items, message IDs, screenshot notes, or artifact paths, Lark-deployer preserves the filled record and writes a fresh blank copy to `level2_verification_record.template.md`.
16. Run `node dist/index.js doctor generated\image-agent-web-lark --out generated\image-agent-web-lark\doctor_report.json --probe-target --gate` as the final MVP gate. It exits non-zero until target-service preflight, live `GET <target_base_url>/api/meta`, Level 2 verification, manual Feishu result evidence, remaining-issue confirmation, and final FDE handoff approval are all present. The matching `doctor_report.md` is safe to include in handoff notes because it reports field names and blockers, not secret or local evidence values.
17. Use `node dist/index.js handoff generated\image-agent-web-lark --copy-to <empty-dir>` for transfer. The sanitized copy excludes local secret files and local configure reports, refuses to copy text files that contain known local secret values, and redacts legacy manual-evidence rows in `level2_evidence_draft.md`.
    The copy step refreshes safe package-path fields in `feishu_context.*`, `verification_report.*`, `level2_evidence_draft.md`, `handoff_status.md`, `handoff_manifest.json/.md`, `doctor_report.json/.md`, and `level2_verification_record.md` inside the copied package so the reports point to the copied package path.
    Then run `node dist/index.js handoff <copied-dir> --check` on the copied package. The check fails if recommended files are missing, excluded local paths are present, shared configure guidance is missing `--dry-run`, shared local-intake guidance is missing `init-local`, permission confirmation summaries are missing, stale package path references remain, common secret literal patterns appear in copied text files, shared docs still contain non-strict `configure` commands, or shared Level 2 drafts still contain unredacted manual evidence rows.
