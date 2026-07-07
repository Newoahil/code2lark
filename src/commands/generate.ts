import fs from "node:fs";
import path from "node:path";
import { getStringOption, hasOption } from "../args.js";
import { buildContextMarkdown, buildContextReplyMarkdown, buildContextReplyTemplate, buildContextRequestMarkdown, buildContextTemplate, type ContextTemplate } from "./context.js";
import { copyFileIfExists, ensureDir, readJsonFile, slugify, writeJson, writeText } from "../fs-utils.js";
import { buildFormFieldMaps } from "../field-mapping.js";
import { hostModeUsesLongConnection, hostModeUsesWebhook, normalizeHostReceiveMode, type HostReceiveMode, type IntegrationMode } from "../host-mode.js";
import { adapterCardsJs, adapterCardsTs, adapterHandlersJs, adapterHandlersTs, adapterServiceClientJs, adapterServiceClientTs, buildAdapterCardTemplateData, buildPythonHostEndpointsSpec, buildStartCardSpec, pythonHostCardsPy, pythonHostHandlersPy, pythonHostLocalContractTestPy, pythonHostServiceClientPy, runtimeCardsTs, runtimeImageAgentClientTs, runtimeIndexTs, type ImageAgentMeta, type RuntimeFieldSpec } from "../profiles/image-agent-web.js";
import type { CapabilityMap, InteractionContract, RequiredPermissions, ServiceManifest } from "../types.js";
import { buildDeploymentChecklist } from "./plan.js";

