import path from "node:path";
import { readJsonFile, writeText } from "../fs-utils.js";
import { hostModeUsesLongConnection, hostModeUsesWebhook, type HostReceiveMode } from "../host-mode.js";
import type { CapabilityMap, InteractionContract, RequiredPermissions, ServiceManifest } from "../types.js";

export async function planCommand(args: string[]): Promise<void> {
  const workspaceArg = args[0];
  if (!workspaceArg) {
    throw new Error("Usage: lark-deployer plan <analysis-workspace>");
  }

  const workspace = path.resolve(workspaceArg);
  const manifestDir = path.join(workspace, "manifest");
  const service = readJsonFile<ServiceManifest>(path.join(manifestDir, "service_manifest.json"));
  const capabilities = readJsonFile<CapabilityMap>(path.join(manifestDir, "capability_map.json"));
  const interactions = readJsonFile<InteractionContract>(path.join(manifestDir, "interaction_contract.json"));
  const permissions = readJsonFile<RequiredPermissions>(path.join(manifestDir, "required_permissions.json"));
  const targetProfile = capabilities.target_profile;
  const calendarModeB = targetProfile === "calendar-stock-updater";

  writeText(path.join(workspace, "permission_review.md"), buildPermissionReview(service, capabilities, interactions, permissions));
  writeText(path.join(workspace, "deployment_checklist.md"), buildDeploymentChecklist(
    service,
    permissions,
    calendarModeB ? "embedded-adapter" : "standalone-runtime",
    calendarModeB ? "embedded-long-connection" : "standalone-runtime",
    targetProfile,
  ));
  writeText(path.join(workspace, "card_plan.md"), buildCardPlan(service, targetProfile));
  writeText(path.join(workspace, "context_readiness.md"), buildContextReadiness(permissions));

  console.log(`Plan documents written to ${workspace}`);
}

export function buildPermissionReview(
  service: ServiceManifest,
  capabilities: CapabilityMap,
  interactions: InteractionContract,
  permissions: RequiredPermissions,
): string {
  const scopeRows = permissions.scopes
    .map((scope) => `| ${scope.scope} | ${scope.identity} | ${scope.risk} | ${scope.required_by.join(", ")} | ${scope.reason} |`)
    .join("\n");
  const callbackRows = permissions.callbacks
    .map((callback) => `| ${callback.callback} | ${callback.required_by.join(", ")} | ${callback.reason} | ${callback.security.join(", ")} |`)
    .join("\n");

  return `# Permission Review

## Service

- Name: ${service.service.name}
- Target base URL: ${service.service.base_url || "not provided"}
- Managed by Lark-deployer: ${String(service.service.managed_by_lark_deployer)}

## Capability Coverage

${capabilities.capabilities.map((capability) => `- ${capability.id}: ${capability.name} (${capability.kind}, risk=${capability.risk})`).join("\n")}

## Interaction Coverage

${interactions.interactions.map((interaction) => `- ${interaction.id}: ${interaction.trigger} -> ${interaction.capability_id} -> ${interaction.result_mode}`).join("\n")}

## Required Feishu/Lark Scopes

| Scope | Identity | Risk | Required By | Reason |
| --- | --- | --- | --- | --- |
${scopeRows}

## Required Callbacks

| Callback | Required By | Reason | Security |
| --- | --- | --- | --- |
${callbackRows}

## Manual Feishu Setup Steps

${permissions.manual_steps.map((item) => `- [ ] ${item}`).join("\n")}

## Context Requirements

${permissions.context_requirements.map((item) => `- [ ] ${item}`).join("\n")}

## Review Flags

${permissions.review_flags.map((item) => `- ${item}`).join("\n") || "- None"}
`;
}

