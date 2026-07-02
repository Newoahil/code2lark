import fs from "node:fs";
import path from "node:path";
import { getStringOption, hasOption } from "../args.js";
import { buildContextMarkdown, buildContextReplyMarkdown, buildContextReplyTemplate, buildContextRequestMarkdown, buildContextTemplate, type ContextTemplate } from "./context.js";
import { copyFileIfExists, ensureDir, readJsonFile, slugify, writeJson, writeText } from "../fs-utils.js";
import type { CapabilityMap, RequiredPermissions, ServiceManifest } from "../types.js";
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

type IntegrationMode = "embedded-adapter" | "standalone-runtime";

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
  const permissions = readJsonFile<RequiredPermissions>(path.join(manifestDir, "required_permissions.json"));
  const meta = readOptionalJson<ImageAgentMeta>(path.join(manifestDir, "image_agent_meta.snapshot.json"));
  const defaultOut = path.resolve("generated", `${slugify(service.service.name)}-lark`);
  const outDir = path.resolve(getStringOption(options, "out", defaultOut));
  const integrationMode = normalizeIntegrationMode(getStringOption(options, "mode", getStringOption(options, "integration-mode", getStringOption(options, "integrationMode", "standalone-runtime"))));
  const adapterDir = path.join(outDir, "adapter");
  const docsDir = path.join(outDir, "docs");
  const runtimeDir = path.join(outDir, "bot-runtime");

  ensureDir(outDir);
  ensureDir(adapterDir);
  ensureDir(docsDir);
  if (integrationMode === "standalone-runtime") ensureDir(runtimeDir);
  ensureDir(path.join(outDir, "manifest"));

  copyManifestArtifacts(workspace, outDir);
  writeJson(path.join(outDir, "generation_summary.json"), {
    schema_version: "0.1",
    generated_at: new Date().toISOString(),
    source_workspace: workspace,
    service: service.service.name,
    integration_mode: integrationMode,
    core_artifact: "adapter",
    runtime: integrationMode === "standalone-runtime" ? "node-lark-bot-runtime" : "none",
    capability_ids: capabilities.capabilities.map((capability) => capability.id),
  });

  writeText(path.join(outDir, ".gitignore"), generatedPackageGitignore());
  writeText(path.join(outDir, "START_HERE.md"), buildStartHere(service, integrationMode));
  writeText(path.join(outDir, "README.md"), buildGeneratedReadme(service, permissions, integrationMode));
  writeText(path.join(outDir, "deployment_checklist.md"), buildDeploymentChecklist(service, permissions));
  writeText(path.join(docsDir, "integration_guide.md"), buildEmbeddedIntegrationGuide(service, permissions));
  writeLevel2VerificationRecord(path.join(outDir, "level2_verification_record.md"), buildLevel2VerificationRecord(service, permissions));
  writeJson(path.join(outDir, "level2_manual_evidence.template.json"), buildLevel2ManualEvidenceTemplate(service));
  writePackageContext(workspace, outDir, service, permissions);
  writeText(path.join(adapterDir, "types.ts"), adapterTypesTs());
  writeText(path.join(adapterDir, "audit-events.ts"), adapterAuditEventsTs());
  writeText(path.join(adapterDir, "validation.ts"), adapterValidationTs());
  writeText(path.join(adapterDir, "service-client.ts"), adapterServiceClientTs());
  writeText(path.join(adapterDir, "cards.ts"), adapterCardsTs());
  writeText(path.join(adapterDir, "handlers.ts"), adapterHandlersTs(service, capabilities, meta));
  writeRuntimeAdapterJs(adapterDir, service, capabilities, meta);
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

  console.log(`Generated Lark integration package at ${outDir}`);
  console.log(`Next: review ${path.join(outDir, "README.md")}`);
}

function generateUsage(): string {
  return "Usage: lark-deployer generate <analysis-workspace> [--out <generated-dir>] [--mode embedded-adapter|standalone-runtime]";
}