export async function generateCommand(args: string[], options: Record<string, string | boolean>): Promise<void> {
  const workspaceArg = args[0];
  if (hasOption(options, "help") || hasOption(options, "h")) {
    console.log(generateUsage());
    return;
  }
  if (!workspaceArg) {
    throw new Error(generateUsage());
  }

  const workspace = path.resolve(workspaceArg);
  const manifestDir = path.join(workspace, "manifest");
  const service = readJsonFile<ServiceManifest>(path.join(manifestDir, "service_manifest.json"));
  const capabilities = readJsonFile<CapabilityMap>(path.join(manifestDir, "capability_map.json"));
  const interactions = readJsonFile<InteractionContract>(path.join(manifestDir, "interaction_contract.json"));
  const permissions = readJsonFile<RequiredPermissions>(path.join(manifestDir, "required_permissions.json"));
  const meta = readOptionalJson<ImageAgentMeta>(path.join(manifestDir, "image_agent_meta.snapshot.json"));
  const targetProfile = capabilities.target_profile || "image-agent-web";
  const defaultOut = path.resolve("generated", `${slugify(service.service.name)}-lark`);
  const outDir = path.resolve(getStringOption(options, "out", defaultOut));
  const integrationMode = normalizeIntegrationMode(getStringOption(options, "mode", getStringOption(options, "integration-mode", getStringOption(options, "integrationMode", "standalone-runtime"))));
  const hostReceiveMode = normalizeHostReceiveMode(getStringOption(options, "host-mode", getStringOption(options, "hostMode", "")), integrationMode);
  if (targetProfile === "generic-http-api" && integrationMode !== "embedded-adapter") {
    throw new Error("generic-http-api targets currently support --mode embedded-adapter only.");
  }
  const adapterDir = path.join(outDir, "adapter");
  const docsDir = path.join(outDir, "docs");
  const sidecarDir = path.join(outDir, "sidecar-long-connection");
  const runtimeDir = path.join(outDir, "bot-runtime");
  const feishuHostDir = path.join(outDir, "feishu-host");

  ensureDir(outDir);
  ensureDir(adapterDir);
  ensureDir(docsDir);
  if (integrationMode === "embedded-adapter" && (hostReceiveMode === "embedded-long-connection" || hostReceiveMode === "hybrid")) ensureDir(sidecarDir);
  if (integrationMode === "standalone-runtime") ensureDir(runtimeDir);
  if (integrationMode === "self-hosted-runtime") ensureDir(feishuHostDir);
  ensureDir(path.join(outDir, "manifest"));

  copyManifestArtifacts(workspace, outDir);
  writeJson(path.join(outDir, "generation_summary.json"), {
    schema_version: "0.1",
    generated_at: new Date().toISOString(),
    source_workspace: workspace,
    service: service.service.name,
    integration_mode: integrationMode,
    host_receive_mode: hostReceiveMode,
    core_artifact: integrationMode === "self-hosted-runtime" ? "feishu-host" : "adapter",
    runtime: integrationMode === "standalone-runtime"
      ? "node-lark-bot-runtime"
      : integrationMode === "self-hosted-runtime" ? "python-feishu-host" : "none",
    target_profile: targetProfile,
    capability_ids: capabilities.capabilities.map((capability) => capability.id),
  });

  writeText(path.join(outDir, ".gitignore"), generatedPackageGitignore());
  writeText(path.join(outDir, "package.json"), generatedPackageJson(service.service.name));
  writeText(path.join(outDir, "START_HERE.md"), buildStartHere(service, integrationMode, hostReceiveMode));
  writeText(path.join(outDir, "README.md"), buildGeneratedReadme(service, permissions, integrationMode, hostReceiveMode, targetProfile, interactions));
  writeText(path.join(outDir, "deployment_checklist.md"), buildDeploymentChecklist(service, permissions, integrationMode));
  writeText(path.join(docsDir, "integration_guide.md"), integrationMode === "self-hosted-runtime" ? buildSelfHostedIntegrationGuide(service) : buildEmbeddedIntegrationGuide(service, permissions, hostReceiveMode, targetProfile, interactions));
  writeLevel2VerificationRecord(path.join(outDir, "level2_verification_record.md"), buildLevel2VerificationRecord(service, permissions, integrationMode, hostReceiveMode));
  writeJson(path.join(outDir, "level2_manual_evidence.template.json"), buildLevel2ManualEvidenceTemplate(service));
  writePackageContext(workspace, outDir, service, permissions, integrationMode, hostReceiveMode);
  if (targetProfile === "generic-http-api") {
    writeGenericAdapterFiles(adapterDir, service, capabilities, interactions);
  } else {
    writeText(path.join(adapterDir, "types.ts"), adapterTypesTs());
    writeText(path.join(adapterDir, "audit-events.ts"), adapterAuditEventsTs());
    writeText(path.join(adapterDir, "validation.ts"), adapterValidationTs());
    writeText(path.join(adapterDir, "service-client.ts"), adapterServiceClientTs());
    writeText(path.join(adapterDir, "cards.ts"), adapterCardsTs(service, capabilities, meta));
    writeText(path.join(adapterDir, "handlers.ts"), adapterHandlersTs(service, capabilities, meta));
    writeRuntimeAdapterJs(adapterDir, service, capabilities, meta);
  }
  if (integrationMode === "embedded-adapter" && (hostReceiveMode === "embedded-long-connection" || hostReceiveMode === "hybrid")) {
    writeText(path.join(sidecarDir, "README.md"), sidecarLongConnectionReadme(service, hostReceiveMode));
    writeText(path.join(sidecarDir, "local-contract-test.mjs"), sidecarLocalContractTestMjs(service));
  } else if (fs.existsSync(sidecarDir)) {
    fs.rmSync(sidecarDir, { recursive: true, force: true });
  }
  if (integrationMode === "standalone-runtime") {
    writeText(path.join(runtimeDir, "package.json"), runtimePackageJson(service.service.name));
    writeText(path.join(runtimeDir, ".gitignore"), runtimeGitignore());
    writeText(path.join(runtimeDir, "tsconfig.json"), runtimeTsconfig());
    writeText(path.join(runtimeDir, ".env.example"), runtimeEnvExample(service));
    writeText(path.join(runtimeDir, "src", "config.ts"), runtimeConfigTs());
    writeText(path.join(runtimeDir, "src", "image-agent-client.ts"), runtimeImageAgentClientTs());
    writeText(path.join(runtimeDir, "src", "cards.ts"), runtimeCardsTs(service, capabilities, meta));
    writeText(path.join(runtimeDir, "src", "audit.ts"), runtimeAuditTs());
    writeText(path.join(runtimeDir, "src", "index.ts"), runtimeIndexTs());
  } else if (fs.existsSync(runtimeDir)) {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
  if (integrationMode === "self-hosted-runtime") {
    writePythonFeishuHost(feishuHostDir, service, capabilities, meta);
  } else if (fs.existsSync(feishuHostDir)) {
    fs.rmSync(feishuHostDir, { recursive: true, force: true });
  }

  console.log(`Generated Lark integration package at ${outDir}`);
  console.log(`Next: review ${path.join(outDir, "README.md")}`);
}

function generateUsage(): string {
  return "Usage: lark-deployer generate <analysis-workspace> [--out <generated-dir>] [--mode embedded-adapter|standalone-runtime|self-hosted-runtime] [--host-mode embedded-webhook|embedded-long-connection|hybrid|standalone-runtime]";
}

function normalizeIntegrationMode(value: string): IntegrationMode {
  const normalized = value.trim() || "standalone-runtime";
  if (normalized === "embedded" || normalized === "embedded-adapter") return "embedded-adapter";
  if (normalized === "standalone" || normalized === "standalone-runtime") return "standalone-runtime";
  if (normalized === "self-hosted" || normalized === "self-hosted-runtime") return "self-hosted-runtime";
  throw new Error('--mode must be "embedded-adapter", "standalone-runtime", or "self-hosted-runtime".');
}

function writeRuntimeAdapterJs(adapterDir: string, service: ServiceManifest, capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): void {
  writeText(path.join(adapterDir, "audit-events.js"), adapterAuditEventsJs());
  writeText(path.join(adapterDir, "cards.js"), adapterCardsJs(service, capabilities, meta));
  writeText(path.join(adapterDir, "validation.js"), adapterValidationJs());
  writeText(path.join(adapterDir, "service-client.js"), adapterServiceClientJs());
  writeText(path.join(adapterDir, "handlers.js"), adapterHandlersJs(service, capabilities, meta));
  writeText(path.join(adapterDir, "handlers.d.ts"), `export function handleImageAgentCardAction(ctx: Record<string, unknown>, deps: Record<string, unknown>): Promise<Record<string, unknown>>;\n`);
  writeText(path.join(adapterDir, "service-client.d.ts"), [
    "export function callImageIterate(baseUrl: string, request: Record<string, unknown>, timeoutMs?: number): Promise<Record<string, unknown>>;",
    "export function callImageBatchCreate(baseUrl: string, request: Record<string, unknown>, timeoutMs?: number): Promise<{ batch_id: string }>;",
    "export function callImageBatchStatus(baseUrl: string, batchId: string, timeoutMs?: number): Promise<Record<string, unknown>>;",
    "export function resolveBatchDownloadUrl(baseUrl: string, batchId: string): string;",
    "",
  ].join("\n"));
}

function writeGenericAdapterFiles(adapterDir: string, service: ServiceManifest, capabilities: CapabilityMap, interactions: InteractionContract): void {
  writeText(path.join(adapterDir, "types.ts"), genericAdapterTypesTs());
  writeText(path.join(adapterDir, "audit-events.ts"), adapterAuditEventsTs());
  writeText(path.join(adapterDir, "validation.ts"), genericAdapterValidationTs());
  writeText(path.join(adapterDir, "service-client.ts"), genericAdapterServiceClientTs());
  writeText(path.join(adapterDir, "cards.ts"), genericAdapterCardsTs(service, capabilities, interactions));
  writeText(path.join(adapterDir, "handlers.ts"), genericAdapterHandlersTs(service, capabilities, interactions));
  writeText(path.join(adapterDir, "audit-events.js"), adapterAuditEventsJs());
  writeText(path.join(adapterDir, "validation.js"), genericAdapterValidationJs());
  writeText(path.join(adapterDir, "service-client.js"), genericAdapterServiceClientJs());
  writeText(path.join(adapterDir, "cards.js"), genericAdapterCardsJs(service, capabilities, interactions));
  writeText(path.join(adapterDir, "handlers.js"), genericAdapterHandlersJs(service, capabilities, interactions));
  writeText(path.join(adapterDir, "handlers.d.ts"), `export function handleGenericHttpCardAction(ctx: Record<string, unknown>, deps: Record<string, unknown>): Promise<Record<string, unknown>>;\n`);
  writeText(path.join(adapterDir, "service-client.d.ts"), `export function callGenericHttpEndpoint(baseUrl: string, method: string, pathTemplate: string, input?: Record<string, unknown>, timeoutMs?: number): Promise<Record<string, unknown>>;\n`);
}

function sidecarLongConnectionReadme(service: ServiceManifest, hostReceiveMode: HostReceiveMode): string {
  return `# Sidecar Long-Connection Gateway Starter

This directory is a starter contract for an external Feishu SDK host/gateway. It keeps \`${service.service.name}\` as a standalone business service and keeps Feishu ingress in a sidecar process.

## Host Receive Mode

- Generated host receive mode: ${hostReceiveMode}
- Feishu ingress: SDK long connection with \`FEISHU_CONNECTION_MODE=websocket\`
- Event to subscribe: \`card.action.trigger\`
- Business target: \`IMAGE_AGENT_BASE_URL=${service.service.base_url || "http://127.0.0.1:8000"}\`

## Sidecar Responsibilities

1. Load \`FEISHU_APP_ID\`, \`FEISHU_APP_SECRET\`, \`FEISHU_CONNECTION_MODE=websocket\`, \`IMAGE_AGENT_BASE_URL\`, and optional \`FEISHU_ALLOWED_USERS\`.
2. Start the Feishu SDK long-connection client and keep it supervised independently of \`${service.service.name}\`.
3. Subscribe to \`card.action.trigger\` and normalize each event into the generated adapter context: \`action\`, \`formValue\`, \`operatorOpenId\`, \`openMessageId\`, and \`openChatId\`.
4. Call \`adapter/handlers.js\` or \`adapter/handlers.ts\` with \`imageAgentBaseUrl\` and return or patch the card produced by the adapter.
5. Send the start card with \`buildStartCard()\`; do not recreate the generated card schema by hand.

## Local Contract Check

Run this from the generated package root after generation:

\`\`\`powershell
node sidecar-long-connection/local-contract-test.mjs
\`\`\`

The script starts an in-process mock \`${service.service.name}\` HTTP API and proves the sidecar contract path: \`card.action.trigger\`-shaped action context -> generated adapter -> \`POST /api/generate\` -> success card.
`;
}

function sidecarLocalContractTestMjs(service: ServiceManifest): string {
  return `import http from "node:http";
import { buildStartCard } from "../adapter/cards.js";
import { handleImageAgentCardAction } from "../adapter/handlers.js";

const requests = [];
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({ method: req.method, url: req.url, body });
    if (req.method === "POST" && req.url === "/api/generate") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ image_url: "https://example.invalid/generated.png", session_id: "session-local-contract", trace_id: "trace-local-contract" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
});

const listen = () => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const close = () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

try {
  await listen();
  const address = server.address();
  const imageAgentBaseUrl = "http://127.0.0.1:" + address.port;
  const startCard = buildStartCard();
  const preset = findPreset(startCard) || {};
  const formValue = buildFormValue(startCard, preset);
  const result = await handleImageAgentCardAction({
    action: "image.generate.submit",
    formValue,
    value: {},
    operatorOpenId: "sidecar-contract-operator",
    openMessageId: "sidecar-contract-message",
    openChatId: "sidecar-contract-chat",
  }, {
    imageAgentBaseUrl,
    timeoutMs: 5000,
    allowedOperatorOpenIds: [],
  });

  const generateRequest = requests.find((item) => item.method === "POST" && item.url === "/api/generate");
  if (!generateRequest) throw new Error("adapter did not call POST /api/generate");
  if (!result.ok) throw new Error("adapter returned failure: " + JSON.stringify(result.card));
  if (!JSON.stringify(result.card).includes("generated.png")) throw new Error("success card did not include generated image URL");
  console.log("sidecar-long-connection contract: PASS for ${service.service.name}");
} finally {
  await close();
}

function buildFormValue(card, preset) {
  const names = [...new Set(collectNames(card))];
  const formValue = {};
  for (const name of names) {
    if (name === "param_template_id") formValue[name] = String(preset.template_id || "default-template");
    else if (name === "param_size") formValue[name] = String(preset.size || "1024x1024");
    else if (name === "param_message") formValue[name] = "Sidecar contract image";
    else if (name.startsWith("field_")) formValue[name] = "Sidecar contract value";
  }
  return formValue;
}

function collectNames(value) {
  if (!value || typeof value !== "object") return [];
  const current = typeof value.name === "string" ? [value.name] : [];
  const children = Array.isArray(value) ? value : Object.values(value);
  return current.concat(children.flatMap(collectNames));
}

function findPreset(value) {
  if (!value || typeof value !== "object") return undefined;
  if (value.preset && typeof value.preset === "object") return value.preset;
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const found = findPreset(child);
    if (found) return found;
  }
  return undefined;
}
`;
}

function writePythonFeishuHost(feishuHostDir: string, service: ServiceManifest, capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): void {
  const specDir = path.join(feishuHostDir, "spec");
  const cardData = buildAdapterCardTemplateData(capabilities, meta);
  writeText(path.join(feishuHostDir, ".env.example"), pythonHostEnvExample(service));
  writeText(path.join(feishuHostDir, "requirements.txt"), pythonHostRequirementsTxt());
  writeText(path.join(feishuHostDir, "config.py"), pythonHostConfigPy());
  writeText(path.join(feishuHostDir, "cards.py"), pythonHostCardsPy());
  writeText(path.join(feishuHostDir, "service_client.py"), pythonHostServiceClientPy());
  writeText(path.join(feishuHostDir, "validation.py"), pythonHostValidationPy());
  writeText(path.join(feishuHostDir, "handlers.py"), pythonHostHandlersPy());
  writeText(path.join(feishuHostDir, "app.py"), pythonHostAppPy());
  writeText(path.join(feishuHostDir, "local_contract_test.py"), pythonHostLocalContractTestPy());
  writeText(path.join(feishuHostDir, "README.md"), pythonHostReadme(service));
  writeJson(path.join(specDir, "preset.json"), cardData.defaultPreset);
  writeJson(path.join(specDir, "field_map.json"), buildPythonHostFieldMapSpec(cardData.fieldSpecs, cardData.fieldMaps));
  writeJson(path.join(specDir, "endpoints.json"), buildPythonHostEndpointsSpec());
  writeJson(path.join(specDir, "start_card.json"), buildStartCardSpec(service, cardData));
  writeJson(path.join(specDir, "template_specs.json"), cardData.templateSpecs);
  writeJson(path.join(specDir, "field_specs.json"), cardData.fieldSpecs);
}

function pythonHostEnvExample(service: ServiceManifest): string {
  return `# Feishu/Lark app credentials. Fill real values in .env; never commit them.
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_CONNECTION_MODE=websocket

# Target image-agent-web HTTP base URL.
IMAGE_AGENT_BASE_URL=${service.service.base_url || "http://127.0.0.1:8000"}

# Optional comma-separated Feishu operator open_id allowlist. Empty allows any valid card click.
FEISHU_ALLOWED_USERS=

# Target HTTP timeout used by the later service client slice.
IMAGE_AGENT_TIMEOUT_MS=120000

# Optional chat id for sending the generated spec/start_card.json during manual Level 2 setup.
TEST_CHAT_ID=
`;
}

function pythonHostRequirementsTxt(): string {
  return `lark-oapi==1.7.0
requests
`;
}

function pythonHostConfigPy(): string {
  return `"""Configuration loader for the generated Feishu Python host.

This module validates the locked self-hosted-runtime environment contract and
does not print or expose secret values. Later runtime slices can import
load_config() before constructing the Feishu SDK long-connection client.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Tuple


REQUIRED_ENV_KEYS = (
    "FEISHU_APP_ID",
    "FEISHU_APP_SECRET",
    "FEISHU_CONNECTION_MODE",
    "IMAGE_AGENT_BASE_URL",
)


@dataclass(frozen=True)
class HostConfig:
    feishu_app_id: str
    feishu_app_secret: str
    feishu_connection_mode: str
    image_agent_base_url: str
    feishu_allowed_users: Tuple[str, ...]
    image_agent_timeout_ms: int
    test_chat_id: str

    def safe_summary(self) -> dict:
        return {
            "feishu_app_id_present": bool(self.feishu_app_id),
            "feishu_app_secret_present": bool(self.feishu_app_secret),
            "feishu_connection_mode": self.feishu_connection_mode,
            "image_agent_base_url": self.image_agent_base_url,
            "feishu_allowed_user_count": len(self.feishu_allowed_users),
            "image_agent_timeout_ms": self.image_agent_timeout_ms,
            "test_chat_id_present": bool(self.test_chat_id),
        }


def load_dotenv(path: Path | None = None) -> None:
    env_path = path or Path(__file__).with_name(".env")
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


def load_config() -> HostConfig:
    load_dotenv()
    values = {key: os.environ.get(key, "").strip() for key in REQUIRED_ENV_KEYS}
    missing = [key for key, value in values.items() if not value]
    if missing:
        raise RuntimeError("Missing required environment variables: " + ", ".join(missing))
    if values["FEISHU_CONNECTION_MODE"] != "websocket":
        raise RuntimeError("FEISHU_CONNECTION_MODE must be websocket for self-hosted-runtime.")
    timeout_ms = _read_timeout_ms(os.environ.get("IMAGE_AGENT_TIMEOUT_MS", "120000"))
    return HostConfig(
        feishu_app_id=values["FEISHU_APP_ID"],
        feishu_app_secret=values["FEISHU_APP_SECRET"],
        feishu_connection_mode=values["FEISHU_CONNECTION_MODE"],
        image_agent_base_url=values["IMAGE_AGENT_BASE_URL"].rstrip("/"),
        feishu_allowed_users=_read_csv(os.environ.get("FEISHU_ALLOWED_USERS", "")),
        image_agent_timeout_ms=timeout_ms,
        test_chat_id=os.environ.get("TEST_CHAT_ID", "").strip(),
    )


def _read_csv(value: str) -> Tuple[str, ...]:
    return tuple(item.strip() for item in value.split(",") if item.strip())


def _read_timeout_ms(value: str) -> int:
    try:
        timeout_ms = int(value.strip())
    except ValueError as exc:
        raise RuntimeError("IMAGE_AGENT_TIMEOUT_MS must be an integer number of milliseconds.") from exc
    if timeout_ms <= 0:
        raise RuntimeError("IMAGE_AGENT_TIMEOUT_MS must be greater than 0.")
    return timeout_ms
`;
}

function pythonHostValidationPy(): string {
  return `"""Validation helpers for generated Feishu card actions."""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List


SIZE_PATTERN = re.compile(r"^[1-9]\\d*x[1-9]\\d*$", re.IGNORECASE)


def assert_allowed_operator(operator_open_id: str, allowed_users: Iterable[str] | None) -> None:
    allowed = [item for item in (allowed_users or []) if item]
    if allowed and operator_open_id not in allowed:
        raise ValueError("Operator is not authorized to execute this card action.")


def validate_size(size: str) -> None:
    if not SIZE_PATTERN.match(str(size or "").strip()):
        raise ValueError("Size must use WIDTHxHEIGHT, for example 1024x1024.")


def validate_required_fields(template_id: str, fields: Dict[str, Any], template_specs: List[Dict[str, Any]], field_specs: List[Dict[str, Any]]) -> None:
    required_keys = []
    for template in template_specs:
        if template.get("id") == template_id:
            required_keys = list(template.get("requiredFieldKeys") or [])
            break
    labels = {field.get("key"): field.get("label") or field.get("key") for field in field_specs}
    for key in required_keys:
        value = fields.get(key)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(str(labels.get(key) or key) + " is required.")


def validate_batch_items(items: Any) -> List[Dict[str, Any]]:
    if not isinstance(items, list) or not items:
        raise ValueError("Batch items JSON must include at least one item.")
    normalized = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError("Batch item " + str(index) + " must be an object.")
        fields = item.get("fields")
        if not isinstance(fields, dict):
            raise ValueError("Batch item " + str(index) + " must include a fields object.")
        normalized.append({"fields": fields})
    return normalized
`;
}

function pythonHostAppPy(): string {
  return `"""Feishu long-connection host entrypoint for self-hosted-runtime."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

import cards
import config
import handlers


def build_lark_wiring(host_config: config.HostConfig):
    import threading
    import lark_oapi as lark
    from lark_oapi.event.callback.model.p2_card_action_trigger import (
        P2CardActionTrigger,
        P2CardActionTriggerResponse,
    )
    from lark_oapi.api.im.v1 import PatchMessageRequest, PatchMessageRequestBody

    # Separate API client for message.patch (ws.Client is ingress-only).
    api_client = lark.Client.builder().app_id(host_config.feishu_app_id).app_secret(host_config.feishu_app_secret).build()

    def _patch_card(message_id: str, card: dict) -> None:
        if not message_id:
            print("patch skipped: no open_message_id", file=sys.stderr)
            return
        try:
            body = PatchMessageRequestBody.builder().content(json.dumps(card, ensure_ascii=False)).build()
            req = PatchMessageRequest.builder().message_id(message_id).request_body(body).build()
            resp = api_client.im.v1.message.patch(req)
            if resp.success():
                print("patch card ok message_id=" + message_id)
            else:
                print("patch card failed: code=" + str(getattr(resp, "code", "")) + " msg=" + str(getattr(resp, "msg", "")), file=sys.stderr)
        except Exception as exc:
            print("patch card exception: " + str(exc), file=sys.stderr)

    def callback(event: P2CardActionTrigger) -> P2CardActionTriggerResponse:
        # Extract action and message_id quickly before returning.
        action = ""
        message_id = ""
        try:
            normalized_quick = handlers.normalize_card_action(event)
            action = normalized_quick["action"]
            message_id = normalized_quick["openMessageId"]
        except Exception:
            pass

        # Return a running card immediately to satisfy Feishu's 3-second callback deadline.
        # The actual generation runs in a background thread and patches the card when done.
        def _process() -> None:
            result = handlers.handle_card_action(event, {
                "image_agent_base_url": host_config.image_agent_base_url,
                "timeout_ms": host_config.image_agent_timeout_ms,
                "allowed_operator_open_ids": host_config.feishu_allowed_users,
            })
            print("card action done ok=" + str(bool(result.get("ok"))) + (" action=" + action if action else ""))
            for item in result.get("auditEvents") or []:
                print("audit " + json.dumps(item, ensure_ascii=False, sort_keys=True))
            _patch_card(message_id, result["card"])

        threading.Thread(target=_process, daemon=True).start()
        print("card.action.trigger action=" + (action or "unknown") + " message_id=" + (message_id or "none") + " → async running")
        return P2CardActionTriggerResponse({"card": {"type": "raw", "data": cards.build_running_card(action)}})

    event_handler = lark.EventDispatcherHandler.builder('', '').register_p2_card_action_trigger(callback).build()
    client = lark.ws.Client(host_config.feishu_app_id, host_config.feishu_app_secret, event_handler=event_handler, log_level=lark.LogLevel.INFO)
    return event_handler, client


def send_start_card() -> dict[str, Any]:
    import lark_oapi as lark
    from lark_oapi.api.im.v1 import CreateMessageRequest, CreateMessageRequestBody

    config.load_dotenv()
    feishu_app_id = os.environ.get("FEISHU_APP_ID", "").strip()
    feishu_app_secret = os.environ.get("FEISHU_APP_SECRET", "").strip()
    missing = [key for key, value in (("FEISHU_APP_ID", feishu_app_id), ("FEISHU_APP_SECRET", feishu_app_secret)) if not value]
    if missing:
        raise RuntimeError("Missing required environment variables for start card: " + ", ".join(missing))
    payload = build_start_message_request()
    client = lark.Client.builder().app_id(feishu_app_id).app_secret(feishu_app_secret).build()
    body = CreateMessageRequestBody.builder().receive_id(payload["receive_id"]).msg_type(payload["msg_type"]).content(payload["content"]).build()
    request = CreateMessageRequest.builder().receive_id_type(payload["receive_id_type"]).request_body(body).build()
    try:
        response = client.im.v1.message.create(request)
    except Exception as exc:
        # lark-oapi raises (for example ObtainAccessTokenException) when credentials or app state are invalid,
        # rather than returning a response. Report the same clean way as an API error code.
        code = getattr(exc, "code", "")
        msg = getattr(exc, "msg", "") or str(exc)
        print("send failed: code=" + str(code) + " msg=" + str(msg), file=sys.stderr)
        return {"ok": False}
    if response.success():
        data = getattr(response, "data", None)
        message_id = getattr(data, "message_id", "") if data is not None else ""
        print("sent start card: message_id=" + str(message_id))
        return {"ok": True, "message_id": message_id}
    print("send failed: code=" + str(getattr(response, "code", "")) + " msg=" + str(getattr(response, "msg", "")), file=sys.stderr)
    return {"ok": False}


def build_start_message_request() -> dict[str, Any]:
    config.load_dotenv()
    test_chat_id = os.environ.get("TEST_CHAT_ID", "").strip()
    if not test_chat_id:
        raise RuntimeError("TEST_CHAT_ID is required to send the start card.")
    return {
        "receive_id": test_chat_id,
        "receive_id_type": "chat_id",
        "msg_type": "interactive",
        "content": json.dumps(cards.load_start_card(), ensure_ascii=False),
    }


def selfcheck() -> int:
    try:
        import lark_oapi as lark  # noqa: F401
    except ModuleNotFoundError as exc:
        print("selfcheck: lark-oapi unavailable; install requirements.txt to run SDK wiring selfcheck", file=sys.stderr)
        raise SystemExit(2) from exc
    dummy = config.HostConfig(
        feishu_app_id="selfcheck_app_id",
        feishu_app_secret="selfcheck_app_secret",
        feishu_connection_mode="websocket",
        image_agent_base_url="http://127.0.0.1:8000",
        feishu_allowed_users=(),
        image_agent_timeout_ms=120000,
        test_chat_id="",
    )
    event_handler, client = build_lark_wiring(dummy)
    start_card = cards.load_start_card()
    print("selfcheck: card.action.trigger registered")
    print("selfcheck: lark.ws.Client constructed without start()")
    print("selfcheck: config " + json.dumps(dummy.safe_summary(), ensure_ascii=False, sort_keys=True))
    print("selfcheck: start_card_elements=" + str(len(start_card.get("elements", []))))
    if event_handler is None or client is None:
        raise RuntimeError("selfcheck failed to construct Feishu SDK wiring")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generated Feishu Python host")
    parser.add_argument("--selfcheck", action="store_true", help="Build SDK wiring without opening a Feishu connection")
    parser.add_argument("--send-start-card", action="store_true", help="Send the generated start card to TEST_CHAT_ID")
    args = parser.parse_args(argv)
    if args.selfcheck:
        return selfcheck()
    if args.send_start_card:
        try:
            result = send_start_card()
        except RuntimeError as exc:
            print("send failed: " + str(exc), file=sys.stderr)
            return 2
        return 0 if result.get("ok") else 1
    host_config = config.load_config()
    _event_handler, client = build_lark_wiring(host_config)
    print("Starting Feishu long-connection host for card.action.trigger")
    client.start()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;
}

function pythonHostReadme(service: ServiceManifest): string {
  return [
    "# Feishu Python Host Scaffold",
    "",
    `This directory is the generated \`self-hosted-runtime\` package for \`${service.service.name}\`. It includes the Python card renderer, service client, validation, handlers, Feishu SDK selfcheck entrypoint, and localhost contract test.`,
    "",
    "## Files",
    "",
    "- `.env.example`: locked environment contract for the Python host.",
    "- `requirements.txt`: Python dependencies required by the Feishu SDK host path.",
    "- `config.py`: syntactically valid config loader with secret-safe validation.",
    "- `cards.py`, `service_client.py`, `validation.py`, `handlers.py`, `app.py`: Python runtime files for card rendering, target HTTP calls, action validation/routing, and SDK wiring selfcheck.",
    "- `local_contract_test.py`: stdlib localhost mock test for handler-to-target behavior without Feishu.",
    "- `spec/start_card.json`: generated Feishu start card, rendered from the TypeScript manifest/card builder logic.",
    "- `spec/preset.json`, `spec/template_specs.json`, `spec/field_specs.json`, `spec/field_map.json`, `spec/endpoints.json`: manifest-derived contracts for later Python runtime slices.",
    "",
    "## Setup",
    "",
    "```powershell",
    "python -m venv .venv",
    ".\\.venv\\Scripts\\python -m pip install -r requirements.txt",
    "Copy-Item .env.example .env",
    "# Fill FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_CONNECTION_MODE=websocket, and IMAGE_AGENT_BASE_URL.",
    "python local_contract_test.py",
    "python app.py --selfcheck",
    "python app.py --send-start-card",
    "```",
    "",
    `The target service remains external. The Python host will call \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}\` over HTTP through the endpoint contract in \`spec/endpoints.json\`.`,
    "",
  ].join("\n");
}

