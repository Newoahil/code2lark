# image-agent-web Mode B Replay Evidence

This record tracks the Mode B replay experiment from `docs/image-agent-web-mode-b-replay-task-book.md`.

## Phase 1 - Replay Copy And Standalone Target Validation

Status: pass

Replay target:

```text
C:\works\image-agent-web-mode-b-replay
```

Source snapshot:

- Source copied from `C:\works\image-agent-web`.
- Destination did not exist before the copy.
- Excluded old runtime/cache/state directories: `.venv`, `__pycache__`, `outputs`, `uploads`.
- Recreated empty `outputs/` and `uploads/` in the replay target.
- Source target is not a git repository, so milestone evidence is committed in `C:\works\Lark-deployer`.

Replay target files after copy:

```text
.dockerignore
.gitignore
Dockerfile
agent.py
batch.py
main.py
requirements.txt
sessions.py
static/
templates.py
outputs/
uploads/
```

Standalone target setup:

```powershell
cd C:\works\image-agent-web-mode-b-replay
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 18080
```

API probe results from the replay process:

```text
REPLAY_TARGET_READY=True
GET /api/meta -> 200
META_TEMPLATES=3
META_REFERENCE_TYPES=3
POST /api/generate malformed fields_json -> 400
POST /api/generate valid product-image form -> PASS_SCHEMA
GENERATE_VALID_KEYS=analysis,generation_size,history,image_url,prompt_used,round,session_id,size,template_id
```

Teardown receipt:

```text
REPLAY_TARGET_STOPPED=true
REPLAY_TARGET_PORT_CLOSED=true
```

Phase 1 conclusion: the fresh replay copy can run as an independent `image-agent-web` target before any Feishu integration is added.

## Phase 2 - Fresh Self-Hosted Package Generation

Status: pass

Fresh generation command:

```powershell
cd C:\works\Lark-deployer
Remove-Item -LiteralPath generated\image-agent-web-lark -Recurse -Force
node dist/index.js generate out\image-agent-web --out generated\image-agent-web-lark --mode self-hosted-runtime
```

Generation result:

```text
Generated Lark integration package at C:\works\Lark-deployer\generated\image-agent-web-lark
Source-of-truth host module: generated\image-agent-web-lark\feishu-host
```

Strict verification command:

```powershell
node dist/index.js verify generated\image-agent-web-lark --mode self-hosted-runtime --strict
```

Verification result summary:

```text
self-hosted:summary:integration-mode -> PASS (self-hosted-runtime)
self-hosted:summary:host-receive-mode -> PASS (embedded-long-connection)
self-hosted:python:py_compile -> PASS
self-hosted:python:requests -> PASS
self-hosted:python:local-contract -> PASS (feishu-host contract: PASS)
self-hosted:python:lark-oapi -> PASS
self-hosted:python:selfcheck -> PASS (card.action.trigger registered; lark.ws.Client constructed without start())
```

Phase 2 conclusion: the current generator can freshly emit a strict-verifying `self-hosted-runtime` package for use as the Mode B embedding source of truth.

## Phase 3 - Embed Generated Host Module Into Replay Target

Status: pass

Embedding command:

```powershell
Copy-Item -LiteralPath C:\works\Lark-deployer\generated\image-agent-web-lark\feishu-host -Destination C:\works\image-agent-web-mode-b-replay\feishu_host -Recurse -Force
Remove-Item -LiteralPath C:\works\image-agent-web-mode-b-replay\feishu_host\__pycache__ -Recurse -Force
```

Embedded host module contents:

```text
feishu_host/
  .env.example
  README.md
  app.py
  cards.py
  config.py
  handlers.py
  local_contract_test.py
  requirements.txt
  service_client.py
  validation.py
  spec/
    endpoints.json
    field_map.json
    field_specs.json
    preset.json
    start_card.json
    template_specs.json
```

Secret/state check:

```text
feishu_host/.env -> absent
feishu_host/.env.example -> present
feishu_host/__pycache__ -> absent after cleanup
```

Replay core-file integrity check against `C:\works\image-agent-web`:

```text
main.py=MATCH
agent.py=MATCH
batch.py=MATCH
sessions.py=MATCH
templates.py=MATCH
requirements.txt=MATCH
```

Phase 3 conclusion: the generated host module was embedded as an isolated `feishu_host/` directory, with no deep changes to target business core files and no copied local secret file.

## Phase 4 - Replay-Local Host Module Validation

Status: pass

Host setup location:

