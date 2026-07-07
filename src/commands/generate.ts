import fs from "node:fs";
import path from "node:path";
import { getStringOption, hasOption } from "../args.js";
import { buildContextMarkdown, buildContextReplyMarkdown, buildContextReplyTemplate, buildContextRequestMarkdown, buildContextTemplate, type ContextTemplate } from "./context.js";
import { copyFileIfExists, ensureDir, readJsonFile, slugify, writeJson, writeText } from "../fs-utils.js";
import { buildFormFieldMaps, formFieldName } from "../field-mapping.js";
import { hostModeUsesLongConnection, hostModeUsesWebhook, normalizeHostReceiveMode, type HostReceiveMode, type IntegrationMode } from "../host-mode.js";
import type { CapabilityMap, InteractionContract, RequiredPermissions, ServiceManifest } from "../types.js";
import { buildDeploymentChecklist } from "./plan.js";

interface ImageAgentMeta {
  templates?: Array<{
    id: string;
    name?: string;
    allowed_sizes?: string[];
    default_size?: string;
    fields?: Array<{ key: string; label?: string; required?: boolean; placeholder?: string }>;
  }>;
}

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
  writeText(path.join(outDir, "README.md"), buildGeneratedReadme(service, permissions, integrationMode, hostReceiveMode));
  writeText(path.join(outDir, "deployment_checklist.md"), buildDeploymentChecklist(service, permissions, integrationMode));
  writeText(path.join(docsDir, "integration_guide.md"), integrationMode === "self-hosted-runtime" ? buildSelfHostedIntegrationGuide(service) : buildEmbeddedIntegrationGuide(service, permissions, hostReceiveMode));
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

function pythonHostCardsPy(): string {
  return `"""Card builders for the generated Feishu Python host."""

from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
from typing import Any, Dict


SPEC_DIR = Path(__file__).with_name("spec")


def load_start_card() -> Dict[str, Any]:
    with (SPEC_DIR / "start_card.json").open("r", encoding="utf-8") as handle:
        return json.load(handle)


def build_success_card(result: Dict[str, Any]) -> Dict[str, Any]:
    image_url = _string_value(result.get("image_url"))
    session_id = _string_value(result.get("session_id"))
    trace_id = _string_value(result.get("trace_id"))
    elements = [
        {"tag": "markdown", "content": "**Image:** " + image_url if image_url else "Image generation completed."},
    ]
    if trace_id:
        elements.append({"tag": "markdown", "content": "**Trace ID:** " + trace_id})
    if session_id:
        elements.append({
            "tag": "form",
            "name": "image_iterate_form",
            "elements": [
                {
                    "tag": "input",
                    "name": "param_feedback",
                    "required": True,
                    "width": "fill",
                    "input_type": "multiline_text",
                    "rows": 2,
                    "auto_resize": True,
                    "label": {"tag": "plain_text", "content": "Feedback"},
                    "placeholder": {"tag": "plain_text", "content": "Describe what to refine in the next image"},
                },
                {
                    "tag": "button",
                    "text": {"tag": "plain_text", "content": "Iterate image"},
                    "type": "primary",
                    "form_action_type": "submit",
                    "name": "submit_image_iterate",
                    "behaviors": [{"type": "callback", "value": {"action": "image.iterate.submit", "session_id": session_id}}],
                },
            ],
        })
    return _card("green", "Image generation complete", elements)


def build_failure_card(message: str) -> Dict[str, Any]:
    return _card("red", "Image generation failed", [{"tag": "markdown", "content": "**What happened:** " + str(message)}])


def build_running_card(action: str, trace_id: str = "") -> Dict[str, Any]:
    lines = ["The request was accepted and is running.", "**Action:** " + _string_value(action)]
    if trace_id:
        lines.append("**Trace ID:** " + trace_id)
    return _card("blue", "Image generation running", [{"tag": "markdown", "content": "\\n\\n".join(lines)}])


def build_batch_status_card(status: Dict[str, Any], download_url: str = "") -> Dict[str, Any]:
    total = _number_value(status.get("total"))
    done = _number_value(status.get("done"))
    completed_count = len(status.get("completed")) if isinstance(status.get("completed"), list) else 0
    failed_count = len(status.get("failed")) if isinstance(status.get("failed"), list) else 0
    running = status.get("running") is True
    finished = not running and total > 0 and done >= total
    batch_id = _string_value(status.get("batch_id"))
    lines = [
        "**Status:** " + ("running" if running else "completed" if finished else "not running"),
        "**Batch ID:** " + batch_id,
        "**Done:** " + str(done) + "/" + str(total),
        "**Completed:** " + str(completed_count),
        "**Failed:** " + str(failed_count),
    ]
    if _string_value(status.get("template_id")):
        lines.append("**Template:** " + _string_value(status.get("template_id")))
    if _string_value(status.get("size")):
        lines.append("**Size:** " + _string_value(status.get("size")))
    elements = [{"tag": "markdown", "content": "\\n\\n".join(lines)}]
    if finished and download_url and completed_count > 0:
        elements.append({"tag": "markdown", "content": "[Download completed images ZIP](" + download_url + ")"})
    if batch_id:
        elements.append({
            "tag": "button",
            "text": {"tag": "plain_text", "content": "Refresh status"},
            "type": "default",
            "behaviors": [{"type": "callback", "value": {"action": "image.batch.refresh", "batch_id": batch_id}}],
        })
    return _card(
        "blue" if running else "red" if failed_count > 0 else "green",
        "Batch running" if running else "Batch finished with failures" if failed_count > 0 else "Batch complete",
        elements,
    )


def clone_card(card: Dict[str, Any]) -> Dict[str, Any]:
    return deepcopy(card)


def _card(template: str, title: str, elements: list[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "schema": "2.0",
        "config": {"update_multi": True, "wide_screen_mode": True},
        "header": {"template": template, "title": {"tag": "plain_text", "content": title}},
        "body": {"elements": elements},
    }


def _string_value(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _number_value(value: Any) -> int:
    return int(value) if isinstance(value, (int, float)) and value == value else 0
`;
}

