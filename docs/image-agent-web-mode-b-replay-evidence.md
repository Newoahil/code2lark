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