export function buildDeploymentChecklist(
  service: ServiceManifest,
  permissions: RequiredPermissions,
  integrationMode: "embedded-adapter" | "standalone-runtime" | "self-hosted-runtime" = "standalone-runtime",
  hostReceiveMode: HostReceiveMode = "embedded-long-connection",
  targetProfile = "image-agent-web",
): string {
  if (targetProfile === "calendar-stock-updater") {
    return buildCalendarDeploymentChecklist(service, permissions);
  }
  if (integrationMode === "embedded-adapter") {
    const usesLongConnection = hostModeUsesLongConnection(hostReceiveMode);
    const usesWebhook = hostModeUsesWebhook(hostReceiveMode);
    const hostModeOption = hostReceiveMode === "embedded-webhook" ? "" : ` --host-mode ${hostReceiveMode}`;
    const targetBaseUrlKey = targetProfile === "generic-http-api" ? "TARGET_BASE_URL" : "IMAGE_AGENT_BASE_URL";
    const adapterHandler = targetProfile === "generic-http-api" ? "handleGenericHttpCardAction()" : "the generated adapter handler";
    const targetMetaCheck = targetProfile === "generic-http-api" ? "Confirm the target health/read endpoint selected by analysis is reachable." : "Confirm GET /api/meta returns template metadata.";
    const secretStep = usesWebhook && usesLongConnection
      ? `Store APP_ID, APP_SECRET, VERIFICATION_TOKEN, TEST_CHAT_ID, PUBLIC_CALLBACK_BASE_URL, ${targetBaseUrlKey}, and long-connection host ownership in the existing host service's secret/config system.`
      : usesLongConnection
      ? `Store APP_ID, APP_SECRET, TEST_CHAT_ID, ${targetBaseUrlKey}, and long-connection host ownership in the existing host service's secret/config system.`
      : `Store APP_ID, APP_SECRET, VERIFICATION_TOKEN, TEST_CHAT_ID, PUBLIC_CALLBACK_BASE_URL, and ${targetBaseUrlKey} in the existing host service's secret/config system.`;
    const debugStep = usesWebhook
      ? "Set DEBUG_ACCESS_TOKEN before any host-owned debug endpoints are exposed through a public callback URL."
      : usesLongConnection
      ? "Set DEBUG_ACCESS_TOKEN before any host-owned debug endpoints are exposed outside the trusted local environment."
      : "Set DEBUG_ACCESS_TOKEN before any host-owned debug endpoints are exposed.";
    const ingressStep = usesWebhook && usesLongConnection
      ? `Configure callback URL to \`<PUBLIC_CALLBACK_BASE_URL>/webhook/card\` on the existing host, subscribe the Feishu SDK host to \`card.action.trigger\`, and route both ingress paths to ${adapterHandler}.`
      : usesLongConnection
      ? `Subscribe the existing Feishu SDK host to \`card.action.trigger\` and route events to ${adapterHandler}.`
      : "Configure callback URL to `<PUBLIC_CALLBACK_BASE_URL>/webhook/card` on the existing host.";
    const feishuSetupSteps = usesLongConnection && !usesWebhook
      ? permissions.manual_steps.map((item) => (
        item.includes("<PUBLIC_CALLBACK_BASE_URL>/webhook/card")
          ? "Enable long connection in the Feishu developer console and subscribe to `card.action.trigger`."
          : item
      ))
      : usesLongConnection
        ? permissions.manual_steps.concat("Enable long connection in the Feishu developer console and subscribe to `card.action.trigger`.")
        : permissions.manual_steps;
    const doneChecks = targetProfile === "generic-http-api"
      ? [
          "A real Feishu test chat receives the generated generic HTTP start card from the existing host.",
          `Clicking a generated action makes the existing host call adapter/ and the selected ${service.service.name} HTTP endpoint.`,
          "The result card appears with the target JSON result or a readable failure summary.",
          "Rejected/destructive endpoints that are not reviewed do not appear as direct card actions.",
          "level2_verification_record.md contains the final operator, message id or screenshot, trace id, target request summary, and completion decision.",
        ]
      : [
          "A real Feishu test chat receives the start card from the existing host.",
          `Clicking the preset generate button makes the existing host call adapter/ and ${service.service.name} /api/generate.`,
          "The result card appears with analysis and generated image or fallback image URL.",
          `Batch submit and refresh call adapter/ and ${service.service.name} /api/batch endpoints.`,
          "Failure paths show readable error cards.",
          "level2_verification_record.md contains the final operator, message id or screenshot, trace id, and completion decision.",
        ];
    return `# Deployment Checklist

## Target Service

- [ ] Confirm ${service.service.name} is running outside Lark-deployer.
- [ ] Confirm the existing Feishu SDK host can reach ${service.service.base_url || `<${targetBaseUrlKey}>`}.
- [ ] ${targetMetaCheck}

## Feishu/Lark App

${feishuSetupSteps.map((item) => `- [ ] ${item}`).join("\n")}

## Embedded Host Environment

- [ ] Mount generated \`adapter/\` in the existing Feishu SDK service.
- [ ] ${secretStep}
- [ ] Fill ENCRYPT_KEY only if encrypted callbacks are enabled in Feishu.
- [ ] ${debugStep}
- [ ] Decide whether ALLOWED_OPERATOR_OPEN_IDS should restrict who can execute card actions in the test chat.
- [ ] Choose the correct Lark-deployer CLI command style for this package:
  - If the package still lives under the original Lark-deployer repository, use \`node ..\\..\\dist\\index.js <command> .\`.
  - If the package was copied elsewhere, set \`$env:LARK_DEPLOYER_CLI="C:\\path\\to\\Lark-deployer\\dist\\index.js"\` and use \`node $env:LARK_DEPLOYER_CLI <command> .\`.
- [ ] Run \`node ..\\..\\dist\\index.js verify . --mode embedded-adapter${hostModeOption} --strict\` or \`node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter${hostModeOption} --strict\` from the generated package root.
- [ ] Run \`node ..\\..\\dist\\index.js verify . --mode embedded-adapter${hostModeOption} --host-runtime-url <host_runtime_url> --simulate\` or \`node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter${hostModeOption} --host-runtime-url <host_runtime_url> --simulate\` after adapter/ is mounted in the existing host.
- [ ] ${ingressStep}
- [ ] Run \`node ..\\..\\dist\\index.js evidence .\` or \`node $env:LARK_DEPLOYER_CLI evidence .\` after verification and review \`level2_evidence_draft.md\`.
- [ ] Run \`node ..\\..\\dist\\index.js doctor . --mode embedded-adapter${hostModeOption} --gate\` or \`node $env:LARK_DEPLOYER_CLI doctor . --mode embedded-adapter${hostModeOption} --gate\` and confirm remaining blockers are external host/Level 2 evidence only.
- [ ] Run \`node ..\\..\\dist\\index.js handoff .\` or \`node $env:LARK_DEPLOYER_CLI handoff .\` and exclude local secrets before copying the package.

## Done

${doneChecks.map((item) => `- [ ] ${item}`).join("\n")}
`;
  }
  if (integrationMode === "self-hosted-runtime") {
    return `# Deployment Checklist

## Target Service

- [ ] Confirm ${service.service.name} is running outside Lark-deployer.
- [ ] Confirm the generated Python host can reach ${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}.
- [ ] Confirm GET /api/meta returns template metadata.

## Python Feishu Host

- [ ] Copy \`feishu-host/.env.example\` to \`feishu-host/.env\`.
- [ ] Fill FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_CONNECTION_MODE=websocket, IMAGE_AGENT_BASE_URL, optional FEISHU_ALLOWED_USERS, IMAGE_AGENT_TIMEOUT_MS, and TEST_CHAT_ID.
- [ ] Create a venv and run \`pip install -r feishu-host/requirements.txt\`.
- [ ] Run \`python feishu-host/local_contract_test.py\`.
- [ ] Run \`python feishu-host/app.py --selfcheck\`.
- [ ] Run \`node ..\\..\\dist\\index.js verify . --mode self-hosted-runtime --strict\` or \`node $env:LARK_DEPLOYER_CLI verify . --mode self-hosted-runtime --strict\` from the generated package root.

## Feishu/Lark App

${permissions.manual_steps.map((item) => `- [ ] ${item}`).join("\n")}
- [ ] Enable long connection and subscribe to card.action.trigger.
- [ ] Add the bot to the test chat.
- [ ] Use the manual Level 2 runbook for real Feishu clicks.

## Done

- [ ] Local contract test proves generate, iterate, batch submit, batch refresh, and failure/no-call paths.
- [ ] app.py --selfcheck proves card.action.trigger wiring without live Feishu connection.
- [ ] Real Feishu Level 2 evidence is recorded manually when available.
`;
  }
  return `# Deployment Checklist

## Target Service

- [ ] Confirm ${service.service.name} is running outside Lark-deployer.
- [ ] Confirm bot runtime can reach ${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}.
- [ ] Confirm GET /api/meta returns template metadata.

## Feishu/Lark App

${permissions.manual_steps.map((item) => `- [ ] ${item}`).join("\n")}

## Runtime Environment

- [ ] Copy generated .env.example to .env.
- [ ] Copy feishu_context.template.json to feishu_context.local.json, fill external values there, then run \`configure --strict --dry-run\` before \`configure --strict\`; or fill bot-runtime/.env directly and run \`configure --strict --dry-run\` before final verification.
- [ ] Fill APP_ID, APP_SECRET, VERIFICATION_TOKEN, TEST_CHAT_ID, PUBLIC_CALLBACK_BASE_URL, and target base URL.
- [ ] Fill ENCRYPT_KEY only if encrypted callbacks are enabled in Feishu.
- [ ] Set DEBUG_ACCESS_TOKEN before the runtime is reachable from the public callback URL.
- [ ] Decide whether ALLOWED_OPERATOR_OPEN_IDS should restrict who can execute card actions in the test chat.
- [ ] Run npm install in bot-runtime.
- [ ] Run npm run build.
- [ ] Run npm start.
- [ ] Choose the correct Lark-deployer CLI command style for this package:
  - If the package still lives under the original Lark-deployer repository, use \`node ..\\..\\dist\\index.js <command> .\`.
  - If the package was copied elsewhere, set \`$env:LARK_DEPLOYER_CLI="C:\\path\\to\\Lark-deployer\\dist\\index.js"\` and use \`node $env:LARK_DEPLOYER_CLI <command> .\`.
- [ ] Run \`node ..\\..\\dist\\index.js readiness .\` or \`node $env:LARK_DEPLOYER_CLI readiness .\` from the generated package root and review \`handoff_status.md\`.
- [ ] Configure callback URL to \`<PUBLIC_CALLBACK_BASE_URL>/webhook/card\`.
- [ ] Run \`node ..\\..\\dist\\index.js verify . --runtime-url <bot_runtime_url> --level2\` or \`node $env:LARK_DEPLOYER_CLI verify . --runtime-url <bot_runtime_url> --level2\`.
- [ ] Run \`node ..\\..\\dist\\index.js evidence .\` or \`node $env:LARK_DEPLOYER_CLI evidence .\` after verification and review \`level2_evidence_draft.md\`.
- [ ] Run \`node ..\\..\\dist\\index.js doctor . --out doctor_report.json --probe-target --gate\` or \`node $env:LARK_DEPLOYER_CLI doctor . --out doctor_report.json --probe-target --gate\`.
- [ ] Run \`node ..\\..\\dist\\index.js handoff .\` or \`node $env:LARK_DEPLOYER_CLI handoff .\` and exclude local secrets/build output before copying the package.

## Done

- [ ] A real Feishu test chat receives the start card.
- [ ] Clicking the preset generate button calls image-agent-web /api/generate.
- [ ] The result card appears with analysis and generated image or fallback image URL.
- [ ] Failure paths show readable error cards.
- [ ] level2_verification_record.md contains the final operator, message id or screenshot, trace id, and completion decision.
`;
}

