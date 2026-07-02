# Market Research: One-shot service-to-Lark bot integration generator

Date: 2026-06-30

## 1. Target definition

The current project is best framed as a one-shot integration generator:

> Given an existing process, program, API, script, or service, analyze how it works, infer the callable capabilities, design the Lark/Feishu bot interaction, generate the bot-side adapter code and card assets, then verify that the exposed functions can run through the bot.

This is not primarily a long-running multi-agent platform. Agent/subagent/skill/tool capabilities are used at build time to create a runnable integration package. The generated package then handles real Lark callbacks, parameter validation, service execution, result cards, and status pushes without requiring the agent to reason again at runtime.

## 2. Bottom-line market finding

No mature open-source project found in this search directly matches the full target:

```text
read arbitrary code/service
-> infer capabilities and usage
-> design Lark bot operations/cards
-> generate bot server + service adapter
-> register/configure Lark app callbacks
-> run end-to-end verification
```

The closest adjacent project is `Code2MCP`, which reads existing code repositories and generates MCP services. Its target channel is AI-agent/MCP clients rather than Lark/Feishu bots, but its workflow shape is very close: analyze repository, configure environment, generate service code, run, review, fix, and finalize.

Most other related projects start from already-known commands, plugins, workflows, or API specs. They provide useful patterns for command schemas, permission checks, action execution, audit trails, adapters, and workflow orchestration, but they do not automatically understand an arbitrary service and produce a Lark bot integration.

## 3. Project categories and positioning

### 3.1 ChatOps bot frameworks

These projects let developers expose scripts, commands, plugins, or operational actions inside chat platforms. They are close in user experience, but they expect humans to write the integration logic.

| Project | Source | What it does | Relevance to Lark-deployer | Gap |
| --- | --- | --- | --- | --- |
| Hubot | https://github.com/hubotio/hubot | JavaScript bot framework with scripts, adapters for multiple chat services, slash-style command registration, typed args, side-effect confirmations, help/search, permissions, and optional event logs. | Good reference for generated command schemas, confirmation gates, help text, permission hooks, and deterministic command handling. | It is a bot framework, not a repo-understanding generator. Integrations are written manually. |
| Errbot | https://github.com/errbotio/errbot | Python ChatOps bot that starts scripts from chatrooms, supports plugins, ACLs, webhooks, storage, conversation flows, and many chat backends via add-ons. | Good reference for plugin packaging, chat-admin commands, ACL, webhook callbacks, and conversation state. | It does not infer capabilities from a target project or generate Lark cards. |
| Botkube | https://github.com/kubeshop/botkube | Kubernetes ChatOps bot for monitoring, debugging, notifications, and secure command execution through Slack/Discord/Mattermost. | Strong reference for "see alert, take action" flows, secure command execution, platform adapters, and operations UX. | Domain-specific to Kubernetes and not a general service wrapper generator. |

Design notes to reuse:

- Generated capabilities should become deterministic command/action specs, not free-form prompt-only behavior.
- Operations with side effects should have explicit confirmation and timeout states.
- Help/discovery should be generated from the same capability schema used for execution.
- Permission checks should be pluggable and visible in generated manifests.

### 3.2 Cross-platform bot frameworks in the Chinese/open chatbot ecosystem

These are useful if the project later wants to target multiple chat platforms. They are less relevant for one-shot generation unless we decide to generate a plugin for one of these ecosystems instead of generating a standalone bot server.

| Project | Source | What it does | Relevance to Lark-deployer | Gap |
| --- | --- | --- | --- | --- |
| NoneBot2 | https://github.com/nonebot/nonebot2 | Python asynchronous multi-platform chatbot framework. The repository advertises Lark/Feishu-related platform coverage through topics and links. | Potential runtime target if Python plugin generation is preferred. Useful reference for adapter/plugin separation. | It is a bot framework, not a service-integration generator. Card/action specifics still need custom work. |
| Koishi | https://github.com/koishijs/koishi | TypeScript cross-platform chatbot framework with plugin ecosystem and platform topics including Lark/Feishu. | Potential runtime target if TypeScript plugin generation and broader platform adapter reuse are priorities. | It does not analyze target repos or generate integration packages by itself. |

Decision note:

For the MVP, generating a direct Lark/Feishu bot server is probably simpler than targeting a general bot framework. Reconsider Koishi/NoneBot only if multi-platform support becomes a near-term requirement.

### 3.3 Runbook, automation, and workflow platforms

These projects expose existing tools, scripts, APIs, and workflows as controlled operations. They are not bot generators, but their action, audit, RBAC, and workflow concepts are directly useful.

