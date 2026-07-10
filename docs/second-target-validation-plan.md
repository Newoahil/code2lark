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

## Out Of Scope

- No new platform targets.
- No real Feishu deployment for this second target in the current phase.
- No Mode B migration unless the target owner explicitly requests an internal host module.
