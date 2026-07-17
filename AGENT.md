# Code2Lark (Lark-deployer)

Code2Lark is a build-time generator. It analyzes an existing service and produces reviewable Feishu/Lark adapter packages. It builds and verifies integration artifacts; it does not own the target service lifecycle.

## Architecture

```text
analyze -> plan -> context -> generate -> verify -> doctor -> handoff
                                      \-> install (Mode B only)
```

The CLI currently exposes 13 commands through `src/index.ts`:

- `analyze`, `plan`, `generate`, `context`
- `configure`, `status`, `readiness`, `doctor`
- `evidence`, `handoff`, `init-local`, `install`, `verify`

The project uses TypeScript strict mode, ES2022/NodeNext, and Node.js 24.16 or newer.

## Delivery Modes

- `embedded-adapter`: generated adapter for an existing Feishu SDK host.
- `self-hosted-runtime`: generated Python `feishu-host/` using the Feishu SDK long connection.
- `standalone-runtime`: optional reference Node.js host.

Host receive modes are `embedded-long-connection`, `embedded-webhook`, `hybrid`, and `standalone-runtime`. Long connection uses `card.action.trigger`.

- Mode A keeps the Feishu host outside the target project.
- Mode B installs an isolated host module under the target project, currently `integrations/lark/`.

## Structural Analysis Backends

`analyze` accepts `--backend auto|internal|codegraph`.

- `internal`: use the built-in source scan.
- `auto`: try codegraph, then safely fall back to internal when codegraph is unavailable, uninitialized, stale, incomplete, or invalid.
- `codegraph`: require a user-maintained fresh index and fail clearly instead of silently falling back.

Only these read-only codegraph commands are allowed:

```text
codegraph status <repo> --json
codegraph query route --kind route --path <repo> --json
```

Code2Lark must never install codegraph or run codegraph `init`, `sync`, reindex, or index-rebuild operations. External results are normalized at the boundary; profile and downstream code must not depend on the external schema.

## Interaction Profiles

Target-specific mapping lives in `src/profiles/`:

| Profile | Source | Role |
| --- | --- | --- |
| `image-agent-web` | `src/profiles/image-agent-web.ts` | Stable sample baseline |
| `calendar-stock-updater` | `src/profiles/calendar-stock-updater.ts` | Typed calendar task cards and handlers |
| `generic-http-api` | analyzer/generator fallback | Coarse generic HTTP mapping |

Profiles own detection, capability mapping, Card JSON 2.0 builders, handlers, validation, and profile-specific strict checks. `handleCardAction` is the calendar adapter facade.

Generated adapter TypeScript must pass `tsc --noEmit --strict`. Do not emit or add `@ts-nocheck`, `@ts-ignore`, `@ts-expect-error`, or `any` to bypass type errors.

## Calendar Mode B Contract

The current calendar correction contract is strict:

- Schema remains `0.2`.
- The only target calls are `GET /api/state`, `POST /api/run`, and `POST /api/stop`.
- Run/stop prepare, confirm, and cancel are host-local card actions, not target HTTP endpoints.
- The browser-only `/api/events` stream is supporting context, not a card action endpoint.
- `generate` never writes the target project.
- `install` defaults to dry-run and must write nothing.
- `install --apply` may write only `integrations/lark/**`.
- Do not modify target root `package.json`, startup scripts, Docker files, business code, or Web UI.
- Treat the original target as read-only. Use a disposable replay/copy for installation verification.
- The install gate probes `GET /api/state`, validates source hashes and managed-file conflicts, and rejects symlink/junction paths before writes.
- The installed module owns its `.env`, dependencies, tests, startup, confirmation state, idempotency, authorization, and audit output.

The generated package remains the source of truth. Do not replace generated directories manually; use the `install` command.

```powershell
node dist/index.js generate <analysis-workspace> --out <generated-package> --mode embedded-adapter --host-mode embedded-long-connection
node dist/index.js verify <generated-package> --mode embedded-adapter --host-mode embedded-long-connection --strict
node dist/index.js install <generated-package> --target <calendar-replay> --target-base-url http://127.0.0.1:3069
node dist/index.js install <generated-package> --target <calendar-replay> --target-base-url http://127.0.0.1:3069 --apply
```

After apply, run `npm install`, `npm test`, and `npm start` inside `<calendar-replay>/integrations/lark`. Run the calendar target service separately.

## Generated Package

```text
generated/<target>-lark/
  manifest/
  adapter/
  docs/
  integrations/lark/       # calendar Mode B installable closure
  sidecar-long-connection/ # host contract/local check when applicable
  bot-runtime/              # optional standalone mode only
  feishu-host/              # optional self-hosted mode only
```

Card payloads use JSON 2.0 (`schema: "2.0"`, `body.elements`, callback behaviors). Manifest schema `0.2` is mandatory. Infrastructure credentials belong in local `.env` files; business parameters belong in cards.

## Governing Documents

- `docs/codegraph-structural-backend-correction-task-book.md`: structural backend and final replay contract.
- `docs/calendar-stock-updater-mode-b-correction-task-book.md`: current calendar Mode B correction contract.
- `docs/capability-validation-matrix.md`: validation fact matrix.
- `docs/project-status.md`: current project status and evidence summary.
- `docs/calendar-stock-updater-mode-b-long-connection-task-book.md`: superseded historical plan; do not use it as the active contract.

When documents conflict, follow the two current correction taskbooks above.

## Build And Test

```powershell
npm run build
npm run test:unit
npm run test:smoke
npm run test:mode-b
npm run test:e2e
npm test
```

For changed files, run LSP diagnostics, focused tests, then the full suite. Strict verify, handoff check, module tests, dependency audits, managed-file hashes, root-integrity hashes, and negative install gates are required before closure.

## Real Feishu Boundary

Local generation, strict verification, replay installation, and module tests do not complete real Feishu Level 2. Level 2 remains incomplete until valid `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `TEST_CHAT_ID`, and `ALLOWED_OPERATOR_OPEN_IDS` are supplied through a secure channel; the long connection is online; real cards are sent and clicked; and sanitized message IDs, screenshots, logs, trace IDs, and verifier sign-off are recorded in `level2_verification_record.md`.