| Project | Source | What it does | Relevance to Lark-deployer | Gap |
| --- | --- | --- | --- | --- |
| StackStorm | https://github.com/StackStorm/st2 | Event-driven automation platform for actions, workflows, rules, sensors, packs, ChatOps, audit trail, and integration packs. Actions can be Python plugins or scripts described with metadata. | Excellent reference for `capability` / `action` metadata, trigger-to-action mapping, packs, workflows, and execution audit. | It is a full automation platform, not a one-shot generator focused on Lark cards and callbacks. |
| Rundeck | https://github.com/rundeck/rundeck | Open-source runbook automation service with web console, CLI, WebAPI, standardized jobs, node execution, and self-service operations over existing tools/scripts. | Strong reference for job options, execution logs, permissions, retries, and self-service operations. | Heavy platform. It does not generate chat-bot wrappers from arbitrary code. |
| n8n | https://github.com/n8n-io/n8n | Workflow automation platform with many integrations, visual building, custom code, self-hosting, and AI features. | Useful reference for node-based integration models, credentials, UI-managed workflows, and templates. | Flow-builder first, not code-understanding or Lark-card-first. Source-available/fair-code license also matters. |
| Node-RED | https://github.com/node-red/node-red | Low-code programming for event-driven applications with flows, custom nodes, and shared flow libraries. | Useful reference for event-flow modeling and visual/low-code extensibility. | Does not generate bot integrations from an existing service. |

Design notes to reuse:

- Treat every exposed operation as an action with metadata: id, input schema, output schema, side effects, timeout, retry, permission, audit.
- Separate triggers/events from actions. Lark card clicks, message commands, schedules, and webhooks can all map to the same action model.
- Store generated integration logic as code plus declarative metadata.
- Keep logs and execution state first-class even in the MVP.

### 3.4 Lark/Feishu SDK and platform primitives

These are not competitors. They are the lower-level substrate the generated integration package can use.

| Project | Source | What it does | Relevance to Lark-deployer | Gap |
| --- | --- | --- | --- | --- |
| Lark/Feishu Node SDK | https://github.com/larksuite/node-sdk | Official Node.js SDK for Lark/Feishu Open Platform. Includes client APIs, websocket/event examples, message card helpers, card action handler, and app registration helpers. | Very relevant for generated TypeScript/Node runtime: message send, interactive card action handling, callback registration, and possible app registration workflow. | SDK only. It does not understand target services or design interactions. |
| Lark/Feishu Python SDK | https://github.com/larksuite/oapi-sdk-python | Official Python SDK for Lark/Feishu Open Platform. | Relevant if generated runtime is Python. | SDK only. |

Decision note:

The current `lark-card-designer` skill should remain a design-time component. The generated runtime should use an SDK or a thin HTTP wrapper to send/update cards and handle callbacks.

### 3.5 API/code-to-tool generation projects

This is the most strategically relevant category. These projects transform code or formal specs into callable interfaces.

| Project | Source | What it does | Relevance to Lark-deployer | Gap |
| --- | --- | --- | --- | --- |
| Code2MCP | https://github.com/DEFENSE-SEU/Code2MCP | Automated workflow that transforms existing code repositories into MCP services, using LLM code analysis, service code generation, environment setup, validation, review, retry, and report generation. | Closest analog. Its workflow can inspire Lark-deployer's pipeline: analyze -> env -> generate -> run -> review -> finalize. | Output target is MCP service, not Lark bot/card/callback runtime. It appears research/young rather than mature production infrastructure. |
| OpenAPI Generator | https://github.com/OpenAPITools/openapi-generator | Generates clients, server stubs, documentation, and configuration from OpenAPI specs. | Useful reference for contract-first generation, language targets, templates, and repeatable generation. | Requires an existing OpenAPI spec. Does not infer arbitrary services or design chat interactions. |
| Botpress | https://github.com/botpress/botpress | Bot/assistant platform with SDK/CLI, integrations, example bots as code, and public integration development flow. | Useful reference for integration definitions, generated integration skeletons, and packaging. | Bot/assistant platform, not one-shot wrapping of arbitrary local services into Lark. |
| Rasa | https://github.com/RasaHQ/rasa | Open-source framework for text/voice conversational assistants with NLU, dialogue management, and channels such as Slack/Facebook. | Useful only for natural-language dialogue design if needed later. | Overkill for deterministic operations/cards; not a repo-to-bot generator. |

Design notes to reuse:

- Separate source analysis from generated runtime.
- Generate a report every time so users can review what the tool inferred.
- Run validation against the original project before trusting the generated wrapper.
- Prefer manifest-driven generation so repeated runs can diff changes rather than overwrite blindly.

