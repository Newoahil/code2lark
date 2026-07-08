# Code2Lark

Code2Lark (current CLI/package name: `lark-deployer`) is a build-time generator for turning an existing service interaction flow into a Lark/Feishu adapter package.

It does not own the target service lifecycle. It analyzes a target service, generates reviewable contracts, produces an embeddable `adapter/` as the core artifact, keeps `bot-runtime/` as an optional standalone reference host, can generate a Python `feishu-host/` self-hosted long-connection runtime, and provides verification checks for FDE-style handoff.

## MVP Scope

MVP-1A targets one real integration:

- Target: `C:\works\image-agent-web`
- Capabilities: `POST /api/generate`, `POST /api/iterate`, and `/api/batch` progress/download
- Runtime mode: external target service, with `embedded-adapter`, `standalone-runtime`, or `self-hosted-runtime` artifacts
- Done level: local MVP proof is automated; real Feishu development app verification remains manual Level 2 evidence

The generated `adapter/` maps Feishu card actions to `image-agent-web`, builds target-service requests, and returns card payloads plus audit events for a host service to persist. The generated `bot-runtime/` remains available as a standalone reference host: it receives Feishu card actions, calls `image-agent-web`, uploads the generated or iterated image when possible, and updates the card with success or failure. The generated `self-hosted-runtime` emits `feishu-host/`, a Python `lark-oapi` WebSocket long-connection host that subscribes to `card.action.trigger` and calls `image-agent-web` over HTTP without importing or modifying the target service. The start card includes a Feishu form built from discovered template fields plus `size` and optional `message`, so the operator can override parameters before submitting. It also includes a batch form that submits items JSON to `/api/batch`, returns a progress card, supports manual refresh through `/api/batch/{batch_id}/status`, and shows a `/api/batch/{batch_id}/download` link when completed images exist.

For slow target services, the generated runtime can set `CARD_ACTION_MODE=async`: it returns a running card immediately, then patches the original Feishu message with the final success or failure card after the target service completes.

When `image-agent-web` is not running during analysis, the MVP analyzer still reads `templates.py` as a static fallback for template ids, allowed sizes, and template fields. The generated test card preset is built from that template metadata instead of a fixed payload. Runtime execution still requires the target service to be reachable.

## Install

```powershell
npm install
npm run build
npm test
```

## Commands

```powershell
node dist/index.js analyze C:\works\image-agent-web --base-url http://127.0.0.1:8000 --out out\image-agent-web
node dist/index.js plan out\image-agent-web
node dist/index.js context out\image-agent-web
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark-embedded --mode embedded-adapter
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark-long --mode embedded-adapter --host-mode embedded-long-connection
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark-self-hosted --mode self-hosted-runtime
node dist/index.js configure generated\image-agent-web-lark --strict --dry-run
node dist/index.js configure generated\image-agent-web-lark --strict
node dist/index.js status generated\image-agent-web-lark
node dist/index.js readiness generated\image-agent-web-lark
node dist/index.js doctor generated\image-agent-web-lark
node dist/index.js verify generated\image-agent-web-lark
node dist/index.js verify generated\image-agent-web-lark --mode embedded-adapter --strict
node dist/index.js verify generated\image-agent-web-lark-self-hosted --mode self-hosted-runtime --strict
node dist/index.js evidence generated\image-agent-web-lark
node dist/index.js handoff generated\image-agent-web-lark
```

After generation:

