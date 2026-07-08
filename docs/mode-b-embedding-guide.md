# Mode B Embedding Guide

Mode B is the target-project embedded host-module path. The generated package remains the source of truth, but selected host files can be copied into the target repository as an incremental module.

Related chooser: `docs/host-delivery-mode-selection.md`.

## What gets copied

- `generated/<target>-lark/feishu-host/`
- `generated/<target>-lark/adapter/`
- `generated/<target>-lark/manifest/`
- selected docs as needed

Copy source, spec, template, and documentation files only. Do not copy `generated/<target>-lark/feishu-host/.env`, `feishu_context.local.json`, `feishu_context.reply.local.json`, `level2_manual_evidence.local.json`, filled evidence files, or any other local secret-bearing file into the target repository.

## Recommended target layout

```text
<target-project>/
  feishu_host/
    app.py
    cards.py
    handlers.py
    service_client.py
    validation.py
    config.py
    spec/
```

Keep the copied module isolated from target business code. The target project owns process supervision and deployment after embedding.

Before filling target-local credentials, add `feishu_host/.env` or the equivalent embedded host path to the target repository's `.gitignore`. Keep `FEISHU_APP_SECRET` and other secrets in the target host secret store or ignored local env file.

## What stays outside the target project

- The original generated package remains the source of truth.
- Regeneration happens in Code2Lark, not in the target repo.

## Verification

Run the generated host checks before and after embedding:

```powershell
python feishu_host/local_contract_test.py
python feishu_host/app.py --selfcheck
node dist/index.js verify generated/<target>-lark --mode self-hosted-runtime --strict
```

Mode B is not considered fully proven for a target until the generated host module is replayed inside that target project copy and passes its local verification path.