## 4. Market map

| Axis | Existing market strength | Gap Lark-deployer can occupy |
| --- | --- | --- |
| Chat bot runtime | Strong: Hubot, Errbot, Koishi, NoneBot, Botpress, Rasa | These assume the integration is manually authored. |
| Operations automation | Strong: StackStorm, Rundeck, Botkube | These expose actions and runbooks, but are platforms, not one-shot Lark bot generators. |
| Workflow integration | Strong: n8n, Node-RED | These are flow-builder ecosystems, not code-understanding deployment generators. |
| Feishu/Lark SDK | Available: official SDKs and community adapters | SDKs do transport/callbacks, not interaction design or service capability inference. |
| Code-to-tool generation | Emerging: Code2MCP and OpenAPI/MCP generators | Most target MCP/API clients, not collaboration-card operations in Lark. |

The opening is a focused generator:

```text
existing service/program/process
-> generated service manifest
-> generated interaction contract
-> Lark card plan
-> generated bot runtime package
-> smoke-tested Lark integration
```

## 5. Recommended product positioning

Proposed one-line position:

> Lark-deployer turns an existing service into a runnable Lark bot integration package through agent-assisted analysis, interaction planning, card design, code generation, and verification.

The differentiators should be:

- Lark/Feishu interaction first, not generic chatbot first.
- One-shot generated package, not a heavy always-on automation platform.
- Supports existing code/processes/scripts/APIs, not only formal OpenAPI specs.
- Human-reviewable manifests and reports.
- Card design as a first-class output, reusing the existing `lark-card-designer` skill.
- Clear separation between build-time agent reasoning and runtime deterministic execution.

## 6. Suggested MVP scope

### 6.1 Input types

Start with two service shapes:

1. CLI/script process
   - Detect from `package.json`, `pyproject.toml`, `requirements.txt`, `README`, `bin`, `scripts`, and examples.
   - Wrap commands with input schemas, timeout, env, cwd, and output parsing.

2. HTTP API service
   - Detect from framework routes, OpenAPI docs if present, README examples, local ports, and curl snippets.
   - Wrap endpoints with request schemas, response format, auth, and healthcheck.

Avoid fully arbitrary daemon support in the first version unless the target project already has clear healthcheck and invocation docs.

### 6.2 Generated artifacts

Recommended generated output:

```text
generated/
  manifest/
    service_manifest.json
    capability_map.json
    interaction_contract.json
    runtime_policy.json
    generation_report.md
  bot-server/
    package.json
    src/
      index.ts
      lark/
        callbacks.ts
        cards.ts
        sender.ts
      runtime/
        actions.ts
        executor.ts
        state.ts
        audit.ts
      service/
        adapter.ts
        schema.ts
    .env.example
    README.md
  tests/
    smoke.test.ts
```

### 6.3 Build-time pipeline

```text
1. Inspect target repo
2. Identify service entrypoints and runnable commands
3. Infer capabilities and classify risk
4. Generate capability map
5. Generate interaction contract
6. Use lark-card-designer for card plan
7. Generate bot runtime code
8. Generate app/scopes/callback setup instructions or helper
9. Run local validation/smoke tests
10. Write final generation report
```

### 6.4 Runtime principle

The generated runtime should not call an agent to decide how to execute normal user actions. It should:

```text
Lark callback/message
-> verify token/signature
-> parse action id and inputs
-> check interaction_contract + runtime_policy
-> execute service adapter
-> update state/audit log
-> send or update Lark card
```

This keeps the production path predictable and testable.

## 7. Concrete lessons from related projects

### Hubot

Useful ideas:

- Command id and alias separation.
- Typed argument schemas.
- Side-effect declarations and confirmation before execution.
- Help/search generated from command metadata.
- Permission provider hooks.
- Event logs.

Apply to Lark-deployer:

Generate a `capability.command` block for every exposed operation:

```json
{
  "id": "service.deploy",
  "title": "Deploy service",
  "input_schema": {},
  "side_effects": ["modifies remote environment"],
  "requires_confirmation": true,
  "permissions": {
    "roles": ["ops", "admin"]
  }
}
```

### Errbot

Useful ideas:

- Plugins as operational units.
- Admin/configure/install operations via chat.
- ACL per command.
- Webhook callback support.
- Conversation flows and persisted plugin storage.

Apply to Lark-deployer:

Generated integrations should be packaged as isolated adapters with their own config, state, and audit. Even if the first runtime is standalone, the internal structure should feel plugin-like.

### StackStorm

Useful ideas:

