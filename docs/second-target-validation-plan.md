# Second Target Validation Plan

## Selected Target

- `calendar-stock-updater`
- Why: non-image, task/status oriented, and already represented by generic HTTP fixture coverage.

## Delivery Choice

- Default: Mode A
- Host shape: external host / sidecar / gateway consuming the generated adapter package.
- Rationale: validate the MVP integration package against a second target without forcing an embedded-host migration first.

## Minimum Validation Scope

- One query/read path: `GET /api/state` as `http.get.api.state`.
- One reviewed action path: `POST /api/run` as `http.post.api.run.submit`.
- One rejected destructive path: `POST /api/stop` remains excluded from generated card actions unless explicitly reviewed later.
- Strict package verification: `verify --mode embedded-adapter --strict`.
- Operator handoff checks: readiness, doctor, and handoff outputs must stay generic and avoid image-agent assumptions.

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

## Out Of Scope

- No new platform targets.
- No real Feishu deployment for this second target in the current phase.
- No Mode B migration unless the target owner explicitly requests an internal host module.
