# Code2Lark Capability Validation Matrix

This matrix is the current human-readable fact source for target profile, delivery mode, host mode, local validation, deployment-test validation, and evidence state.

| Target | Delivery mode | Host mode | Local validation | Deployment-test validation | Notes |
| --- | --- | --- | --- | --- | --- |
| image-agent-web | Mode A | self-hosted / long connection | yes | yes | verified sample baseline |
| image-agent-web | Mode B | embedded host module | yes | yes | verified sample baseline |
| calendar-stock-updater | Mode A | embedded-adapter / embedded-long-connection | yes | package and host contract verified; real Feishu pending | dedicated calendar Profile and `handleCardAction()` facade; formal Feishu ingress is `card.action.trigger`; exact target calls remain `GET /api/state`, `POST /api/run`, and `POST /api/stop` |
| calendar-stock-updater | Mode B | isolated Node module / long connection | yes | replay install verified; real WebSocket, start card, and callback receipt observed; authorized Level 2 pending | `auto` safely fell back to internal without a maintained index; strict generated TypeScript without suppressions; target-controlled status/log/failure text is bounded and redacted; dry-run-first install writes only `integrations/lark`; strict verify `32/0/0`; module `8/8`, replay `49/49`, zero-vulnerability audits, offline/conflict gates, and root/hash integrity passed; current app-scoped operator open_id must be aligned with `ALLOWED_OPERATOR_OPEN_IDS` before authorized refresh/dry-run evidence |
