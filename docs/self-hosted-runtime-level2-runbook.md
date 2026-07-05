# Self-Hosted Runtime Level 2 Runbook

This runbook is for manual real-Feishu validation of a generated `self-hosted-runtime` package. It starts only after local MVP proof has passed.

## Local Proof Gate

Run these from the generated package before opening a real Feishu connection:

```powershell
cd generated\image-agent-web-lark-self-hosted\feishu-host
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe local_contract_test.py
.\.venv\Scripts\python.exe app.py --selfcheck
cd ..
node ..\..\dist\index.js verify . --mode self-hosted-runtime --strict
```

Expected evidence:

- `local_contract_test.py` prints `feishu-host contract: PASS`.
- `app.py --selfcheck` prints `card.action.trigger registered` and `lark.ws.Client constructed without start()`.
- strict verify reports pass and includes passing Python contract/selfcheck checks.

Do not treat missing Python or missing `lark-oapi`/`requests` warnings as final MVP evidence.

## Feishu App Setup

In the Feishu developer console:

1. Enable bot capability.
2. Enable event receiving by long connection.
3. Subscribe to `card.action.trigger`.
4. Grant at least `im:message:send_as_bot` and `im:resource:upload`; add `im:message:update` if the operator uses async message patch behavior later.
5. Add the bot to the test chat.

No public callback URL is required for this mode unless the operator intentionally adds a webhook fallback.

## Runtime Setup

Fill `feishu-host/.env` through a secure channel:

```text
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_CONNECTION_MODE=websocket
IMAGE_AGENT_BASE_URL=http://127.0.0.1:8000
TEST_CHAT_ID=
FEISHU_ALLOWED_USERS=
IMAGE_AGENT_TIMEOUT_MS=120000
```

Confirm the target service is reachable from the host machine:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/api/meta
```

Start the host:

```powershell
cd generated\image-agent-web-lark-self-hosted\feishu-host
.\.venv\Scripts\python.exe app.py
```

Keep the console logs for evidence. They should show the long connection starting and later show `card.action.trigger` events when cards are clicked.

## Manual Interaction Evidence

Record the following in the package-local `level2_verification_record.md`:

- Date, operator, Feishu app name, test chat, target base URL, generated package path, and `feishu-host` path.
- Start card message ID or screenshot.
- Generate click evidence: host received `card.action.trigger`, target `/api/generate` was called, result card appeared, and trace ID/result summary were visible.
- Iterate evidence: feedback action called `/api/iterate` and produced an updated result card.
- Batch evidence: batch submit called `/api/batch`, refresh called `/api/batch/{batch_id}/status`, and completed card exposed `/api/batch/{batch_id}/download` when available.
- Failure-path evidence: invalid input, target failure, timeout, or unauthorized operator produced a readable failure card without an unintended target call.

## Completion Decision

Level 2 is complete only when:

- Local proof gate passed with installed Python dependencies.
- The real Feishu app received the start card.
- At least generate and batch paths were clicked in Feishu and observed in `feishu-host` logs.
- Required screenshots, message IDs, URLs, trace IDs, and notes are written to the package-local `level2_verification_record.md`.
- Remaining issues are documented, or explicitly marked as none.
