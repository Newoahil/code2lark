# Host Delivery Mode Selection

Use this guide to choose the generated host shape before handoff.

Mode B details: `docs/mode-b-embedding-guide.md`.

| Mode | Best when | Trade-off |
| --- | --- | --- |
| Mode A | You want minimal intrusion and easy rollback | Separate host process to run |
| Mode B | You want the target project to own the Feishu host module | Slightly tighter coupling to the target repo |
| standalone-runtime | You need a quick reference host or fallback | Not the primary product shape |

## Mode A

Mode A is the external host, sidecar, or gateway path. Keep the target service unchanged and run the generated host beside it.

## Mode B

Mode B is the target-project embedded host-module path. Keep `generated/<target>-lark/` as source of truth. When the package contains `integrations/lark/install-manifest.json`, use the explicit `install` command: it defaults to dry-run and only `--apply` writes the isolated `integrations/lark/` module. Older host packages without that closure still follow the target-specific manual embedding guide.

## standalone-runtime

`standalone-runtime` remains a reference or fallback host for teams without an existing Feishu SDK service. Do not treat it as the default product shape.
