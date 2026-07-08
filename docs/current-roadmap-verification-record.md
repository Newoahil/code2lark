# Current Roadmap Verification Record

Record date: 2026-07-08

This record closes the verification notes for `docs/current-roadmap-task-book.md`.

## Scope

The current roadmap phase is complete when these conditions hold:

- `image-agent-web` remains the self-hosted-runtime regression anchor.
- Mode A and Mode B are documented as first-class delivery modes.
- The manifest, capability, interaction, analyzer, and generator structure is no longer inherently image-agent-web-only.
- `calendar-stock-updater` can enter the generalized workflow through analyze, generate, strict verify, and package validation.
- No Slack, WeCom, group @, private command, skill packaging, deployment automation, or third target expansion is added.

## Verification Notes

`master` history was not rewritten during final verification. The final three implementation commits were created on `master`; rewriting them only to reorder two already-passing commits would violate the local no-rewrite policy for `master`. This is the explicit waiver for the commit-history ordering note: the roadmap artifacts are present, and the final verified repository state is the source of truth.

The following final-gate commands were run at the completed tree:

```powershell
npm run build
node --test tests/*.test.mjs
node dist/index.js analyze C:\works\calendar-stock-updater --base-url http://127.0.0.1:3069 --out <temp>\out --name calendar-stock-updater
node dist/index.js generate <temp>\out --out <temp>\generated --mode embedded-adapter
node dist/index.js verify <temp>\generated --mode embedded-adapter --strict
node dist/index.js doctor <temp>\generated --mode embedded-adapter --json
node dist/index.js analyze C:\works\image-agent-web --base-url http://127.0.0.1:8000 --out <temp>\out --name image-agent-web
node dist/index.js generate <temp>\out --out <temp>\generated-self-hosted --mode self-hosted-runtime
node dist/index.js verify <temp>\generated-self-hosted --mode self-hosted-runtime --strict
```

Results:

- Build: pass.
- Test suite: pass, 9/9.
- `calendar-stock-updater`: pass, `generic_http_api`, `GET /api/state` healthcheck available, strict embedded-adapter verify pass, doctor package validation pass.
- `image-agent-web` self-hosted-runtime regression: pass, including generated Python compile, `requests`, `local_contract_test.py`, `lark_oapi`, and `app.py --selfcheck`.

## Worktree Cleanliness

The roadmap/task-book documents are committed so they are part of the reviewable project record. Local `.claude/` state is ignored as tool-local workspace metadata.