function normalizeIntegrationMode(value: string): IntegrationMode {
  const normalized = value.trim() || "standalone-runtime";
  if (normalized === "embedded" || normalized === "embedded-adapter") return "embedded-adapter";
  if (normalized === "standalone" || normalized === "standalone-runtime") return "standalone-runtime";
  throw new Error('--mode must be "embedded-adapter" or "standalone-runtime".');
}

function writeRuntimeAdapterJs(adapterDir: string, service: ServiceManifest, capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): void {
  writeText(path.join(adapterDir, "audit-events.js"), adapterAuditEventsJs());
  writeText(path.join(adapterDir, "cards.js"), adapterCardsJs());
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
): void {
  const sourceContext = readOptionalJson<Partial<ContextTemplate>>(path.join(workspace, "feishu_context.template.json"));
  const mergedContext = mergeContextValues(
    buildContextTemplate(service, permissions, {
      generatedPackageHint: packageHintFromProjectRoot(outDir),
      packageRootCliPath: toCliPath(path.relative(outDir, path.resolve("dist", "index.js"))),
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

function buildStartHere(service: ServiceManifest, integrationMode: IntegrationMode): string {
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
node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter --strict
# After adapter/ is mounted in your existing Feishu SDK host:
node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter --host-runtime-url http://127.0.0.1:3978 --simulate
node $env:LARK_DEPLOYER_CLI doctor . --mode embedded-adapter --gate
\`\`\``;
  return `# Start Here

This generated package connects \`${service.service.name}\` to Feishu/Lark card actions for MVP-1A verification. The core generated artifact is \`adapter/\`${integrationMode === "standalone-runtime" ? "; \`bot-runtime/\` is the optional standalone reference host." : ". This package was generated in embedded-adapter mode and does not include \`bot-runtime/\`."}

## Boundary

- Lark-deployer built this package; it does not start or supervise \`${service.service.name}\`.
- Keep real secrets out of shared Markdown. Use \`feishu_context.local.json\`${integrationMode === "standalone-runtime" ? " or `bot-runtime/.env`" : " or the existing host service's secret store"} locally.
- Real MVP completion still requires a Feishu app, a test chat, a public callback URL, and a real card click/result observation.

## First 10 Minutes

1. Review \`adapter/\` and \`docs/integration_guide.md\` if you already have a Feishu SDK service.
2. Read \`doctor_report.md\` for the current blocker list.
3. Send \`feishu_context.request.md\` to the Feishu app owner/FDE.
4. Use \`feishu_context.reply.template.json\` or \`feishu_context.reply.template.md\` to record non-secret answers, then confirm who owns \`APP_ID\`, \`APP_SECRET\`, \`VERIFICATION_TOKEN\`, \`TEST_CHAT_ID\`, \`PUBLIC_CALLBACK_BASE_URL\`, and the reachable target URL.
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
  uploadImageToFeishu?: (imageUrl: string) => Promise<string>;
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

export function mergeGeneratePresetWithFormValue(preset: GeneratePreset, formValue: Record<string, unknown> | undefined): GeneratePreset {
  if (!formValue) return preset;
  const fields = { ...preset.fields };
  for (const [key, value] of Object.entries(formValue)) {
    if (key.startsWith("field_") && typeof value === "string") {
      fields[key.slice("field_".length)] = value;
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
  const response = await fetchWithTimeout(baseUrl.replace(/\/+$/, "") + "/api/iterate", {
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
  const response = await fetchWithTimeout(baseUrl.replace(/\/+$/, "") + "/api/batch", { method: "POST", body: form }, timeoutMs, "image-agent-web /api/batch");
  const parsed = await readJsonResponse(response, "image-agent-web /api/batch");
  const batchId = typeof parsed.batch_id === "string" ? parsed.batch_id : "";
  if (!batchId) throw new Error("image-agent-web /api/batch response did not include batch_id: " + JSON.stringify(parsed));
  return { batch_id: batchId };
}

export async function callImageBatchStatus(baseUrl: string, batchId: string, timeoutMs = 120000): Promise<Record<string, unknown>> {
  const response = await fetchWithTimeout(baseUrl.replace(/\/+$/, "") + "/api/batch/" + encodeURIComponent(batchId) + "/status", {}, timeoutMs, "image-agent-web /api/batch/{batch_id}/status");
  return readJsonResponse(response, "image-agent-web /api/batch/{batch_id}/status");
}

export function resolveBatchDownloadUrl(baseUrl: string, batchId: string): string {
  return baseUrl.replace(/\/+$/, "") + "/api/batch/" + encodeURIComponent(batchId) + "/download";
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

export function mergeGeneratePresetWithFormValue(preset, formValue) {
  if (!formValue || typeof formValue !== "object") return preset;
  const fields = { ...preset.fields };
  for (const [key, value] of Object.entries(formValue)) {
    if (key.startsWith("field_") && typeof value === "string") {
      fields[key.slice("field_".length)] = value.trim();
    }
  }
  const merged = {
    ...preset,
    template_id: stringValue(formValue.param_template_id) || preset.template_id,
    size: stringValue(formValue.param_size) || preset.size,
    message: stringValue(formValue.param_message) || preset.message,
    fields,
  };
  if (!/^([1-9]\\d*)x([1-9]\\d*)$/i.test(String(merged.size || "").trim())) {
    throw new Error("Size must use WIDTHxHEIGHT, for example 1024x1024.");
  }
  return merged;
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
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

function adapterCardsJs(): string {
  return `export function buildSuccessCard(result) {
  const imageUrl = typeof result.image_url === "string" ? result.image_url : "";
  return {
    config: { wide_screen_mode: true },
    header: { template: "green", title: { tag: "plain_text", content: "Image generation complete" } },
    elements: [
      { tag: "markdown", content: imageUrl ? "**Image:** " + imageUrl : "Image generation completed." },
    ],
  };
}

export function buildBatchStatusCard(status, downloadUrl) {
  const total = numberValue(status?.total);
  const done = numberValue(status?.done);
  const completedCount = Array.isArray(status?.completed) ? status.completed.length : 0;
  const failedCount = Array.isArray(status?.failed) ? status.failed.length : 0;
  const running = status?.running === true;
  const finished = !running && total > 0 && done >= total;
  const batchId = stringValue(status?.batch_id);
  const elements = [
    {
      tag: "markdown",
      content: [
        "**Status:** " + (running ? "running" : finished ? "completed" : "not running"),
        "**Batch ID:** " + batchId,
        "**Done:** " + done + "/" + total,
        "**Completed:** " + completedCount,
        "**Failed:** " + failedCount,
        stringValue(status?.template_id) ? "**Template:** " + stringValue(status.template_id) : "",
        stringValue(status?.size) ? "**Size:** " + stringValue(status.size) : "",
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

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildFailureCard(message) {
  return {
    config: { wide_screen_mode: true },
    header: { template: "red", title: { tag: "plain_text", content: "Image generation failed" } },
    elements: [{ tag: "markdown", content: "**What happened:** " + message }],
  };
}
`;
}

function adapterCardsTs(): string {
  return `export function buildSuccessCard(result: Record<string, unknown>): Record<string, unknown> {
  const imageUrl = typeof result.image_url === "string" ? result.image_url : "";
  return {
    config: { wide_screen_mode: true },
    header: { template: "green", title: { tag: "plain_text", content: "Image generation complete" } },
    elements: [
      { tag: "markdown", content: imageUrl ? "**Image:** " + imageUrl : "Image generation completed." },
    ],
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
  const generateCapability = capabilities.capabilities.find((capability) => capability.id === "image.generate") || capabilities.capabilities[0];
  const properties = isJsonObject(generateCapability?.input_schema.properties) ? generateCapability.input_schema.properties : {};
  const templateProperty = isJsonObject(properties.template_id) ? properties.template_id : {};
  const defaultTemplate = typeof templateProperty.default === "string" ? templateProperty.default : meta?.templates?.[0]?.id || "product-image";
  const fieldsProperty = isJsonObject(properties.fields) ? properties.fields : {};
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
  return `import { auditEvent } from "./audit-events.js";
import { buildBatchStatusCard, buildFailureCard, buildSuccessCard } from "./cards.js";
import { callImageBatchCreate, callImageBatchStatus, callImageGenerate, callImageIterate, resolveBatchDownloadUrl } from "./service-client.js";
import type { AdapterActionContext, AdapterDependencies, AdapterResult, BatchRequest, GeneratePreset, IterateRequest } from "./types.js";
import { assertAllowedOperator, mergeGeneratePresetWithFormValue } from "./validation.js";

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
      const preset = mergeGeneratePresetWithFormValue(basePreset, ctx.formValue);
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
  const size = stringValue(formValue?.param_batch_size || value?.size || defaultPreset.size);
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
  const generateCapability = capabilities.capabilities.find((capability) => capability.id === "image.generate") || capabilities.capabilities[0];
  const properties = isJsonObject(generateCapability?.input_schema.properties) ? generateCapability.input_schema.properties : {};
  const templateProperty = isJsonObject(properties.template_id) ? properties.template_id : {};
  const defaultTemplate = typeof templateProperty.default === "string" ? templateProperty.default : meta?.templates?.[0]?.id || "product-image";
  const fieldsProperty = isJsonObject(properties.fields) ? properties.fields : {};
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
  return `import { auditEvent } from "./audit-events.js";
import { buildBatchStatusCard, buildFailureCard, buildSuccessCard } from "./cards.js";
import { callImageBatchCreate, callImageBatchStatus, callImageGenerate, callImageIterate, resolveBatchDownloadUrl } from "./service-client.js";
import { assertAllowedOperator, mergeGeneratePresetWithFormValue } from "./validation.js";

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
      const preset = mergeGeneratePresetWithFormValue(basePreset, ctx?.formValue);
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
  const size = stringValue(formValue?.param_batch_size || value?.size || defaultPreset.size);
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

function buildEmbeddedIntegrationGuide(service: ServiceManifest, permissions: RequiredPermissions): string {
  return `# Embedded Adapter Integration Guide

This package is adapter-first. The core artifact is \`adapter/\`; \`bot-runtime/\` is a standalone reference host for teams that do not already have a Feishu SDK service.

## Adapter Files

- \`adapter/handlers.ts\`: entry point for card action handling.
- \`adapter/cards.ts\`: card builders returned to the host service.
- \`adapter/service-client.ts\`: calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}\`.
- \`adapter/validation.ts\`: form parsing and business validation helpers.
- \`adapter/audit-events.ts\`: structured audit event declarations.
- \`adapter/types.ts\`: host-facing TypeScript interfaces.

## Host Responsibilities

Your existing Feishu SDK service owns SDK initialization, callback verification, route registration, image upload wrappers, audit log persistence, runtime config loading, deployment, and process lifecycle.

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
  uploadImageToFeishu,
  allowedOperatorOpenIds,
});

for (const event of result.auditEvents) {
  audit(event);
}
return result.card;
\`\`\`

## Feishu Capabilities To Confirm

${permissions.scopes.map((scope) => `- \`${scope.scope}\`: ${scope.reason}`).join("\n")}
${permissions.callbacks.map((callback) => `- Callback \`${callback.callback}\`: ${callback.reason}`).join("\n")}

## Verification

Run package validation without starting the standalone runtime:

\`\`\`powershell
node ..\\..\\dist\\index.js verify . --mode embedded-adapter --strict
\`\`\`

After the adapter is mounted in your existing Feishu SDK host, run host validation against that host. This probes the host-owned \`/health\` endpoint and Feishu-style \`/webhook/card\` URL verification route; with \`--simulate\`, it also tries a conventional \`/debug/simulate-card-action\` endpoint and reports a manual-check warning if your host uses a different debug surface:

\`\`\`powershell
node ..\\..\\dist\\index.js verify . --mode embedded-adapter --host-runtime-url http://127.0.0.1:3978 --simulate
\`\`\`

Real Level 2 still requires your host service to receive a real Feishu card callback, call the adapter, call \`${service.service.name}\`, return the result card, and record manual evidence in \`level2_verification_record.md\`.
`;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function buildGeneratedReadme(service: ServiceManifest, permissions: RequiredPermissions, integrationMode: IntegrationMode): string {
  if (integrationMode === "embedded-adapter") {
    return `# ${service.service.name} Lark Embedded Adapter Package

This package was generated by Lark-deployer for the MVP-1A image generation, feedback-iteration, and batch-progress flow.

## Boundary

Lark-deployer generated an embeddable adapter package. It does not run or manage the target service lifecycle and this embedded-adapter package does not include a standalone \`bot-runtime/\` host.

- Target service: ${service.service.name}
- Target base URL: ${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}
- Core artifact: \`adapter/\`
- Integration mode: embedded-adapter
- Managed by Lark-deployer: false

## What The Embedded Adapter Does

1. Exposes adapter handlers for Feishu/Lark card actions.
2. Maps generate, iterate, batch submit, and batch refresh actions to \`${service.service.name}\` requests.
3. Returns card JSON and audit events for your existing Feishu SDK host to send and persist.
4. Leaves callback routing, Feishu SDK verification, secret storage, deployment, and Level 2 evidence collection to the existing host service.

## Required Context

${permissions.context_requirements.map((item) => `- ${item}`).join("\n")}

## Package Validation

Package-only validation does not require host secrets or a running generated runtime:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter --strict
\`\`\`

## Host Validation

After \`adapter/\` is mounted in your existing Feishu SDK host, validate the host boundary:

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter --host-runtime-url http://127.0.0.1:3978 --simulate
\`\`\`

This checks \`/health\` and \`/webhook/card\` on the existing host. If \`--simulate\` is provided and your host does not expose \`/debug/simulate-card-action\`, the report records a host-owned manual-check warning instead of assuming a generated debug API.

## Real Level 2

Real Level 2 still requires your host service to receive a real Feishu card callback, call the adapter, call \`${service.service.name}\`, return the result card, and record manual evidence in \`level2_verification_record.md\`.

Use \`level2_manual_evidence.template.json\` as the safe template for local manual evidence intake. Keep filled evidence and secrets in ignored local files or your existing host service's secret store.

## Handoff

\`\`\`powershell
node $env:LARK_DEPLOYER_CLI status .
node $env:LARK_DEPLOYER_CLI readiness .
node $env:LARK_DEPLOYER_CLI doctor . --mode embedded-adapter
node $env:LARK_DEPLOYER_CLI doctor . --mode embedded-adapter --gate
node $env:LARK_DEPLOYER_CLI handoff .
\`\`\`
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

function buildLevel2VerificationRecord(service: ServiceManifest, permissions: RequiredPermissions): string {
  const scopes = permissions.scopes.length
    ? permissions.scopes.map((scope) => `  - [ ] \`${scope.scope}\` - ${scope.reason}`).join("\n")
    : "  - [ ] No explicit scopes were generated.";
  const callbacks = permissions.callbacks.length
    ? permissions.callbacks.map((callback) => `  - [ ] \`${callback.callback}\` - ${callback.reason}`).join("\n")
    : "  - [ ] No explicit callbacks were generated.";

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

function formFieldName(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^([^a-zA-Z_])/, "_$1").slice(0, 40) || "field";
  return `field_${safe}`;
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
    header: {
      template: "blue",
      title: { tag: "plain_text", content: "Image Agent MVP" },
    },
    elements: [
      {
        tag: "markdown",
        content: \`**Target service:** ${service.service.name}\\n\\n**Templates:** \${templateSpecs.map((template) => template.id).join(", ")}\\n\\nFill the parameters and submit to run /api/generate.\`,
      },
      {
        tag: "form",
        name: "image_generate_form",
        elements: [
          {
            tag: "input",
            name: "param_template_id",
            required: true,
            default_value: defaultPreset.template_id,
            width: "fill",
            label: { tag: "plain_text", content: "Template ID" },
            placeholder: { tag: "plain_text", content: templateSpecs.map((template) => template.id).join(" / ") },
            fallback: {
              tag: "fallback_text",
              text: { tag: "plain_text", content: "Input requires Feishu 6.8 or later." },
            },
          },
          {
            tag: "input",
            name: "param_size",
            required: true,
            default_value: defaultPreset.size,
            width: "fill",
            label: { tag: "plain_text", content: "Size" },
            placeholder: { tag: "plain_text", content: "WIDTHxHEIGHT" },
            fallback: {
              tag: "fallback_text",
              text: { tag: "plain_text", content: "Input requires Feishu 6.8 or later." },
            },
          },
          ...fieldSpecs.map((field) => ({
            tag: "input",
            name: field.name,
            required: field.required,
            default_value: field.defaultValue,
            width: "fill",
            label: { tag: "plain_text", content: field.label },
            placeholder: { tag: "plain_text", content: field.placeholder || field.defaultValue || "Enter value" },
            fallback: {
              tag: "fallback_text",
              text: { tag: "plain_text", content: "Input requires Feishu 6.8 or later." },
            },
          })),
          {
            tag: "input",
            name: "param_message",
            required: false,
            default_value: defaultPreset.message || "",
            width: "fill",
            input_type: "multiline_text",
            rows: 2,
            auto_resize: true,
            label: { tag: "plain_text", content: "Message" },
            placeholder: { tag: "plain_text", content: "Optional extra instruction" },
            fallback: {
              tag: "fallback_text",
              text: { tag: "plain_text", content: "Input requires Feishu 6.8 or later." },
            },
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: "Generate image" },
            type: "primary",
            action_type: "form_submit",
            name: "submit_image_generate",
            value: {
              action: "image.generate.submit",
              preset: defaultPreset,
            },
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: "Reset" },
            type: "default",
            action_type: "form_reset",
            name: "reset_image_generate",
          },
        ],
        fallback: {
          tag: "fallback_text",
          text: { tag: "plain_text", content: "Form input requires Feishu 6.6 or later." },
        },
      },
      { tag: "hr" },
      {
        tag: "markdown",
        content: "Use batch mode for long-running /api/batch jobs. Submit a JSON array of items, then refresh the returned progress card when needed.",
      },
      {
        tag: "form",
        name: "image_batch_form",
        elements: [
          {
            tag: "input",
            name: "param_batch_template_id",
            required: true,
            default_value: defaultPreset.template_id,
            width: "fill",
            label: { tag: "plain_text", content: "Batch template ID" },
            placeholder: { tag: "plain_text", content: templateSpecs.map((template) => template.id).join(" / ") },
            fallback: {
              tag: "fallback_text",
              text: { tag: "plain_text", content: "Input requires Feishu 6.8 or later." },
            },
          },
          {
            tag: "input",
            name: "param_batch_size",
            required: true,
            default_value: defaultPreset.size,
            width: "fill",
            label: { tag: "plain_text", content: "Batch size" },
            placeholder: { tag: "plain_text", content: "WIDTHxHEIGHT" },
            fallback: {
              tag: "fallback_text",
              text: { tag: "plain_text", content: "Input requires Feishu 6.8 or later." },
            },
          },
          {
            tag: "input",
            name: "param_batch_items_json",
            required: true,
            default_value: defaultBatchItemsJson,
            width: "fill",
            input_type: "multiline_text",
            rows: 5,
            auto_resize: true,
            label: { tag: "plain_text", content: "Batch items JSON" },
            placeholder: { tag: "plain_text", content: "[{ \\"fields\\": { ... } }]" },
            fallback: {
              tag: "fallback_text",
              text: { tag: "plain_text", content: "Input requires Feishu 6.8 or later." },
            },
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: "Start batch" },
            type: "primary",
            action_type: "form_submit",
            name: "submit_image_batch",
            value: {
              action: "image.batch.submit",
            },
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: "Reset" },
            type: "default",
            action_type: "form_reset",
            name: "reset_image_batch",
          },
        ],
        fallback: {
          tag: "fallback_text",
          text: { tag: "plain_text", content: "Form input requires Feishu 6.6 or later." },
        },
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