function pythonHostServiceClientPy(): string {
  return `"""HTTP client for image-agent-web target calls."""

from __future__ import annotations

import json
from typing import Any, Dict


class TargetServiceError(RuntimeError):
    def __init__(self, operation: str, message: str, status_code: int | None = None, detail: Any = None):
        super().__init__(message)
        self.operation = operation
        self.status_code = status_code
        self.detail = detail

    def to_audit_detail(self) -> Dict[str, Any]:
        return {"operation": self.operation, "status_code": self.status_code, "detail": self.detail}


def call_generate(base_url: str, preset: Dict[str, Any], timeout_ms: int = 120000) -> Dict[str, Any]:
    data = {
        "template_id": _string_value(preset.get("template_id")),
        "size": _string_value(preset.get("size")),
        "fields_json": json.dumps(preset.get("fields") if isinstance(preset.get("fields"), dict) else {}, ensure_ascii=False),
        "message": _string_value(preset.get("message")),
        "reference_types_json": "[]",
    }
    response = _post(_join_url(base_url, "/api/generate"), data=data, timeout_ms=timeout_ms, operation="generate")
    return _read_json_response(response, "generate")


def call_iterate(base_url: str, request: Dict[str, Any], timeout_ms: int = 120000) -> Dict[str, Any]:
    payload = {"session_id": _string_value(request.get("session_id")), "feedback": _string_value(request.get("feedback"))}
    response = _post(_join_url(base_url, "/api/iterate"), json_body=payload, timeout_ms=timeout_ms, operation="iterate")
    return _read_json_response(response, "iterate")


def call_batch_create(base_url: str, request: Dict[str, Any], timeout_ms: int = 120000) -> Dict[str, Any]:
    data = {
        "template_id": _string_value(request.get("template_id")),
        "size": _string_value(request.get("size")),
        "items_json": json.dumps(request.get("items") if isinstance(request.get("items"), list) else [], ensure_ascii=False),
        "reference_types_json": "[]",
    }
    response = _post(_join_url(base_url, "/api/batch"), data=data, timeout_ms=timeout_ms, operation="batch")
    parsed = _read_json_response(response, "batch")
    if not _string_value(parsed.get("batch_id")):
        raise TargetServiceError("batch", "image-agent-web /api/batch response did not include batch_id", detail=parsed)
    return parsed


def call_batch_status(base_url: str, batch_id: str, timeout_ms: int = 120000) -> Dict[str, Any]:
    response = _get(_join_url(base_url, "/api/batch/" + _quote(batch_id) + "/status"), timeout_ms=timeout_ms, operation="batch_status")
    return _read_json_response(response, "batch_status")


def resolve_download_url(base_url: str, batch_id: str) -> str:
    return _join_url(base_url, "/api/batch/" + _quote(batch_id) + "/download")


def resolve_image_url(base_url: str, image_url: str) -> str:
    value = _string_value(image_url)
    if not value:
        return ""
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if value.startswith("/"):
        return _join_url(base_url, value)
    return _join_url(base_url, "/" + value)


def _post(url: str, *, data: Dict[str, str] | None = None, json_body: Dict[str, Any] | None = None, timeout_ms: int, operation: str):
    requests = _requests()
    try:
        return requests.post(url, data=data, json=json_body, timeout=_timeout_seconds(timeout_ms))
    except requests.exceptions.Timeout as exc:
        raise TargetServiceError(operation, operation + " timed out after " + str(timeout_ms) + "ms") from exc
    except requests.exceptions.RequestException as exc:
        raise TargetServiceError(operation, operation + " request failed: " + str(exc)) from exc


def _get(url: str, *, timeout_ms: int, operation: str):
    requests = _requests()
    try:
        return requests.get(url, timeout=_timeout_seconds(timeout_ms))
    except requests.exceptions.Timeout as exc:
        raise TargetServiceError(operation, operation + " timed out after " + str(timeout_ms) + "ms") from exc
    except requests.exceptions.RequestException as exc:
        raise TargetServiceError(operation, operation + " request failed: " + str(exc)) from exc


def _read_json_response(response: Any, operation: str) -> Dict[str, Any]:
    text = getattr(response, "text", "") or ""
    try:
        parsed = response.json() if text else {}
    except ValueError:
        parsed = {"raw": text}
    status_code = int(getattr(response, "status_code", 0) or 0)
    if status_code < 200 or status_code >= 300:
        message = parsed.get("detail") if isinstance(parsed, dict) else text
        raise TargetServiceError(operation, "image-agent-web " + operation + " returned HTTP " + str(status_code) + ": " + str(message), status_code=status_code, detail=parsed)
    return parsed if isinstance(parsed, dict) else {}


def _requests():
    import requests
    return requests


def _timeout_seconds(timeout_ms: int) -> float:
    return max(int(timeout_ms), 1) / 1000.0


def _join_url(base_url: str, path: str) -> str:
    return str(base_url).rstrip("/") + path


def _quote(value: str) -> str:
    from urllib.parse import quote
    return quote(str(value), safe="")


def _string_value(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""
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

function pythonHostHandlersPy(): string {
  return `"""Card action handler for the generated Feishu Python host."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping

import cards
import service_client
import validation


SPEC_DIR = Path(__file__).with_name("spec")


@dataclass(frozen=True)
class HandlerDeps:
    image_agent_base_url: str
    timeout_ms: int = 120000
    allowed_operator_open_ids: tuple[str, ...] = ()
    call_generate: Callable[..., Dict[str, Any]] = service_client.call_generate
    call_iterate: Callable[..., Dict[str, Any]] = service_client.call_iterate
    call_batch_create: Callable[..., Dict[str, Any]] = service_client.call_batch_create
    call_batch_status: Callable[..., Dict[str, Any]] = service_client.call_batch_status
    resolve_download_url: Callable[..., str] = service_client.resolve_download_url
    resolve_image_url: Callable[..., str] = service_client.resolve_image_url


def handle_card_action(ctx: Any, deps: HandlerDeps | Mapping[str, Any]) -> Dict[str, Any]:
    normalized = normalize_card_action(ctx)
    deps_obj = _deps_from_mapping(deps)
    audit_events = [_audit("python_host_card_action_received", {"action": normalized["action"]})]
    try:
        validation.assert_allowed_operator(normalized["operatorOpenId"], deps_obj.allowed_operator_open_ids)
        endpoints = _load_json("endpoints.json")
        actions = endpoints.get("actions") if isinstance(endpoints.get("actions"), dict) else {}
        action = normalized["action"]
        if action not in actions:
            raise ValueError("Unsupported card action: " + action)
        if action == "image.generate.submit":
            preset = _build_generate_preset(normalized)
            result = deps_obj.call_generate(deps_obj.image_agent_base_url, preset, deps_obj.timeout_ms)
            image_url = deps_obj.resolve_image_url(deps_obj.image_agent_base_url, _string_value(result.get("image_url")))
            if image_url:
                result["image_url"] = image_url
            audit_events.append(_audit("python_host_generation_succeeded", {"imageUrl": result.get("image_url", "")}))
            return _result(True, cards.build_success_card(result), audit_events, result=result)
        if action == "image.iterate.submit":
            request = _build_iterate_request(normalized)
            result = deps_obj.call_iterate(deps_obj.image_agent_base_url, request, deps_obj.timeout_ms)
            image_url = deps_obj.resolve_image_url(deps_obj.image_agent_base_url, _string_value(result.get("image_url")))
            if image_url:
                result["image_url"] = image_url
            audit_events.append(_audit("python_host_iteration_succeeded", {"session_id": result.get("session_id") or request["session_id"]}))
            return _result(True, cards.build_success_card(result), audit_events, result=result)
        if action == "image.batch.submit":
            request = _build_batch_request(normalized)
            created = deps_obj.call_batch_create(deps_obj.image_agent_base_url, request, deps_obj.timeout_ms)
            batch_id = _string_value(created.get("batch_id"))
            status = deps_obj.call_batch_status(deps_obj.image_agent_base_url, batch_id, deps_obj.timeout_ms)
            download_url = _batch_download_url(deps_obj, status)
            audit_events.append(_audit("python_host_batch_submitted", {"batchId": batch_id, "total": len(request["items"])}))
            return _result(True, cards.build_batch_status_card(status, download_url), audit_events, batchId=batch_id, batchStatus=status, downloadUrl=download_url)
        if action == "image.batch.refresh":
            batch_id = _string_value(normalized["value"].get("batch_id") or normalized["value"].get("batchId") or normalized["formValue"].get("param_batch_id"))
            if not batch_id:
                raise ValueError("batch_id is required.")
            status = deps_obj.call_batch_status(deps_obj.image_agent_base_url, batch_id, deps_obj.timeout_ms)
            download_url = _batch_download_url(deps_obj, status)
            audit_events.append(_audit("python_host_batch_status_checked", {"batchId": batch_id, "downloadUrl": download_url or None}))
            return _result(True, cards.build_batch_status_card(status, download_url), audit_events, batchId=batch_id, batchStatus=status, downloadUrl=download_url)
        raise ValueError("Unsupported card action: " + action)
    except Exception as exc:
        message = str(exc)
        audit_events.append(_audit("python_host_card_action_failed", {"message": message}))
        return _result(False, cards.build_failure_card(message), audit_events)


def normalize_card_action(ctx: Any) -> Dict[str, Any]:
    if isinstance(ctx, Mapping):
        value = _object_value(ctx.get("value"))
        form_value = _object_value(ctx.get("formValue") or ctx.get("form_value"))
        action = _string_value(ctx.get("action") or value.get("action"))
        return {
            "action": action,
            "value": value,
            "formValue": form_value,
            "operatorOpenId": _string_value(ctx.get("operatorOpenId") or ctx.get("operator_open_id")),
            "openMessageId": _string_value(ctx.get("openMessageId") or ctx.get("open_message_id")),
            "openChatId": _string_value(ctx.get("openChatId") or ctx.get("open_chat_id")),
        }
    event = getattr(ctx, "event", None)
    action_obj = getattr(event, "action", None)
    raw_value = getattr(action_obj, "value", None)
    value = _object_value(json.loads(raw_value) if isinstance(raw_value, str) and raw_value.strip().startswith("{") else raw_value)
    form_value = _object_value(getattr(action_obj, "form_value", None))
    operator = getattr(event, "operator", None)
    context = getattr(event, "context", None)
    return {
        "action": _string_value(value.get("action")),
        "value": value,
        "formValue": form_value,
        "operatorOpenId": _string_value(getattr(operator, "open_id", "")),
        "openMessageId": _string_value(getattr(context, "open_message_id", "")),
        "openChatId": _string_value(getattr(context, "open_chat_id", "")),
    }


def _build_generate_preset(normalized: Dict[str, Any]) -> Dict[str, Any]:
    base = normalized["value"].get("preset") if isinstance(normalized["value"].get("preset"), dict) else _load_json("preset.json")
    form_value = normalized["formValue"]
    fields = dict(base.get("fields") if isinstance(base.get("fields"), dict) else {})
    field_map = _load_json("field_map.json").get("formFieldToTemplateKey", {})
    for key, value in form_value.items():
        if key.startswith("field_") and isinstance(value, str):
            fields[str(field_map.get(key) or key.removeprefix("field_"))] = value.strip()
    preset = {
        "template_id": _string_value(form_value.get("param_template_id")) or _string_value(base.get("template_id")),
        "size": _string_value(form_value.get("param_size")) or _string_value(base.get("size")),
        "fields": fields,
        "message": _string_value(form_value.get("param_message")) or _string_value(base.get("message")),
    }
    validation.validate_size(preset["size"])
    validation.validate_required_fields(preset["template_id"], preset["fields"], _load_json("template_specs.json"), _load_json("field_specs.json"))
    return preset


def _build_iterate_request(normalized: Dict[str, Any]) -> Dict[str, Any]:
    session_id = _string_value(normalized["value"].get("session_id") or normalized["value"].get("sessionId") or normalized["formValue"].get("param_session_id"))
    feedback = _string_value(normalized["formValue"].get("param_feedback") or normalized["value"].get("feedback"))
    if not session_id or not feedback:
        raise ValueError("session_id and feedback are required.")
    return {"session_id": session_id, "feedback": feedback}


def _build_batch_request(normalized: Dict[str, Any]) -> Dict[str, Any]:
    preset = _load_json("preset.json")
    form_value = normalized["formValue"]
    value = normalized["value"]
    template_id = _string_value(form_value.get("param_batch_template_id") or value.get("template_id") or value.get("templateId") or preset.get("template_id"))
    size = _string_value(form_value.get("param_batch_size") or value.get("size") or preset.get("size"))
    validation.validate_size(size)
    items_json = _string_value(form_value.get("param_batch_items_json") or value.get("items_json") or value.get("itemsJson"))
    raw_items = json.loads(items_json) if items_json else value.get("items")
    items = validation.validate_batch_items(raw_items)
    return {"template_id": template_id, "size": size, "items": items}


def _batch_download_url(deps: HandlerDeps, status: Dict[str, Any]) -> str:
    batch_id = _string_value(status.get("batch_id"))
    completed = status.get("completed")
    if batch_id and status.get("running") is not True and isinstance(completed, list) and completed:
        return deps.resolve_download_url(deps.image_agent_base_url, batch_id)
    return ""


def _deps_from_mapping(deps: HandlerDeps | Mapping[str, Any]) -> HandlerDeps:
    if isinstance(deps, HandlerDeps):
        return deps
    return HandlerDeps(
        image_agent_base_url=_string_value(deps.get("imageAgentBaseUrl") or deps.get("image_agent_base_url")),
        timeout_ms=int(deps.get("timeoutMs") or deps.get("timeout_ms") or 120000),
        allowed_operator_open_ids=tuple(deps.get("allowedOperatorOpenIds") or deps.get("allowed_operator_open_ids") or ()),
        call_generate=deps.get("call_generate", service_client.call_generate),
        call_iterate=deps.get("call_iterate", service_client.call_iterate),
        call_batch_create=deps.get("call_batch_create", service_client.call_batch_create),
        call_batch_status=deps.get("call_batch_status", service_client.call_batch_status),
        resolve_download_url=deps.get("resolve_download_url", service_client.resolve_download_url),
        resolve_image_url=deps.get("resolve_image_url", service_client.resolve_image_url),
    )


def _result(ok: bool, card: Dict[str, Any], audit_events: List[Dict[str, Any]], **extra: Any) -> Dict[str, Any]:
    result = {"ok": ok, "card": card, "auditEvents": audit_events, "response": {"card": card}}
    result.update(extra)
    return result


def _audit(event: str, detail: Dict[str, Any]) -> Dict[str, Any]:
    return {"event": event, "detail": detail}


def _load_json(name: str) -> Any:
    with (SPEC_DIR / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _object_value(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _string_value(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""
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

function pythonHostLocalContractTestPy(): string {
  return `"""Local contract test for the generated Feishu Python host.

This test starts a stdlib localhost mock of image-agent-web and drives
handlers.handle_card_action directly. It does not import lark-oapi, does not
use real Feishu credentials, and does not contact any non-local network.
"""

from __future__ import annotations

from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import time
from typing import Any, Dict, List
from urllib.parse import parse_qs, urlparse

import app
import cards
import handlers


REQUESTS: List[Dict[str, Any]] = []


class MockImageAgentHandler(BaseHTTPRequestHandler):
    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def do_POST(self) -> None:
        length = int(self.headers.get("content-length") or "0")
        raw = self.rfile.read(length).decode("utf-8")
        content_type = self.headers.get("content-type", "")
        parsed_form = {key: values[-1] for key, values in parse_qs(raw, keep_blank_values=True).items()}
        parsed_json: Dict[str, Any] = {}
        if "application/json" in content_type:
            parsed_json = json.loads(raw or "{}")
        REQUESTS.append({
            "method": "POST",
            "path": self.path,
            "content_type": content_type,
            "raw": raw,
            "form": parsed_form,
            "json": parsed_json,
        })
        if self.path == "/api/generate":
            if parsed_form.get("message") == "target-500":
                self._json(500, {"detail": "mock target failure"})
                return
            if parsed_form.get("message") == "target-timeout":
                time.sleep(0.25)
            self._json(200, {"image_url": "/outputs/generated.png", "session_id": "session-contract", "trace_id": "trace-generate"})
            return
        if self.path == "/api/iterate":
            self._json(200, {"image_url": "/outputs/iterated.png", "session_id": parsed_json.get("session_id", ""), "trace_id": "trace-iterate"})
            return
        if self.path == "/api/batch":
            self._json(200, {"batch_id": "batch-contract"})
            return
        self._json(404, {"detail": "not found"})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        REQUESTS.append({"method": "GET", "path": parsed.path, "content_type": self.headers.get("content-type", ""), "raw": "", "form": {}, "json": {}})
        if parsed.path == "/api/batch/batch-contract/status":
            self._json(200, {
                "batch_id": "batch-contract",
                "template_id": "launch-banner",
                "size": "1200x628",
                "total": 1,
                "done": 1,
                "running": False,
                "completed": [{"image_url": "https://example.invalid/batch.png"}],
                "failed": [],
            })
            return
        self._json(404, {"detail": "not found"})

    def _json(self, status: int, body: Dict[str, Any]) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, OSError):
            return


def main() -> None:
    with mock_server() as base_url:
        run_contract(base_url)
    print("feishu-host contract: PASS")


def run_contract(base_url: str) -> None:
    REQUESTS.clear()
    assert_start_message_request()
    preset = load_spec("preset.json")
    template_id = preset["template_id"]
    size = preset["size"]
    generate_result = handlers.handle_card_action(generate_ctx(), deps(base_url))
    assert generate_result["ok"] is True, generate_result
    assert "http://127.0.0.1:" in json.dumps(generate_result["card"]), generate_result
    assert "/outputs/generated.png" in json.dumps(generate_result["card"]), generate_result
    generate_request = only_request("POST", "/api/generate")
    assert_form_request(generate_request, {
        "template_id": template_id,
        "size": size,
        "message": "contract generate",
        "reference_types_json": "[]",
    })
    generate_fields = json.loads(generate_request["form"]["fields_json"])
    primary_key = primary_template_key()
    secondary_key = secondary_template_key()
    assert generate_fields[primary_key] == "Contract primary", generate_fields
    if secondary_key:
        assert generate_fields[secondary_key] == "Contract secondary", generate_fields

    before = len(REQUESTS)
    iterate_result = handlers.handle_card_action({
        "action": "image.iterate.submit",
        "value": {"action": "image.iterate.submit", "session_id": "session-contract"},
        "formValue": {"param_feedback": "make it brighter"},
        "operatorOpenId": "operator-ok",
    }, deps(base_url))
    assert iterate_result["ok"] is True, iterate_result
    iterate_request = REQUESTS[before]
    assert iterate_request["method"] == "POST" and iterate_request["path"] == "/api/iterate", iterate_request
    assert "application/json" in iterate_request["content_type"], iterate_request
    assert iterate_request["json"] == {"session_id": "session-contract", "feedback": "make it brighter"}, iterate_request

    before = len(REQUESTS)
    batch_result = handlers.handle_card_action({
        "action": "image.batch.submit",
        "value": {"action": "image.batch.submit"},
        "formValue": {
            "param_batch_template_id": template_id,
            "param_batch_size": size,
            "param_batch_items_json": json.dumps([{"fields": {primary_key: "Batch primary"}}]),
        },
        "operatorOpenId": "operator-ok",
    }, deps(base_url))
    assert batch_result["ok"] is True, batch_result
    assert batch_result["downloadUrl"].endswith("/api/batch/batch-contract/download"), batch_result
    batch_create = REQUESTS[before]
    batch_status = REQUESTS[before + 1]
    assert batch_create["method"] == "POST" and batch_create["path"] == "/api/batch", batch_create
    assert_form_request(batch_create, {"template_id": template_id, "size": size, "reference_types_json": "[]"})
    assert json.loads(batch_create["form"]["items_json"])[0]["fields"][primary_key] == "Batch primary", batch_create
    assert batch_status["method"] == "GET" and batch_status["path"] == "/api/batch/batch-contract/status", batch_status

    before = len(REQUESTS)
    refresh_result = handlers.handle_card_action({
        "action": "image.batch.refresh",
        "value": {"action": "image.batch.refresh", "batch_id": "batch-contract"},
        "formValue": {},
        "operatorOpenId": "operator-ok",
    }, deps(base_url))
    assert refresh_result["ok"] is True, refresh_result
    assert refresh_result["downloadUrl"].endswith("/api/batch/batch-contract/download"), refresh_result
    assert REQUESTS[before]["method"] == "GET" and REQUESTS[before]["path"] == "/api/batch/batch-contract/status", REQUESTS[before]
    assert "Download completed images ZIP" in json.dumps(refresh_result["card"]), refresh_result

    assert_no_target_call(base_url, invalid_size_ctx(), "Size must use")
    prove_missing_required_no_call(base_url)
    assert_no_target_call(base_url, generate_ctx(), "not authorized", allowed=("someone-else",))
    assert_no_target_call(base_url, {"action": "unknown.action", "value": {"action": "unknown.action"}, "formValue": {}, "operatorOpenId": "operator-ok"}, "Unsupported card action")

    before = len(REQUESTS)
    target_500 = handlers.handle_card_action(generate_ctx(message="target-500"), deps(base_url))
    assert target_500["ok"] is False, target_500
    assert len(REQUESTS) == before + 1, REQUESTS[before:]
    assert "HTTP 500" in json.dumps(target_500), target_500

    before = len(REQUESTS)
    timeout_result = handlers.handle_card_action(generate_ctx(message="target-timeout"), deps(base_url, timeout_ms=50))
    assert timeout_result["ok"] is False, timeout_result
    assert len(REQUESTS) == before + 1, REQUESTS[before:]
    assert "timed out" in json.dumps(timeout_result), timeout_result

    prove_special_field_mapping(base_url)


def prove_special_field_mapping(base_url: str) -> None:
    field_map_path = Path(__file__).with_name("spec") / "field_map.json"
    original = json.loads(field_map_path.read_text(encoding="utf-8"))
    patched = json.loads(json.dumps(original))
    patched.setdefault("formFieldToTemplateKey", {})["field_hero_title"] = "hero-title"
    patched.setdefault("templateKeyToFormField", {})["hero-title"] = "field_hero_title"
    field_map_path.write_text(json.dumps(patched, indent=2, ensure_ascii=False) + "\\n", encoding="utf-8")
    try:
        before = len(REQUESTS)
        result = handlers.handle_card_action(generate_ctx(extra_form={"field_hero_title": "Mapped Hero"}), deps(base_url))
        assert result["ok"] is True, result
        request = REQUESTS[before]
        fields = json.loads(request["form"]["fields_json"])
        assert fields["hero-title"] == "Mapped Hero", fields
    finally:
        field_map_path.write_text(json.dumps(original, indent=2, ensure_ascii=False) + "\\n", encoding="utf-8")


def prove_missing_required_no_call(base_url: str) -> None:
    template_specs_path = Path(__file__).with_name("spec") / "template_specs.json"
    original = json.loads(template_specs_path.read_text(encoding="utf-8"))
    patched = json.loads(json.dumps(original))
    template_id = load_spec("preset.json")["template_id"]
    required_key = primary_template_key()
    for template in patched:
        if template.get("id") == template_id:
            keys = list(template.get("requiredFieldKeys") or [])
            if required_key not in keys:
                keys.append(required_key)
            template["requiredFieldKeys"] = keys
            break
    template_specs_path.write_text(json.dumps(patched, indent=2, ensure_ascii=False) + "\\n", encoding="utf-8")
    try:
        assert_no_target_call(base_url, missing_required_ctx(required_key), "is required")
    finally:
        template_specs_path.write_text(json.dumps(original, indent=2, ensure_ascii=False) + "\\n", encoding="utf-8")


def generate_ctx(message: str = "contract generate", extra_form: Dict[str, Any] | None = None) -> Dict[str, Any]:
    preset = load_spec("preset.json")
    template_id = preset["template_id"]
    size = preset["size"]
    primary_key = primary_template_key()
    secondary_key = secondary_template_key()
    field_map = load_spec("field_map.json")["templateKeyToFormField"]
    form = {
        "param_template_id": template_id,
        "param_size": size,
        field_map[primary_key]: "Contract primary",
        "param_message": message,
    }
    if secondary_key:
        form[field_map[secondary_key]] = "Contract secondary"
    if extra_form:
        form.update(extra_form)
    return {"action": "image.generate.submit", "value": {"action": "image.generate.submit"}, "formValue": form, "operatorOpenId": "operator-ok"}


def invalid_size_ctx() -> Dict[str, Any]:
    ctx = generate_ctx()
    ctx["formValue"] = dict(ctx["formValue"])
    ctx["formValue"]["param_size"] = "0xbad"
    return ctx


def missing_required_ctx(required_key: str) -> Dict[str, Any]:
    ctx = generate_ctx()
    ctx["formValue"] = dict(ctx["formValue"])
    ctx["formValue"][load_spec("field_map.json")["templateKeyToFormField"][required_key]] = ""
    return ctx


def primary_template_key() -> str:
    field_map = load_spec("field_map.json")["templateKeyToFormField"]
    return next(iter(field_map.keys()))


def secondary_template_key() -> str:
    keys = list(load_spec("field_map.json")["templateKeyToFormField"].keys())
    return keys[1] if len(keys) > 1 else ""


def load_spec(name: str) -> Any:
    return json.loads((Path(__file__).with_name("spec") / name).read_text(encoding="utf-8"))


def assert_no_target_call(base_url: str, ctx: Dict[str, Any], expected_message: str, allowed: tuple[str, ...] = ()) -> None:
    before = len(REQUESTS)
    result = handlers.handle_card_action(ctx, deps(base_url, allowed=allowed))
    assert result["ok"] is False, result
    assert expected_message in json.dumps(result, ensure_ascii=False), result
    assert len(REQUESTS) == before, REQUESTS[before:]


def deps(base_url: str, timeout_ms: int = 120000, allowed: tuple[str, ...] = ()) -> Dict[str, Any]:
    return {"image_agent_base_url": base_url, "timeout_ms": timeout_ms, "allowed_operator_open_ids": allowed}


def assert_start_message_request() -> None:
    with temporary_env({
        "FEISHU_APP_ID": "dummy_app_id",
        "FEISHU_APP_SECRET": "dummy_app_secret",
        "FEISHU_CONNECTION_MODE": "websocket",
        "IMAGE_AGENT_BASE_URL": "http://127.0.0.1:8000",
        "TEST_CHAT_ID": "oc_dummy_chat",
    }):
        request = app.build_start_message_request()
    assert request["receive_id_type"] == "chat_id", request
    assert request["receive_id"] == "oc_dummy_chat", request
    assert request["msg_type"] == "interactive", request
    assert json.loads(request["content"]) == cards.load_start_card(), request
    assert "feishu_app_id" not in request, request
    assert "feishu_app_secret" not in request, request

    with temporary_env({
        "FEISHU_APP_ID": "dummy_app_id",
        "FEISHU_APP_SECRET": "dummy_app_secret",
        "FEISHU_CONNECTION_MODE": "websocket",
        "IMAGE_AGENT_BASE_URL": "http://127.0.0.1:8000",
        "TEST_CHAT_ID": "",
    }):
        try:
            app.build_start_message_request()
        except RuntimeError as exc:
            assert "TEST_CHAT_ID" in str(exc), "missing TEST_CHAT_ID should be clear: " + str(exc)
        else:
            raise AssertionError("missing TEST_CHAT_ID should fail")


def only_request(method: str, path: str) -> Dict[str, Any]:
    matches = [item for item in REQUESTS if item["method"] == method and item["path"] == path]
    assert len(matches) == 1, matches
    return matches[0]


def assert_form_request(request: Dict[str, Any], expected: Dict[str, str]) -> None:
    assert "application/x-www-form-urlencoded" in request["content_type"], request
    for key, value in expected.items():
        assert request["form"].get(key) == value, {"expected": expected, "request": request}


@contextmanager
def temporary_env(values: Dict[str, str]):
    previous = {key: os.environ.get(key) for key in values}
    try:
        for key, value in values.items():
            os.environ[key] = value
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


@contextmanager
def mock_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), MockImageAgentHandler)
    host, port = server.server_address
    import threading
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield "http://" + host + ":" + str(port)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    main()
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

function buildPythonHostEndpointsSpec(): Record<string, unknown> {
  return {
    schema_version: "0.1",
    target: "image-agent-web",
    actions: {
      "image.generate.submit": {
        operation: "generate",
        method: "POST",
        path: "/api/generate",
        content_type: "multipart/form-data",
        body: "form",
        fields: ["template_id", "size", "fields_json", "message", "reference_types_json"],
      },
      "image.iterate.submit": {
        operation: "iterate",
        method: "POST",
        path: "/api/iterate",
        content_type: "application/json",
        body: "json",
        fields: ["session_id", "feedback"],
      },
      "image.batch.submit": {
        operation: "batch",
        method: "POST",
        path: "/api/batch",
        content_type: "multipart/form-data",
        body: "form",
        fields: ["template_id", "size", "items_json", "reference_types_json"],
      },
      "image.batch.refresh": {
        operation: "batch_status",
        method: "GET",
        path: "/api/batch/{batch_id}/status",
        body: "none",
        path_params: ["batch_id"],
      },
    },
    supporting_endpoints: {
      batch_download: {
        method: "GET",
        path: "/api/batch/{batch_id}/download",
        path_params: ["batch_id"],
      },
      meta: {
        method: "GET",
        path: "/api/meta",
      },
    },
  };
}

function buildStartCardSpec(service: ServiceManifest, data: AdapterCardTemplateData): Record<string, unknown> {
  const { defaultPreset, templateSpecs, fieldSpecs, fieldMaps } = data;
  const defaultBatchItemsJson = JSON.stringify([{ fields: defaultPreset.fields }], null, 2);
  return {
    schema: "2.0",
    config: { update_multi: true, wide_screen_mode: true },
    header: { template: "blue", title: { tag: "plain_text", content: "Image Agent MVP" } },
    body: { elements: [
      { tag: "markdown", content: `**Target service:** ${service.service.name}\n\n**Templates:** ${templateSpecs.map((template) => template.id).join(", ")}\n\nFill the parameters and submit to run /api/generate.` },
      {
        tag: "form",
        name: "image_generate_form",
        elements: [
          { tag: "input", name: "param_template_id", required: true, default_value: defaultPreset.template_id, width: "fill", label: { tag: "plain_text", content: "Template ID" }, placeholder: { tag: "plain_text", content: templateSpecs.map((template) => template.id).join(" / ") } },
          { tag: "input", name: "param_size", required: true, default_value: defaultPreset.size, width: "fill", label: { tag: "plain_text", content: "Size" }, placeholder: { tag: "plain_text", content: "WIDTHxHEIGHT" } },
          ...fieldSpecs.map((field) => ({ tag: "input", name: fieldMaps.templateKeyToFormField[field.key] || field.name, required: field.required, default_value: field.defaultValue, width: "fill", label: { tag: "plain_text", content: field.label }, placeholder: { tag: "plain_text", content: field.placeholder || field.defaultValue || "Enter value" } })),
          { tag: "input", name: "param_message", required: false, default_value: defaultPreset.message || "", width: "fill", input_type: "multiline_text", rows: 2, auto_resize: true, label: { tag: "plain_text", content: "Message" }, placeholder: { tag: "plain_text", content: "Optional extra instruction" } },
          { tag: "button", text: { tag: "plain_text", content: "Generate image" }, type: "primary", form_action_type: "submit", name: "submit_image_generate", behaviors: [{ type: "callback", value: { action: "image.generate.submit", preset: defaultPreset } }] },
          { tag: "button", text: { tag: "plain_text", content: "Reset" }, type: "default", form_action_type: "reset", name: "reset_image_generate" },
        ],
      },
      { tag: "hr" },
      { tag: "markdown", content: "Use batch mode for long-running /api/batch jobs. Submit a JSON array of items, then refresh the returned progress card when needed." },
      {
        tag: "form",
        name: "image_batch_form",
        elements: [
          { tag: "input", name: "param_batch_template_id", required: true, default_value: defaultPreset.template_id, width: "fill", label: { tag: "plain_text", content: "Batch template ID" }, placeholder: { tag: "plain_text", content: templateSpecs.map((template) => template.id).join(" / ") } },
          { tag: "input", name: "param_batch_size", required: true, default_value: defaultPreset.size, width: "fill", label: { tag: "plain_text", content: "Batch size" }, placeholder: { tag: "plain_text", content: "WIDTHxHEIGHT" } },
          { tag: "input", name: "param_batch_items_json", required: true, default_value: defaultBatchItemsJson, width: "fill", input_type: "multiline_text", rows: 5, auto_resize: true, label: { tag: "plain_text", content: "Batch items JSON" }, placeholder: { tag: "plain_text", content: "[{ \\\"fields\\\": { ... } }]" } },
          { tag: "button", text: { tag: "plain_text", content: "Start batch" }, type: "primary", form_action_type: "submit", name: "submit_image_batch", behaviors: [{ type: "callback", value: { action: "image.batch.submit" } }] },
          { tag: "button", text: { tag: "plain_text", content: "Reset" }, type: "default", form_action_type: "reset", name: "reset_image_batch" },
        ],
      },
    ] },
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

function adapterServiceClientTs(): string {
  return `import type { BatchRequest, GeneratePreset, IterateRequest } from "./types.js";

export async function callImageGenerate(baseUrl: string, preset: GeneratePreset, timeoutMs = 120000): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const form = new FormData();
    form.set("template_id", preset.template_id);
    form.set("size", preset.size);
    form.set("fields_json", JSON.stringify(preset.fields));
    form.set("message", preset.message || "");
    form.set("reference_types_json", "[]");
    const response = await fetch(baseUrl.replace(/\\/+$/, "") + "/api/generate", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("image-agent-web /api/generate returned HTTP " + response.status);
    }
    const body = await response.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } finally {
    clearTimeout(timeout);
  }
}

export async function callImageIterate(baseUrl: string, request: IterateRequest, timeoutMs = 120000): Promise<Record<string, unknown>> {
  const response = await fetchWithTimeout(baseUrl.replace(/\\/+$/, "") + "/api/iterate", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ session_id: request.session_id, feedback: request.feedback }),
  }, timeoutMs, "image-agent-web /api/iterate");
  return readJsonResponse(response, "image-agent-web /api/iterate");
}

export async function callImageBatchCreate(baseUrl: string, request: BatchRequest, timeoutMs = 120000): Promise<{ batch_id: string }> {
  const form = new FormData();
  form.set("template_id", request.template_id);
  form.set("size", request.size);
  form.set("items_json", JSON.stringify(request.items));
  form.set("reference_types_json", "[]");
  const response = await fetchWithTimeout(baseUrl.replace(/\\/+$/, "") + "/api/batch", { method: "POST", body: form }, timeoutMs, "image-agent-web /api/batch");
  const parsed = await readJsonResponse(response, "image-agent-web /api/batch");
  const batchId = typeof parsed.batch_id === "string" ? parsed.batch_id : "";
  if (!batchId) throw new Error("image-agent-web /api/batch response did not include batch_id: " + JSON.stringify(parsed));
  return { batch_id: batchId };
}

export async function callImageBatchStatus(baseUrl: string, batchId: string, timeoutMs = 120000): Promise<Record<string, unknown>> {
  const response = await fetchWithTimeout(baseUrl.replace(/\\/+$/, "") + "/api/batch/" + encodeURIComponent(batchId) + "/status", {}, timeoutMs, "image-agent-web /api/batch/{batch_id}/status");
  return readJsonResponse(response, "image-agent-web /api/batch/{batch_id}/status");
}

export function resolveBatchDownloadUrl(baseUrl: string, batchId: string): string {
  return baseUrl.replace(/\\/+$/, "") + "/api/batch/" + encodeURIComponent(batchId) + "/download";
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(label + " timed out after " + timeoutMs + "ms.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonResponse(response: Response, label: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    const message = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "detail" in parsed ? String((parsed as { detail?: unknown }).detail) : text;
    throw new Error(label + " returned HTTP " + response.status + ": " + message);
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
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

function adapterServiceClientJs(): string {
  return `export async function callImageGenerate(baseUrl, preset, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const form = new FormData();
    form.set("template_id", preset.template_id);
    form.set("size", preset.size);
    form.set("fields_json", JSON.stringify(preset.fields));
    form.set("message", preset.message || "");
    form.set("reference_types_json", "[]");
    const response = await fetch(baseUrl.replace(/\\/+$/, "") + "/api/generate", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    if (!response.ok) {
      const message = parsed && typeof parsed === "object" && "detail" in parsed ? String(parsed.detail) : text;
      throw new Error("image-agent-web /api/generate returned HTTP " + response.status + ": " + message);
    }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("image-agent-web /api/generate timed out after " + timeoutMs + "ms.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callImageIterate(baseUrl, request, timeoutMs = 120000) {
  const response = await fetchWithTimeout(baseUrl.replace(/\\/+$/, "") + "/api/iterate", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ session_id: request.session_id, feedback: request.feedback }),
  }, timeoutMs, "image-agent-web /api/iterate");
  return readJsonResponse(response, "image-agent-web /api/iterate");
}

export async function callImageBatchCreate(baseUrl, request, timeoutMs = 120000) {
  const form = new FormData();
  form.set("template_id", request.template_id);
  form.set("size", request.size);
  form.set("items_json", JSON.stringify(request.items));
  form.set("reference_types_json", "[]");
  const response = await fetchWithTimeout(baseUrl.replace(/\\/+$/, "") + "/api/batch", { method: "POST", body: form }, timeoutMs, "image-agent-web /api/batch");
  const parsed = await readJsonResponse(response, "image-agent-web /api/batch");
  const batchId = typeof parsed.batch_id === "string" ? parsed.batch_id : "";
  if (!batchId) throw new Error("image-agent-web /api/batch response did not include batch_id: " + JSON.stringify(parsed));
  return { batch_id: batchId };
}

export async function callImageBatchStatus(baseUrl, batchId, timeoutMs = 120000) {
  const response = await fetchWithTimeout(baseUrl.replace(/\\/+$/, "") + "/api/batch/" + encodeURIComponent(batchId) + "/status", {}, timeoutMs, "image-agent-web /api/batch/{batch_id}/status");
  return readJsonResponse(response, "image-agent-web /api/batch/{batch_id}/status");
}

export function resolveBatchDownloadUrl(baseUrl, batchId) {
  return baseUrl.replace(/\\/+$/, "") + "/api/batch/" + encodeURIComponent(batchId) + "/download";
}

async function fetchWithTimeout(url, init, timeoutMs, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(label + " timed out after " + timeoutMs + "ms.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    const message = parsed && typeof parsed === "object" && "detail" in parsed ? String(parsed.detail) : text;
    throw new Error(label + " returned HTTP " + response.status + ": " + message);
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
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
      label: humanizeKey(name),
      required: required.has(name),
      multiline: name === "body_json" || property.type === "object" || property.type === "array",
      placeholder: name === "body_json" ? "{\"key\":\"value\"}" : String(property.description || name),
    };
  });
}

interface AdapterCardTemplateData {
  defaultPreset: ReturnType<typeof buildDefaultPreset>;
  templateSpecs: RuntimeTemplateSpec[];
  fieldSpecs: RuntimeFieldSpec[];
  fieldMaps: ReturnType<typeof buildFormFieldMaps>;
}

function buildAdapterCardTemplateData(capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): AdapterCardTemplateData {
  const defaultPreset = buildDefaultPreset(capabilities, meta);
  const templateSpecs = buildTemplateSpecs(defaultPreset, meta);
  const fieldSpecs = buildFieldSpecs(defaultPreset, meta);
  const fieldMaps = buildFormFieldMaps(fieldSpecs);
  return { defaultPreset, templateSpecs, fieldSpecs, fieldMaps };
}

interface AdapterHandlerTemplateData {
  defaultPreset: { template_id: string; size: string; fields: Record<string, string>; message: string };
  requiredFieldsByTemplate: Record<string, string[]>;
  fieldLabels: Record<string, string>;
}

function buildAdapterHandlerTemplateData(capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): AdapterHandlerTemplateData {
  const generateCapability = capabilities.capabilities.find((capability) => capability.id === "image.generate") || capabilities.capabilities[0];
  const properties = isJsonObject(generateCapability?.input_schema.properties) ? generateCapability.input_schema.properties : {};
  const templateProperty = isJsonObject(properties.template_id) ? properties.template_id : {};
  const fieldsProperty = isJsonObject(properties.fields) ? properties.fields : {};
  const defaultTemplate = typeof templateProperty.default === "string" ? templateProperty.default : meta?.templates?.[0]?.id || "product-image";
  const defaultSizeByTemplate = isJsonObject(fieldsProperty.default_size_by_template) ? fieldsProperty.default_size_by_template : {};
  const defaultSize = typeof defaultSizeByTemplate[defaultTemplate] === "string" ? defaultSizeByTemplate[defaultTemplate] : "1024x1024";
  const defaultPreset = {
    template_id: defaultTemplate,
    size: defaultSize,
    fields: {},
    message: "",
  };
  const requiredFieldsByTemplate = Object.fromEntries((meta?.templates || []).map((template) => [
    template.id,
    (template.fields || []).filter((field) => field.required).map((field) => field.key),
  ]));
  const fieldLabels = Object.fromEntries((meta?.templates || []).flatMap((template) => (
    template.fields || []
  ).map((field) => [field.key, field.label || humanizeKey(field.key)])));
  return { defaultPreset, requiredFieldsByTemplate, fieldLabels };
}

function adapterCardsJs(service: ServiceManifest, capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): string {
  return stripAdapterCardsTypeScript(adapterCardsTs(service, capabilities, meta));
}

function stripAdapterCardsTypeScript(source: string): string {
  return source
    .replace(/: Record<string, string>(?= =)/g, "")
    .replace(/\(\): Record<string, unknown>/g, "()")
    .replace(/\(result: Record<string, unknown>\): Record<string, unknown>/g, "(result)")
    .replace(/\(status: Record<string, unknown>, downloadUrl: string\): Record<string, unknown>/g, "(status, downloadUrl)")
    .replace(/\(message: string\): Record<string, unknown>/g, "(message)")
    .replace(/: unknown\[\](?= =)/g, "")
    .replace(/\(value: unknown\): number/g, "(value)")
    .replace(/\(value: unknown\): string/g, "(value)");
}
function adapterCardsTs(service: ServiceManifest, capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): string {
  const { defaultPreset, templateSpecs, fieldSpecs, fieldMaps } = buildAdapterCardTemplateData(capabilities, meta);
  return `export const defaultPreset = ${JSON.stringify(defaultPreset, null, 2)};

export const templateSpecs = ${JSON.stringify(templateSpecs, null, 2)};

export const fieldSpecs = ${JSON.stringify(fieldSpecs, null, 2)};

export const templateKeyToFormField: Record<string, string> = ${JSON.stringify(fieldMaps.templateKeyToFormField, null, 2)};

export const formFieldToTemplateKey: Record<string, string> = ${JSON.stringify(fieldMaps.formFieldToTemplateKey, null, 2)};

export function buildStartCard(): Record<string, unknown> {
  const defaultBatchItemsJson = JSON.stringify([{ fields: defaultPreset.fields }], null, 2);
  return {
    config: { wide_screen_mode: true },
    header: { template: "blue", title: { tag: "plain_text", content: "Image Agent MVP" } },
    elements: [
      { tag: "markdown", content: "**Target service:** " + ${JSON.stringify(service.service.name)} + "\\n\\n**Templates:** " + templateSpecs.map((template) => template.id).join(", ") + "\\n\\nFill the parameters and submit to run /api/generate." },
      {
        tag: "form",
        name: "image_generate_form",
        elements: [
          { tag: "input", name: "param_template_id", required: true, default_value: defaultPreset.template_id, width: "fill", label: { tag: "plain_text", content: "Template ID" }, placeholder: { tag: "plain_text", content: templateSpecs.map((template) => template.id).join(" / ") } },
          { tag: "input", name: "param_size", required: true, default_value: defaultPreset.size, width: "fill", label: { tag: "plain_text", content: "Size" }, placeholder: { tag: "plain_text", content: "WIDTHxHEIGHT" } },
          ...fieldSpecs.map((field) => ({ tag: "input", name: templateKeyToFormField[field.key] || field.name, required: field.required, default_value: field.defaultValue, width: "fill", label: { tag: "plain_text", content: field.label }, placeholder: { tag: "plain_text", content: field.placeholder || field.defaultValue || "Enter value" } })),
          { tag: "input", name: "param_message", required: false, default_value: defaultPreset.message || "", width: "fill", input_type: "multiline_text", rows: 2, auto_resize: true, label: { tag: "plain_text", content: "Message" }, placeholder: { tag: "plain_text", content: "Optional extra instruction" } },
          { tag: "button", text: { tag: "plain_text", content: "Generate image" }, type: "primary", action_type: "form_submit", name: "submit_image_generate", value: { action: "image.generate.submit", preset: defaultPreset } },
          { tag: "button", text: { tag: "plain_text", content: "Reset" }, type: "default", action_type: "form_reset", name: "reset_image_generate" },
        ],
      },
      { tag: "hr" },
      { tag: "markdown", content: "Use batch mode for long-running /api/batch jobs. Submit a JSON array of items, then refresh the returned progress card when needed." },
      {
        tag: "form",
        name: "image_batch_form",
        elements: [
          { tag: "input", name: "param_batch_template_id", required: true, default_value: defaultPreset.template_id, width: "fill", label: { tag: "plain_text", content: "Batch template ID" }, placeholder: { tag: "plain_text", content: templateSpecs.map((template) => template.id).join(" / ") } },
          { tag: "input", name: "param_batch_size", required: true, default_value: defaultPreset.size, width: "fill", label: { tag: "plain_text", content: "Batch size" }, placeholder: { tag: "plain_text", content: "WIDTHxHEIGHT" } },
          { tag: "input", name: "param_batch_items_json", required: true, default_value: defaultBatchItemsJson, width: "fill", input_type: "multiline_text", rows: 5, auto_resize: true, label: { tag: "plain_text", content: "Batch items JSON" }, placeholder: { tag: "plain_text", content: "[{ \\\"fields\\\": { ... } }]" } },
          { tag: "button", text: { tag: "plain_text", content: "Start batch" }, type: "primary", action_type: "form_submit", name: "submit_image_batch", value: { action: "image.batch.submit" } },
          { tag: "button", text: { tag: "plain_text", content: "Reset" }, type: "default", action_type: "form_reset", name: "reset_image_batch" },
        ],
      },
    ],
  };
}

export function buildSuccessCard(result: Record<string, unknown>): Record<string, unknown> {
  const imageUrl = typeof result.image_url === "string" ? result.image_url : "";
  const sessionId = typeof result.session_id === "string" ? result.session_id : "";
  const elements: unknown[] = [
    { tag: "markdown", content: imageUrl ? "**Image:** " + imageUrl : "Image generation completed." },
  ];
  if (sessionId) {
    elements.push({
      tag: "form",
      name: "image_iterate_form",
      elements: [
        {
          tag: "input",
          name: "param_feedback",
          required: true,
          width: "fill",
          input_type: "multiline_text",
          rows: 2,
          auto_resize: true,
          label: { tag: "plain_text", content: "Feedback" },
          placeholder: { tag: "plain_text", content: "Describe what to refine in the next image" },
        },
        {
          tag: "button",
          text: { tag: "plain_text", content: "Iterate image" },
          type: "primary",
          action_type: "form_submit",
          name: "submit_image_iterate",
          value: { action: "image.iterate.submit", session_id: sessionId },
        },
      ],
    });
  }
  return {
    config: { wide_screen_mode: true },
    header: { template: "green", title: { tag: "plain_text", content: "Image generation complete" } },
    elements,
  };
}

export function buildBatchStatusCard(status: Record<string, unknown>, downloadUrl: string): Record<string, unknown> {
  const total = numberValue(status.total);
  const done = numberValue(status.done);
  const completedCount = Array.isArray(status.completed) ? status.completed.length : 0;
  const failedCount = Array.isArray(status.failed) ? status.failed.length : 0;
  const running = status.running === true;
  const finished = !running && total > 0 && done >= total;
  const batchId = stringValue(status.batch_id);
  const elements: unknown[] = [
    {
      tag: "markdown",
      content: [
        "**Status:** " + (running ? "running" : finished ? "completed" : "not running"),
        "**Batch ID:** " + batchId,
        "**Done:** " + done + "/" + total,
        "**Completed:** " + completedCount,
        "**Failed:** " + failedCount,
        stringValue(status.template_id) ? "**Template:** " + stringValue(status.template_id) : "",
        stringValue(status.size) ? "**Size:** " + stringValue(status.size) : "",
      ].filter(Boolean).join("\\n\\n"),
    },
  ];
  if (finished && downloadUrl && completedCount > 0) {
    elements.push({ tag: "markdown", content: "[Download completed images ZIP](" + downloadUrl + ")" });
  }
  if (batchId) {
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "Refresh status" },
          type: "default",
          value: { action: "image.batch.refresh", batch_id: batchId },
        },
      ],
    });
  }
  return {
    config: { wide_screen_mode: true },
    header: {
      template: running ? "blue" : failedCount > 0 ? "red" : "green",
      title: { tag: "plain_text", content: running ? "Batch running" : failedCount > 0 ? "Batch finished with failures" : "Batch complete" },
    },
    elements,
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildFailureCard(message: string): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: { template: "red", title: { tag: "plain_text", content: "Image generation failed" } },
    elements: [{ tag: "markdown", content: "**What happened:** " + message }],
  };
}
`;
}

function adapterHandlersTs(service: ServiceManifest, capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): string {
  const { defaultPreset, requiredFieldsByTemplate, fieldLabels } = buildAdapterHandlerTemplateData(capabilities, meta);
  return `import { auditEvent } from "./audit-events.js";
import { buildBatchStatusCard, buildFailureCard, buildSuccessCard, formFieldToTemplateKey } from "./cards.js";
import { callImageBatchCreate, callImageBatchStatus, callImageGenerate, callImageIterate, resolveBatchDownloadUrl } from "./service-client.js";
import type { AdapterActionContext, AdapterDependencies, AdapterResult, BatchRequest, GeneratePreset, IterateRequest } from "./types.js";
import { assertAllowedOperator, mergeGeneratePresetWithFormValue, validateSize } from "./validation.js";

const defaultPreset: GeneratePreset = ${JSON.stringify(defaultPreset, null, 2)};
const requiredFieldsByTemplate: Record<string, string[]> = ${JSON.stringify(requiredFieldsByTemplate, null, 2)};
const fieldLabels: Record<string, string> = ${JSON.stringify(fieldLabels, null, 2)};

export async function handleImageAgentCardAction(ctx: AdapterActionContext, deps: AdapterDependencies): Promise<AdapterResult> {
  const auditEvents = [auditEvent("adapter_card_action_received", { action: ctx.action, service: ${JSON.stringify(service.service.name)} })];
  try {
    assertAllowedOperator(ctx.operatorOpenId, deps.allowedOperatorOpenIds);
    if (ctx.action === "image.generate.submit") {
      const actionValue = ctx.value && typeof ctx.value === "object" ? ctx.value : {};
      const basePreset = isGeneratePreset((actionValue as { preset?: unknown }).preset) ? (actionValue as { preset: GeneratePreset }).preset : defaultPreset;
      const preset = mergeGeneratePresetWithFormValue(basePreset, ctx.formValue, formFieldToTemplateKey);
      validateGeneratePreset(preset);
      const result = await callImageGenerate(deps.imageAgentBaseUrl, preset, deps.timeoutMs);
      auditEvents.push(auditEvent("adapter_generation_succeeded", { imageUrl: result.image_url || "" }));
      return { ok: true, card: buildSuccessCard(result), result, auditEvents };
    }
    if (ctx.action === "image.iterate.submit") {
      const request = buildIterateRequest(ctx.value, ctx.formValue);
      const result = await callImageIterate(deps.imageAgentBaseUrl, request, deps.timeoutMs);
      auditEvents.push(auditEvent("adapter_iteration_succeeded", { session_id: result.session_id || request.session_id }));
      return { ok: true, card: buildSuccessCard(result), result, auditEvents };
    }
    if (ctx.action === "image.batch.submit") {
      const request = buildBatchRequest(ctx.value, ctx.formValue);
      const created = await callImageBatchCreate(deps.imageAgentBaseUrl, request, deps.timeoutMs);
      const status = await callImageBatchStatus(deps.imageAgentBaseUrl, created.batch_id, deps.timeoutMs);
      const downloadUrl = batchDownloadUrl(deps.imageAgentBaseUrl, status);
      auditEvents.push(auditEvent("adapter_batch_submitted", { batchId: created.batch_id, template_id: request.template_id, size: request.size, total: request.items.length, downloadUrl }));
      auditEvents.push(auditEvent("adapter_batch_status_checked", summarizeBatchStatus(status, downloadUrl)));
      return { ok: true, card: buildBatchStatusCard(status, downloadUrl), batchId: created.batch_id, batchStatus: status, downloadUrl, auditEvents };
    }
    if (ctx.action === "image.batch.refresh") {
      const batchId = stringValue(ctx.value?.batch_id || ctx.value?.batchId || ctx.formValue?.param_batch_id);
      if (!batchId) throw new Error("batch_id is required.");
      const status = await callImageBatchStatus(deps.imageAgentBaseUrl, batchId, deps.timeoutMs);
      const downloadUrl = batchDownloadUrl(deps.imageAgentBaseUrl, status);
      auditEvents.push(auditEvent("adapter_batch_status_checked", summarizeBatchStatus(status, downloadUrl)));
      return { ok: true, card: buildBatchStatusCard(status, downloadUrl), batchId, batchStatus: status, downloadUrl, auditEvents };
    }
    throw new Error("Unsupported adapter action: " + ctx.action);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    auditEvents.push(auditEvent("adapter_generation_failed", { message }));
    return { ok: false, card: buildFailureCard(message), auditEvents };
  }
}

function buildIterateRequest(value: Record<string, unknown> | undefined, formValue: Record<string, unknown> | undefined): IterateRequest {
  const sessionId = stringValue(value?.session_id || value?.sessionId || formValue?.param_session_id);
  const feedback = stringValue(formValue?.param_feedback || value?.feedback);
  if (!sessionId || !feedback) throw new Error("session_id and feedback are required.");
  return { session_id: sessionId, feedback };
}

function buildBatchRequest(value: Record<string, unknown> | undefined, formValue: Record<string, unknown> | undefined): BatchRequest {
  const templateId = stringValue(formValue?.param_batch_template_id || value?.template_id || value?.templateId || defaultPreset.template_id);
  const size = typeof formValue?.param_batch_size === "string"
    ? formValue.param_batch_size.trim()
    : stringValue(value?.size || defaultPreset.size);
  validateSize(size);
  const itemsJson = stringValue(formValue?.param_batch_items_json || value?.items_json || value?.itemsJson);
  const rawItems = itemsJson ? JSON.parse(itemsJson) : Array.isArray(value?.items) ? value.items : [];
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new Error("Batch items JSON must include at least one item.");
  return { template_id: templateId, size, items: rawItems as BatchRequest["items"] };
}

function batchDownloadUrl(baseUrl: string, status: Record<string, unknown>): string {
  const batchId = stringValue(status.batch_id);
  const completed = Array.isArray(status.completed) ? status.completed.length : 0;
  return batchId && status.running !== true && completed > 0 ? resolveBatchDownloadUrl(baseUrl, batchId) : "";
}

function validateGeneratePreset(preset: GeneratePreset): void {
  const requiredFields = requiredFieldsByTemplate[preset.template_id] || [];
  for (const key of requiredFields) {
    const value = preset.fields[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error((fieldLabels[key] || key) + " is required.");
    }
  }
}

function summarizeBatchStatus(status: Record<string, unknown>, downloadUrl: string): Record<string, unknown> {
  return {
    batchId: stringValue(status.batch_id),
    template_id: status.template_id,
    size: status.size,
    total: numberValue(status.total),
    done: numberValue(status.done),
    running: status.running === true,
    completed: Array.isArray(status.completed) ? status.completed.length : 0,
    failed: Array.isArray(status.failed) ? status.failed.length : 0,
    downloadUrl: downloadUrl || undefined,
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isGeneratePreset(value: unknown): value is GeneratePreset {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && typeof (value as { template_id?: unknown }).template_id === "string"
    && typeof (value as { size?: unknown }).size === "string"
    && (value as { fields?: unknown }).fields
    && typeof (value as { fields?: unknown }).fields === "object"
    && !Array.isArray((value as { fields?: unknown }).fields));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
`;
}

function adapterHandlersJs(service: ServiceManifest, capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): string {
  const { defaultPreset, requiredFieldsByTemplate, fieldLabels } = buildAdapterHandlerTemplateData(capabilities, meta);
  return `import { auditEvent } from "./audit-events.js";
import { buildBatchStatusCard, buildFailureCard, buildSuccessCard, formFieldToTemplateKey } from "./cards.js";
import { callImageBatchCreate, callImageBatchStatus, callImageGenerate, callImageIterate, resolveBatchDownloadUrl } from "./service-client.js";
import { assertAllowedOperator, mergeGeneratePresetWithFormValue, validateSize } from "./validation.js";

const defaultPreset = ${JSON.stringify(defaultPreset, null, 2)};
const requiredFieldsByTemplate = ${JSON.stringify(requiredFieldsByTemplate, null, 2)};
const fieldLabels = ${JSON.stringify(fieldLabels, null, 2)};

export async function handleImageAgentCardAction(ctx, deps) {
  const action = typeof ctx?.action === "string" ? ctx.action : "";
  const auditEvents = [auditEvent("adapter_card_action_received", { action, service: ${JSON.stringify(service.service.name)} })];
  try {
    assertAllowedOperator(ctx?.operatorOpenId, deps?.allowedOperatorOpenIds);
    if (action === "image.generate.submit") {
      const actionValue = ctx?.value && typeof ctx.value === "object" ? ctx.value : {};
      const basePreset = isGeneratePreset(actionValue.preset) ? actionValue.preset : defaultPreset;
      const preset = mergeGeneratePresetWithFormValue(basePreset, ctx?.formValue, formFieldToTemplateKey);
      validateGeneratePreset(preset);
      const result = await callImageGenerate(String(deps?.imageAgentBaseUrl || ""), preset, Number(deps?.timeoutMs || 120000));
      auditEvents.push(auditEvent("adapter_generation_succeeded", { imageUrl: result.image_url || "" }));
      return { ok: true, card: buildSuccessCard(result), result, auditEvents };
    }
    if (action === "image.iterate.submit") {
      const request = buildIterateRequest(ctx?.value, ctx?.formValue);
      const result = await callImageIterate(String(deps?.imageAgentBaseUrl || ""), request, Number(deps?.timeoutMs || 120000));
      auditEvents.push(auditEvent("adapter_iteration_succeeded", { session_id: result.session_id || request.session_id }));
      return { ok: true, card: buildSuccessCard(result), result, auditEvents };
    }
    if (action === "image.batch.submit") {
      const request = buildBatchRequest(ctx?.value, ctx?.formValue);
      const created = await callImageBatchCreate(String(deps?.imageAgentBaseUrl || ""), request, Number(deps?.timeoutMs || 120000));
      const status = await callImageBatchStatus(String(deps?.imageAgentBaseUrl || ""), created.batch_id, Number(deps?.timeoutMs || 120000));
      const downloadUrl = batchDownloadUrl(String(deps?.imageAgentBaseUrl || ""), status);
      auditEvents.push(auditEvent("adapter_batch_submitted", { batchId: created.batch_id, template_id: request.template_id, size: request.size, total: request.items.length, downloadUrl }));
      auditEvents.push(auditEvent("adapter_batch_status_checked", summarizeBatchStatus(status, downloadUrl)));
      return { ok: true, card: buildBatchStatusCard(status, downloadUrl), batchId: created.batch_id, batchStatus: status, downloadUrl, auditEvents };
    }
    if (action === "image.batch.refresh") {
      const batchId = stringValue(ctx?.value?.batch_id || ctx?.value?.batchId || ctx?.formValue?.param_batch_id);
      if (!batchId) throw new Error("batch_id is required.");
      const status = await callImageBatchStatus(String(deps?.imageAgentBaseUrl || ""), batchId, Number(deps?.timeoutMs || 120000));
      const downloadUrl = batchDownloadUrl(String(deps?.imageAgentBaseUrl || ""), status);
      auditEvents.push(auditEvent("adapter_batch_status_checked", summarizeBatchStatus(status, downloadUrl)));
      return { ok: true, card: buildBatchStatusCard(status, downloadUrl), batchId, batchStatus: status, downloadUrl, auditEvents };
    }
    throw new Error("Unsupported adapter action: " + action);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    auditEvents.push(auditEvent("adapter_generation_failed", { message }));
    return { ok: false, card: buildFailureCard(message), auditEvents };
  }
}

function buildIterateRequest(value, formValue) {
  const sessionId = stringValue(value?.session_id || value?.sessionId || formValue?.param_session_id);
  const feedback = stringValue(formValue?.param_feedback || value?.feedback);
  if (!sessionId || !feedback) throw new Error("session_id and feedback are required.");
  return { session_id: sessionId, feedback };
}

function buildBatchRequest(value, formValue) {
  const templateId = stringValue(formValue?.param_batch_template_id || value?.template_id || value?.templateId || defaultPreset.template_id);
  const size = typeof formValue?.param_batch_size === "string"
    ? formValue.param_batch_size.trim()
    : stringValue(value?.size || defaultPreset.size);
  validateSize(size);
  const itemsJson = stringValue(formValue?.param_batch_items_json || value?.items_json || value?.itemsJson);
  const rawItems = itemsJson ? JSON.parse(itemsJson) : Array.isArray(value?.items) ? value.items : [];
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new Error("Batch items JSON must include at least one item.");
  return { template_id: templateId, size, items: rawItems };
}

function batchDownloadUrl(baseUrl, status) {
  const batchId = stringValue(status?.batch_id);
  const completed = Array.isArray(status?.completed) ? status.completed.length : 0;
  return batchId && status?.running !== true && completed > 0 ? resolveBatchDownloadUrl(baseUrl, batchId) : "";
}

function validateGeneratePreset(preset) {
  const requiredFields = requiredFieldsByTemplate[preset.template_id] || [];
  for (const key of requiredFields) {
    const value = preset.fields[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error((fieldLabels[key] || key) + " is required.");
    }
  }
}

function summarizeBatchStatus(status, downloadUrl) {
  return {
    batchId: stringValue(status?.batch_id),
    template_id: status?.template_id,
    size: status?.size,
    total: numberValue(status?.total),
    done: numberValue(status?.done),
    running: status?.running === true,
    completed: Array.isArray(status?.completed) ? status.completed.length : 0,
    failed: Array.isArray(status?.failed) ? status.failed.length : 0,
    downloadUrl: downloadUrl || undefined,
  };
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isGeneratePreset(value) {
  return value && typeof value === "object"
    && typeof value.template_id === "string"
    && typeof value.size === "string"
    && value.fields && typeof value.fields === "object";
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
`;
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

function buildEmbeddedIntegrationGuide(service: ServiceManifest, permissions: RequiredPermissions, hostReceiveMode: HostReceiveMode): string {
  const longConnection = hostReceiveMode === "embedded-long-connection";
  const usesLongConnection = hostModeUsesLongConnection(hostReceiveMode);
  const hybrid = hostReceiveMode === "hybrid";
  const hostModeOption = hostReceiveMode === "embedded-webhook" ? "" : ` --host-mode ${hostReceiveMode}`;
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

function buildGeneratedReadme(service: ServiceManifest, permissions: RequiredPermissions, integrationMode: IntegrationMode, hostReceiveMode: HostReceiveMode): string {
  if (integrationMode === "embedded-adapter") {
    const longConnection = hostReceiveMode === "embedded-long-connection";
    const usesWebhook = hostModeUsesWebhook(hostReceiveMode);
    const usesLongConnection = hostModeUsesLongConnection(hostReceiveMode);
    const hybrid = hostReceiveMode === "hybrid";
    const hostModeOption = hostReceiveMode === "embedded-webhook" ? "" : ` --host-mode ${hostReceiveMode}`;
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

function runtimeImageAgentClientTs(): string {
  return `import fs from "node:fs";
import path from "node:path";

export interface GeneratePreset {
  template_id: string;
  size: string;
  fields: Record<string, string>;
  message?: string;
}

export interface BatchStatus {
  batch_id: string;
  template_id?: string;
  size?: string;
  total?: number;
  done?: number;
  running?: boolean;
  completed?: Array<Record<string, unknown>>;
  failed?: Array<Record<string, unknown>>;
}

export interface ImageAgentResult {
  session_id?: string;
  analysis?: string;
  image_url?: string;
  prompt_used?: string;
  round?: number;
  template_id?: string;
  size?: string;
}

export async function getMeta(baseUrl: string, timeoutMs = 5000): Promise<unknown> {
  const response = await fetchWithTimeout(\`\${baseUrl}/api/meta\`, {}, timeoutMs, "image-agent-web /api/meta");
  if (!response.ok) {
    throw new Error(\`image-agent-web /api/meta returned HTTP \${response.status}\`);
  }
  return response.json();
}

export function resolveImageUrl(baseUrl: string, imageUrl: string | undefined): string {
  if (!imageUrl) return "";
  if (/^https?:\\/\\//i.test(imageUrl)) return imageUrl;
  return \`\${baseUrl}\${imageUrl.startsWith("/") ? "" : "/"}\${imageUrl}\`;
}

export async function downloadImageToTemp(imageUrl: string, traceId: string, timeoutMs: number): Promise<string> {
  const response = await fetchWithTimeout(imageUrl, {}, timeoutMs, "generated image download");
  if (!response.ok) {
    throw new Error(\`Failed to download generated image: HTTP \${response.status}\`);
  }
  const contentType = response.headers.get("content-type") || "image/png";
  const extension = contentType.includes("jpeg") ? "jpg" : "png";
  const buffer = Buffer.from(await response.arrayBuffer());
  const filePath = path.join(process.cwd(), "tmp", \`\${traceId}.\${extension}\`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(\`\${label} timed out after \${timeoutMs}ms.\`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
`;
}

function buildDefaultPreset(capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): {
  template_id: string;
  size: string;
  fields: Record<string, string>;
  message: string;
} {
  const capability = capabilities.capabilities.find((item) => item.id === "image.generate") || capabilities.capabilities[0];
  const properties = isRecord(capability?.input_schema.properties) ? capability.input_schema.properties : {};
  const templateProperty = isRecord(properties.template_id) ? properties.template_id : {};
  const sizeProperty = isRecord(properties.size) ? properties.size : {};
  const firstTemplate = meta?.templates?.[0];
  const templateId = firstTemplate?.id || stringValue(templateProperty.default) || "product-image";
  const size = firstTemplate?.default_size || firstTemplate?.allowed_sizes?.[0] || stringValue(sizeProperty.default) || "1024x1024";
  const fields = buildDefaultFields(firstTemplate?.fields || []);

  return {
    template_id: templateId,
    size,
    fields,
    message: "Generated from Lark-deployer MVP test card.",
  };
}

interface RuntimeTemplateSpec {
  id: string;
  name: string;
  allowedSizes: string[];
  defaultSize: string;
  fieldKeys: string[];
  requiredFieldKeys: string[];
}

interface RuntimeFieldSpec {
  key: string;
  name: string;
  label: string;
  required: boolean;
  requiredFor: string[];
  placeholder: string;
  defaultValue: string;
}

function buildDefaultFields(fields: NonNullable<ImageAgentMeta["templates"]>[number]["fields"]): Record<string, string> {
  if (!fields?.length) {
    return {
      theme: "MVP test product visual",
      selling_points: "clean composition, clear subject, commerce-ready style",
      ad_copy: "MVP Test",
      style_hint: "bright, polished, modern",
    };
  }

  return Object.fromEntries(fields.map((field) => [field.key, defaultFieldValue(field.key)]));
}

function buildTemplateSpecs(
  defaultPreset: { template_id: string; size: string; fields: Record<string, string> },
  meta: ImageAgentMeta | undefined,
): RuntimeTemplateSpec[] {
  const templates = meta?.templates;
  if (!templates?.length) {
    return [
      {
        id: defaultPreset.template_id,
        name: defaultPreset.template_id,
        allowedSizes: [defaultPreset.size],
        defaultSize: defaultPreset.size,
        fieldKeys: Object.keys(defaultPreset.fields),
        requiredFieldKeys: Object.keys(defaultPreset.fields),
      },
    ];
  }

  return templates.map((template) => ({
    id: template.id,
    name: template.name || template.id,
    allowedSizes: template.allowed_sizes || [],
    defaultSize: template.default_size || template.allowed_sizes?.[0] || defaultPreset.size,
    fieldKeys: (template.fields || []).map((field) => field.key),
    requiredFieldKeys: (template.fields || []).filter((field) => field.required).map((field) => field.key),
  }));
}

function buildFieldSpecs(
  defaultPreset: { fields: Record<string, string> },
  meta: ImageAgentMeta | undefined,
): RuntimeFieldSpec[] {
  const templates = meta?.templates;
  if (!templates?.length) {
    return Object.entries(defaultPreset.fields).map(([key, value]) => ({
      key,
      name: formFieldName(key),
      label: humanizeKey(key),
      required: Boolean(value),
      requiredFor: [],
      placeholder: value,
      defaultValue: value,
    }));
  }

  const byKey = new Map<string, RuntimeFieldSpec>();
  for (const template of templates) {
    for (const field of template.fields || []) {
      const existing = byKey.get(field.key);
      const requiredFor = field.required ? [template.id] : [];
      if (existing) {
        existing.requiredFor.push(...requiredFor);
        if (!existing.placeholder && field.placeholder) {
          existing.placeholder = field.placeholder;
        }
        continue;
      }
      byKey.set(field.key, {
        key: field.key,
        name: formFieldName(field.key),
        label: field.label || humanizeKey(field.key),
        required: false,
        requiredFor,
        placeholder: field.placeholder || defaultPreset.fields[field.key] || humanizeKey(field.key),
        defaultValue: defaultPreset.fields[field.key] || "",
      });
    }
  }
  return Array.from(byKey.values());
}

function defaultFieldValue(key: string): string {
  const defaults: Record<string, string> = {
    theme: "MVP test product visual",
    selling_points: "clean composition, clear subject, commerce-ready style",
    ad_copy: "MVP Test",
    style_hint: "bright, polished, modern",
    product_name: "MVP Product",
    activity_mood: "launch campaign",
  };
  return defaults[key] || `MVP ${humanizeKey(key)}`;
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "value";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function runtimeCardsTs(service: ServiceManifest, capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): string {
  const defaultPreset = buildDefaultPreset(capabilities, meta);
  const templateSpecs = buildTemplateSpecs(defaultPreset, meta);
  const fieldSpecs = buildFieldSpecs(defaultPreset, meta);
  return `import type { BatchStatus, GeneratePreset, ImageAgentResult } from "./image-agent-client.js";

export const defaultPreset: GeneratePreset = ${JSON.stringify(defaultPreset, null, 2)};

export const templateSpecs = ${JSON.stringify(templateSpecs, null, 2)};

export const fieldSpecs = ${JSON.stringify(fieldSpecs, null, 2)};

export function buildStartCard() {
  const defaultBatchItemsJson = JSON.stringify([{ fields: defaultPreset.fields }], null, 2);
  return {
    config: { wide_screen_mode: true },
    header: { template: "blue", title: { tag: "plain_text", content: "Image Agent MVP" } },
    elements: [
      { tag: "markdown", content: "**Target service:** ${service.service.name}\\n\\n**Templates:** " + templateSpecs.map((template) => template.id).join(", ") + "\\n\\nFill the parameters and submit to run /api/generate." },
      {
        tag: "form",
        name: "image_generate_form",
        elements: [
          { tag: "input", name: "param_template_id", required: true, default_value: defaultPreset.template_id, width: "fill", label: { tag: "plain_text", content: "Template ID" }, placeholder: { tag: "plain_text", content: templateSpecs.map((template) => template.id).join(" / ") } },
          { tag: "input", name: "param_size", required: true, default_value: defaultPreset.size, width: "fill", label: { tag: "plain_text", content: "Size" }, placeholder: { tag: "plain_text", content: "WIDTHxHEIGHT" } },
          ...fieldSpecs.map((field) => ({ tag: "input", name: field.name, required: field.required, default_value: field.defaultValue, width: "fill", label: { tag: "plain_text", content: field.label }, placeholder: { tag: "plain_text", content: field.placeholder || field.defaultValue || "Enter value" } })),
          { tag: "input", name: "param_message", required: false, default_value: defaultPreset.message || "", width: "fill", input_type: "multiline_text", rows: 2, auto_resize: true, label: { tag: "plain_text", content: "Message" }, placeholder: { tag: "plain_text", content: "Optional extra instruction" } },
          { tag: "button", text: { tag: "plain_text", content: "Generate image" }, type: "primary", action_type: "form_submit", name: "submit_image_generate", value: { action: "image.generate.submit", preset: defaultPreset } },
          { tag: "button", text: { tag: "plain_text", content: "Reset" }, type: "default", action_type: "form_reset", name: "reset_image_generate" },
        ],
      },
      { tag: "hr" },
      { tag: "markdown", content: "Use batch mode for long-running /api/batch jobs. Submit a JSON array of items, then refresh the returned progress card when needed." },
      {
        tag: "form",
        name: "image_batch_form",
        elements: [
          { tag: "input", name: "param_batch_template_id", required: true, default_value: defaultPreset.template_id, width: "fill", label: { tag: "plain_text", content: "Batch template ID" }, placeholder: { tag: "plain_text", content: templateSpecs.map((template) => template.id).join(" / ") } },
          { tag: "input", name: "param_batch_size", required: true, default_value: defaultPreset.size, width: "fill", label: { tag: "plain_text", content: "Batch size" }, placeholder: { tag: "plain_text", content: "WIDTHxHEIGHT" } },
          { tag: "input", name: "param_batch_items_json", required: true, default_value: defaultBatchItemsJson, width: "fill", input_type: "multiline_text", rows: 5, auto_resize: true, label: { tag: "plain_text", content: "Batch items JSON" }, placeholder: { tag: "plain_text", content: "[{ \\"fields\\": { ... } }]" } },
          { tag: "button", text: { tag: "plain_text", content: "Start batch" }, type: "primary", action_type: "form_submit", name: "submit_image_batch", value: { action: "image.batch.submit" } },
          { tag: "button", text: { tag: "plain_text", content: "Reset" }, type: "default", action_type: "form_reset", name: "reset_image_batch" },
        ],
      },
    ],
  };
}

export function buildRunningCard(traceId: string, preset: GeneratePreset) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: "Generating image" },
    },
    elements: [
      { tag: "markdown", content: \`**Status:** running\\n\\n**Trace:** \${traceId}\\n\\n**Template:** \${preset.template_id}\\n\\n**Size:** \${preset.size}\` },
    ],
  };
}

export function buildIterationRunningCard(traceId: string, sessionId: string) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: "Iterating image" },
    },
    elements: [
      { tag: "markdown", content: \`**Status:** running\\n\\n**Trace:** \${traceId}\\n\\n**Session:** \${escapeText(sessionId)}\` },
    ],
  };
}

export function buildBatchRunningCard(traceId: string, batchId: string, templateId = "", size = "", total = 0) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: "Batch running" },
    },
    elements: [
      {
        tag: "markdown",
        content: [
          "**Status:** running",
          \`**Trace:** \${traceId}\`,
          \`**Batch ID:** \${escapeText(batchId)}\`,
          templateId ? \`**Template:** \${escapeText(templateId)}\` : "",
          size ? \`**Size:** \${escapeText(size)}\` : "",
          total ? \`**Total:** \${total}\` : "",
        ].filter(Boolean).join("\\n\\n"),
      },
    ],
  };
}

export function buildBatchStatusCard(traceId: string, status: BatchStatus, downloadUrl: string) {
  const total = numberOrZero(status.total);
  const done = numberOrZero(status.done);
  const completedCount = Array.isArray(status.completed) ? status.completed.length : 0;
  const failedCount = Array.isArray(status.failed) ? status.failed.length : 0;
  const running = status.running === true;
  const finished = !running && total > 0 && done >= total;
  const hasFailures = failedCount > 0;
  const headerTemplate = running ? "blue" : hasFailures ? "red" : finished ? "green" : "blue";
  const title = running ? "Batch running" : hasFailures ? "Batch finished with failures" : finished ? "Batch complete" : "Batch status";
  const batchId = status.batch_id || "";
  const elements: unknown[] = [
    {
      tag: "markdown",
      content: [
        \`**Status:** \${running ? "running" : finished ? "completed" : "not running"}\`,
        \`**Trace:** \${traceId}\`,
        \`**Batch ID:** \${escapeText(batchId)}\`,
        \`**Progress:** \${done} / \${total}\`,
        \`**Completed:** \${completedCount}\`,
        \`**Failed:** \${failedCount}\`,
        status.template_id ? \`**Template:** \${escapeText(status.template_id)}\` : "",
        status.size ? \`**Size:** \${escapeText(status.size)}\` : "",
      ].filter(Boolean).join("\\n\\n"),
    },
  ];

  if (finished && downloadUrl && completedCount > 0) {
    elements.push({
      tag: "markdown",
      content: \`[Download completed images ZIP](\${downloadUrl})\`,
    });
  }

  if (batchId) {
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "Refresh status" },
          type: "default",
          value: {
            action: "image.batch.refresh",
            batch_id: batchId,
          },
        },
      ],
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      template: headerTemplate,
      title: { tag: "plain_text", content: title },
    },
    elements,
  };
}

export function buildSuccessCard(traceId: string, result: ImageAgentResult, imageKey: string, fallbackUrl: string) {
  const elements: unknown[] = [
    { tag: "markdown", content: \`**Status:** succeeded\\n\\n**Trace:** \${traceId}\\n\\n**Analysis:** \${escapeText(result.analysis || "No analysis returned.")}\` },
  ];

  if (imageKey) {
    elements.push({ tag: "img", img_key: imageKey, alt: { tag: "plain_text", content: "Generated image" } });
  } else if (fallbackUrl) {
    elements.push({ tag: "markdown", content: \`Image upload did not produce an image_key. Open target output: \${fallbackUrl}\` });
  }

  if (result.session_id) {
    elements.push({
      tag: "form",
      name: "image_iterate_form",
      elements: [
        {
          tag: "input",
          name: "param_feedback",
          required: true,
          width: "fill",
          input_type: "multiline_text",
          rows: 2,
          auto_resize: true,
          label: { tag: "plain_text", content: "Feedback" },
          placeholder: { tag: "plain_text", content: "Describe what to refine in the next image" },
          fallback: {
            tag: "fallback_text",
            text: { tag: "plain_text", content: "Input requires Feishu 6.8 or later." },
          },
        },
        {
          tag: "button",
          text: { tag: "plain_text", content: "Iterate image" },
          type: "primary",
          action_type: "form_submit",
          name: "submit_image_iterate",
          value: {
            action: "image.iterate.submit",
            session_id: result.session_id,
          },
        },
      ],
      fallback: {
        tag: "fallback_text",
        text: { tag: "plain_text", content: "Form input requires Feishu 6.6 or later." },
      },
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      template: "green",
      title: { tag: "plain_text", content: "Image generated" },
    },
    elements,
  };
}

export function buildInfoCard(traceId: string, title: string, message: string) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: title },
    },
    elements: [
      {
        tag: "markdown",
        content: \`**State:** duplicate action ignored\\n\\n**Trace ID:** \${traceId}\\n\\n**Next step:** \${escapeText(message)}\`,
      },
    ],
  };
}

export function buildFailureCard(traceId: string, message: string) {
  const nextStep = failureNextStep(message);
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "red",
      title: { tag: "plain_text", content: "Image generation failed" },
    },
    elements: [
      {
        tag: "markdown",
        content: \`**State:** failed\\n\\n**Trace ID:** \${traceId}\\n\\n**What happened:** \${escapeText(message)}\\n\\n**Next step:** \${nextStep}\`,
      },
    ],
  };
}

function escapeText(value: string): string {
  return value.replace(/[<>]/g, "");
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function failureNextStep(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("not authorized") || normalized.includes("operator_open_id")) {
    return "Use an allowed Feishu operator open_id or update ALLOWED_OPERATOR_OPEN_IDS, then submit again.";
  }
  if (normalized.includes("invalid card input") || normalized.includes("size must") || normalized.includes(" is required")) {
    return "Correct the card parameters and submit the form again.";
  }
  if (normalized.includes("timed out")) {
    return "Check target-service latency or raise IMAGE_AGENT_TIMEOUT_MS, then retry.";
  }
  if (normalized.includes("missing feishu") || normalized.includes("requires open_message_id")) {
    return "Complete bot-runtime/.env and Feishu callback/message permissions, then rerun verification.";
  }
  if (normalized.includes("unsupported card action")) {
    return "Refresh the start card and submit the generated form button.";
  }
  return "Check bot-runtime/audit.log with the trace ID, fix the target or runtime issue, then retry.";
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

function runtimeIndexTs(): string {
  return `import http from "node:http";
import fs from "node:fs";
import * as lark from "@larksuiteoapi/node-sdk";
import { audit, makeTraceId, readAuditTail } from "./audit.js";
import { buildFailureCard, buildInfoCard, buildRunningCard, buildStartCard, buildSuccessCard, defaultPreset, fieldSpecs, templateSpecs } from "./cards.js";
import { loadConfig } from "./config.js";
import { downloadImageToTemp, resolveImageUrl } from "./image-agent-client.js";
import type { BatchStatus, GeneratePreset, ImageAgentResult } from "./image-agent-client.js";

const config = loadConfig();
let cachedClient: lark.Client | undefined;
const adapterHandlersModule = "../../adapter/handlers.js";
const CARD_ACTION_DEDUPE_TTL_MS = 120_000;
const cardActionDedupe = new Map<string, CardActionDedupeEntry>();

interface AdapterResult {
  ok?: boolean;
  card?: unknown;
  result?: unknown;
  batchId?: string;
  batchStatus?: unknown;
  downloadUrl?: string;
  auditEvents?: Array<{ event: string; detail: Record<string, unknown> }>;
}

interface AdapterHandlersModule {
  handleImageAgentCardAction(ctx: Record<string, unknown>, deps: Record<string, unknown>): Promise<AdapterResult>;
}

interface CardActionDedupeEntry {
  traceId: string;
  card: unknown;
  expiresAt: number;
}

function requireFeishuApiConfig(): void {
  if (!config.feishuApiConfigured) {
    throw new Error(\`Missing Feishu API config: \${config.missingFeishuApiKeys.join(", ")}\`);
  }
}

function requireCallbackConfig(): void {
  if (!config.callbackConfigured) {
    throw new Error(\`Missing Feishu callback config: \${config.missingCallbackKeys.join(", ")}\`);
  }
}

function requireSendConfig(): void {
  if (!config.sendConfigured) {
    throw new Error(\`Missing Feishu send config: \${config.missingSendKeys.join(", ")}\`);
  }
}

function getClient(): lark.Client {
  requireFeishuApiConfig();
  if (!cachedClient) {
    cachedClient = new lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      domain: config.feishuOpenApiBaseUrl || lark.Domain.Feishu,
    });
  }
  return cachedClient;
}

async function sendCardToTestChat(card: unknown) {
  requireSendConfig();
  const response = await getClient().im.message.create({
    params: { receive_id_type: "chat_id" },
    data: {
      receive_id: config.testChatId,
      msg_type: "interactive",
      content: JSON.stringify(card),
    },
  });
  assertFeishuApiSuccess(response, "message.create");
  return response;
}

async function uploadImage(imageUrl: string, traceId: string): Promise<string> {
  if (!config.uploadImageToLark || !imageUrl) return "";
  const filePath = await downloadImageToTemp(imageUrl, traceId, config.imageAgentTimeoutMs);
  try {
    const result: any = await getClient().im.image.create({
      data: {
        image_type: "message",
        image: fs.createReadStream(filePath),
      },
    });
    assertFeishuApiSuccess(result, "image.create");
    const imageKey = result?.data?.image_key || result?.image_key || "";
    return imageKey;
  } finally {
    fs.rmSync(filePath, { force: true });
  }
}

async function updateCardMessage(messageId: string, card: unknown, traceId: string): Promise<void> {
  requireFeishuApiConfig();
  const tenantAccessToken = await getTenantAccessToken();
  const response = await fetch(\`\${getOpenApiBaseUrl()}/open-apis/im/v1/messages/\${encodeURIComponent(messageId)}\`, {
    method: "PATCH",
    headers: {
      "Authorization": \`Bearer \${tenantAccessToken}\`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ content: JSON.stringify(card) }),
  });
  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(\`Feishu message.patch returned HTTP \${response.status}: \${safeJsonStringify(body)}\`);
  }
  assertFeishuApiSuccess(body, "message.patch");
  audit({ trace_id: traceId, event: "message_patch_succeeded", detail: { messageId } });
}

async function getTenantAccessToken(): Promise<string> {
  const response = await fetch(\`\${getOpenApiBaseUrl()}/open-apis/auth/v3/tenant_access_token/internal\`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
  });
  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(\`Feishu tenant_access_token returned HTTP \${response.status}: \${safeJsonStringify(body)}\`);
  }
  assertFeishuApiSuccess(body, "tenant_access_token");
  const token = isRecord(body) && typeof body.tenant_access_token === "string" ? body.tenant_access_token : "";
  if (!token) {
    throw new Error(\`Feishu tenant_access_token response did not include tenant_access_token: \${safeJsonStringify(body)}\`);
  }
  return token;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getOpenApiBaseUrl(): string {
  return config.feishuOpenApiBaseUrl || "https://open.feishu.cn";
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

interface GenerationRun {
  traceId: string;
  result?: ImageAgentResult;
  imageUrl: string;
  imageKey: string;
  card: unknown;
}

async function runGeneration(preset: GeneratePreset, uploadToLark: boolean, traceId = makeTraceId()): Promise<GenerationRun> {
  audit({ trace_id: traceId, event: "generation_started", detail: { preset, uploadToLark } });
  const running = buildRunningCard(traceId, preset);
  audit({ trace_id: traceId, event: "running_card_built", detail: { running } });

  const adapter = await loadAdapterHandlers();
  const adapterResult = await adapter.handleImageAgentCardAction({
    action: "image.generate.submit",
    value: { action: "image.generate.submit", preset },
    formValue: {},
  }, {
    imageAgentBaseUrl: config.imageAgentBaseUrl,
    timeoutMs: config.imageAgentTimeoutMs,
  });
  for (const event of adapterResult.auditEvents || []) {
    audit({ trace_id: traceId, event: event.event, detail: event.detail || {} });
  }
  if (!adapterResult.ok) {
    throw new Error(adapterFailureMessage(adapterResult));
  }
  const result = normalizeImageAgentResult(adapterResult.result);
  const imageUrl = resolveImageUrl(config.imageAgentBaseUrl, result.image_url);
  let imageKey = "";
  if (uploadToLark && config.feishuApiConfigured) {
    try {
      imageKey = await uploadImage(imageUrl, traceId);
    } catch (error) {
      audit({
        trace_id: traceId,
        event: "image_upload_failed",
        detail: { message: error instanceof Error ? error.message : String(error), imageUrl },
      });
    }
  }

  audit({ trace_id: traceId, event: "generation_succeeded", detail: { imageUrl, imageKey } });
  return {
    traceId,
    result,
    imageUrl,
    imageKey,
    card: buildSuccessCard(traceId, result, imageKey, imageUrl),
  };
}

async function loadAdapterHandlers(): Promise<AdapterHandlersModule> {
  return await import(adapterHandlersModule) as AdapterHandlersModule;
}

function normalizeImageAgentResult(value: unknown): ImageAgentResult {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ImageAgentResult : {};
}

function adapterFailureMessage(adapterResult: unknown): string {
  if (!isRecord(adapterResult)) return "Adapter action failed.";
  const auditEvents = Array.isArray(adapterResult.auditEvents) ? adapterResult.auditEvents : [];
  for (let index = auditEvents.length - 1; index >= 0; index -= 1) {
    const event = auditEvents[index];
    if (!isRecord(event) || !isRecord(event.detail)) continue;
    const message = event.detail.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Adapter action failed.";
}

interface CardActionRun {
  ok: boolean;
  traceId: string;
  card: unknown;
  error?: string;
  batchId?: string;
  batchStatus?: BatchStatus;
  downloadUrl?: string;
}

async function runCardAction(data: any, options: { requireCallbackConfig: boolean; uploadToLark: boolean; asyncUpdate: boolean; dedupe: boolean }): Promise<CardActionRun> {
  const traceId = makeTraceId();
  const actionValue = getActionValue(data);
  const action = typeof actionValue.action === "string" ? actionValue.action : "";
  const formValue = getFormValue(data);
  const preset = isPreset(actionValue.preset) ? mergePresetWithFormValue(actionValue.preset, formValue) : undefined;
  const callbackContext = extractCallbackContext(data);
  audit({
    trace_id: traceId,
    event: "card_action_received",
    detail: {
      action,
      form_value_keys: isRecord(formValue) ? Object.keys(formValue) : [],
      ...callbackContext,
    },
  });

  if (!isSupportedCardAction(action)) {
    return {
      ok: false,
      traceId,
      card: buildFailureCard(traceId, "Unsupported card action."),
      error: "Unsupported card action.",
    };
  }

  const dedupeKey = options.dedupe ? buildCardActionDedupeKey(action, actionValue, formValue, callbackContext) : "";
  if (dedupeKey) {
    const duplicate = findDuplicateCardAction(dedupeKey, traceId, callbackContext);
    if (duplicate) {
      return {
        ok: true,
        traceId,
        card: duplicate.card,
      };
    }
    rememberCardAction(dedupeKey, traceId, buildInfoCard(traceId, "Card action already queued", "This card action is already being processed. The original request will update the card when it finishes."));
  }

  try {
    if (options.requireCallbackConfig) {
      requireCallbackConfig();
    }
    if (options.asyncUpdate && action === "image.generate.submit" && preset) {
      requireFeishuApiConfig();
      const messageId = typeof callbackContext.open_message_id === "string" ? callbackContext.open_message_id : "";
      if (!messageId) {
        throw new Error("Async card action requires open_message_id in the callback context.");
      }
      const runningCard = buildRunningCard(traceId, preset);
      audit({ trace_id: traceId, event: "async_generation_queued", detail: { messageId, preset } });
      rememberCardAction(dedupeKey, traceId, runningCard);
      void completeAsyncCardAction(messageId, preset, options.uploadToLark, traceId, callbackContext, dedupeKey);
      return {
        ok: true,
        traceId,
        card: runningCard,
      };
    }
    const adapter = await loadAdapterHandlers();
    const adapterResult = await adapter.handleImageAgentCardAction({
      action,
      value: actionValue,
      formValue: isRecord(formValue) ? formValue : {},
      operatorOpenId: typeof callbackContext.operator_open_id === "string" ? callbackContext.operator_open_id : undefined,
      openMessageId: typeof callbackContext.open_message_id === "string" ? callbackContext.open_message_id : undefined,
      openChatId: typeof callbackContext.open_chat_id === "string" ? callbackContext.open_chat_id : undefined,
    }, {
      imageAgentBaseUrl: config.imageAgentBaseUrl,
      timeoutMs: config.imageAgentTimeoutMs,
      allowedOperatorOpenIds: config.allowedOperatorOpenIds,
    });
    for (const event of adapterResult.auditEvents || []) {
      const translated = translateAdapterAuditEvent(event, callbackContext);
      audit({ trace_id: traceId, event: translated.event, detail: translated.detail });
    }
    const card = adapterResult.ok ? decorateAdapterCard(adapterResult.card, traceId) : buildFailureCard(traceId, adapterFailureMessage(adapterResult));
    rememberCardAction(dedupeKey, traceId, card);
    return {
      ok: Boolean(adapterResult.ok),
      traceId,
      card,
      batchId: adapterResult.batchId,
      batchStatus: normalizeBatchStatus(adapterResult.batchStatus, adapterResult.batchId),
      downloadUrl: adapterResult.downloadUrl,
      error: adapterResult.ok ? undefined : adapterFailureMessage(adapterResult),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureCard = buildFailureCard(traceId, message);
    rememberCardAction(dedupeKey, traceId, failureCard);
    audit({ trace_id: traceId, event: "generation_failed", detail: { message, ...callbackContext } });
    return {
      ok: false,
      traceId,
      card: failureCard,
      error: message,
    };
  }
}

function isSupportedCardAction(action: string): boolean {
  return action === "image.generate.submit"
    || action === "image.iterate.submit"
    || action === "image.batch.submit"
    || action === "image.batch.refresh";
}

function decorateAdapterCard(card: unknown, traceId: string): unknown {
  if (!isRecord(card) || !Array.isArray(card.elements)) return card;
  const elements = card.elements.map((element) => isRecord(element) ? { ...element } : element);
  elements.push({ tag: "markdown", content: "**Trace ID:** " + traceId });
  return { ...card, elements };
}

function normalizeBatchStatus(value: unknown, batchId: string | undefined): BatchStatus | undefined {
  if (!isRecord(value)) return undefined;
  return { ...value, batch_id: typeof value.batch_id === "string" ? value.batch_id : batchId || "" } as BatchStatus;
}

function translateAdapterAuditEvent(
  event: { event: string; detail: Record<string, unknown> },
  callbackContext: Record<string, unknown>,
): { event: string; detail: Record<string, unknown> } {
  if (event.event === "adapter_generation_failed") {
    const message = typeof event.detail.message === "string" ? event.detail.message : "Adapter action failed.";
    const normalized = message.toLowerCase();
    if (normalized.includes("not authorized") || normalized.includes("operator_open_id")) {
      return {
        event: "card_action_unauthorized",
        detail: {
          message,
          allowed_operator_count: config.allowedOperatorOpenIds.length,
          ...callbackContext,
        },
      };
    }
    if (normalized.includes("timed out")) {
      return { event: "generation_failed", detail: { message, ...callbackContext } };
    }
    return { event: "card_action_validation_failed", detail: { errors: [message], ...callbackContext } };
  }
  if (event.event === "adapter_batch_submitted") {
    return {
      event: "batch_started",
      detail: {
        template_id: event.detail.template_id,
        size: event.detail.size,
        total: event.detail.total,
        ...callbackContext,
      },
    };
  }
  if (event.event === "adapter_batch_status_checked") {
    return { event: "batch_status_checked", detail: { ...event.detail, ...callbackContext } };
  }
  return event;
}

function buildCardActionDedupeKey(
  action: string,
  payload: unknown,
  formValue: unknown,
  callbackContext: Record<string, unknown>,
): string {
  return safeJsonStringify({
    action,
    payload,
    formValue: isRecord(formValue) ? formValue : {},
    operator_open_id: callbackContext.operator_open_id || "",
    open_message_id: callbackContext.open_message_id || "",
    open_chat_id: callbackContext.open_chat_id || "",
  });
}

function findDuplicateCardAction(
  dedupeKey: string,
  traceId: string,
  callbackContext: Record<string, unknown>,
): CardActionDedupeEntry | undefined {
  cleanupCardActionDedupe();
  const duplicate = cardActionDedupe.get(dedupeKey);
  if (!duplicate) return undefined;
  audit({
    trace_id: traceId,
    event: "card_action_duplicate",
    detail: {
      original_trace_id: duplicate.traceId,
      dedupe_ttl_seconds: Math.round(CARD_ACTION_DEDUPE_TTL_MS / 1000),
      ...callbackContext,
    },
  });
  return duplicate;
}

function rememberCardAction(dedupeKey: string, traceId: string, card: unknown): void {
  if (!dedupeKey) return;
  cardActionDedupe.set(dedupeKey, {
    traceId,
    card,
    expiresAt: Date.now() + CARD_ACTION_DEDUPE_TTL_MS,
  });
}

function cleanupCardActionDedupe(): void {
  const now = Date.now();
  for (const [key, value] of cardActionDedupe.entries()) {
    if (value.expiresAt <= now) {
      cardActionDedupe.delete(key);
    }
  }
}

async function completeAsyncCardAction(
  messageId: string,
  preset: GeneratePreset,
  uploadToLark: boolean,
  traceId: string,
  callbackContext: Record<string, unknown>,
  dedupeKey: string,
): Promise<void> {
  try {
    const run = await runGeneration(preset, uploadToLark, traceId);
    rememberCardAction(dedupeKey, traceId, run.card);
    await updateCardMessage(messageId, run.card, traceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureCard = buildFailureCard(traceId, message);
    rememberCardAction(dedupeKey, traceId, failureCard);
    audit({ trace_id: traceId, event: "async_generation_failed", detail: { message, ...callbackContext } });
    try {
      await updateCardMessage(messageId, failureCard, traceId);
    } catch (patchError) {
      audit({
        trace_id: traceId,
        event: "message_patch_failed",
        detail: { message: patchError instanceof Error ? patchError.message : String(patchError), originalError: message },
      });
    }
  }
}

const cardHandler = new lark.CardActionHandler(
  {
    encryptKey: config.encryptKey,
    verificationToken: config.verificationToken,
  },
  async (data: any) => {
    const run = await runCardAction(data, {
      requireCallbackConfig: true,
      uploadToLark: config.uploadImageToLark && config.feishuApiConfigured,
      asyncUpdate: config.cardActionMode === "async",
      dedupe: true,
    });
    return run.card;
  },
);

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", "http://localhost");

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true,
      service: "image-agent-web-lark-runtime",
      feishuConfigured: config.feishuConfigured,
      feishuApiConfigured: config.feishuApiConfigured,
      callbackConfigured: config.callbackConfigured,
      sendConfigured: config.sendConfigured,
      cardActionMode: config.cardActionMode,
      feishuOpenApiBaseUrl: config.feishuOpenApiBaseUrl,
      uploadImageToLark: config.uploadImageToLark,
      operatorAuthConfigured: config.allowedOperatorOpenIds.length > 0,
      allowedOperatorCount: config.allowedOperatorOpenIds.length,
      missingFeishuKeys: config.missingFeishuKeys,
      missingFeishuApiKeys: config.missingFeishuApiKeys,
      missingCallbackKeys: config.missingCallbackKeys,
      missingSendKeys: config.missingSendKeys,
      publicCallbackBaseUrl: config.publicCallbackBaseUrl,
      imageAgentBaseUrl: config.imageAgentBaseUrl,
      imageAgentTimeoutMs: config.imageAgentTimeoutMs,
      debugEnabled: config.allowDebugWithoutFeishu,
      debugProtected: Boolean(config.debugAccessToken),
    }));
    return;
  }

  if (requestUrl.pathname.startsWith("/debug/") && !isDebugRequestAllowed(req)) {
    writeJson(res, 403, {
      ok: false,
      error: config.allowDebugWithoutFeishu
        ? "Debug endpoint access denied. Provide DEBUG_ACCESS_TOKEN with Authorization: Bearer <token> or x-lark-deployer-debug-token."
        : "Debug endpoints are disabled. Set ALLOW_DEBUG_WITHOUT_FEISHU=1 for local verification.",
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/debug/audit-tail") {
    const requestedLimit = Number(requestUrl.searchParams.get("limit") || "50");
    const limit = Number.isInteger(requestedLimit) ? requestedLimit : 50;
    const events = readAuditTail(limit);
    writeJson(res, 200, { ok: true, count: events.length, events });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/debug/start-card") {
    const traceId = makeTraceId();
    try {
      const body = await readJsonBody(req);
      const response = isRecord(body?.mockFeishuResponse) && config.allowDebugWithoutFeishu
        ? assertMockFeishuResponse(body.mockFeishuResponse)
        : await sendCardToTestChat(buildStartCard());
      audit({
        trace_id: traceId,
        event: "start_card_sent",
        detail: {
          messageId: extractFeishuMessageId(response),
          responseCode: isRecord(response) ? response.code : undefined,
        },
      });
      writeJson(res, 200, { ok: true, traceId, response });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      audit({ trace_id: traceId, event: "start_card_failed", detail: { message } });
      writeJson(res, 500, { ok: false, traceId, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/debug/simulate-generate") {
    try {
      const body = await readJsonBody(req);
      const preset = isPreset(body?.preset) ? body.preset : defaultPreset;
      const uploadToLark = Boolean(body?.uploadToLark) && config.feishuApiConfigured;
      const run = await runGeneration(preset, uploadToLark);
      writeJson(res, 200, { ok: true, ...run });
    } catch (error) {
      const traceId = makeTraceId();
      const message = error instanceof Error ? error.message : String(error);
      audit({ trace_id: traceId, event: "debug_simulate_failed", detail: { message } });
      writeJson(res, 500, { ok: false, traceId, card: buildFailureCard(traceId, message), error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/debug/simulate-card-action") {
    try {
      const body = await readJsonBody(req);
      const preset = isPreset(body?.preset) ? body.preset : defaultPreset;
      const actionName = typeof body?.action === "string" ? body.action : "image.generate.submit";
      const formValue = isRecord(body?.formValue) ? body.formValue : buildDefaultFormValueForAction(actionName, preset);
      const eventShape = body?.eventShape === "v2" ? "v2" : "legacy";
      const valueAsJsonString = body?.valueAsJsonString === true;
      const uploadToLark = Boolean(body?.uploadToLark) && config.feishuApiConfigured;
      const actionValue = buildDebugActionValue(body, preset);
      const event = eventShape === "v2"
        ? buildDebugCardActionEventV2(preset, formValue, valueAsJsonString, actionValue)
        : buildDebugCardActionEvent(preset, formValue, valueAsJsonString, actionValue);
      const run = await runCardAction(event, {
        requireCallbackConfig: false,
        uploadToLark,
        asyncUpdate: body?.asyncUpdate === true,
        dedupe: body?.dedupe === true,
      });
      writeJson(res, run.ok ? 200 : 500, run);
    } catch (error) {
      const traceId = makeTraceId();
      const message = error instanceof Error ? error.message : String(error);
      audit({ trace_id: traceId, event: "debug_card_action_failed", detail: { message } });
      writeJson(res, 500, { ok: false, traceId, card: buildFailureCard(traceId, message), error: message });
    }
    return;
  }

  if (requestUrl.pathname === "/webhook/card") {
    await handleCardWebhook(req, res);
    return;
  }

  writeJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(config.port, config.host, () => {
  console.log(\`Lark bot runtime listening on http://\${config.host}:\${config.port}\`);
  console.log("Card callback path: /webhook/card");
  if (!config.feishuConfigured) {
    console.log(\`Feishu config incomplete: \${config.missingFeishuKeys.join(", ")}\`);
    console.log("Local debug endpoint available: POST /debug/simulate-generate");
  }
  if (config.allowDebugWithoutFeishu && config.debugAccessToken) {
    console.log("Debug endpoints require DEBUG_ACCESS_TOKEN.");
  }
  if (config.allowDebugWithoutFeishu && !config.debugAccessToken) {
    console.log("Debug endpoints are unprotected. Set DEBUG_ACCESS_TOKEN before exposing this runtime publicly.");
  }
});

function writeJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function assertMockFeishuResponse(response: Record<string, unknown>): Record<string, unknown> {
  assertFeishuApiSuccess(response, "mock message.create");
  return response;
}

function extractFeishuMessageId(response: unknown): string {
  if (!isRecord(response)) return "";
  const data = isRecord(response.data) ? response.data : {};
  return stringFromUnknown(data.message_id)
    || stringFromUnknown(data.messageId)
    || stringFromUnknown(data.open_message_id)
    || stringFromUnknown(response.message_id)
    || stringFromUnknown(response.messageId)
    || stringFromUnknown(response.open_message_id);
}

function stringFromUnknown(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isDebugRequestAllowed(req: http.IncomingMessage): boolean {
  if (!config.allowDebugWithoutFeishu) return false;
  if (!config.debugAccessToken) return true;
  const headerToken = firstHeaderValue(req.headers["x-lark-deployer-debug-token"]);
  if (headerToken === config.debugAccessToken) return true;
  const authorization = firstHeaderValue(req.headers.authorization);
  return authorization === \`Bearer \${config.debugAccessToken}\`;
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function assertFeishuApiSuccess(response: unknown, operation: string): void {
  if (!isRecord(response) || !Object.prototype.hasOwnProperty.call(response, "code")) return;
  const rawCode = response.code;
  const code = typeof rawCode === "number" ? rawCode : Number(rawCode);
  if (Number.isFinite(code) && code === 0) return;
  const message = typeof response.msg === "string"
    ? response.msg
    : typeof response.message === "string"
      ? response.message
      : "Unknown Feishu API error";
  throw new Error(\`Feishu \${operation} failed with code \${String(rawCode)}: \${message}\`);
}

async function handleCardWebhook(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    writeJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  let body: any;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    return;
  }

  const data = Object.assign(Object.create({ headers: req.headers }), body);
  try {
    const { isChallenge, challenge } = lark.generateChallenge(data, { encryptKey: config.encryptKey });
    if (isChallenge) {
      writeJson(res, 200, challenge);
      return;
    }
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  if (!config.callbackConfigured) {
    writeJson(res, 503, {
      ok: false,
      error: \`Feishu callback config incomplete: \${config.missingCallbackKeys.join(", ")}\`,
      missingFeishuKeys: config.missingCallbackKeys,
    });
    return;
  }

  const card = await cardHandler.invoke(data);
  if (!card) {
    writeJson(res, 401, { ok: false, error: "Card callback verification failed or no card was returned." });
    return;
  }
  writeJson(res, 200, card);
}

function buildDebugCardActionEvent(
  preset: GeneratePreset,
  formValue: Record<string, unknown>,
  valueAsJsonString = false,
  actionValue?: Record<string, unknown>,
): Record<string, unknown> {
  const value = actionValue || {
    action: "image.generate.submit",
    preset,
  };
  return {
    open_id: "debug_open_id",
    user_id: "debug_user_id",
    tenant_key: "debug_tenant_key",
    open_message_id: "debug_message_id",
    context: {
      open_chat_id: "debug_chat_id",
      open_message_id: "debug_message_id",
    },
    action: {
      tag: "button",
      form_value: formValue,
      value: valueAsJsonString ? JSON.stringify(value) : value,
    },
  };
}

function buildDebugCardActionEventV2(
  preset: GeneratePreset,
  formValue: Record<string, unknown>,
  valueAsJsonString = false,
  actionValue?: Record<string, unknown>,
): Record<string, unknown> {
  const value = actionValue || {
    action: "image.generate.submit",
    preset,
  };
  return {
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      tenant_key: "debug_v2_tenant_key",
    },
    event: {
      operator: {
        open_id: "debug_v2_open_id",
        user_id: "debug_v2_user_id",
      },
      token: "debug_v2_card_update_token",
      action: {
        tag: "button",
        name: "submit_image_generate",
        form_value: formValue,
        value: valueAsJsonString ? JSON.stringify(value) : value,
      },
      context: {
        open_chat_id: "debug_v2_chat_id",
        open_message_id: "debug_v2_message_id",
      },
    },
  };
}

function buildDebugActionValue(body: any, preset: GeneratePreset): Record<string, unknown> {
  if (body?.action === "image.iterate.submit") {
    return {
      action: "image.iterate.submit",
      session_id: stringFromUnknown(body?.session_id || body?.sessionId) || "debug_session_id",
    };
  }
  if (body?.action === "image.batch.submit") {
    return {
      action: "image.batch.submit",
    };
  }
  if (body?.action === "image.batch.refresh") {
    return {
      action: "image.batch.refresh",
      batch_id: stringFromUnknown(body?.batch_id || body?.batchId) || "debug_batch_id",
    };
  }
  return {
    action: "image.generate.submit",
    preset,
  };
}

function buildDefaultFormValueForAction(action: string, preset: GeneratePreset): Record<string, string> {
  if (action === "image.iterate.submit") {
    return { param_feedback: "Make the image cleaner and more conversion-focused." };
  }
  if (action === "image.batch.submit") {
    return buildDefaultBatchFormValue(preset);
  }
  if (action === "image.batch.refresh") {
    return {};
  }
  return buildDefaultFormValue(preset);
}

function buildDefaultFormValue(preset: GeneratePreset): Record<string, string> {
  return {
    param_template_id: preset.template_id,
    param_size: preset.size,
    param_message: preset.message || "",
    ...Object.fromEntries(fieldSpecs.map((field) => [field.name, preset.fields[field.key] || ""])),
  };
}

function buildDefaultBatchFormValue(preset: GeneratePreset): Record<string, string> {
  return {
    param_batch_template_id: preset.template_id,
    param_batch_size: preset.size,
    param_batch_items_json: JSON.stringify([{ fields: preset.fields }], null, 2),
  };
}

function getActionValue(data: any): Record<string, unknown> {
  const value = getActionObject(data)?.value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getFormValue(data: any): unknown {
  const action = getActionObject(data);
  if (isRecord(action?.form_value)) return action.form_value;
  if (isRecord(action?.formValue)) return action.formValue;
  if (isRecord(data?.form_value)) return data.form_value;
  if (isRecord(data?.formValue)) return data.formValue;
  return undefined;
}

function getActionObject(data: any): Record<string, unknown> | undefined {
  if (isRecord(data?.action)) return data.action;
  if (isRecord(data?.event?.action)) return data.event.action;
  return undefined;
}

function mergePresetWithFormValue(preset: GeneratePreset, formValue: unknown): GeneratePreset {
  if (!formValue || typeof formValue !== "object") return preset;
  const submitted = formValue as Record<string, unknown>;
  let templateId = preset.template_id;
  let size = preset.size;
  let message = preset.message || "";
  const fields = { ...preset.fields };
  if (Object.prototype.hasOwnProperty.call(submitted, "param_template_id")) {
    templateId = typeof submitted.param_template_id === "string" ? submitted.param_template_id.trim() : "";
  }
  if (Object.prototype.hasOwnProperty.call(submitted, "param_size")) {
    size = typeof submitted.param_size === "string" ? submitted.param_size.trim() : "";
  }
  if (Object.prototype.hasOwnProperty.call(submitted, "param_message")) {
    message = typeof submitted.param_message === "string" ? submitted.param_message.trim() : "";
  }
  for (const field of fieldSpecs) {
    if (Object.prototype.hasOwnProperty.call(submitted, field.name)) {
      const submittedValue = submitted[field.name];
      fields[field.key] = typeof submittedValue === "string" ? submittedValue.trim() : "";
    }
  }
  return {
    ...preset,
    template_id: templateId,
    size,
    message,
    fields,
  };
}

function validatePreset(preset: GeneratePreset): string[] {
  const errors: string[] = [];
  const template = findTemplateSpec(preset.template_id);
  if (!template) {
    errors.push(\`Template ID must be one of: \${templateSpecs.map((item) => item.id).join(", ")}.\`);
  }
  if (!/^([1-9]\\d*)x([1-9]\\d*)$/i.test(preset.size.trim())) {
    errors.push("Size must use WIDTHxHEIGHT, for example 1024x1024.");
  }

  const requiredKeys = template
    ? new Set(template.requiredFieldKeys)
    : new Set(fieldSpecs.filter((field) => field.required).map((field) => field.key));
  for (const field of fieldSpecs) {
    if (!requiredKeys.has(field.key)) continue;
    const value = preset.fields[field.key];
    if (typeof value !== "string" || !value.trim()) {
      errors.push(field.label + " is required.");
    }
  }

  return errors;
}

function findTemplateSpec(templateId: string): { id: string; requiredFieldKeys: string[] } | undefined {
  return templateSpecs.find((template) => template.id === templateId);
}

function isOperatorAllowed(callbackContext: Record<string, unknown>): boolean {
  if (!config.allowedOperatorOpenIds.length) return true;
  const operatorOpenId = typeof callbackContext.operator_open_id === "string" ? callbackContext.operator_open_id : "";
  return Boolean(operatorOpenId && config.allowedOperatorOpenIds.includes(operatorOpenId));
}

function extractCallbackContext(data: any): Record<string, unknown> {
  const event = isRecord(data?.event) ? data.event : {};
  const eventOperator = isRecord(event.operator) ? event.operator : {};
  const eventContext = isRecord(event.context) ? event.context : {};
  const action = getActionObject(data);
  return compactObject({
    operator_open_id: data?.open_id || data?.operator?.open_id || data?.operator?.openId || eventOperator.open_id || eventOperator.openId,
    operator_user_id: data?.user_id || data?.operator?.user_id || data?.operator?.userId || eventOperator.user_id || eventOperator.userId,
    tenant_key: data?.tenant_key || data?.header?.tenant_key || event.tenant_key,
    open_message_id: data?.open_message_id || data?.context?.open_message_id || data?.messageId || eventContext.open_message_id || event.messageId,
    open_chat_id: data?.open_chat_id || data?.context?.open_chat_id || data?.chatId || eventContext.open_chat_id || event.chatId,
    action_tag: action?.tag,
    action_option: action?.option,
    action_name: action?.name,
  });
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function isPreset(value: unknown): value is GeneratePreset {
  if (!value || typeof value !== "object") return false;
  const candidate = value as GeneratePreset;
  return typeof candidate.template_id === "string"
    && typeof candidate.size === "string"
    && typeof candidate.fields === "object"
    && candidate.fields !== null;
}
`;
}