function buildCalendarDeploymentChecklist(service: ServiceManifest, permissions: RequiredPermissions): string {
  return `# Deployment Checklist - Calendar Mode B

## Target Service

- [ ] Confirm ${service.service.name} is running under the target project's existing lifecycle.
- [ ] Confirm the isolated Lark module can reach ${service.service.base_url || "<TARGET_BASE_URL>"}.
- [ ] Confirm GET /api/state returns defaults, current task state, and bounded recent logs.
- [ ] Confirm the only target write endpoints are POST /api/run and POST /api/stop.

## Feishu/Lark App

${permissions.manual_steps.map((item) => `- [ ] ${item}`).join("\n")}

## Candidate And Install Review

- [ ] Keep the generated package as the source of truth; do not copy individual adapter files by hand.
- [ ] Run strict package verification for embedded-adapter with embedded-long-connection.
- [ ] Start the existing target service, then run install . --target <calendar-project> as a zero-write dry-run.
- [ ] Review every planned path and confirm all writes are under integrations/lark.
- [ ] After review, run install . --target <calendar-project> --apply.
- [ ] Copy integrations/lark/.env.example to the module-local integrations/lark/.env and fill only module settings.
- [ ] Run npm install and npm test inside integrations/lark.
- [ ] Start the calendar service and the isolated Lark module separately; do not change target root startup files.

## Local Completion

- [ ] Status refresh calls only GET /api/state.
- [ ] Ordinary preview calls POST /api/run with mode=dry-run.
- [ ] Formal run uses host-local prepare/confirm/cancel and calls POST /api/run with mode=run only after confirmation.
- [ ] Stop uses host-local prepare/confirm/cancel and calls POST /api/stop only after confirmation.
- [ ] Root project files remain byte-identical after install.

## Real Feishu Level 2

Real Feishu Level 2 is separate from local generation and installation. Complete it only after the real app, long connection, test chat, card clicks, and sanitized evidence are available.
`;
}

