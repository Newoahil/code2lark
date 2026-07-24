# Second Target Validation Plan

Status: historical Mode A baseline. The approved Mode B correction and current execution contract are in `docs/calendar-stock-updater-mode-b-correction-task-book.md`.

## Selected Target

- `calendar-stock-updater`
- Why: non-image, task/status oriented, and already represented by generic HTTP fixture coverage.

## Delivery Choice

- Default: Mode A
- Delivery mode: Mode A
- Integration mode: embedded-adapter
- Host receive mode: embedded-long-connection
- Host shape: external host / sidecar / gateway consuming the generated adapter package and receiving Feishu card actions through SDK long connection.
- Rationale: validate the MVP integration package against a second target without forcing an embedded-host migration first, while making long connection the formal Feishu ingress path for manual follow-up.

## Minimum Validation Scope

- One query/read path: `GET /api/state` as `http.get.api.state`.
- One reviewed action path: `POST /api/run` as `http.post.api.run.submit`.
- One rejected destructive path: `POST /api/stop` remains excluded from generated card actions unless explicitly reviewed later.
- Strict package verification: `verify --mode embedded-adapter --strict`.
- Operator handoff checks: readiness, doctor, and handoff outputs must stay generic and avoid image-agent assumptions.
- Formal Feishu handoff path: generated package must use `--mode embedded-adapter --host-mode embedded-long-connection`, require `card.action.trigger` routing to `handleGenericHttpCardAction()`, and avoid webhook callback prerequisites unless a future webhook fallback is explicitly requested.

## Evidence Location

- Automated evidence lives in `tests/cli-smoke.test.mjs` under `calendar-stock-updater Node target can analyze generate and verify`.
- Human-readable status is tracked in `docs/capability-validation-matrix.md`.

## Replay Evidence

- Replay copy: `C:\works\calendar-stock-updater-c2l-replay`.
- Generated package: `generated\calendar-stock-updater-lark`.
- Fresh analyze: `node dist/index.js analyze "C:\works\calendar-stock-updater-c2l-replay" --base-url http://127.0.0.1:3069 --out out\calendar-stock-updater-c2l-replay --name calendar-stock-updater`.
- Fresh generate: `node dist/index.js generate out\calendar-stock-updater-c2l-replay --out generated\calendar-stock-updater-lark --mode embedded-adapter`.
- Package gates: `verify --mode embedded-adapter --strict`, `doctor --mode embedded-adapter --json`, `readiness`, and `handoff --check` passed for the generated package.
- Target read validation: generated adapter action `http.get.api.state.submit` returned `READ_OK=true` against replay `GET /api/state`.
- Reviewed action validation: generated adapter action `http.post.api.run.submit` sent an intentionally invalid `dry-run` product range and returned a failure card (`ACTION_OK=false`, `HTTP action failed`), leaving the replay target not running (`stopRequested=false`).
- This proves replay package + safe target-path validation only; it is not real Feishu Level 2 evidence.

## Formal Long-Connection Handoff Target

- Replay copy: `C:\works\calendar-stock-updater-c2l-replay` remains the only analysis/generation source for this target.
- Long-connection analysis output: `out\calendar-stock-updater-c2l-replay-long`.
- Long-connection generated package: `generated\calendar-stock-updater-lark-long`.
- Fresh analyze: `node dist\index.js analyze "C:\works\calendar-stock-updater-c2l-replay" --base-url http://127.0.0.1:3069 --out out\calendar-stock-updater-c2l-replay-long --name calendar-stock-updater`.
- Fresh generate: `node dist\index.js generate out\calendar-stock-updater-c2l-replay-long --out generated\calendar-stock-updater-lark-long --mode embedded-adapter --host-mode embedded-long-connection`.
- Required package gates: `verify --mode embedded-adapter --host-mode embedded-long-connection --strict`, `doctor --mode embedded-adapter --host-mode embedded-long-connection --json`, `readiness`, and `handoff --copy-to handoff\calendar-stock-updater-lark-long --check`.
- Manual follow-up requirements: configure `APP_ID`, `APP_SECRET`, `TEST_CHAT_ID`, and `TARGET_BASE_URL` in the external host or sidecar; start Feishu SDK long connection; subscribe to `card.action.trigger`; route events to `handleGenericHttpCardAction()`; send the start card; click in the test chat; then fill sanitized Level 2 evidence.
- This package must not require `PUBLIC_CALLBACK_BASE_URL`, `/webhook/card`, `VERIFICATION_TOKEN`, or a public callback URL for the formal long-connection path.

## Out Of Scope

- No new platform targets.
- No real Feishu deployment for this second target in the current phase.
- No Mode B migration unless the target owner explicitly requests an internal host module.
- No webhook fallback unless explicitly requested later.
