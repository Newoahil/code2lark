# Feishu Official Docs Snapshot

These files are local snapshots of selected official Feishu/Open Platform documentation that Code2Lark depends on.

Purpose:
- Keep a project-local reference set for platform behavior that directly affects adapter generation, card callback transport, permissions, and SDK integration.
- Support doc audits when local summaries drift from official behavior.
- Make it easy to diff local assumptions against current upstream docs.

Notes:
- Each file begins with `source` and `fetched` comments.
- These are snapshots, not rewritten summaries.
- When changing platform-dependent behavior, re-open the official source and compare with these snapshots plus `docs/feishu-docs-dependency-map.md` and `docs/lark-permissions-reference.md`.

Current snapshot set:
- `01-callback-subscription-receive-and-handle-callbacks.md`
- `02-node-sdk-handling-callbacks.md`
- `03-handle-card-callbacks.md`
- `04-long-connection-receive-events.md`