For an existing Feishu SDK service, start with `generated\image-agent-web-lark\adapter\` and `generated\image-agent-web-lark\docs\integration_guide.md`. Package validation for that embedded path is:

```powershell
node dist/index.js verify generated\image-agent-web-lark --mode embedded-adapter --strict
node dist/index.js doctor generated\image-agent-web-lark --mode embedded-adapter
```

`--mode` describes the generated artifact shape. `--host-mode` describes how Feishu reaches the host: `embedded-webhook` is the default for embedded packages, while `embedded-long-connection` is for a sidecar/gateway or existing SDK host that subscribes to `card.action.trigger` and calls `adapter/handlers.ts`. For `image-agent-web`, prefer this sidecar route before embedding Feishu SDK code into the FastAPI service itself.

For the Python self-hosted long-connection runtime:

```powershell
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark-self-hosted --mode self-hosted-runtime
cd generated\image-agent-web-lark-self-hosted\feishu-host
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe local_contract_test.py
.\.venv\Scripts\python.exe app.py --selfcheck
cd ..
node ..\..\dist\index.js verify . --mode self-hosted-runtime --strict
```

`self-hosted-runtime` defaults to `host_receive_mode=embedded-long-connection`. Its automated MVP proof is local: generated specs, Python compilation, `local_contract_test.py`, and `app.py --selfcheck`. It does not require `PUBLIC_CALLBACK_BASE_URL`, `/webhook/card`, or `VERIFICATION_TOKEN` unless the operator adds a webhook fallback. Real Feishu Level 2 for this mode means configuring the Feishu app for long connection, subscribing to `card.action.trigger`, running `feishu-host/app.py`, sending the start card, clicking it in Feishu, and recording evidence with `docs/self-hosted-runtime-level2-runbook.md` plus the package-local `level2_verification_record.md`.

For the optional standalone reference host:

```powershell
cd generated\image-agent-web-lark\bot-runtime
Copy-Item .env.example .env
npm install
npm run build
npm start
```

Send the first test card after the runtime is running and `APP_ID`, `APP_SECRET`, and `TEST_CHAT_ID` are filled:

```powershell
Invoke-WebRequest -Method POST http://127.0.0.1:3978/debug/start-card
```

`/debug/start-card` writes `start_card_sent` or `start_card_failed` to `bot-runtime/audit.log`, letting `evidence` recover the start-card message id and trace id when available.

Before Feishu credentials are ready, run a local target-service simulation:

```powershell
Invoke-WebRequest -Method POST http://127.0.0.1:3978/debug/simulate-generate
Invoke-WebRequest -Method POST http://127.0.0.1:3978/debug/simulate-card-action
Invoke-WebRequest -Method POST http://127.0.0.1:3978/debug/simulate-card-action -Body '{"action":"image.batch.submit"}' -ContentType 'application/json'
```

These checks cover the direct target-service call, the Feishu-card action path, batch submit/refresh, Feishu 2.0-shaped card-action payloads, and invalid-input failure-card behavior without sending a Feishu message. When `/health` is available, `verify` also compares the running runtime's reported target URL, card action mode, callback URL, image-upload/debug flags, and Feishu config readiness against the env/context values, catching stale runtime processes after `.env` changes.
If `DEBUG_ACCESS_TOKEN` is set, `/debug/*` endpoints require `Authorization: Bearer <token>` or `x-lark-deployer-debug-token: <token>`, and `verify` reads the token from `.env` automatically. Set this token before exposing the runtime behind a public callback URL.
The runtime also keeps a short in-memory duplicate-action window for real card callbacks, so repeated delivery or rapid double-clicks of the same message/operator/action/form payload do not call the target service twice. This is a retry/double-click guard, not durable cross-process job storage.

When the generated runtime is running, include runtime health and simulation in verification:

```powershell
node dist/index.js verify generated\image-agent-web-lark --runtime-url http://127.0.0.1:3978 --simulate
```

With `--runtime-url`, `verify` also posts a local `url_verification` payload to `/webhook/card`. With `--simulate`, it submits normal card-action, Feishu 2.0-shaped card-action, invalid card-action, and signed webhook card-action payloads. This confirms the runtime can answer Feishu callback URL challenge requests, parse likely real callback shapes, validate signed webhook callbacks when `VERIFICATION_TOKEN` is present, and reject bad form input before the real developer-console setup.

Use `evidence` after local or Level 2 verification to generate a non-destructive evidence draft:

```powershell
node dist/index.js evidence generated\image-agent-web-lark
```

It writes `level2_evidence_draft.md` from `verification_report.json` and `bot-runtime/audit.log`. The draft never prints secret values or raw manual evidence values and does not mark the real Feishu click as complete; it separates machine-supported evidence from manual chat observations and screenshots that still belong in `level2_verification_record.md`. When available, it extracts the start-card message id, generated image URL or image key, and recent trace ids for easier record filling.

After the operator captures real Feishu evidence, pass the manual fields through `evidence --update-record` to fill blank record lines without checking completion boxes:

```powershell
node dist/index.js evidence generated\image-agent-web-lark --runtime-url http://127.0.0.1:3978 --update-record --start-message-id <message-id> --result-message-id <message-id> --result-screenshot <path-or-url> --generated-image-url <url> --batch-id <batch-id> --batch-status-message-id <message-id> --batch-status-screenshot <path-or-url> --batch-download-url <url> --batch-download-screenshot <path-or-url> --trace-id <trace-id> --operator <name> --test-chat <chat-name>
```

For FDE handoff, initialize `level2_manual_evidence.local.json`, fill the observed Feishu fields there, then import the local file:

```powershell
node dist/index.js init-local generated\image-agent-web-lark --manual-evidence
node dist/index.js evidence generated\image-agent-web-lark --runtime-url http://127.0.0.1:3978 --manual-evidence generated\image-agent-web-lark\level2_manual_evidence.local.json --update-record
```

Regenerating a package will not overwrite `level2_verification_record.md` after it contains manual evidence such as checked items, message IDs, screenshot notes, or artifact paths. In that case, `generate` preserves the filled record and writes the fresh blank template to `level2_verification_record.template.md`.

When Feishu credentials are filled and the bot has been added to the test chat, use Level 2 mode to make the verification stricter and send the first card:

```powershell
node dist/index.js verify generated\image-agent-web-lark --runtime-url http://127.0.0.1:3978 --level2
```

`--level2` implies `--simulate`, `--send-start-card`, and `--strict`. In standalone-runtime and embedded-webhook modes it probes `<PUBLIC_CALLBACK_BASE_URL>/webhook/card` with Feishu-style URL verification and signed card-action payloads before asking the operator to click the card. In embedded-long-connection mode, the host/gateway must instead provide Feishu SDK long-connection evidence for `card.action.trigger`. The final human step is still clicking the card in Feishu and recording the result in the generated package's `level2_verification_record.md`, for example `generated/image-agent-web-lark/level2_verification_record.md`.

Webhook and standalone Level 2 expect `PUBLIC_CALLBACK_BASE_URL` to be a public HTTPS URL. `--allow-local-callback` exists only for automated local mock verification and should not be used as real Feishu evidence.

`--strict` exits non-zero on any WARN or FAIL check, which makes it suitable for handoff gates and real Level 2 preflight.

## Required External Context

Before real Feishu verification, the operator must provide:

- Running `image-agent-web` base URL reachable from the selected host/runtime.
- Feishu custom app `APP_ID` and `APP_SECRET`.
- Card callback `VERIFICATION_TOKEN` and optional `ENCRYPT_KEY` for webhook or standalone-runtime host modes; these are optional for embedded-long-connection and self-hosted-runtime unless webhook fallback is enabled.
- Test chat ID where the bot can send messages.
- Feishu permissions plus callback or long-connection event configuration described in `permission_review.md` and the generated package docs.

Runtime configuration is split by use:

- Callback verification: `VERIFICATION_TOKEN`, plus `ENCRYPT_KEY` if encrypted callbacks are enabled; long-connection and self-hosted-runtime hosts use app credentials and `card.action.trigger` subscription evidence instead.
- Sending the first test card: `APP_ID`, `APP_SECRET`, and `TEST_CHAT_ID`.
- Uploading result images to Feishu: `APP_ID` and `APP_SECRET`.
- Full Level 2 verification: all mode-specific Feishu setup plus a reachable target service; webhook and standalone modes also require `PUBLIC_CALLBACK_BASE_URL`.

Use the context command to create a handoff template:

```powershell
node dist/index.js context out\image-agent-web
```

It writes `feishu_context.template.json`, `feishu_context.template.md`, `feishu_context.request.md`, and `feishu_context.reply.template.json/md`. The request file is the shortest owner-facing note: send it to the Feishu app owner or FDE to confirm who can provide the app context, grant scopes, configure either the webhook callback or long-connection `card.action.trigger` subscription, add the bot to a test chat, and expose the required host path for the selected host mode. The reply template is a safe non-secret intake form for the owner's answer; run `init-local --reply` or copy it to `feishu_context.reply.local.json`/`.md` before adding internal contact, handoff, or blocked-by notes.

The JSON template also contains `runtime_config`. Use it for handoff-time settings such as `CARD_ACTION_MODE`, `UPLOAD_IMAGE_TO_LARK`, `HOST`, `PORT`, `FEISHU_OPENAPI_BASE_URL`, `DEBUG_ACCESS_TOKEN`, `ALLOWED_OPERATOR_OPEN_IDS`, and `ALLOW_DEBUG_WITHOUT_FEISHU`; `configure` writes those values into `bot-runtime/.env`.
When `PUBLIC_CALLBACK_BASE_URL` is set, debug endpoints are enabled, and no `DEBUG_ACCESS_TOKEN` is provided or preserved, `configure` generates a random token and writes it to `.env` without printing the value.
`target_timeout_seconds` maps to `IMAGE_AGENT_TIMEOUT_MS` and keeps slow or stuck target calls from holding the card callback forever.
`ALLOWED_OPERATOR_OPEN_IDS` is an optional runtime authorization guard: when set, only listed Feishu operator `open_id` values can execute card actions.
`configure` validates these runtime values and fails early on invalid modes, ports, or boolean flags. It also writes a safe `configure_report.json` and `configure_report.md` that show whether each key came from context, an existing `.env`, a generated value, or a default without printing secret values. Use `configure --strict --dry-run` to validate a filled context and write only the local report before touching `.env`; use `configure --strict` after the Feishu context arrives when missing required Level 2 values should fail the command and the runtime env should be written.
If `feishu_context.reply.local.json` exists, `configure --strict --dry-run` also fails on invalid owner reply JSON, blocked owner answers, blocked/unknown/missing permission confirmations, or a missing `secure_secret_channel`; `configure_report.*` shows only counts and field names from that reply.
When `feishu_context.local.json` leaves public fields blank, `configure` may use non-secret owner reply values for `TEST_CHAT_ID`, `PUBLIC_CALLBACK_BASE_URL`, and `IMAGE_AGENT_BASE_URL`; the report marks those rows as `context_reply` and still prints only field names, not values.
When a context field is blank, `configure` preserves an existing non-empty value from `bot-runtime/.env` instead of clearing it.
For real secrets, run `node dist/index.js init-local generated\image-agent-web-lark --context --reply` or copy `feishu_context.template.json` to `feishu_context.local.json` manually, then fill the local file. `configure` prefers `feishu_context.local.json` when it exists, and generated package `.gitignore` excludes it along with `feishu_context.reply.local.*`. If `generate` receives a filled source context, it keeps the generated template secret-free and writes the filled values to `feishu_context.local.json`.

Use `status` for a quick one-screen summary before deciding the next handoff action:

```powershell
node dist/index.js status generated\image-agent-web-lark
```

It reads the same inputs as `readiness`, but does not write files. When external context is missing, it prints the package-local `feishu_context.request.md` path so the operator knows which owner-facing request to send first. It also promotes target-service preflight failures, such as `GET /api/meta` not passing, into explicit blockers because Lark-deployer does not start the target service. `--json` reports the ignored `feishu_context.reply.local.json` intake state by counts and field names only, plus whether `level2_manual_evidence.template.json` exists, whether ignored `level2_manual_evidence.local.json` has filled fields, which field names are still pending import into `level2_verification_record.md`, and the import command, without printing the actual reply or evidence values. Use `--json` when another script needs the state.

Use `readiness` when handing the generated package to another operator or FDE:

```powershell
node dist/index.js readiness generated\image-agent-web-lark
```

It writes `handoff_status.md` without probing the network or overwriting `verification_report.md`. The status file reports which external values are present or missing, points to `feishu_context.request.md`, summarizes the non-secret owner reply intake, summarizes the manual evidence helper files, reports invalid local JSON parse errors, separates imported and pending manual evidence field names, summarizes required Feishu scopes/callbacks, includes the latest verification counts, and suggests the next command. If the latest verification says `target:/api/meta` is not passing, next actions explicitly tell the FDE to start or expose the externally managed target service, include generated start hints when available, and include the verify command to rerun. Secret, owner reply, and evidence values are never printed, only their presence, counts, field names, and source.

Use `doctor` when you want a human-readable MVP gate explanation:

```powershell
node dist/index.js doctor generated\image-agent-web-lark
node dist/index.js doctor generated\image-agent-web-lark --out generated\image-agent-web-lark\doctor_report.json
node dist/index.js doctor generated\image-agent-web-lark --gate
node dist/index.js doctor generated\image-agent-web-lark --probe-target --gate
```

It reads the same readiness evidence, prints why the package is not yet `handoff_ready`, and exits non-zero with `--gate` until real Level 2 verification, manual Feishu evidence, remaining-issue confirmation, and final FDE handoff approval are all present. By default, doctor only reads `verification_report.json`; add `--probe-target` to perform a live `GET <target_base_url>/api/meta` inside the doctor report without rewriting `verification_report.json`. With `--out`, it writes `doctor_report.json` plus a matching `doctor_report.md`; both are safe to include in a sanitized handoff because secret and local evidence values are not printed.

Package-root commands use the relative CLI path generated for the current repository layout. If a generated package is copied elsewhere, set `LARK_DEPLOYER_CLI` to the absolute path of the built CLI, then run commands such as `node $env:LARK_DEPLOYER_CLI readiness .` from the moved package root.

Use `handoff` to generate transfer guidance before copying a package:

```powershell
node dist/index.js handoff generated\image-agent-web-lark
```

It writes `handoff_manifest.json` and `handoff_manifest.md`, listing recommended files, optional evidence, and excluded local paths such as `.env`, `feishu_context.local.json`, `configure_report.*`, `node_modules`, `dist`, and audit/log files.
To create a sanitized copy for transfer, add `--copy-to <empty-dir>`. The target directory must be empty; Lark-deployer will not overwrite an existing package. The copy step scans files for known local secret values from `.env` and local context, refuses the copy if a secret appears in a copied report or template, and redacts legacy manual-evidence rows in `level2_evidence_draft.md`. It also refreshes safe package-path fields in `feishu_context.*`, `verification_report.*`, `level2_evidence_draft.md`, `handoff_status.md`, `handoff_manifest.json/.md`, `doctor_report.json/.md`, and `level2_verification_record.md` inside the copied package so those reports point to the copied path.
Use `--check` on a sanitized transfer directory to fail fast if recommended files are missing, excluded local paths are present, shared configure guidance is missing `--dry-run`, shared local-intake guidance is missing `init-local`, permission confirmation summaries are missing, stale package path references remain, common secret literal patterns appear in copied text files, shared docs still contain non-strict `configure` commands, or shared Level 2 drafts still contain unredacted manual evidence rows.

```powershell
node dist/index.js handoff generated\image-agent-web-lark --copy-to out\handoff\image-agent-web-lark
node dist/index.js handoff out\handoff\image-agent-web-lark --check
```

After the operator fills the JSON template, apply it to the generated runtime:

```powershell
node dist/index.js configure generated\image-agent-web-lark --context generated\image-agent-web-lark\feishu_context.template.json --strict --dry-run
node dist/index.js configure generated\image-agent-web-lark --context generated\image-agent-web-lark\feishu_context.template.json --strict
```

## Generated Output

```text
generated/image-agent-web-lark/
  START_HERE.md
  README.md
  permission_review.md
  deployment_checklist.md
  card_plan.md
  context_readiness.md
    feishu_context.request.md
    feishu_context.reply.template.json
    feishu_context.reply.template.md
  handoff_status.md          # written by `readiness`
  handoff_manifest.md        # written by `handoff`
  level2_evidence_draft.md   # written by `evidence`
  level2_verification_record.md
  level2_manual_evidence.template.json
  manifest/
    service_manifest.json
    capability_map.json
    interaction_contract.json
    required_permissions.json
  adapter/
    handlers.ts
    cards.ts
    service-client.ts
    validation.ts
    types.ts
    audit-events.ts
  docs/
    integration_guide.md
  bot-runtime/
    src/
    package.json
    .env.example

generated/image-agent-web-lark-self-hosted/
  START_HERE.md
  README.md
  docs/
    integration_guide.md
  feishu-host/
    .env.example
    requirements.txt
    config.py
    cards.py
    service_client.py
    validation.py
    handlers.py
    app.py
    local_contract_test.py
    README.md
    spec/
      start_card.json
      field_map.json
      endpoints.json
      preset.json
      template_specs.json
      field_specs.json
```

## Boundary

Lark-deployer builds integration packages. It may check target service availability, but it does not start, stop, restart, supervise, or deploy the target service.

## Verification Reports

`verify` writes these files into the checked package/workspace:

```text
verification_report.json
verification_report.md
```

Warnings for missing Feishu credentials, missing `.env`, unavailable target service, or unchecked runtime health are expected until the external context is provided. `verification_report.md` includes a `Next Steps` section for the operator.

For final `self-hosted-runtime` MVP proof, missing Python dependencies are not an acceptable green state. Install `feishu-host/requirements.txt` and run strict verify so the report includes passing Python contract and `app.py --selfcheck` checks.

Runtime check failures include a short response-body summary when available. For example, a failed `/debug/start-card` check should show the missing Feishu send config or non-zero Feishu OpenAPI `code` directly in the report detail.

## Current MVP Evidence

The automated test suite now covers both levels that can be proven without real Feishu credentials:

- CLI smoke path: analyze -> plan -> context -> generate -> configure -> verify.
- Embedded adapter package path: `generate` emits `adapter/` and `docs/integration_guide.md`; `verify --mode embedded-adapter --strict` validates the package without requiring `bot-runtime/.env` or runtime debug endpoints.
- Self-hosted runtime package path: `generate --mode self-hosted-runtime` emits `feishu-host/`, manifest-derived specs, Python handlers/client/card rendering, `local_contract_test.py`, and `app.py --selfcheck`; `verify --mode self-hosted-runtime --strict` validates the package without requiring webhook callback configuration.
- Local runtime e2e path: generate a runtime package, install/build it, start it, call `/debug/simulate-generate`, confirm the runtime calls an `image-agent-web`-compatible target and writes a passing simulation check.
- Runtime callback path: `/webhook/card` answers URL verification challenges before full credentials are available.
- Runtime public callback preflight path: `verify --level2` posts a URL verification challenge to `<PUBLIC_CALLBACK_BASE_URL>/webhook/card`, catching tunnel or reverse-proxy mistakes before the Feishu console is used.
- Runtime encrypted callback preflight path: when `ENCRYPT_KEY` is provided, `verify` posts encrypted URL verification payloads to both local and public callback URLs.
- Runtime signed webhook action path: when `VERIFICATION_TOKEN` is provided, `verify --simulate` posts a signed card action to `/webhook/card`, proving the SDK validation path reaches the same generation handler as the debug action.
- Runtime async update path: `CARD_ACTION_MODE=async` returns a running card immediately and then calls Feishu `message.patch` to update the original card when generation completes.
- Runtime card-action path: `/debug/simulate-card-action` uses the same action parsing, trace ID, form-value merge, and audit path as the real Feishu callback handler.
- Runtime callback compatibility path: `verify --simulate` also covers an official Feishu 2.0-shaped card-action payload with JSON-string callback value.
- Runtime validation path: `verify --simulate` also submits invalid card input and expects a red failure card, proving bad form values are rejected before the target service is called.
- Runtime batch path: `verify --simulate` submits `image.batch.submit`, extracts the returned `batchId`, then submits `image.batch.refresh` to prove the generated runtime can call `/api/batch`, `/api/batch/{batch_id}/status`, and render a progress/download card path.
- MVP gate path: `readiness` and `doctor --gate` require manual Feishu evidence for both the single-image result and the batch progress/download path before reporting `handoff_ready`.
- Runtime debug protection path: when `DEBUG_ACCESS_TOKEN` is set, `/debug/*` rejects unauthenticated requests and `verify --simulate` can still pass by sending the token from `.env`.
- Runtime send preflight path: `/debug/start-card` treats non-zero Feishu OpenAPI `code` responses as failures, so `--level2` does not pass when the bot lacks send permission or chat access.
- Runtime safety path: missing Feishu credentials cause non-challenge `/webhook/card` requests to return a clear 503 instead of accepting card callbacks, and unknown routes return 404.
- Runtime operator authorization path: when `ALLOWED_OPERATOR_OPEN_IDS` is set, unlisted card-click operators receive a red failure card and the target service is not called.
- Runtime duplicate-action path: repeated card callbacks for the same message/operator/action/form payload are detected in memory and do not call the target service twice.
- Runtime timeout path: slow target calls return a readable failure card instead of holding the callback indefinitely.
- Real target preflight: on 2026-07-01, `C:\works\image-agent-web` was temporarily started and `verify --runtime-url` passed actual `GET /api/meta`, generated runtime `/health`, local card URL challenge, target URL, card mode, image upload flag, and debug flag checks. Real `/api/generate` execution still requires the external image/model service.

Real Level 2 verification is still separate. It requires a Feishu development app, granted scopes, callback configuration, a public runtime URL, and a test chat.

For real Feishu Level 2 validation, use:

```text
generated/image-agent-web-lark/level2_verification_record.md
```

`docs/level-2-verification-record.md` is only the generic template. Each generated package owns its own filled evidence record.