function buildPythonHostFieldMapSpec(
  fieldSpecs: RuntimeFieldSpec[],
  fieldMaps: ReturnType<typeof buildFormFieldMaps>,
): Record<string, unknown> {
  return {
    schema_version: "0.1",
    templateKeyToFormField: fieldMaps.templateKeyToFormField,
    formFieldToTemplateKey: fieldMaps.formFieldToTemplateKey,
    fields: fieldSpecs.map((field) => ({
      template_key: field.key,
      form_field: fieldMaps.templateKeyToFormField[field.key] || field.name,
      label: field.label,
      required: field.required,
      required_for: field.requiredFor,
      placeholder: field.placeholder,
      default_value: field.defaultValue,
    })),
  };
}

function writeLevel2VerificationRecord(recordPath: string, content: string): void {
  const templatePath = recordPath.replace(/\.md$/i, ".template.md");
  if (fs.existsSync(recordPath)) {
    const existing = fs.readFileSync(recordPath, "utf8");
    if (hasManualLevel2Evidence(existing)) {
      writeText(templatePath, content);
      writeText(recordPath, mergeLevel2VerificationRecord(existing, content));
      console.log(`Preserved existing Level 2 evidence record at ${recordPath}`);
      console.log(`Fresh Level 2 record template written to ${templatePath}`);
      return;
    }
  }

  writeText(recordPath, content);
  if (fs.existsSync(templatePath)) {
    fs.rmSync(templatePath);
  }
}

function mergeLevel2VerificationRecord(existing: string, template: string): string {
  let merged = template;
  for (const field of LEVEL2_RECORD_PRESERVE_FIELDS) {
    const value = readRecordField(existing, field);
    if (value) {
      merged = fillRecordField(merged, field, value);
    }
  }

  const checkedLabels = new Set(
    Array.from(existing.matchAll(/^\s*-\s*\[[xX]\]\s*(.+?)\s*$/gm))
      .map((match) => normalizeChecklistLabel(match[1] || ""))
      .filter(Boolean),
  );
  merged = merged.replace(/^(\s*-\s*)\[\s\](\s*)(.+?)\s*$/gm, (line, prefix: string, spacing: string, label: string) => {
    return checkedLabels.has(normalizeChecklistLabel(label)) ? `${prefix}[x]${spacing}${label}` : line;
  });

  return merged;
}

function hasManualLevel2Evidence(content: string): boolean {
  if (/-\s*\[[xX]\]/.test(content)) return true;
  return LEVEL2_RECORD_PRESERVE_FIELDS.some((field) => hasFilledRecordField(content, field));
}

const LEVEL2_RECORD_PRESERVE_FIELDS = [
  "Date",
  "Operator",
  "Generated package path",
  "Bot runtime URL",
  "Public callback URL",
  "Feishu app name",
  "Test chat",
  "`verification_report.md` path",
  "verification_report.md path",
  "`bot-runtime/audit.log` path",
  "bot-runtime/audit.log path",
  "Start card message ID",
  "Result card message ID or screenshot",
  "Generated image URL or image key",
  "Batch ID",
  "Batch status card message ID or screenshot",
  "Batch download URL or screenshot",
  "Trace ID",
  "Notes",
];

function hasFilledRecordField(content: string, field: string): boolean {
  return Boolean(readRecordField(content, field));
}

function readRecordField(content: string, field: string): string {
  const pattern = new RegExp(`^-\\s*${escapeRegExp(field)}:[^\\S\\r\\n]*(.*?)\\s*$`, "im");
  const value = content.match(pattern)?.[1]?.trim() || "";
  return value && !value.includes("<") ? value : "";
}

function fillRecordField(content: string, field: string, value: string): string {
  const pattern = new RegExp(`^(-\\s*${escapeRegExp(field)}:[^\\S\\r\\n]*)([^\\r\\n]*)$`, "im");
  return content.replace(pattern, (_line, prefix: string, currentValue: string) => {
    return readRecordValueCanBeFilled(currentValue) ? `${prefix.replace(/[^\S\r\n]*$/, " ")}${value}` : `${prefix}${currentValue}`;
  });
}

function readRecordValueCanBeFilled(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || trimmed.includes("<");
}

