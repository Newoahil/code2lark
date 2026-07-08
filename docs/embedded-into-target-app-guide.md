# Embedded Host Module Guide

This guide defines Mode B: moving generated host files into the target project as an incremental module. The generated package remains the source of truth.

## Source Of Truth

Start from:

```text
generated/<target>-lark/
```

Do not hand-edit target-project copies first. Regenerate the package, review the diff, then copy the intended host module files into the target repository.

## What To Move

For the current Python self-hosted host, copy `feishu-host/` as a directory into the target project, for example:

```text
<target>/integrations/lark/feishu-host/
```

Keep these files together:

- `.env.example`
- `requirements.txt`
- `config.py`
- `cards.py`
- `service_client.py`
- `validation.py`
- `handlers.py`
- `app.py`
- `local_contract_test.py`
- `README.md`
- `spec/*.json`

The `spec/` files are part of the runtime contract. Do not rebuild the start card or endpoint map by hand inside the target app.

## Configuration Migration

Create a target-local `.env` beside the migrated host module. Preserve the generated keys:

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_CONNECTION_MODE=websocket`
- target base URL, currently `IMAGE_AGENT_BASE_URL` for the image-agent-web profile
- optional operator allowlist
- timeout and test-chat settings

Secrets stay local to the target deployment environment and must not be copied back into the generated package.

## Startup Migration

Mode B needs a target-owned start command or process supervisor entry that runs the migrated host module, for example:

```powershell
cd integrations\lark\feishu-host
python app.py --selfcheck
python app.py --send-start-card
python app.py
```

The target project owns process lifecycle, logs, deployment, and rollback. Code2Lark only provides the module and verification contracts.

## Verification

Before real Feishu use, run from the migrated module directory:

```powershell
python local_contract_test.py
python app.py --selfcheck
```

Then run package validation from the generated package root before copying or after regenerating:

```powershell
node dist/index.js verify generated/<target>-lark --mode self-hosted-runtime --strict
```

Real Level 2 remains manual: configure the Feishu app for long connection, send the start card, click it in Feishu, and record evidence in the package-local `level2_verification_record.md`.