- Actions, triggers, sensors, rules, workflows, and packs.
- Actions can be scripts with metadata.
- Workflows compose actions.
- Audit trail is a first-class feature.

Apply to Lark-deployer:

Use `action` as the central execution primitive. Lark button clicks, slash-like commands, schedules, and alerts all become triggers that invoke actions.

### Rundeck

Useful ideas:

- Self-service operations over existing tools and scripts.
- Standardized jobs with options.
- Execution logs and operational quality.
- Web console/CLI/API around the same job model.

Apply to Lark-deployer:

Operation cards should show the exact object, options, risk, status, and execution trace. Do not bury task logs or owner/trigger metadata.

### Botkube

Useful ideas:

- Monitoring and action in the same collaboration context.
- Secure command execution from chat.
- Platform adapters.
- Plugins and context-aware notifications.

Apply to Lark-deployer:

Information-push use cases and operation-use cases should share the same capability model. A metric alert can later expose actions such as "refresh", "retry", "rollback", or "view logs".

### Code2MCP

Useful ideas:

- Minimal intrusion into original repository.
- LLM-powered repository analysis.
- Generated adapter/service code.
- Environment setup and original project validation.
- Run/review/fix/finalize loop.
- Detailed generation report.

Apply to Lark-deployer:

This is the strongest pipeline reference. Replace MCP service output with Lark bot integration output:

```text
Code2MCP:
repo -> MCP service -> MCP client config

Lark-deployer:
repo -> Lark bot server -> Feishu/Lark app config + card interactions
```

## 8. Initial schema sketch

### service_manifest.json

```json
{
  "service": {
    "name": "example-service",
    "type": "cli | http | worker | mixed",
    "root": ".",
    "start": {
      "command": "npm run start",
      "healthcheck": "http://localhost:3000/health"
    }
  },
  "environment": {
    "required": ["API_KEY"],
    "optional": ["LOG_LEVEL"]
  },
  "capabilities": []
}
```

### capability_map.json

```json
{
  "capabilities": [
    {
      "id": "report.daily",
      "kind": "info | action | long_task",
      "source": {
        "type": "cli | http | function",
        "entry": "npm run daily-report"
      },
      "input_schema": {},
      "output_schema": {},
      "side_effects": [],
      "risk": "read_only | write | destructive",
      "timeout_seconds": 60
    }
  ]
}
```

### interaction_contract.json

```json
{
  "channel": "lark",
  "interactions": [
    {
      "id": "report.daily.open",
      "capability_id": "report.daily",
      "trigger": {
        "type": "button | command | schedule | alert"
      },
      "card_pattern": "digest_card | action_approval_card | progress_card | alert_card",
      "requires_confirmation": false,
      "states": ["idle", "running", "succeeded", "failed"],
      "audit": ["operator", "time", "inputs", "trace_id", "result"]
    }
  ]
}
```

## 9. Open risks and decisions

Important product decisions:

- Whether the generated runtime should be TypeScript/Node first or Python first.
- Whether to use the official Lark SDK directly or generate a plugin for Koishi/NoneBot.
- How much automatic inference is allowed before requiring human review.
- How destructive actions are detected and gated.
- Whether app registration should be fully automated or documented as a guided setup.

Recommended MVP choices:

- Runtime: TypeScript/Node, because the official Lark Node SDK currently has convenient examples for card action handling and app registration helpers.
- Card design: keep using the existing `lark-card-designer` skill at build time.
- Contract format: JSON first, with optional YAML later.
- Safety: require manual approval for write/destructive capabilities in the generation report before enabling them.
- Platform scope: Feishu/Lark only for MVP; keep channel adapter boundaries in code names but do not build other adapters yet.

## 10. Sources reviewed

- Hubot: https://github.com/hubotio/hubot
- Errbot: https://github.com/errbotio/errbot
- Botkube: https://github.com/kubeshop/botkube
- StackStorm: https://github.com/StackStorm/st2
- Rundeck: https://github.com/rundeck/rundeck
- n8n: https://github.com/n8n-io/n8n
- Node-RED: https://github.com/node-red/node-red
- NoneBot2: https://github.com/nonebot/nonebot2
- Koishi: https://github.com/koishijs/koishi
- Lark/Feishu Node SDK: https://github.com/larksuite/node-sdk
- Lark/Feishu Python SDK: https://github.com/larksuite/oapi-sdk-python
- Code2MCP: https://github.com/DEFENSE-SEU/Code2MCP
- OpenAPI Generator: https://github.com/OpenAPITools/openapi-generator
- Botpress: https://github.com/botpress/botpress
- Rasa: https://github.com/RasaHQ/rasa

