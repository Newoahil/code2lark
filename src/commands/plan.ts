import path from "node:path";
import { readJsonFile, writeText } from "../fs-utils.js";
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

  writeText(path.join(workspace, "permission_review.md"), buildPermissionReview(service, capabilities, interactions, permissions));
  writeText(path.join(workspace, "deployment_checklist.md"), buildDeploymentChecklist(service, permissions));
  writeText(path.join(workspace, "card_plan.md"), buildCardPlan(service));
  writeText(path.join(workspace, "context_readiness.md"), buildContextReadiness(permissions));

  console.log(`Plan documents written to ${workspace}`);
}

function buildPermissionReview(
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
  integrationMode: "embedded-adapter" | "standalone-runtime" = "standalone-runtime",
): string {
  if (integrationMode === "embedded-adapter") {
    return `# Deployment Checklist

## Target Service

- [ ] Confirm ${service.service.name} is running outside Lark-deployer.
- [ ] Confirm the existing Feishu SDK host can reach ${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}.
- [ ] Confirm GET /api/meta returns template metadata.

## Feishu/Lark App

${permissions.manual_steps.map((item) => `- [ ] ${item}`).join("\n")}

## Embedded Host Environment

- [ ] Mount generated \`adapter/\` in the existing Feishu SDK service.
- [ ] Store APP_ID, APP_SECRET, VERIFICATION_TOKEN, TEST_CHAT_ID, PUBLIC_CALLBACK_BASE_URL, and target base URL in the existing host service's secret/config system.
- [ ] Fill ENCRYPT_KEY only if encrypted callbacks are enabled in Feishu.
- [ ] Set DEBUG_ACCESS_TOKEN before any host-owned debug endpoints are exposed through a public callback URL.
- [ ] Decide whether ALLOWED_OPERATOR_OPEN_IDS should restrict who can execute card actions in the test chat.
- [ ] Choose the correct Lark-deployer CLI command style for this package:
  - If the package still lives under the original Lark-deployer repository, use \`node ..\\..\\dist\\index.js <command> .\`.
  - If the package was copied elsewhere, set \`$env:LARK_DEPLOYER_CLI="C:\\path\\to\\Lark-deployer\\dist\\index.js"\` and use \`node $env:LARK_DEPLOYER_CLI <command> .\`.
- [ ] Run \`node ..\\..\\dist\\index.js verify . --mode embedded-adapter --strict\` or \`node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter --strict\` from the generated package root.
- [ ] Run \`node ..\\..\\dist\\index.js verify . --mode embedded-adapter --host-runtime-url <host_runtime_url> --simulate\` or \`node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter --host-runtime-url <host_runtime_url> --simulate\` after adapter/ is mounted in the existing host.
- [ ] Configure callback URL to \`<PUBLIC_CALLBACK_BASE_URL>/webhook/card\` on the existing host.
- [ ] Run \`node ..\\..\\dist\\index.js evidence .\` or \`node $env:LARK_DEPLOYER_CLI evidence .\` after verification and review \`level2_evidence_draft.md\`.
- [ ] Run \`node ..\\..\\dist\\index.js doctor . --mode embedded-adapter --gate\` or \`node $env:LARK_DEPLOYER_CLI doctor . --mode embedded-adapter --gate\` and confirm remaining blockers are external host/Level 2 evidence only.
- [ ] Run \`node ..\\..\\dist\\index.js handoff .\` or \`node $env:LARK_DEPLOYER_CLI handoff .\` and exclude local secrets before copying the package.

## Done

- [ ] A real Feishu test chat receives the start card from the existing host.
- [ ] Clicking the preset generate button makes the existing host call adapter/ and ${service.service.name} /api/generate.
- [ ] The result card appears with analysis and generated image or fallback image URL.
- [ ] Batch submit and refresh call adapter/ and ${service.service.name} /api/batch endpoints.
- [ ] Failure paths show readable error cards.
- [ ] level2_verification_record.md contains the final operator, message id or screenshot, trace id, and completion decision.
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

function buildCardPlan(service: ServiceManifest): string {
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

function buildContextReadiness(permissions: RequiredPermissions): string {
  return `# Context Readiness Check

Before real Feishu verification, ask the operator whether these values can be provided:

${permissions.context_requirements.map((item) => `- [ ] ${item}`).join("\n")}

If any item is missing, Lark-deployer should produce the generated package and mark verification as blocked by missing external context rather than guessing credentials or app settings.
`;
}