```text
C:\works\image-agent-web-mode-b-replay\feishu_host
```

Setup commands:

```powershell
cd C:\works\image-agent-web-mode-b-replay\feishu_host
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Local `.env` shape:

```text
FEISHU_APP_ID -> present
FEISHU_APP_SECRET -> present
FEISHU_CONNECTION_MODE -> websocket
IMAGE_AGENT_BASE_URL -> http://127.0.0.1:18080
TEST_CHAT_ID -> present
FEISHU_ALLOWED_USERS -> empty
IMAGE_AGENT_TIMEOUT_MS -> 120000
```

Important setup finding: PowerShell 5.1 `Set-Content -Encoding UTF8` wrote a BOM that made the first `.env` key unreadable by the generated parser. The local replay `.env` was rewritten with ASCII encoding before validation. No generated host source or target business source was changed.

Config-loader proof from inside `feishu_host/`:

```text
{"feishu_allowed_user_count": 0, "feishu_app_id_present": true, "feishu_app_secret_present": true, "feishu_connection_mode": "websocket", "image_agent_base_url": "http://127.0.0.1:18080", "image_agent_timeout_ms": 120000, "test_chat_id_present": true}
```

Replay-local validation commands:

```powershell
.\.venv\Scripts\python.exe local_contract_test.py
.\.venv\Scripts\python.exe app.py --selfcheck
```

Replay-local validation output:

```text
feishu-host contract: PASS
selfcheck: card.action.trigger registered
selfcheck: lark.ws.Client constructed without start()
selfcheck: config {"feishu_allowed_user_count": 0, "feishu_app_id_present": true, "feishu_app_secret_present": true, "feishu_connection_mode": "websocket", "image_agent_base_url": "http://127.0.0.1:8000", "image_agent_timeout_ms": 120000, "test_chat_id_present": false}
selfcheck: start_card_elements=0
```

Note: `app.py --selfcheck` intentionally constructs SDK wiring with its internal dummy config and does not open a live Feishu socket. The separate config-loader proof above verifies the replay-local `.env` points at the replay target.

Phase 4 conclusion: the embedded `feishu_host/` module is locally self-contained inside the replay target: dependencies install in replay, config loads from replay-local `.env`, the contract test passes, and SDK wiring selfcheck passes without relying on `generated/...` at runtime.

## Phase 5 - Real Feishu Long-Connection Validation

Status: blocked

Required command sequence from inside the replay target:

```powershell
cd C:\works\image-agent-web-mode-b-replay\feishu_host
.\.venv\Scripts\python.exe app.py --send-start-card
.\.venv\Scripts\python.exe app.py
```

Required manual Feishu actions after the host is online:

```text
generate
iterate
batch
refresh
failure path
```

Blocker check performed before contacting Feishu:

```text
FEISHU_APP_ID=MISSING
FEISHU_APP_SECRET=MISSING
FEISHU_CONNECTION_MODE=MISSING
TEST_CHAT_ID=MISSING
FEISHU_ALLOWED_USERS=MISSING
```

No fake send was attempted with dummy credentials. The local replay `.env` currently contains dummy values used only for local config/selfcheck proof; replacing those with real Feishu app values is required before real Level 2 replay.

Phase 5 conclusion: real Feishu validation is blocked by missing app/test-chat secret context in this session. By the task book's completion definition, Mode B is not yet fully proven as a real replayed product capability; it is proven through fresh target copy, fresh generated host source, embedded host copy, and replay-local contract/selfcheck only.

## Final Applicable Gates

Status: pass for all gates not requiring real Feishu credentials

Commands run after Phase 5 blocker record:

```powershell
npm run build
node --test tests/*.test.mjs
node dist/index.js verify generated\image-agent-web-lark --mode self-hosted-runtime --strict
cd C:\works\image-agent-web-mode-b-replay\feishu_host
.\.venv\Scripts\python.exe local_contract_test.py
.\.venv\Scripts\python.exe app.py --selfcheck
git status --short
```

Gate results:

```text
npm run build -> PASS
node --test tests/*.test.mjs -> PASS, 10/10
generated self-hosted strict verify -> PASS
replay feishu_host local_contract_test.py -> PASS
replay feishu_host app.py --selfcheck -> PASS
git status --short -> clean
```

Current overall result: blocked at real Feishu Level 2 replay because real app credentials and test chat context are not available in this session. The experiment has not proven full Mode B product capability by the task book's definition until Phase 5 is rerun with real Feishu context from `C:\works\image-agent-web-mode-b-replay\feishu_host`.
