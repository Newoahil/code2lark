# image-agent-web Self-Hosted MVP Verified Summary

Recorded: 2026-07-07

This document freezes the verified `image-agent-web` `self-hosted-runtime` path as the regression anchor for the current generalization phase. The goal of the next work is not to re-prove Feishu connectivity; it is to preserve this host layer while extracting the target-specific business mapping into reusable manifest-driven mechanisms.

## Verified Baseline

The generated Python `feishu-host/` self-hosted runtime has been validated in a real Feishu environment for these host-layer behaviors:

- Long connection ingress through `lark-oapi` WebSocket mode.
- `card.action.trigger` subscription and callback dispatch.
- Card JSON 2.0 start/result cards.
- Immediate running-card response for card callbacks.
- Asynchronous target execution followed by message card patch.
- `image.generate.submit` mapped to `POST /api/generate`.
- `image.iterate.submit` mapped to `POST /api/iterate`.
- `image.batch.submit` mapped to `POST /api/batch`.
- `image.batch.refresh` mapped to `GET /api/batch/{batch_id}/status` with completed batch download link support.
- Failure cards for validation, target-service, and host-side errors.

## Regression Contract

Future generalization work must keep the following checks green for the `image-agent-web` sample:

```powershell
npm run build
node --test tests/*.test.mjs
node dist/index.js verify generated\image-agent-web-lark-self-hosted --mode self-hosted-runtime --strict
```

The final strict verify command is expected to run against a freshly generated `self-hosted-runtime` package after Python dependencies from `feishu-host/requirements.txt` are installed. If dependencies are unavailable during local development, that condition is a local environment blocker, not a reason to weaken the regression target.

## Boundary For This Phase

The proven host layer must remain stable:

- Do not rewrite the long-connection host wiring.
- Do not replace the Card JSON 2.0 callback and patch path.
- Do not expand this phase into Slack, WeCom, group mention commands, private chat commands, full deployment automation, or skill packaging.
- Do isolate the `image-agent-web` action ids, service client mapping, card fields, and result rendering behind a target-specific profile so future targets can use the same manifest-driven workflow.