function buildCardPlan(service: ServiceManifest, targetProfile = "image-agent-web"): string {
  if (targetProfile === "calendar-stock-updater") return buildCalendarCardPlan(service);
  return `# Card Plan

## Pattern

Use an action card followed by running/success/failure status cards. The success card keeps the feedback loop open when the target returns a session id.

## Start Card

- Header: blue informational state.
- Body: service name, target base URL, MVP capability, and preset generation options.
- Primary action: generate a product image using a safe preset payload.

## Running Card

- Header: blue running state.
- Body: trace ID, template, size, and target service URL.

## Success Card

- Header: green completed state.
- Body: analysis summary, template, size, and image preview if upload succeeds.
- Interaction: feedback input plus iterate action when \`session_id\` is present.
- Footer: trace ID and source service ${service.service.name}.

## Failure Card

- Header: red failed state.
- Body: failed step, error message, target base URL, trace ID.
- Secondary action: send a new start card.
`;
}

function buildCalendarCardPlan(service: ServiceManifest): string {
  return `# Card Plan - Calendar Mode B

## Pattern

Use a process/task operations card with separate status, parameter, action, and recent-log sections. Keep the decision path clear on mobile and use color only for semantic status.

## Status Card

- Header: blue for idle, yellow for running, green for succeeded, red for failed, and grey for stopped.
- Status summary: current state, current message, date range, stock, product range, and start time.
- Refresh action: authorized operators call GET /api/state manually; browser-only GET /api/events is excluded.

## Task Form

- Required fields: target date, stock, normal-operation delay, and date-picker delay.
- Optional fields: start product ID and end product ID.
- Primary safe action: ordinary dry-run preview.
- High-risk action: request formal execution.

## Formal Run Flow

- Prepare: validate the full form without calling a target write endpoint.
- Confirm: show every submitted value and a professional inventory-write risk notice.
- Execute: call POST /api/run with mode=run once after operator-bound confirmation.
- Cancel: discard the host-local confirmation and return to current state.

## Stop Flow

- Prepare: read current state and create an operator-bound host-local confirmation.
- Confirm: state that only the current running task will be stopped, then call POST /api/stop once.
- Cancel: discard the confirmation without calling a target write endpoint.

## Recent Logs

- Show at most the latest 8 entries.
- Preserve an available timestamp, flatten multiline content, truncate long lines, and state the display limit.

## Failure Card

- Header: red failed state.
- Body: concise reason without secrets or raw operator/chat identifiers.
- Recovery: return to the operations card after the operator corrects the issue.

- Source service: ${service.service.name}.
`;
}

export function buildContextReadiness(permissions: RequiredPermissions): string {
  return `# Context Readiness Check

Before real Feishu verification, ask the operator whether these values can be provided:

${permissions.context_requirements.map((item) => `- [ ] ${item}`).join("\n")}

If any item is missing, Lark-deployer should produce the generated package and mark verification as blocked by missing external context rather than guessing credentials or app settings.
`;
}