function normalizeChecklistLabel(value: string): string {
  return value
    .replace(/`node \.\.\\\.\.\\dist\\index\.js\s+/g, "`")
    .replace(/`verify \. /g, "`")
    .replace(/\s+using the command style above\./g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readOptionalJson<T>(filePath: string): T | undefined {
  return fs.existsSync(filePath) ? readJsonFile<T>(filePath) : undefined;
}

function writePackageContext(
  workspace: string,
  outDir: string,
  service: ServiceManifest,
  permissions: RequiredPermissions,
  integrationMode: IntegrationMode,
  hostReceiveMode: HostReceiveMode,
): void {
  const sourceContext = readOptionalJson<Partial<ContextTemplate>>(path.join(workspace, "feishu_context.template.json"));
  const mergedContext = mergeContextValues(
    buildContextTemplate(service, permissions, {
      generatedPackageHint: packageHintFromProjectRoot(outDir),
      packageRootCliPath: toCliPath(path.relative(outDir, path.resolve("dist", "index.js"))),
      integrationMode,
      hostReceiveMode,
    }),
    sourceContext,
  );
  const templateContext = sanitizeContextTemplate(mergedContext);

  writeJson(path.join(outDir, "feishu_context.template.json"), templateContext);
  writeText(path.join(outDir, "feishu_context.template.md"), buildContextMarkdown(templateContext));
  writeText(path.join(outDir, "feishu_context.request.md"), buildContextRequestMarkdown(templateContext));
  const replyTemplate = buildContextReplyTemplate(templateContext);
  writeJson(path.join(outDir, "feishu_context.reply.template.json"), replyTemplate);
  writeText(path.join(outDir, "feishu_context.reply.template.md"), buildContextReplyMarkdown(replyTemplate));
  const localContextPath = path.join(outDir, "feishu_context.local.json");
  if (hasLocalContextValues(mergedContext, templateContext)) {
    writeJson(localContextPath, mergedContext);
  } else if (fs.existsSync(localContextPath)) {
    fs.rmSync(localContextPath);
  }
}

function mergeContextValues(base: ContextTemplate, source: Partial<ContextTemplate> | undefined): ContextTemplate {
  if (!source) return base;
  return {
    ...base,
    target_service: {
      ...base.target_service,
      ...source.target_service,
    },
    runtime_config: {
      ...base.runtime_config,
      ...source.runtime_config,
    },
    feishu_app: {
      ...base.feishu_app,
      ...source.feishu_app,
    },
  };
}

function sanitizeContextTemplate(context: ContextTemplate): ContextTemplate {
  return {
    ...context,
    feishu_app: {
      ...context.feishu_app,
      app_secret: "",
      verification_token: "",
      encrypt_key: "",
    },
    runtime_config: {
      ...context.runtime_config,
      debug_access_token: "",
    },
  };
}

function hasLocalContextValues(localContext: ContextTemplate, templateContext: ContextTemplate): boolean {
  return JSON.stringify(localContext.feishu_app) !== JSON.stringify(templateContext.feishu_app)
    || JSON.stringify(localContext.runtime_config) !== JSON.stringify(templateContext.runtime_config);
}

function packageHintFromProjectRoot(outDir: string): string {
  const relative = path.relative(process.cwd(), outDir);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return toCliPath(relative);
  }
  return toCliPath(outDir);
}

function toCliPath(value: string): string {
  return value.replace(/\//g, "\\") || ".";
}

function copyManifestArtifacts(workspace: string, outDir: string): void {
  const sourceManifest = path.join(workspace, "manifest");
  const targetManifest = path.join(outDir, "manifest");
  if (fs.existsSync(sourceManifest)) {
    for (const entry of fs.readdirSync(sourceManifest)) {
      copyFileIfExists(path.join(sourceManifest, entry), path.join(targetManifest, entry));
    }
  }

  for (const entry of [
    "analysis_report.md",
    "permission_review.md",
    "deployment_checklist.md",
    "card_plan.md",
    "context_readiness.md",
    "feishu_context.template.json",
    "feishu_context.template.md",
    "feishu_context.request.md",
    "feishu_context.reply.template.json",
    "feishu_context.reply.template.md",
  ]) {
    copyFileIfExists(path.join(workspace, entry), path.join(outDir, entry));
  }
}

function generatedPackageGitignore(): string {
  return `# Local secrets and generated runtime artifacts
bot-runtime/.env
bot-runtime/node_modules/
bot-runtime/dist/
bot-runtime/tmp/
bot-runtime/audit.log
bot-runtime/*.log
feishu-host/.env
feishu-host/.venv/
feishu-host/__pycache__/
feishu-host/*.pyc

# Local-only filled context copies. Keep feishu_context.template.json reviewable.
feishu_context.local.json
feishu_context.reply.local.json
feishu_context.reply.local.md
level2_manual_evidence.local.json

# Verification reports can be regenerated and may include local machine paths.
verification_report.json
verification_report.md
configure_report.json
configure_report.md
`;
}

function generatedPackageJson(serviceName: string): string {
  return `${JSON.stringify({
    name: `${slugify(serviceName)}-lark-adapter`,
    private: true,
    type: "module",
  }, null, 2)}\n`;
}

function runtimeGitignore(): string {
  return `# Local secrets
.env

# Dependencies and build output
node_modules/
dist/
tmp/

# Runtime audit/log output
audit.log
*.log
`;
}

function buildLevel2ManualEvidenceTemplate(service: ServiceManifest): Record<string, unknown> {
  return {
    schema_version: "0.1",
    purpose: "Copy this file to level2_manual_evidence.local.json and fill real Feishu Level 2 observations. The local file is ignored by git and sanitized handoff.",
    target_service: service.service.name,
    instructions: [
      "Do not paste APP_SECRET, VERIFICATION_TOKEN, ENCRYPT_KEY, or DEBUG_ACCESS_TOKEN here.",
      "Use result_message_id when you can read the Feishu message id; use result_screenshot for a local screenshot path or shared evidence URL.",
      "Use batch_status_message_id or batch_status_screenshot for the real Feishu batch progress card; use batch_download_url or batch_download_screenshot for the completed batch download evidence.",
      "Run `node $env:LARK_DEPLOYER_CLI evidence . --manual-evidence level2_manual_evidence.local.json --update-record` from the generated package root to copy blank fields into level2_verification_record.md. If the package still lives under the original Lark-deployer repo, `node ..\\..\\dist\\index.js evidence . ...` also works.",
      "This helper never checks completion boxes; the human verifier still decides final sign-off.",
    ],
    values: {
      date: "",
      operator: "",
      feishu_app_name: "",
      test_chat: "",
      start_message_id: "",
      result_message_id: "",
      result_screenshot: "",
      generated_image_url: "",
      generated_image_key: "",
      batch_id: "",
      batch_status_message_id: "",
      batch_status_screenshot: "",
      batch_download_url: "",
      batch_download_screenshot: "",
      trace_id: "",
      notes: "",
    },
  };
}

function buildStartHere(service: ServiceManifest, integrationMode: IntegrationMode, hostReceiveMode: HostReceiveMode): string {
  const hostModeOption = integrationMode === "embedded-adapter" && hostReceiveMode !== "embedded-webhook" ? ` --host-mode ${hostReceiveMode}` : "";
  const usesWebhook = hostModeUsesWebhook(hostReceiveMode);
  const usesLongConnection = hostModeUsesLongConnection(hostReceiveMode);
  const level2HostRequirement = usesWebhook && usesLongConnection
    ? "a public callback URL, an online long-connection host subscribed to `card.action.trigger`"
    : usesLongConnection
      ? "an online long-connection host subscribed to `card.action.trigger`"
      : "a public callback URL";
  const ownerFields = usesWebhook && usesLongConnection
    ? "`APP_ID`, `APP_SECRET`, `VERIFICATION_TOKEN`, `TEST_CHAT_ID`, `PUBLIC_CALLBACK_BASE_URL`, the long-connection host lifecycle, and the reachable target URL"
    : usesLongConnection
      ? "`APP_ID`, `APP_SECRET`, `TEST_CHAT_ID`, the long-connection host lifecycle, and the reachable target URL"
      : "`APP_ID`, `APP_SECRET`, `VERIFICATION_TOKEN`, `TEST_CHAT_ID`, `PUBLIC_CALLBACK_BASE_URL`, and the reachable target URL";
  const afterContext = integrationMode === "standalone-runtime"
    ? `\`\`\`powershell
node $env:LARK_DEPLOYER_CLI init-local . --context --reply
# Fill feishu_context.local.json locally. Do not commit or share it.
node $env:LARK_DEPLOYER_CLI configure . --strict --dry-run
node $env:LARK_DEPLOYER_CLI configure . --strict
cd bot-runtime
npm install
npm run build
npm start
\`\`\`

In a second terminal from the package root:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI verify . --runtime-url http://127.0.0.1:3978 --level2
node $env:LARK_DEPLOYER_CLI evidence . --runtime-url http://127.0.0.1:3978 --update-record
node $env:LARK_DEPLOYER_CLI doctor . --out doctor_report.json --probe-target --gate
\`\`\``
    : `\`\`\`powershell
node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter${hostModeOption} --strict
# After adapter/ is mounted in your existing Feishu SDK host:
node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter${hostModeOption} --host-runtime-url http://127.0.0.1:3978 --simulate
node $env:LARK_DEPLOYER_CLI doctor . --mode embedded-adapter${hostModeOption} --gate
\`\`\``;
  return `# Start Here

This generated package connects \`${service.service.name}\` to Feishu/Lark card actions for MVP-1A verification. The core generated artifact is \`adapter/\`${integrationMode === "standalone-runtime" ? "; \`bot-runtime/\` is the optional standalone reference host." : ". This package was generated in embedded-adapter mode and does not include \`bot-runtime/\`."}

Host receive mode: ${hostReceiveMode}

## Boundary

- Lark-deployer built this package; it does not start or supervise \`${service.service.name}\`.
- Keep real secrets out of shared Markdown. Use \`feishu_context.local.json\`${integrationMode === "standalone-runtime" ? " or `bot-runtime/.env`" : " or the existing host service's secret store"} locally.
- Real MVP completion still requires a Feishu app, a test chat, ${level2HostRequirement}, and a real card click/result observation.

## First 10 Minutes

1. Review \`adapter/\` and \`docs/integration_guide.md\` if you already have a Feishu SDK service.
2. Read \`doctor_report.md\` for the current blocker list.
3. Send \`feishu_context.request.md\` to the Feishu app owner/FDE.
4. Use \`feishu_context.reply.template.json\` or \`feishu_context.reply.template.md\` to record non-secret answers, then confirm who owns ${ownerFields}.
5. If this package was copied outside the Lark-deployer repo, set the CLI path:

\`\`\`powershell
$env:LARK_DEPLOYER_CLI="C:\\path\\to\\Lark-deployer\\dist\\index.js"
\`\`\`

6. From this package root, rerun the current gate:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI status .
node $env:LARK_DEPLOYER_CLI doctor .
\`\`\`

If this package still lives under the original Lark-deployer repository, the README also shows the relative \`node ..\\..\\dist\\index.js ...\` commands.

## After Feishu Context Arrives

${afterContext}

## Evidence To Capture

- Start card message ID.
- Result card message ID or screenshot.
- Generated image URL or Feishu image key.
- Batch ID.
- Batch status card message ID or screenshot.
- Batch download URL or screenshot.
- Runtime trace ID.
- Final checked completion section in \`level2_verification_record.md\`.
`;
}

function adapterTypesTs(): string {
  return `export interface GeneratePreset {
  template_id: string;
  size: string;
  fields: Record<string, string>;
  message?: string;
}

export interface IterateRequest {
  session_id: string;
  feedback: string;
}

export interface BatchRequest {
  template_id: string;
  size: string;
  items: Array<{ fields: Record<string, string> }>;
}

export interface AdapterActionContext {
  action: string;
  value?: Record<string, unknown>;
  formValue?: Record<string, unknown>;
  operatorOpenId?: string;
  openMessageId?: string;
  openChatId?: string;
}

export interface AdapterDependencies {
  imageAgentBaseUrl: string;
  timeoutMs?: number;
  allowedOperatorOpenIds?: string[];
}

export interface AdapterAuditEvent {
  event: string;
  detail: Record<string, unknown>;
}

export interface AdapterResult {
  ok: boolean;
  card: Record<string, unknown>;
  result?: Record<string, unknown>;
  batchId?: string;
  batchStatus?: Record<string, unknown>;
  downloadUrl?: string;
  auditEvents: AdapterAuditEvent[];
}
`;
}

function adapterAuditEventsTs(): string {
  return `import type { AdapterAuditEvent } from "./types.js";

export function auditEvent(event: string, detail: Record<string, unknown> = {}): AdapterAuditEvent {
  return { event, detail };
}
`;
}

function adapterValidationTs(): string {
  return `import type { GeneratePreset } from "./types.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function assertAllowedOperator(operatorOpenId: string | undefined, allowedOperatorOpenIds: string[] | undefined): void {
  if (!allowedOperatorOpenIds?.length) return;
  if (!operatorOpenId || !allowedOperatorOpenIds.includes(operatorOpenId)) {
    throw new Error("Operator is not authorized to execute this card action.");
  }
}

export function validateSize(size: string): void {
  if (!/^([1-9]\\d*)x([1-9]\\d*)$/i.test(size.trim())) {
    throw new Error("Invalid image size: " + size);
  }
}

export function mergeGeneratePresetWithFormValue(preset: GeneratePreset, formValue: Record<string, unknown> | undefined, formFieldToTemplateKey: Record<string, string> = {}): GeneratePreset {
  if (!formValue) return preset;
  const fields = { ...preset.fields };
  for (const [key, value] of Object.entries(formValue)) {
    if (key.startsWith("field_") && typeof value === "string") {
      fields[formFieldToTemplateKey[key] || key.slice("field_".length)] = value;
    }
  }
  const merged = {
    ...preset,
    template_id: stringValue(formValue.param_template_id) || preset.template_id,
    size: stringValue(formValue.param_size) || preset.size,
    message: stringValue(formValue.param_message) || preset.message,
    fields,
  };
  validateSize(merged.size);
  return merged;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
`;
}

function adapterAuditEventsJs(): string {
  return `export function auditEvent(event, detail = {}) {
  return { event, detail };
}
`;
}

function adapterValidationJs(): string {
  return `export function assertAllowedOperator(operatorOpenId, allowedOperatorOpenIds) {
  if (!Array.isArray(allowedOperatorOpenIds) || allowedOperatorOpenIds.length === 0) return;
  if (!operatorOpenId || !allowedOperatorOpenIds.includes(operatorOpenId)) {
    throw new Error("Operator is not authorized to execute this card action.");
  }
}

export function mergeGeneratePresetWithFormValue(preset, formValue, formFieldToTemplateKey = {}) {
  if (!formValue || typeof formValue !== "object") return preset;
  const fields = { ...preset.fields };
  for (const [key, value] of Object.entries(formValue)) {
    if (key.startsWith("field_") && typeof value === "string") {
      fields[formFieldToTemplateKey[key] || key.slice("field_".length)] = value.trim();
    }
  }
  const merged = {
    ...preset,
    template_id: stringValue(formValue.param_template_id) || preset.template_id,
    size: stringValue(formValue.param_size) || preset.size,
    message: stringValue(formValue.param_message) || preset.message,
    fields,
  };
  validateSize(merged.size);
  return merged;
}

export function validateSize(size) {
  if (!/^([1-9]\\d*)x([1-9]\\d*)$/i.test(String(size || "").trim())) {
    throw new Error("Size must use WIDTHxHEIGHT, for example 1024x1024.");
  }
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
`;
}

function genericAdapterTypesTs(): string {
  return `export interface GenericAdapterActionContext {
  action: string;
  value?: Record<string, unknown>;
  formValue?: Record<string, unknown>;
  operatorOpenId?: string;
  openMessageId?: string;
  openChatId?: string;
}

export interface GenericAdapterDependencies {
  targetBaseUrl: string;
  timeoutMs?: number;
  allowedOperatorOpenIds?: string[];
}

export interface AdapterAuditEvent {
  event: string;
  detail: Record<string, unknown>;
}

export interface GenericAdapterResult {
  ok: boolean;
  card: Record<string, unknown>;
  result?: Record<string, unknown>;
  auditEvents: AdapterAuditEvent[];
}
`;
}

function genericAdapterValidationTs(): string {
  return `export function assertAllowedOperator(operatorOpenId: string | undefined, allowedOperatorOpenIds: string[] | undefined): void {
  if (!allowedOperatorOpenIds?.length) return;
  if (!operatorOpenId || !allowedOperatorOpenIds.includes(operatorOpenId)) {
    throw new Error("Operator is not authorized to execute this card action.");
  }
}

export function readFormInput(value: Record<string, unknown> | undefined): Record<string, unknown> {
  return value && typeof value === "object" ? value : {};
}
`;
}

function genericAdapterValidationJs(): string {
  return `export function assertAllowedOperator(operatorOpenId, allowedOperatorOpenIds) {
  if (!Array.isArray(allowedOperatorOpenIds) || allowedOperatorOpenIds.length === 0) return;
  if (!operatorOpenId || !allowedOperatorOpenIds.includes(operatorOpenId)) {
    throw new Error("Operator is not authorized to execute this card action.");
  }
}

export function readFormInput(value) {
  return value && typeof value === "object" ? value : {};
}
`;
}

function genericAdapterServiceClientTs(): string {
  return `export async function callGenericHttpEndpoint(baseUrl: string, method: string, pathTemplate: string, input: Record<string, unknown> = {}, timeoutMs = 30000): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(renderPath(baseUrl, pathTemplate, input));
    const init: RequestInit = { method, signal: controller.signal };
    if (method !== "GET") {
      init.headers = { "Content-Type": "application/json; charset=utf-8" };
      init.body = JSON.stringify(input.body_json && typeof input.body_json === "object" ? input.body_json : input);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    const parsed = parseJson(text);
    if (!response.ok) {
      throw new Error(method + " " + pathTemplate + " returned HTTP " + response.status + ": " + text);
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function renderPath(baseUrl: string, pathTemplate: string, input: Record<string, unknown>): string {
  const path = pathTemplate.replace(/\{([^}]+)\}/g, (_match, key: string) => encodeURIComponent(String(input[key] || "")));
  return baseUrl.replace(/\\/+$/, "") + path;
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const parsed = text ? JSON.parse(text) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { value: parsed };
  } catch {
    return { text };
  }
}
`;
}

function genericAdapterServiceClientJs(): string {
  return `export async function callGenericHttpEndpoint(baseUrl, method, pathTemplate, input = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(renderPath(baseUrl, pathTemplate, input));
    const init = { method, signal: controller.signal };
    if (method !== "GET") {
      init.headers = { "Content-Type": "application/json; charset=utf-8" };
      init.body = JSON.stringify(input.body_json && typeof input.body_json === "object" ? input.body_json : input);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    const parsed = parseJson(text);
    if (!response.ok) {
      throw new Error(method + " " + pathTemplate + " returned HTTP " + response.status + ": " + text);
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function renderPath(baseUrl, pathTemplate, input) {
  const path = pathTemplate.replace(/\{([^}]+)\}/g, (_match, key) => encodeURIComponent(String(input[key] || "")));
  return baseUrl.replace(/\\/+$/, "") + path;
}

function parseJson(text) {
  try {
    const parsed = text ? JSON.parse(text) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { value: parsed };
  } catch {
    return { text };
  }
}
`;
}

function genericAdapterCardsTs(service: ServiceManifest, capabilities: CapabilityMap, interactions: InteractionContract): string {
  const specs = buildGenericActionSpecs(capabilities, interactions);
  return `const actionSpecs = ${JSON.stringify(specs, null, 2)} as const;

export function buildStartCard(): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: { template: "blue", title: { tag: "plain_text", content: ${JSON.stringify(service.service.name + " actions")} } },
    elements: actionSpecs.map(buildActionForm),
  };
}

function buildActionForm(spec: typeof actionSpecs[number]): Record<string, unknown> {
  return {
    tag: "form",
    name: "generic_http_form_" + spec.actionId.replace(/[^a-zA-Z0-9_]+/g, "_"),
    elements: [
      { tag: "markdown", content: "**" + spec.label + "**\\n" + spec.method + " " + spec.path },
      ...spec.inputs.map((input) => ({
        tag: "input",
        name: input.name,
        required: input.required,
        width: "fill",
        input_type: input.multiline ? "multiline_text" : "text",
        rows: input.multiline ? 3 : undefined,
        label: { tag: "plain_text", content: input.label },
        placeholder: { tag: "plain_text", content: input.placeholder },
      })),
      { tag: "button", text: { tag: "plain_text", content: "Run" }, type: "primary", form_action_type: "submit", name: "submit_" + spec.actionId.replace(/[^a-zA-Z0-9_]+/g, "_"), behaviors: [{ type: "callback", value: { action: spec.actionId } }] },
    ],
  };
}

export function buildSuccessCard(label: string, result: Record<string, unknown>): Record<string, unknown> {
  return card("green", label + " complete", [{ tag: "markdown", content: "\`\`\`json\\n" + JSON.stringify(result, null, 2) + "\\n\`\`\`" }]);
}

export function buildFailureCard(message: string): Record<string, unknown> {
  return card("red", "HTTP action failed", [{ tag: "markdown", content: "**What happened:** " + message }]);
}

function card(template: string, title: string, elements: Array<Record<string, unknown>>): Record<string, unknown> {
  return { config: { wide_screen_mode: true }, header: { template, title: { tag: "plain_text", content: title } }, elements };
}
`;
}

function genericAdapterCardsJs(service: ServiceManifest, capabilities: CapabilityMap, interactions: InteractionContract): string {
  const specs = buildGenericActionSpecs(capabilities, interactions);
  return `const actionSpecs = ${JSON.stringify(specs, null, 2)};

export function buildStartCard() {
  return {
    config: { wide_screen_mode: true },
    header: { template: "blue", title: { tag: "plain_text", content: ${JSON.stringify(service.service.name + " actions")} } },
    elements: actionSpecs.map(buildActionForm),
  };
}

function buildActionForm(spec) {
  return {
    tag: "form",
    name: "generic_http_form_" + spec.actionId.replace(/[^a-zA-Z0-9_]+/g, "_"),
    elements: [
      { tag: "markdown", content: "**" + spec.label + "**\\n" + spec.method + " " + spec.path },
      ...spec.inputs.map((input) => ({
        tag: "input",
        name: input.name,
        required: input.required,
        width: "fill",
        input_type: input.multiline ? "multiline_text" : "text",
        rows: input.multiline ? 3 : undefined,
        label: { tag: "plain_text", content: input.label },
        placeholder: { tag: "plain_text", content: input.placeholder },
      })),
      { tag: "button", text: { tag: "plain_text", content: "Run" }, type: "primary", form_action_type: "submit", name: "submit_" + spec.actionId.replace(/[^a-zA-Z0-9_]+/g, "_"), behaviors: [{ type: "callback", value: { action: spec.actionId } }] },
    ],
  };
}

export function buildSuccessCard(label, result) {
  return card("green", label + " complete", [{ tag: "markdown", content: "\`\`\`json\\n" + JSON.stringify(result, null, 2) + "\\n\`\`\`" }]);
}

export function buildFailureCard(message) {
  return card("red", "HTTP action failed", [{ tag: "markdown", content: "**What happened:** " + message }]);
}

function card(template, title, elements) {
  return { config: { wide_screen_mode: true }, header: { template, title: { tag: "plain_text", content: title } }, elements };
}
`;
}

function genericAdapterHandlersTs(service: ServiceManifest, capabilities: CapabilityMap, interactions: InteractionContract): string {
  const specs = buildGenericActionSpecs(capabilities, interactions);
  return `import { auditEvent } from "./audit-events.js";
import { buildFailureCard, buildSuccessCard } from "./cards.js";
import { callGenericHttpEndpoint } from "./service-client.js";
import type { GenericAdapterActionContext, GenericAdapterDependencies, GenericAdapterResult } from "./types.js";
import { assertAllowedOperator, readFormInput } from "./validation.js";

const actionSpecs = ${JSON.stringify(specs, null, 2)} as const;

export async function handleGenericHttpCardAction(ctx: GenericAdapterActionContext, deps: GenericAdapterDependencies): Promise<GenericAdapterResult> {
  const action = typeof ctx.action === "string" ? ctx.action : "";
  const auditEvents = [auditEvent("generic_http_card_action_received", { action, service: ${JSON.stringify(service.service.name)} })];
  try {
    assertAllowedOperator(ctx.operatorOpenId, deps.allowedOperatorOpenIds);
    const spec = actionSpecs.find((item) => item.actionId === action);
    if (!spec) throw new Error("Unsupported adapter action: " + action);
    const input = normalizeGenericInput({ ...readFormInput(ctx.value), ...readFormInput(ctx.formValue) });
    const result = await callGenericHttpEndpoint(deps.targetBaseUrl, spec.method, spec.path, input, deps.timeoutMs);
    auditEvents.push(auditEvent("generic_http_action_succeeded", { action, capability_id: spec.capabilityId }));
    return { ok: true, card: buildSuccessCard(spec.label, result), result, auditEvents };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    auditEvents.push(auditEvent("generic_http_action_failed", { action, message }));
    return { ok: false, card: buildFailureCard(message), auditEvents };
  }
}

function normalizeGenericInput(input: Record<string, unknown>): Record<string, unknown> {
  if (typeof input.body_json !== "string") return input;
  const text = input.body_json.trim();
  if (!text) return { ...input, body_json: {} };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("body_json must be a JSON object.");
    return { ...input, body_json: parsed };
  } catch (error) {
    if (error instanceof Error && error.message === "body_json must be a JSON object.") throw error;
    throw new Error("body_json must be valid JSON.");
  }
}
`;
}

function genericAdapterHandlersJs(service: ServiceManifest, capabilities: CapabilityMap, interactions: InteractionContract): string {
  const specs = buildGenericActionSpecs(capabilities, interactions);
  return `import { auditEvent } from "./audit-events.js";
import { buildFailureCard, buildSuccessCard } from "./cards.js";
import { callGenericHttpEndpoint } from "./service-client.js";
import { assertAllowedOperator, readFormInput } from "./validation.js";

const actionSpecs = ${JSON.stringify(specs, null, 2)};

export async function handleGenericHttpCardAction(ctx, deps) {
  const action = typeof ctx?.action === "string" ? ctx.action : "";
  const auditEvents = [auditEvent("generic_http_card_action_received", { action, service: ${JSON.stringify(service.service.name)} })];
  try {
    assertAllowedOperator(ctx?.operatorOpenId, deps?.allowedOperatorOpenIds);
    const spec = actionSpecs.find((item) => item.actionId === action);
    if (!spec) throw new Error("Unsupported adapter action: " + action);
    const input = normalizeGenericInput({ ...readFormInput(ctx?.value), ...readFormInput(ctx?.formValue) });
    const result = await callGenericHttpEndpoint(String(deps?.targetBaseUrl || ""), spec.method, spec.path, input, Number(deps?.timeoutMs || 30000));
    auditEvents.push(auditEvent("generic_http_action_succeeded", { action, capability_id: spec.capabilityId }));
    return { ok: true, card: buildSuccessCard(spec.label, result), result, auditEvents };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    auditEvents.push(auditEvent("generic_http_action_failed", { action, message }));
    return { ok: false, card: buildFailureCard(message), auditEvents };
  }
}

function normalizeGenericInput(input) {
  if (typeof input.body_json !== "string") return input;
  const text = input.body_json.trim();
  if (!text) return { ...input, body_json: {} };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("body_json must be a JSON object.");
    return { ...input, body_json: parsed };
  } catch (error) {
    if (error instanceof Error && error.message === "body_json must be a JSON object.") throw error;
    throw new Error("body_json must be valid JSON.");
  }
}
`;
}

function buildGenericActionSpecs(capabilities: CapabilityMap, interactions: InteractionContract): Array<{ actionId: string; capabilityId: string; label: string; method: string; path: string; inputs: Array<{ name: string; label: string; required: boolean; multiline: boolean; placeholder: string }> }> {
  return interactions.interactions.map((interaction) => {
    const capability = capabilities.capabilities.find((item) => item.id === interaction.capability_id);
    return {
      actionId: interaction.action_id,
      capabilityId: interaction.capability_id,
      label: capability?.name || interaction.capability_id,
      method: capability?.source.method || "POST",
      path: capability?.source.path || "/",
      inputs: genericInputsForCapability(capability),
    };
  });
}

function genericInputsForCapability(capability: CapabilityMap["capabilities"][number] | undefined): Array<{ name: string; label: string; required: boolean; multiline: boolean; placeholder: string }> {
  const schema = capability?.input_schema;
  const properties = schema && typeof schema.properties === "object" && !Array.isArray(schema.properties) ? schema.properties as Record<string, unknown> : {};
  const required = new Set(Array.isArray(schema?.required) ? schema.required.filter((item): item is string => typeof item === "string") : []);
  return Object.entries(properties).map(([name, value]) => {
    const property = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    return {
      name,
      label: genericFieldLabel(name),
      required: required.has(name),
      multiline: name === "body_json" || property.type === "object" || property.type === "array",
      placeholder: name === "body_json" ? "{\"key\":\"value\"}" : String(property.description || name),
    };
  });
}

function genericFieldLabel(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "value";
}

function buildSelfHostedIntegrationGuide(service: ServiceManifest): string {
  return `# Self-Hosted Runtime Integration Guide

This package was generated in \`self-hosted-runtime\` mode. The core artifact is \`feishu-host/\`: a Python Feishu long-connection host scaffold that keeps \`${service.service.name}\` external and talks to it over HTTP.

## Current Slice

This generated package includes the Python host, local contract test, Feishu SDK selfcheck, and manifest-derived specs:

- \`feishu-host/.env.example\`
- \`feishu-host/requirements.txt\`
- \`feishu-host/config.py\`
- \`feishu-host/cards.py\`
- \`feishu-host/service_client.py\`
- \`feishu-host/validation.py\`
- \`feishu-host/handlers.py\`
- \`feishu-host/app.py\`
- \`feishu-host/local_contract_test.py\`
- \`feishu-host/README.md\`
- \`feishu-host/spec/start_card.json\`
- \`feishu-host/spec/preset.json\`
- \`feishu-host/spec/template_specs.json\`
- \`feishu-host/spec/field_specs.json\`
- \`feishu-host/spec/field_map.json\`
- \`feishu-host/spec/endpoints.json\`

## Locked Environment Contract

Copy \`feishu-host/.env.example\` to \`feishu-host/.env\` and fill these values locally:

- \`FEISHU_APP_ID\`
- \`FEISHU_APP_SECRET\`
- \`FEISHU_CONNECTION_MODE=websocket\`
- \`IMAGE_AGENT_BASE_URL\`
- Optional \`FEISHU_ALLOWED_USERS\`
- \`IMAGE_AGENT_TIMEOUT_MS\`
- Optional \`TEST_CHAT_ID\`

\`config.py\` validates this contract and exposes only a secret-safe summary.

## Spec Contracts

The start card is fully rendered at generation time in \`feishu-host/spec/start_card.json\`; the Python host should load it instead of rebuilding the initial card. The manifest-derived specs preserve the TypeScript card-builder field names and template mappings, including \`field_map.json\` for converting generated form field names back to target template field keys.

\`spec/endpoints.json\` maps Feishu actions to the target HTTP contract:

- \`image.generate.submit\` -> \`POST /api/generate\` with multipart form fields \`template_id\`, \`size\`, \`fields_json\`, \`message\`, and \`reference_types_json\`.
- \`image.iterate.submit\` -> \`POST /api/iterate\` with JSON \`session_id\` and \`feedback\`.
- \`image.batch.submit\` -> \`POST /api/batch\` with multipart form fields \`template_id\`, \`size\`, \`items_json\`, and \`reference_types_json\`.
- \`image.batch.refresh\` -> \`GET /api/batch/{batch_id}/status\`.

## Setup

\`\`\`powershell
cd feishu-host
python -m venv .venv
.\\.venv\\Scripts\\python -m pip install -r requirements.txt
Copy-Item .env.example .env
python local_contract_test.py
python app.py --selfcheck
python app.py --send-start-card
\`\`\`

\`python app.py --send-start-card\` sends \`spec/start_card.json\` to \`TEST_CHAT_ID\` with \`im.v1.message.create\`. If it fails, use the printed Feishu \`code/msg\` to check bot permissions, app release state, and test-chat membership.

Real Feishu Level 2 remains manual: enable long connection in the Feishu app, subscribe to \`card.action.trigger\`, add the bot to the test chat, send the built-in start card, click it in Feishu, and record evidence in \`level2_verification_record.md\`.
`;
}

function buildEmbeddedIntegrationGuide(service: ServiceManifest, permissions: RequiredPermissions, hostReceiveMode: HostReceiveMode, targetProfile: string, interactions: InteractionContract): string {
  const longConnection = hostReceiveMode === "embedded-long-connection";
  const usesLongConnection = hostModeUsesLongConnection(hostReceiveMode);
  const hybrid = hostReceiveMode === "hybrid";
  const hostModeOption = hostReceiveMode === "embedded-webhook" ? "" : ` --host-mode ${hostReceiveMode}`;
  if (targetProfile === "generic-http-api") {
    const actions = interactions.interactions.map((interaction) => `- \`${interaction.action_id}\` -> \`${interaction.capability_id}\``).join("\n") || "- No card actions were discovered.";
    return `# Embedded Adapter Integration Guide

This package is adapter-first. The core artifact is \`adapter/\`. It contains a generic HTTP adapter for \`${service.service.name}\` and is intended for an existing Feishu SDK host.

- Host receive mode: ${hostReceiveMode}
- Card action ingress: ${longConnection ? "Feishu SDK long connection subscription to `card.action.trigger`." : hybrid ? "Hybrid: webhook callback route such as `/webhook/card` plus Feishu SDK long connection subscription to `card.action.trigger`." : "Webhook callback route such as `/webhook/card`."}

## Adapter Files

- \`adapter/handlers.ts\`: exports \`handleGenericHttpCardAction()\`.
- \`adapter/cards.ts\`: builds generic HTTP start/result/failure cards.
- \`adapter/service-client.ts\`: renders relative target endpoint paths and calls \`targetBaseUrl\`.
- \`adapter/validation.ts\`: operator allowlist and form input helpers.
- \`adapter/types.ts\`: host-facing generic adapter interfaces.

## Generic Actions

${actions}

The generated start card renders one form per discovered HTTP action. Path parameters such as \`ticket_id\` and request JSON bodies such as \`body_json\` are submitted through Feishu form values.

## Handler Shape

\`\`\`ts
import { handleGenericHttpCardAction } from "./adapter/handlers";

const result = await handleGenericHttpCardAction({
  action: "${interactions.interactions[0]?.action_id || "http.post.example.submit"}",
  formValue,
  operatorOpenId,
  openMessageId,
  openChatId,
}, {
  targetBaseUrl,
  timeoutMs,
  allowedOperatorOpenIds,
});

return result.card;
\`\`\`

The host owns Feishu SDK initialization, ${longConnection ? "long-connection lifecycle, `card.action.trigger` subscription" : hybrid ? "callback verification, route registration, long-connection lifecycle, `card.action.trigger` subscription" : "callback verification and route registration"}, secret storage, deployment, and audit persistence. The adapter returns \`ok\`, \`card\`, \`result\`, and \`auditEvents\`; it does not manage the target service lifecycle.

## Feishu Capabilities To Confirm

${permissions.scopes.map((scope) => `- \`${scope.scope}\`: ${scope.reason}`).join("\n")}
${permissions.callbacks.map((callback) => `- Callback \`${callback.callback}\`: ${callback.reason}`).join("\n")}

## Verification

\`\`\`powershell
node ..\\..\\dist\\index.js verify . --mode embedded-adapter${hostModeOption} --strict
\`\`\`

After mounting the adapter in your existing host, run host validation against that host:

\`\`\`powershell
node ..\\..\\dist\\index.js verify . --mode embedded-adapter${hostModeOption} --host-runtime-url http://127.0.0.1:3978 --simulate
\`\`\`

Real Level 2 still requires your host service to receive a real Feishu ${usesLongConnection ? "`card.action.trigger` event" : "card callback"}${hybrid ? " and maintain the webhook callback path" : ""}, call \`handleGenericHttpCardAction()\`, call \`${service.service.name}\`, return the result card, and record manual evidence in \`level2_verification_record.md\`.
`;
  }
  return `# Embedded Adapter Integration Guide

This package is adapter-first. The core artifact is \`adapter/\`. In embedded-adapter mode, this package is intended for an existing Feishu SDK host and does not include a generated \`bot-runtime/\` directory. If a standalone reference host is needed, regenerate with \`--mode standalone-runtime\`.

- Host receive mode: ${hostReceiveMode}
- Card action ingress: ${longConnection ? "Feishu SDK long connection subscription to `card.action.trigger`." : hybrid ? "Hybrid: webhook callback route such as `/webhook/card` plus Feishu SDK long connection subscription to `card.action.trigger`." : "Webhook callback route such as `/webhook/card`."}

## Adapter Files

- \`adapter/handlers.ts\`: entry point for card action handling.
- \`adapter/cards.ts\`: card builders returned to the host service.
- \`adapter/service-client.ts\`: calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}\`.
- \`adapter/validation.ts\`: form parsing and business validation helpers.
- \`adapter/audit-events.ts\`: structured audit event declarations.
- \`adapter/types.ts\`: host-facing TypeScript interfaces.

## Host Responsibilities

Your existing Feishu SDK service owns SDK initialization, ${longConnection ? "long-connection lifecycle, `card.action.trigger` subscription" : hybrid ? "callback verification, route registration, long-connection lifecycle, `card.action.trigger` subscription" : "callback verification, route registration"}, image upload wrappers, audit log persistence, runtime config loading, deployment, and process lifecycle.

## Send The Initial Card

Use the generated \`buildStartCard()\` builder when your host sends the first interactive card. The embedded host should not recreate the card schema by hand.

\`\`\`ts
import { buildStartCard } from "./adapter/cards";

await feishuClient.im.message.create({
  params: { receive_id_type: "chat_id" },
  data: {
    receive_id: testChatId,
    msg_type: "interactive",
    content: JSON.stringify(buildStartCard()),
  },
});
\`\`\`

The start card contains two forms:

- \`image_generate_form\` submits \`image.generate.submit\`.
- \`image_batch_form\` submits \`image.batch.submit\`.

## Form Fields And Actions

For single-image generation, pass the card callback action and Feishu form fields directly into \`handleImageAgentCardAction()\`:

- \`action\`: \`image.generate.submit\`.
- \`param_template_id\`: target template id.
- \`param_size\`: target image size such as \`1024x1024\`.
- \`field_*\`: generated target template fields from \`adapter/cards.ts\`.
- \`param_message\`: optional extra instruction.

When the target returns a \`session_id\`, the adapter success card includes \`image_iterate_form\`. Submit that form back to the same handler with:

- \`action\`: \`image.iterate.submit\`.
- \`value.session_id\`: session id from the Iterate image button payload.
- \`param_feedback\`: operator feedback from the form.

For batch generation, submit:

- \`action\`: \`image.batch.submit\`.
- \`param_batch_template_id\`: target template id for batch items.
- \`param_batch_size\`: target image size.
- \`param_batch_items_json\`: JSON array such as \`[{ "fields": { "theme": "launch visual" } }]\`.

The returned batch status card includes a refresh button. Route that callback to the same handler with \`action: "image.batch.refresh"\` and the button \`value.batch_id\`; the adapter calls the target status endpoint and returns a fresh status/download card.

## Handler Shape

\`\`\`ts
import { handleImageAgentCardAction } from "./adapter/handlers";

const result = await handleImageAgentCardAction({
  action: "image.generate.submit",
  formValue,
  operatorOpenId,
  openMessageId,
  openChatId,
}, {
  imageAgentBaseUrl,
  timeoutMs,
  allowedOperatorOpenIds,
});

for (const event of result.auditEvents) {
  audit(event);
}
if (!result.ok) {
  // result.card is already a red adapter failure card; return or patch it to Feishu.
  return result.card;
}
return result.card;
\`\`\`

The host should extract the callback action from the Feishu card value, preserve the button \`value\` object, pass Feishu form values as \`formValue\`, and then return or patch \`result.card\`. Adapter errors are represented as \`ok: false\` with a failure card, so the host does not need to build its own business error card.

## Feishu Capabilities To Confirm

${permissions.scopes.map((scope) => `- \`${scope.scope}\`: ${scope.reason}`).join("\n")}
${permissions.callbacks.map((callback) => `- Callback \`${callback.callback}\`: ${callback.reason}`).join("\n")}

## Verification

Run package validation without starting the standalone runtime:

\`\`\`powershell
node ..\\..\\dist\\index.js verify . --mode embedded-adapter${hostModeOption} --strict
\`\`\`

After the adapter is mounted in your existing Feishu SDK host, run host validation against that host. This probes the host-owned \`/health\` endpoint${longConnection ? " and expects host-owned `card.action.trigger` long-connection evidence instead of a webhook URL-verification route" : hybrid ? ", Feishu-style `/webhook/card` URL verification, and host-owned `card.action.trigger` long-connection evidence" : " and Feishu-style `/webhook/card` URL verification route"}; with \`--simulate\`, it also tries a conventional \`/debug/simulate-card-action\` endpoint and reports a manual-check warning if your host uses a different debug surface:

\`\`\`powershell
node ..\\..\\dist\\index.js verify . --mode embedded-adapter${hostModeOption} --host-runtime-url http://127.0.0.1:3978 --simulate
\`\`\`

Real Level 2 still requires your host service to receive a real Feishu ${usesLongConnection ? "`card.action.trigger` long-connection event" : "card callback"}${hybrid ? " and maintain the webhook callback path" : ""}, call the adapter, call \`${service.service.name}\`, return the result card, and record manual evidence in \`level2_verification_record.md\`.
`;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function buildGeneratedReadme(service: ServiceManifest, permissions: RequiredPermissions, integrationMode: IntegrationMode, hostReceiveMode: HostReceiveMode, targetProfile: string, interactions: InteractionContract): string {
  if (integrationMode === "embedded-adapter") {
    const longConnection = hostReceiveMode === "embedded-long-connection";
    const usesWebhook = hostModeUsesWebhook(hostReceiveMode);
    const usesLongConnection = hostModeUsesLongConnection(hostReceiveMode);
    const hybrid = hostReceiveMode === "hybrid";
    const hostModeOption = hostReceiveMode === "embedded-webhook" ? "" : ` --host-mode ${hostReceiveMode}`;
    if (targetProfile === "generic-http-api") {
      const actions = interactions.interactions.map((interaction) => `- \`${interaction.action_id}\` handles \`${interaction.capability_id}\``).join("\n") || "- No generic HTTP card actions were discovered.";
      return `# ${service.service.name} Lark Generic HTTP Adapter Package

This package was generated by Lark-deployer for a generic HTTP API target. It exposes generic card-action forms that call discovered target endpoints and render structured JSON results.

## Boundary

Lark-deployer generated an embeddable adapter package. It does not run or manage the target service lifecycle and this embedded-adapter package does not include a standalone \`bot-runtime/\` host.

- Target service: ${service.service.name}
- Target base URL: ${service.service.base_url || "<TARGET_BASE_URL>"}
- Target profile: generic-http-api
- Core artifact: \`adapter/\`
- Integration mode: embedded-adapter
- Host receive mode: ${hostReceiveMode}

## What The Embedded Adapter Does

1. Exports \`handleGenericHttpCardAction()\` for Feishu/Lark card actions.
2. Maps generic action IDs to discovered HTTP endpoints for \`${service.service.name}\`.
3. Reads path parameters and \`body_json\` from card form values.
4. Calls the configured \`targetBaseUrl\` and returns generic success/failure cards plus audit events.
5. Leaves ${usesLongConnection && usesWebhook ? "long-connection ingress, callback routing, Feishu SDK lifecycle" : usesLongConnection ? "long-connection ingress, Feishu SDK lifecycle" : "callback routing, Feishu SDK verification"}, secret storage, deployment, and Level 2 evidence collection to the existing host service.

## Generated Actions

${actions}

## Required Context

${permissions.context_requirements.map((item) => `- ${item}`).join("\n")}

## Package Validation

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter${hostModeOption} --strict
\`\`\`

## Host Validation

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter${hostModeOption} --host-runtime-url http://127.0.0.1:3978 --simulate
\`\`\`

Use \`docs/integration_guide.md\` for the exact \`handleGenericHttpCardAction()\` call shape. Real Level 2 still requires your host to receive a real Feishu ${hybrid ? "webhook callback and `card.action.trigger` long-connection event" : longConnection ? "`card.action.trigger` long-connection event" : "card callback"}, call the adapter, call \`${service.service.name}\`, return the result card, and record manual evidence.
`;
    }
    return `# ${service.service.name} Lark Embedded Adapter Package

This package was generated by Lark-deployer for the MVP-1A image generation, feedback-iteration, and batch-progress flow.

## Boundary

Lark-deployer generated an embeddable adapter package. It does not run or manage the target service lifecycle and this embedded-adapter package does not include a standalone \`bot-runtime/\` host.

- Target service: ${service.service.name}
- Target base URL: ${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}
- Core artifact: \`adapter/\`
- Integration mode: embedded-adapter
- Host receive mode: ${hostReceiveMode}
- Managed by Lark-deployer: false

## What The Embedded Adapter Does

1. Exposes adapter handlers for Feishu/Lark card actions.
2. Maps generate, iterate, batch submit, and batch refresh actions to \`${service.service.name}\` requests.
3. Returns card JSON and audit events for your existing Feishu SDK host to send and persist.
4. Leaves ${usesLongConnection && usesWebhook ? "long-connection ingress, callback routing, Feishu SDK lifecycle" : usesLongConnection ? "long-connection ingress, Feishu SDK lifecycle" : "callback routing, Feishu SDK verification"}, secret storage, deployment, and Level 2 evidence collection to the existing host service.
5. Uses ${hybrid ? "both the webhook callback path and the Feishu SDK `card.action.trigger` long-connection event path" : usesLongConnection ? "the Feishu SDK `card.action.trigger` long-connection event path" : "the webhook callback path"} as the host receive mode.

## Required Context

${permissions.context_requirements.map((item) => `- ${item}`).join("\n")}

## Package Validation

Package-only validation does not require host secrets or a running generated runtime:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter${hostModeOption} --strict
\`\`\`

## Host Validation

After \`adapter/\` is mounted in your existing Feishu SDK host, validate the host boundary:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter${hostModeOption} --host-runtime-url http://127.0.0.1:3978 --simulate
\`\`\`

This checks \`/health\`${hybrid ? ", `/webhook/card`, and host-owned `card.action.trigger` long-connection evidence" : longConnection ? " on the existing host and does not require a `/webhook/card` URL-verification endpoint for long-connection delivery" : " and `/webhook/card` on the existing host"}. If \`--simulate\` is provided and your host does not expose \`/debug/simulate-card-action\`, the report records a host-owned manual-check warning instead of assuming a generated debug API.

## Real Level 2

Real Level 2 still requires your host service to receive a real Feishu ${hybrid ? "webhook callback and `card.action.trigger` long-connection event" : longConnection ? "`card.action.trigger` long-connection event" : "card callback"}, call the adapter, call \`${service.service.name}\`, return the result card, and record manual evidence in \`level2_verification_record.md\`.

Use \`level2_manual_evidence.template.json\` as the safe template for local manual evidence intake. Keep filled evidence and secrets in ignored local files or your existing host service's secret store.

## Handoff

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI status .
node $env:LARK_DEPLOYER_CLI readiness .
node $env:LARK_DEPLOYER_CLI doctor . --mode embedded-adapter${hostModeOption}
node $env:LARK_DEPLOYER_CLI doctor . --mode embedded-adapter${hostModeOption} --gate
node $env:LARK_DEPLOYER_CLI handoff .
\`\`\`
`;
  }
  if (integrationMode === "self-hosted-runtime") {
    return `# ${service.service.name} Lark Self-Hosted Runtime Package

This package was generated by Lark-deployer for the MVP-1A image generation, feedback-iteration, and batch-progress flow.

## Boundary

Lark-deployer generated a Python \`feishu-host/\` runtime. It keeps \`${service.service.name}\` external and calls it over HTTP; it does not import or modify the target service.

- Target service: ${service.service.name}
- Target base URL: ${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}
- Core artifact: \`feishu-host/\`
- Integration mode: self-hosted-runtime
- Host receive mode: embedded-long-connection

## Local Proof

Run these before manual Feishu Level 2:

\`\`\`powershell
cd feishu-host
python -m venv .venv
.\\.venv\\Scripts\\python -m pip install -r requirements.txt
Copy-Item .env.example .env
python local_contract_test.py
python app.py --selfcheck
python app.py --send-start-card
\`\`\`

\`python app.py --send-start-card\` sends \`spec/start_card.json\` to \`TEST_CHAT_ID\` with Feishu \`im.v1.message.create\`. If it fails, use the printed Feishu \`code/msg\` or missing-env message to check bot permissions, app release state, and test-chat membership.

## Package Validation

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI verify . --mode self-hosted-runtime --strict
\`\`\`

## Real Level 2

Real Level 2 remains manual: enable long connection in the Feishu app, subscribe to \`card.action.trigger\`, add the bot to the test chat, send the built-in start card, click it in Feishu, and record evidence in \`level2_verification_record.md\`.
`;
  }
  return `# ${service.service.name} Lark Integration Package

This package was generated by Lark-deployer for the MVP-1A image generation, feedback-iteration, and batch-progress flow.

## Boundary

Lark-deployer generated this package, but it does not run or manage the target service lifecycle.

- Target service: ${service.service.name}
- Target base URL: ${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}
- Runtime mode: external service
- Managed by Lark-deployer: false

## What This Runtime Does

1. Receives Feishu/Lark interactive card callbacks at \`/webhook/card\`.
2. Verifies callback security through the official Node SDK.
3. Calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/generate\` for the first image.
4. When the result includes \`session_id\`, accepts feedback from the success card and calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/iterate\`.
5. Accepts batch items JSON, calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/batch\`, and returns a progress card with manual refresh plus download link when completed images exist.
6. Uploads the generated or iterated image to Feishu when possible.
7. Updates the card with success or failure status.

The default start-card preset is derived from \`manifest/image_agent_meta.snapshot.json\` when template metadata is available.
The start card includes Feishu form inputs for template id, size, optional message, and discovered template fields. Submitted form values override the preset before the runtime calls the target service. When multiple templates are discovered, the generated runtime validates required fields against the submitted template id.

## Required Context

${permissions.context_requirements.map((item) => `- ${item}`).join("\n")}

## Embedded adapter

The strategic integration path is the generated \`adapter/\` directory. Use \`docs/integration_guide.md\` when you already have a Feishu SDK service and want to embed the generated card-action adapter without deploying the standalone reference runtime.

Package-only validation for this path does not require \`bot-runtime/.env\` or a running runtime:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter --strict
\`\`\`

Once the adapter is mounted in your existing Feishu SDK host, validate the host boundary with:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter --host-runtime-url http://127.0.0.1:3978 --simulate
\`\`\`

This embedded host validation checks \`/health\` and \`/webhook/card\` on the existing host. If \`--simulate\` is provided and your host does not expose \`/debug/simulate-card-action\`, the report records a host-owned manual-check warning instead of assuming a generated \`bot-runtime\` debug API.

The \`bot-runtime/\` directory remains available as a standalone reference host for local verification or teams without an existing Feishu service.

## Runtime Config Boundaries

- Callback verification requires \`VERIFICATION_TOKEN\`, plus \`ENCRYPT_KEY\` if encrypted callbacks are enabled.
- Sending the first test card requires \`APP_ID\`, \`APP_SECRET\`, and \`TEST_CHAT_ID\`.
- Uploading result images to Feishu requires \`APP_ID\` and \`APP_SECRET\`.
- Target calls and result-image downloads use \`IMAGE_AGENT_TIMEOUT_MS\` so slow or stuck services return a readable failure card.
- Slow targets can set \`CARD_ACTION_MODE=async\`; this returns a running card immediately and patches the original message after generation. Async mode requires \`APP_ID\`, \`APP_SECRET\`, and the \`im:message:update\` scope.
- When the runtime is reachable through a public callback URL, set \`DEBUG_ACCESS_TOKEN\` so \`/debug/*\` endpoints, including \`/debug/audit-tail\`, require \`Authorization: Bearer <token>\` or \`x-lark-deployer-debug-token: <token>\`.
- Set \`ALLOWED_OPERATOR_OPEN_IDS\` to a comma-separated Feishu operator \`open_id\` allowlist when only specific people should be able to execute card actions. Empty means any valid card click can run the service.
- Full Level 2 verification requires all of the above, \`PUBLIC_CALLBACK_BASE_URL\`, and a reachable target service.

\`configure\` validates runtime settings before writing \`.env\`, writes a safe \`configure_report.json\` plus \`configure_report.md\` that show value sources without printing secrets, and supports \`--strict\` when missing required Level 2 values should fail the command. Use \`configure --strict --dry-run\` to validate a filled context and write only the local report before touching \`.env\`. The generated runtime validates \`PORT\`, \`CARD_ACTION_MODE\`, and boolean flags again at startup.
If \`feishu_context.reply.local.json\` exists, \`configure --strict --dry-run\` also fails on invalid owner reply JSON, blocked owner answers, blocked/unknown/missing permission confirmations, or a missing \`secure_secret_channel\`; \`configure_report.*\` shows only counts and field names from that reply.
When \`feishu_context.local.json\` leaves public fields blank, \`configure\` may use non-secret owner reply values for \`TEST_CHAT_ID\`, \`PUBLIC_CALLBACK_BASE_URL\`, and \`IMAGE_AGENT_BASE_URL\`; the report marks those rows as \`context_reply\` and still prints only field names, not values.
\`configure --strict --dry-run\` treats placeholder-shaped values such as \`<APP_ID>\`, \`{{VERIFICATION_TOKEN}}\`, or \`\${TEST_CHAT_ID}\` as missing, so replace placeholders completely before real Level 2 verification.
When \`PUBLIC_CALLBACK_BASE_URL\` is set, debug endpoints are enabled, and no \`DEBUG_ACCESS_TOKEN\` is provided or preserved, \`configure\` generates a random token and writes it to \`.env\` without printing the value.

## Setup

\`\`\`powershell
cd bot-runtime
Copy-Item .env.example .env
npm install
npm run build
npm start
\`\`\`

If this package contains a filled \`feishu_context.template.json\`, generate \`bot-runtime/.env\` from this generated package root:

\`\`\`powershell
node ..\\..\\dist\\index.js init-local . --context --reply
node ..\\..\\dist\\index.js configure . --strict --dry-run
node ..\\..\\dist\\index.js configure . --strict
\`\`\`

For the rest of this README, use the portable \`LARK_DEPLOYER_CLI\` command style. If this package has been copied outside the Lark-deployer repository, the relative CLI path above will not work. Point \`LARK_DEPLOYER_CLI\` at the built CLI from the project checkout:

\`\`\`powershell
$env:LARK_DEPLOYER_CLI="C:\\path\\to\\Lark-deployer\\dist\\index.js"
node $env:LARK_DEPLOYER_CLI init-local . --context --reply
node $env:LARK_DEPLOYER_CLI configure . --strict --dry-run
node $env:LARK_DEPLOYER_CLI configure . --strict
node $env:LARK_DEPLOYER_CLI status .
node $env:LARK_DEPLOYER_CLI readiness .
node $env:LARK_DEPLOYER_CLI doctor .
node $env:LARK_DEPLOYER_CLI doctor . --gate
node $env:LARK_DEPLOYER_CLI doctor . --probe-target --gate
node $env:LARK_DEPLOYER_CLI verify . --runtime-url http://127.0.0.1:3978 --simulate
node $env:LARK_DEPLOYER_CLI verify . --runtime-url http://127.0.0.1:3978 --level2
node $env:LARK_DEPLOYER_CLI evidence . --runtime-url http://127.0.0.1:3978 --update-record
node $env:LARK_DEPLOYER_CLI handoff .
\`\`\`

If Feishu context is still missing, send \`feishu_context.request.md\` to the Feishu app owner or FDE first; it asks who can provide the app credentials, scopes, callback setup, test chat, and public callback URL without exposing secrets. Use \`feishu_context.reply.template.json\` or \`feishu_context.reply.template.md\` as the non-secret intake form for the owner's answer; run \`init-local --reply\` or copy it to a local filename before adding internal contacts or blocked-by notes.

For real secrets, run \`init-local --context --reply\` or copy \`feishu_context.template.json\` to \`feishu_context.local.json\` manually, fill the local file, and rerun \`configure\`. \`configure\` prefers \`feishu_context.local.json\` when it exists, and this package's \`.gitignore\` excludes it along with \`bot-runtime/.env\`. If \`generate\` received a filled source context, this generated template remains secret-free and the filled values are kept in \`feishu_context.local.json\`.

Before handing the package to another operator, write a current status summary:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI status .
node $env:LARK_DEPLOYER_CLI readiness .
node $env:LARK_DEPLOYER_CLI doctor .
node $env:LARK_DEPLOYER_CLI doctor . --out doctor_report.json
node $env:LARK_DEPLOYER_CLI doctor . --out doctor_report.json --probe-target --gate
node $env:LARK_DEPLOYER_CLI handoff .
\`\`\`

\`status\` prints a one-screen state summary without writing files. \`readiness\` writes \`handoff_status.md\` without probing the network or overwriting \`verification_report.md\`. When external context is missing, both point to \`feishu_context.request.md\`; the readiness file also records the missing values to request. They summarize ignored \`feishu_context.reply.local.json\` by counts and field names only, so an owner reply can surface blockers without leaking contacts, URLs, or notes. They also report whether \`level2_manual_evidence.template.json\` exists, whether ignored \`level2_manual_evidence.local.json\` parses, and which filled field names are imported or pending import, without printing the local evidence values. \`doctor\` explains the current MVP blockers, can write a safe \`doctor_report.json\` plus \`doctor_report.md\` with \`--out\`, and can be run with \`--gate\` to exit non-zero until the package is truly \`handoff_ready\`. By default it reads the latest verification snapshot; add \`--probe-target\` before final sign-off to perform a live \`GET <target_base_url>/api/meta\` inside the doctor report without rewriting \`verification_report.json\`. \`handoff\` writes \`handoff_manifest.json\` and \`handoff_manifest.md\` with recommended files to copy and local or sensitive paths to exclude. Secret values are never printed.

To create a sanitized copy for transfer, use an empty directory:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI handoff . --copy-to ..\\image-agent-web-lark-handoff
node $env:LARK_DEPLOYER_CLI handoff ..\\image-agent-web-lark-handoff --check
\`\`\`

\`--copy-to\` refuses to write into a non-empty directory, excludes \`.env\`, local context, local configure reports, \`node_modules\`, build output, and logs, scans copied text files for known local secret values, and redacts legacy manual-evidence rows in \`level2_evidence_draft.md\` before transfer.
\`--copy-to\` also refreshes safe package-path fields in \`feishu_context.*\`, \`verification_report.*\`, \`level2_evidence_draft.md\`, \`handoff_status.md\`, \`handoff_manifest.json/.md\`, \`doctor_report.json/.md\`, and \`level2_verification_record.md\`, so copied reports point to the copied path rather than the source generated package.
\`--check\` validates a sanitized handoff directory by failing if recommended files are missing, excluded local paths are present, shared configure guidance is missing \`--dry-run\`, shared local-intake guidance is missing \`init-local\`, permission confirmation summaries are missing, stale package path references remain, common secret literal patterns appear in copied text files, shared docs still contain non-strict \`configure\` commands, or shared Level 2 drafts still contain unredacted manual evidence rows.

Configure the Feishu card action callback URL to:

\`\`\`text
https://<your-public-runtime-url>/webhook/card
\`\`\`

To send the first test card after runtime starts and \`APP_ID\`, \`APP_SECRET\`, and \`TEST_CHAT_ID\` are filled:

\`\`\`powershell
Invoke-WebRequest -Method POST http://127.0.0.1:3978/debug/start-card
\`\`\`

\`/debug/start-card\` checks the Feishu OpenAPI business response. If Feishu returns a non-zero \`code\`, the endpoint returns HTTP 500 so Level 2 verification does not pass with missing bot permission, missing chat access, or an invalid receive id.
It also writes \`start_card_sent\` or \`start_card_failed\` to \`bot-runtime/audit.log\` so \`evidence\` can recover the start-card message id and trace id when available.

To test the target-service call and card rendering before Feishu credentials are ready:

\`\`\`powershell
Invoke-WebRequest -Method POST http://127.0.0.1:3978/debug/simulate-generate
Invoke-WebRequest -Method POST http://127.0.0.1:3978/debug/simulate-card-action
\`\`\`

These local debug endpoints do not send a Feishu message. They call the target service and return the card JSON that would be used for the Feishu result. \`/debug/simulate-card-action\` also uses the same action parsing, form-value merge, validation, and audit path as a real card click. It accepts \`eventShape: "v2"\` and \`valueAsJsonString: true\` for local compatibility checks against the official Feishu 2.0 callback shape. When \`VERIFICATION_TOKEN\` is present, \`verify --simulate\` also posts a signed card-action payload to \`/webhook/card\` so the SDK validation path is tested before a real Feishu click.

Real card callbacks use a short in-memory duplicate-action window keyed by message, operator, action, and submitted form payload. Repeated delivery or rapid double-clicks do not call the target service twice. This is a retry/double-click guard, not durable cross-process job storage.

If \`DEBUG_ACCESS_TOKEN\` is set, include it as \`Authorization: Bearer <token>\` or \`x-lark-deployer-debug-token: <token>\` for manual \`/debug/*\` calls. \`verify\` and \`evidence --runtime-url\` read the token from \`.env\` automatically.
\`GET /debug/audit-tail?limit=100\` returns recent runtime audit events for Level 2 evidence collection without requiring direct filesystem access to \`bot-runtime/audit.log\`.

After Feishu credentials are filled and the bot is in the test chat, run Level 2 preflight from this generated package root:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI verify . --runtime-url http://127.0.0.1:3978 --level2
\`\`\`

\`--level2\` checks runtime health, public callback URL verification, signed card-action callback handling when \`VERIFICATION_TOKEN\` is set, encrypted callback URL verification when \`ENCRYPT_KEY\` is set, target simulation, and first-card sending. The final click/result observation still needs to be recorded in \`level2_verification_record.md\` by the operator.

Real Level 2 expects \`PUBLIC_CALLBACK_BASE_URL\` to be a public HTTPS URL. \`--allow-local-callback\` exists only for automated local mock verification and should not be used as real Feishu evidence.

After verification, generate a machine-supported evidence draft:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI evidence . --runtime-url http://127.0.0.1:3978 --update-record
\`\`\`

\`evidence\` writes \`level2_evidence_draft.md\` from \`verification_report.json\` and \`bot-runtime/audit.log\`; with \`--runtime-url\`, it first tries the protected \`/debug/audit-tail\` endpoint and falls back to the local audit file when the endpoint is unavailable. The evidence draft summarizes recent audit details and redacts submitted field values, operator ids, chat ids, and manual evidence values from the shared Markdown output. With \`--update-record\`, it also copies machine-supported artifact fields and supplied manual evidence values into blank lines in \`level2_verification_record.md\`. It does not mark the real Feishu click complete. When available, it extracts the start-card message id, generated image URL or image key, and recent trace ids for easier record filling.

After the operator captures real Feishu evidence, rerun \`evidence --update-record\` with manual fields to fill remaining blank record lines:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI evidence . --runtime-url http://127.0.0.1:3978 --update-record --start-message-id <message-id> --result-message-id <message-id> --result-screenshot <path-or-url> --generated-image-url <url> --batch-id <batch-id> --batch-status-message-id <message-id> --batch-status-screenshot <path-or-url> --batch-download-url <url> --batch-download-screenshot <path-or-url> --trace-id <trace-id> --operator <name> --test-chat <chat-name>
\`\`\`

For repeatable handoff, initialize \`level2_manual_evidence.local.json\`, fill the observed Feishu result fields there, then import it:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI init-local . --manual-evidence
node $env:LARK_DEPLOYER_CLI evidence . --runtime-url http://127.0.0.1:3978 --manual-evidence level2_manual_evidence.local.json --update-record
\`\`\`

If \`level2_verification_record.md\` already contains manual evidence such as checked items, message ids, screenshot notes, or artifact paths, rerunning \`generate\` preserves that filled record and writes the fresh blank template to \`level2_verification_record.template.md\`.

Any verification command with \`--runtime-url\` also checks that \`/webhook/card\` can answer a local \`url_verification\` challenge and compares \`/health\` configuration fields such as target URL, card action mode, callback URL, image-upload/debug flags, and Feishu readiness against env/context values. \`--simulate\` checks direct generation, simulated card-action, Feishu 2.0-shaped card-action, and invalid-input failure-card paths. Non-challenge card callbacks still require complete Feishu configuration.

When a runtime check fails, \`verification_report.md\` includes a short response-body summary when available. Use this detail first for missing Feishu send config, non-zero Feishu OpenAPI \`code\`, target-service errors, or callback parsing failures.

## Review Files

- \`START_HERE.md\`: short first-entry guide for the next FDE or operator.
- \`permission_review.md\`: permissions and callbacks to apply in Feishu.
- \`deployment_checklist.md\`: FDE step-by-step checklist.
- \`feishu_context.request.md\`: owner-facing request for missing Feishu values, permissions, callbacks, and test-chat setup.
- \`feishu_context.reply.template.json/md\`: non-secret intake template for recording the owner's reply before local configuration.
- \`handoff_status.md\`: current missing-context and next-action summary generated by \`readiness\`.
- \`doctor_report.md\`: optional safe MVP gate report generated by \`doctor --out doctor_report.json\`.
- \`handoff_manifest.md\`: recommended transfer file list and exclusions generated by \`handoff\`.
- \`level2_evidence_draft.md\`: machine-supported evidence summary generated by \`evidence\`.
- \`level2_verification_record.md\`: checklist and evidence log for the real Feishu test.
- \`level2_manual_evidence.template.json\`: safe template for recording manual Feishu result evidence in an ignored local copy.
- \`manifest/*.json\`: machine-readable service, capability, interaction, and permission contracts.
`;
}

function buildLevel2VerificationRecord(service: ServiceManifest, permissions: RequiredPermissions, integrationMode: IntegrationMode, hostReceiveMode: HostReceiveMode): string {
  const scopes = permissions.scopes.length
    ? permissions.scopes.map((scope) => `  - [ ] \`${scope.scope}\` - ${scope.reason}`).join("\n")
    : "  - [ ] No explicit scopes were generated.";
  const callbacks = permissions.callbacks.length
    ? permissions.callbacks.map((callback) => `  - [ ] \`${callback.callback}\` - ${callback.reason}`).join("\n")
    : "  - [ ] No explicit callbacks were generated.";

  if (integrationMode === "embedded-adapter") {
    const longConnection = hostReceiveMode === "embedded-long-connection";
    const usesWebhook = hostModeUsesWebhook(hostReceiveMode);
    const usesLongConnection = hostModeUsesLongConnection(hostReceiveMode);
    const hybrid = hostReceiveMode === "hybrid";
    const hostModeOption = hostReceiveMode === "embedded-webhook" ? "" : ` --host-mode ${hostReceiveMode}`;
    const environmentRows = [
      "- Date:",
      "- Operator:",
      `- Target service: ${service.service.name}`,
      `- Target base URL: ${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}`,
      "- Generated package path:",
      "- Existing host service URL:",
      `- Host receive mode: ${hostReceiveMode}`,
      ...(usesWebhook ? ["- Public callback URL: <PUBLIC_CALLBACK_BASE_URL>/webhook/card"] : []),
      ...(usesLongConnection ? ["- Long-connection gateway/sidecar:"] : []),
      "- Feishu app name:",
      "- Test chat:",
    ].join("\n");
    const setupRows = [
      "- [ ] Bot capability is enabled.",
      "- [ ] Bot is added to the test chat.",
      "- [ ] App credentials are stored in the existing host service's secret/config system: `APP_ID`, `APP_SECRET`.",
      ...(usesWebhook ? [
        "- [ ] Callback token is stored in the existing host service's secret/config system: `VERIFICATION_TOKEN`.",
        "- [ ] `ENCRYPT_KEY` is stored if encrypted callbacks are enabled.",
      ] : []),
      ...(usesLongConnection ? [
        "- [ ] Feishu SDK long connection is configured with the existing app credentials and subscribed to `card.action.trigger`.",
      ] : []),
      "- [ ] `TEST_CHAT_ID` is configured in the existing host.",
      ...(usesWebhook ? ["- [ ] `PUBLIC_CALLBACK_BASE_URL` is configured and publicly reachable by Feishu."] : []),
      ...(usesLongConnection ? ["- [ ] The gateway/sidecar process lifecycle is supervised independently of the target business service."] : []),
      "- [ ] `DEBUG_ACCESS_TOKEN` or equivalent protection is set before host-owned debug endpoints are exposed.",
      "- [ ] `ALLOWED_OPERATOR_OPEN_IDS` or equivalent host guard is set for real group use, or the operator explicitly accepts that any valid card click can run the service.",
      ...(usesWebhook ? ["- [ ] Card callback URL is configured as `<PUBLIC_CALLBACK_BASE_URL>/webhook/card` on the existing host."] : []),
      ...(usesLongConnection ? ["- [ ] The host routes long-connection card.action.trigger events into `adapter/handlers.ts`."] : []),
    ].join("\n");
    const preflightRows = [
      "- [ ] `GET <target_base_url>/api/meta` succeeds from the existing host environment.",
      "- [ ] `GET <host_runtime_url>/health` succeeds on the existing host.",
      ...(usesWebhook ? [
        "- [ ] `POST <host_runtime_url>/webhook/card` answers a local `url_verification` challenge.",
        "- [ ] `POST <PUBLIC_CALLBACK_BASE_URL>/webhook/card` answers a public `url_verification` challenge.",
        "- [ ] Signed card-action payloads to local and public `/webhook/card` return success cards when `VERIFICATION_TOKEN` is set.",
        "- [ ] If `ENCRYPT_KEY` is enabled, local and public encrypted `url_verification` challenges both succeed.",
      ] : []),
      ...(usesLongConnection ? [
        "- [ ] Host logs show the Feishu SDK long connection is online and a `card.action.trigger` event reaches the gateway/sidecar.",
        "- [ ] Host-owned simulation or manual card-action evidence reaches `adapter/handlers.ts`.",
      ] : []),
      `- [ ] \`verify . --mode embedded-adapter${hostModeOption} --host-runtime-url <host_runtime_url> --simulate\` records host health checks and either passes host-owned simulation or records the manual-check warning for the host debug surface.`,
      "- [ ] `verification_report.md` has no unexpected FAIL checks.",
    ].join("\n");
    return `# Level 2 Verification Record

Use this file to record the real Feishu/Lark verification for this embedded adapter package.

## Environment

${environmentRows}

## Required Feishu Setup

${setupRows}

## Required Scopes

${scopes}

## Required Callbacks

${callbacks}

## CLI Command Style

- If this package still lives under the original Lark-deployer repository, run commands as \`node ..\\..\\dist\\index.js <command> .\`.
- If this package was copied elsewhere, set \`$env:LARK_DEPLOYER_CLI="C:\\path\\to\\Lark-deployer\\dist\\index.js"\` and run commands as \`node $env:LARK_DEPLOYER_CLI <command> .\`.

## Preflight Evidence

${preflightRows}

## Interaction Evidence

- [ ] Existing host sends the start card or equivalent entry card.
- [ ] Test chat receives the start card.
- [ ] Start card shows expected template fields from \`manifest/image_agent_meta.snapshot.json\`.
- [ ] Start card shows \`Template ID\`, \`Size\`, optional \`Message\`, and batch items JSON inputs.
- [ ] Operator submits a valid card form in Feishu.
- [ ] Existing host receives the ${hybrid ? "card callback and `card.action.trigger` long-connection event" : longConnection ? "`card.action.trigger` long-connection event" : "card callback"}.
- [ ] Existing host calls \`adapter/handlers.ts\` and records a \`card_action_received\` or equivalent adapter audit event.
- [ ] If \`ALLOWED_OPERATOR_OPEN_IDS\` is set, an unlisted operator gets a red failure card and the target service is not called.
- [ ] Repeating the same card action immediately is deduplicated by the host or documented as a host-owned behavior.
- [ ] Existing host calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/generate\` through the adapter.
- [ ] Submitted template id, field, size, and message values appear in the target request or output behavior.
- [ ] Target service returns \`image_url\`.
- [ ] Existing host uploads image to Feishu or records fallback URL.
- [ ] Test chat card updates to success.
- [ ] Success card shows \`Feedback\` input and \`Iterate image\` action when the target returns \`session_id\`.
- [ ] Operator submits feedback from the success card in Feishu.
- [ ] Existing host calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/iterate\` through the adapter.
- [ ] Test chat receives an iterated result card with trace ID and result summary.
- [ ] Operator submits a batch job from Feishu.
- [ ] Existing host calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/batch\` through the adapter.
- [ ] Batch progress card shows batch id, done/total, completed count, failed count, and refresh action.
- [ ] Operator refreshes the batch progress card from Feishu.
- [ ] Existing host calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/batch/{batch_id}/status\` through the adapter.
- [ ] Completed batch card shows a download link for \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/batch/{batch_id}/download\` when completed images exist.
- [ ] Success card includes trace ID and result summary.

## Failure-Path Evidence

At least one failure path should be observed before considering this package stable:

- [ ] Invalid card input returns a red failure card and does not call the target service.
- [ ] Missing or invalid target base URL returns a readable failure card.
- [ ] Slow or stuck target response returns a readable timeout failure card.
- [ ] Missing Feishu host configuration is caught before accepting real non-challenge callbacks.
- [ ] Image upload failure falls back to target output URL when available.

## Artifacts

- \`verification_report.md\` path:
- Existing host audit/log evidence path:
- Start card message ID:
- Result card message ID or screenshot:
- Generated image URL or image key:
- Batch ID:
- Batch status card message ID or screenshot:
- Batch download URL or screenshot:
- Trace ID:
- Notes:

## Completion Decision

- [ ] Level 2 verified.
- [ ] Remaining issues documented.
- [ ] This generated package can be handed to another FDE using \`README.md\`, \`deployment_checklist.md\`, and this file.
`;
  }

  return `# Level 2 Verification Record

Use this file to record the real Feishu/Lark verification for this generated package.

## Environment

- Date:
- Operator:
- Target service: ${service.service.name}
- Target base URL: ${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}
- Generated package path:
- Bot runtime URL:
- Public callback URL: <PUBLIC_CALLBACK_BASE_URL>/webhook/card
- Feishu app name:
- Test chat:

## Required Feishu Setup

- [ ] Bot capability is enabled.
- [ ] Bot is added to the test chat.
- [ ] App credentials are written to \`bot-runtime/.env\`: \`APP_ID\`, \`APP_SECRET\`.
- [ ] Callback token is written to \`bot-runtime/.env\`: \`VERIFICATION_TOKEN\`.
- [ ] \`ENCRYPT_KEY\` is written if encrypted callbacks are enabled.
- [ ] \`TEST_CHAT_ID\` is written.
- [ ] \`PUBLIC_CALLBACK_BASE_URL\` is written and publicly reachable by Feishu.
- [ ] \`DEBUG_ACCESS_TOKEN\` is set before \`/debug/*\` endpoints are exposed through a public runtime URL.
- [ ] \`ALLOWED_OPERATOR_OPEN_IDS\` is set for real group use, or the operator explicitly accepts that any valid card click can run the service.
- [ ] Card callback URL is configured as \`<PUBLIC_CALLBACK_BASE_URL>/webhook/card\`.

## Required Scopes

${scopes}

## Required Callbacks

${callbacks}

## CLI Command Style

- If this package still lives under the original Lark-deployer repository, run commands as \`node ..\\..\\dist\\index.js <command> .\`.
- If this package was copied elsewhere, set \`$env:LARK_DEPLOYER_CLI="C:\\path\\to\\Lark-deployer\\dist\\index.js"\` and run commands as \`node $env:LARK_DEPLOYER_CLI <command> .\`.

## Preflight Evidence

- [ ] \`GET <target_base_url>/api/meta\` succeeds from the bot runtime environment.
- [ ] \`GET <bot_runtime_url>/health\` succeeds.
- [ ] \`POST <bot_runtime_url>/webhook/card\` answers a local \`url_verification\` challenge.
- [ ] \`POST <PUBLIC_CALLBACK_BASE_URL>/webhook/card\` answers a public \`url_verification\` challenge.
- [ ] Signed card-action payloads to local and public \`/webhook/card\` return success cards when \`VERIFICATION_TOKEN\` is set.
- [ ] If \`ENCRYPT_KEY\` is enabled, local and public encrypted \`url_verification\` challenges both succeed.
- [ ] \`POST <bot_runtime_url>/debug/simulate-generate\` succeeds.
- [ ] \`POST <bot_runtime_url>/debug/simulate-card-action\` succeeds and writes \`card_action_received\`.
- [ ] \`verify . --runtime-url <bot_runtime_url> --simulate\` records card-action, v2 card-action, iterate, batch, batch-refresh, and invalid-input failure-card PASS checks using the command style above.
- [ ] \`verify . --runtime-url <bot_runtime_url> --level2\` succeeds using the command style above.
- [ ] \`verification_report.md\` has no FAIL checks.

## Interaction Evidence

- [ ] \`POST <bot_runtime_url>/debug/start-card\` returns success.
- [ ] \`/debug/start-card\` response does not contain a non-zero Feishu OpenAPI \`code\`.
- [ ] Test chat receives the start card.
- [ ] Start card shows expected template fields from \`manifest/image_agent_meta.snapshot.json\`.
- [ ] Start card shows \`Template ID\`, \`Size\`, optional \`Message\`, and batch items JSON inputs.
- [ ] Operator submits a valid card form in Feishu.
- [ ] Bot runtime receives the card callback.
- [ ] Bot runtime writes an audit event with \`card_action_received\`.
- [ ] If \`ALLOWED_OPERATOR_OPEN_IDS\` is set, an unlisted operator gets a red failure card and the target service is not called.
- [ ] Repeating the same card action immediately writes \`card_action_duplicate\` and does not call the target service twice.
- [ ] Bot runtime calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/generate\`.
- [ ] Submitted template id, field, size, and message values appear in the target request or output behavior.
- [ ] Target service returns \`image_url\`.
- [ ] Bot runtime uploads image to Feishu or records fallback URL.
- [ ] Test chat card updates to success.
- [ ] Success card shows \`Feedback\` input and \`Iterate image\` action when the target returns \`session_id\`.
- [ ] Operator submits feedback from the success card in Feishu.
- [ ] Bot runtime calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/iterate\`.
- [ ] Test chat receives an iterated result card with trace ID and result summary.
- [ ] Operator submits a batch job from Feishu.
- [ ] Bot runtime calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/batch\`.
- [ ] Batch progress card shows batch id, done/total, completed count, failed count, and refresh action.
- [ ] Operator refreshes the batch progress card from Feishu.
- [ ] Bot runtime calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/batch/{batch_id}/status\`.
- [ ] Completed batch card shows a download link for \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/batch/{batch_id}/download\` when completed images exist.
- [ ] If \`CARD_ACTION_MODE=async\`, \`bot-runtime/audit.log\` includes \`async_generation_queued\` and \`message_patch_succeeded\`.
- [ ] Success card includes trace ID and result summary.

## Failure-Path Evidence

At least one failure path should be observed before considering this package stable:

- [ ] Invalid card input returns a red failure card and does not call the target service.
- [ ] Missing or invalid target base URL returns a readable failure card.
- [ ] Slow or stuck target response returns a readable timeout failure card.
- [ ] Missing Feishu \`.env\` values are caught before accepting real non-challenge callbacks.
- [ ] Image upload failure falls back to target output URL when available.

## Artifacts

- \`verification_report.md\` path:
- \`bot-runtime/audit.log\` path:
- Start card message ID:
- Result card message ID or screenshot:
- Generated image URL or image key:
- Batch ID:
- Batch status card message ID or screenshot:
- Batch download URL or screenshot:
- Trace ID:
- Notes:

## Completion Decision

- [ ] Level 2 verified.
- [ ] Remaining issues documented.
- [ ] This generated package can be handed to another FDE using \`README.md\`, \`deployment_checklist.md\`, and this file.
`;
}

function runtimePackageJson(serviceName: string): string {
  return `${JSON.stringify({
    name: `${slugify(serviceName)}-lark-bot-runtime`,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      build: "tsc -p tsconfig.json",
      start: "node dist/index.js",
      dev: "tsx src/index.ts",
    },
    dependencies: {
      "@larksuiteoapi/node-sdk": "^1.68.0",
      "dotenv": "^16.4.7",
    },
    overrides: {
      axios: "^1.18.1",
    },
    devDependencies: {
      "@types/node": "^24.0.10",
      "tsx": "^4.20.3",
      "typescript": "^5.8.3",
    },
  }, null, 2)}\n`;
}

function runtimeTsconfig(): string {
  return `${JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: "dist",
      rootDir: "src",
    },
    include: ["src/**/*.ts"],
  }, null, 2)}\n`;
}

function runtimeEnvExample(service: ServiceManifest): string {
  return `# Feishu/Lark app credentials
APP_ID=
APP_SECRET=
VERIFICATION_TOKEN=
ENCRYPT_KEY=

# The chat that receives the first test card.
TEST_CHAT_ID=

# Public base URL that Feishu can call. Configure card callback to:
# \${PUBLIC_CALLBACK_BASE_URL}/webhook/card
PUBLIC_CALLBACK_BASE_URL=

# Target service. Lark-deployer does not start or manage this service.
IMAGE_AGENT_BASE_URL=${service.service.base_url || "http://127.0.0.1:8000"}
IMAGE_AGENT_TIMEOUT_MS=120000

# Runtime HTTP server
HOST=0.0.0.0
PORT=3978

# Optional: if image upload fails, success card falls back to target image URL.
UPLOAD_IMAGE_TO_LARK=1

# Card action handling:
# - sync waits for the target service and returns the final card directly.
# - async returns a running card immediately, then patches the original message.
CARD_ACTION_MODE=sync

# Optional: override Feishu OpenAPI base URL for local verification/mocking.
FEISHU_OPENAPI_BASE_URL=

# Optional: protect /debug/* endpoints when the runtime is publicly reachable.
# Send as Authorization: Bearer <token> or x-lark-deployer-debug-token: <token>.
# configure auto-generates this when PUBLIC_CALLBACK_BASE_URL is set and debug remains enabled.
DEBUG_ACCESS_TOKEN=

# Optional: comma-separated Feishu operator open_id values allowed to execute card actions.
# Empty means any valid card click can run the service.
ALLOWED_OPERATOR_OPEN_IDS=

# Allows /health and local debug simulation before Feishu credentials are filled.
# Callback verification requires VERIFICATION_TOKEN.
# Sending the first test card requires APP_ID, APP_SECRET, and TEST_CHAT_ID.
# Uploading images to Feishu requires APP_ID and APP_SECRET.
# Full Level 2 verification requires APP_ID, APP_SECRET, VERIFICATION_TOKEN,
# TEST_CHAT_ID, PUBLIC_CALLBACK_BASE_URL, and a reachable target service.
ALLOW_DEBUG_WITHOUT_FEISHU=1
`;
}

function runtimeConfigTs(): string {
  return `import dotenv from "dotenv";

dotenv.config();

export interface RuntimeConfig {
  appId: string;
  appSecret: string;
  verificationToken: string;
  encryptKey: string;
  testChatId: string;
  publicCallbackBaseUrl: string;
  imageAgentBaseUrl: string;
  imageAgentTimeoutMs: number;
  host: string;
  port: number;
  uploadImageToLark: boolean;
  cardActionMode: "sync" | "async";
  feishuOpenApiBaseUrl: string;
  debugAccessToken: string;
  allowedOperatorOpenIds: string[];
  allowDebugWithoutFeishu: boolean;
  missingFeishuKeys: string[];
  missingFeishuApiKeys: string[];
  missingCallbackKeys: string[];
  missingSendKeys: string[];
  feishuConfigured: boolean;
  feishuApiConfigured: boolean;
  callbackConfigured: boolean;
  sendConfigured: boolean;
}

export function loadConfig(): RuntimeConfig {
  const base = {
    appId: envValue("APP_ID"),
    appSecret: envValue("APP_SECRET"),
    verificationToken: envValue("VERIFICATION_TOKEN"),
    encryptKey: envValue("ENCRYPT_KEY"),
    testChatId: envValue("TEST_CHAT_ID"),
    publicCallbackBaseUrl: stripTrailingSlash(envValue("PUBLIC_CALLBACK_BASE_URL")),
    imageAgentBaseUrl: stripTrailingSlash(envValue("IMAGE_AGENT_BASE_URL", "http://127.0.0.1:8000")),
    imageAgentTimeoutMs: parsePositiveInt(envValue("IMAGE_AGENT_TIMEOUT_MS", "120000"), "IMAGE_AGENT_TIMEOUT_MS"),
    host: envValue("HOST", "0.0.0.0"),
    port: parsePort(envValue("PORT", "3978"), "PORT"),
    uploadImageToLark: parseFlag(envValue("UPLOAD_IMAGE_TO_LARK", "1"), "UPLOAD_IMAGE_TO_LARK"),
    cardActionMode: parseCardActionMode(envValue("CARD_ACTION_MODE", "sync")),
    feishuOpenApiBaseUrl: stripTrailingSlash(envValue("FEISHU_OPENAPI_BASE_URL")),
    debugAccessToken: envValue("DEBUG_ACCESS_TOKEN"),
    allowedOperatorOpenIds: parseCsv(envValue("ALLOWED_OPERATOR_OPEN_IDS")),
    allowDebugWithoutFeishu: parseFlag(envValue("ALLOW_DEBUG_WITHOUT_FEISHU", "0"), "ALLOW_DEBUG_WITHOUT_FEISHU"),
  };

  const missingApi = [
    ["APP_ID", base.appId],
    ["APP_SECRET", base.appSecret],
  ].filter(([, value]) => !value);
  const missingCallback = [
    ["VERIFICATION_TOKEN", base.verificationToken],
  ].filter(([, value]) => !value);
  const missingSend = [
    ["APP_ID", base.appId],
    ["APP_SECRET", base.appSecret],
    ["TEST_CHAT_ID", base.testChatId],
  ].filter(([, value]) => !value);
  const missing = [
    ...missingApi,
    ...missingCallback,
    ["TEST_CHAT_ID", base.testChatId],
  ].filter(([, value]) => !value);

  if (missing.length && !base.allowDebugWithoutFeishu) {
    throw new Error(\`Missing required environment values: \${missing.map(([key]) => key).join(", ")}\`);
  }

  return {
    ...base,
    missingFeishuKeys: missing.map(([key]) => key),
    missingFeishuApiKeys: missingApi.map(([key]) => key),
    missingCallbackKeys: missingCallback.map(([key]) => key),
    missingSendKeys: missingSend.map(([key]) => key),
    feishuConfigured: missing.length === 0,
    feishuApiConfigured: missingApi.length === 0,
    callbackConfigured: missingCallback.length === 0,
    sendConfigured: missingSend.length === 0,
  };
}

function envValue(key: string, defaultValue = ""): string {
  const value = process.env[key];
  if (value === undefined || value === null) return defaultValue;
  const trimmed = value.trim();
  if (!trimmed || isPlaceholderValue(trimmed)) return defaultValue;
  return trimmed;
}

function isPlaceholderValue(value: string): boolean {
  return /^<[^>\\r\\n]+>$/.test(value)
    || /^\\{\\{[^}\\r\\n]+\\}\\}$/.test(value)
    || /^\\$\\{[^}\\r\\n]+\\}$/.test(value)
    || /^(todo|tbd|changeme|change-me|replace-me|placeholder|dummy)$/i.test(value)
    || /^(your|replace|fill|insert)[-_ ]?[a-z0-9_-]*$/i.test(value);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\\/+$/, "");
}

function parsePort(value: string, key: string): number {
  if (!/^\\d+$/.test(value)) {
    throw new Error(\`\${key} must be an integer between 1 and 65535.\`);
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(\`\${key} must be an integer between 1 and 65535.\`);
  }
  return port;
}

function parsePositiveInt(value: string, key: string): number {
  if (!/^\\d+$/.test(value)) {
    throw new Error(\`\${key} must be a positive integer.\`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(\`\${key} must be a positive integer.\`);
  }
  return parsed;
}

function parseFlag(value: string, key: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  throw new Error(\`\${key} must be 1, 0, true, or false.\`);
}

function parseCardActionMode(value: string): "sync" | "async" {
  if (value === "sync" || value === "async") return value;
  throw new Error("CARD_ACTION_MODE must be sync or async.");
}

function parseCsv(value: string): string[] {
  return value.split(",").map((item) => isPlaceholderValue(item.trim()) ? "" : item.trim()).filter(Boolean);
}
`;
}

function runtimeAuditTs(): string {
  return `import fs from "node:fs";
import path from "node:path";

export interface AuditEvent {
  trace_id: string;
  event: string;
  time: string;
  detail: Record<string, unknown>;
}

export function makeTraceId(): string {
  return \`img_\${Date.now()}_\${Math.random().toString(16).slice(2, 10)}\`;
}

export function audit(event: Omit<AuditEvent, "time">): void {
  const entry: AuditEvent = {
    ...event,
    time: new Date().toISOString(),
  };
  const filePath = path.join(process.cwd(), "audit.log");
  fs.appendFileSync(filePath, \`\${JSON.stringify(entry)}\\n\`, "utf8");
}

export function readAuditTail(limit = 50): AuditEvent[] {
  const filePath = path.join(process.cwd(), "audit.log");
  if (!fs.existsSync(filePath)) return [];
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
  return fs.readFileSync(filePath, "utf8")
    .split(/\\r?\\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-safeLimit)
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as AuditEvent : undefined;
      } catch {
        return undefined;
      }
    })
    .filter((event): event is AuditEvent => Boolean(event));
}
`;
}
