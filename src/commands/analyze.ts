import fs from "node:fs";
import path from "node:path";
import { getStringOption } from "../args.js";
import { ensureDir, readTextIfExists, slugify, writeJson, writeText } from "../fs-utils.js";
import { getJsonWithTimeout, normalizeBaseUrl } from "../http-utils.js";
import { IMAGE_AGENT_WEB_PROFILE } from "../profiles/image-agent-web.js";
import type { CapabilityMap, InteractionContract, JsonObject, RequiredPermissions, ServiceManifest } from "../types.js";

interface AnalyzeOptions {
  targetPath: string;
  baseUrl: string;
  outDir: string;
  name: string;
}

interface AnalyzerStrategy {
  id: ServiceManifest["source_scan"]["analysis_strategy"];
  canAnalyze(options: AnalyzeOptions): boolean;
  analyze(options: AnalyzeOptions): Promise<void>;
}

interface ImageAgentMeta {
  templates?: Array<{
    id: string;
    name?: string;
    allowed_sizes?: string[];
    default_size?: string;
    fields?: Array<{ key: string; label?: string; required?: boolean; placeholder?: string }>;
  }>;
  reference_types?: Array<{ id: string; name?: string }>;
}

interface SecretFinding {
  file: string;
  line: number;
  kind: string;
  action: string;
}

const SECRET_SCAN_SKIP_DIRS = new Set([".git", ".venv", "node_modules", "__pycache__", "outputs", "uploads", "dist", "build"]);
const SECRET_SCAN_EXTENSIONS = new Set([".py", ".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs", ".json", ".env", ".yml", ".yaml", ".toml"]);
const SECRET_SCAN_MAX_FILE_BYTES = 1_000_000;
const SECRET_SCAN_MAX_FILES = 250;
const SECRET_FINDING_ACTION = "Review target-side secret handling; use environment variables or a secret manager before shared deployment.";
const SECRET_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: "openai_api_key_literal", pattern: /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{8,}\b/ },
  {
    kind: "secret_assignment_literal",
    pattern: /\b(api[_-]?key|app[_-]?secret|access[_-]?token|secret[_-]?key|verification[_-]?token)\b[^\r\n]{0,80}["'][^"'\r\n]{8,}["']/i,
  },
];

const ANALYZER_STRATEGIES: AnalyzerStrategy[] = [
  {
    id: "http_api_python_image_agent_web",
    canAnalyze: ({ targetPath }) => isImageAgentWebTarget(targetPath),
    analyze: analyzeImageAgentWeb,
  },
  {
    id: "generic_http_api",
    canAnalyze: ({ targetPath }) => discoverHttpEndpoints(targetPath).length > 0,
    analyze: analyzeGenericHttpApi,
  },
  {
    id: "generic_cli",
    canAnalyze: () => false,
    analyze: async () => {
      throw new Error("generic_cli analyzer is a reserved strategy skeleton and cannot analyze this target yet.");
    },
  },
];

export async function analyzeCommand(args: string[], options: Record<string, string | boolean>): Promise<void> {
  const targetArg = args[0];
  if (!targetArg) {
    throw new Error("Usage: lark-deployer analyze <target-path> --base-url <url> [--out <dir>] [--name <name>]");
  }

  const targetPath = path.resolve(targetArg);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Target path does not exist: ${targetPath}`);
  }

  const name = getStringOption(options, "name", path.basename(targetPath));
  const defaultOut = path.resolve("out", slugify(name));
  const outDir = path.resolve(getStringOption(options, "out", defaultOut));
  const baseUrl = normalizeBaseUrl(getStringOption(options, "base-url", getStringOption(options, "baseUrl", "")));

  const analyzeOptions = {
    targetPath,
    baseUrl,
    outDir,
    name,
  };
  const strategy = ANALYZER_STRATEGIES.find((item) => item.canAnalyze(analyzeOptions));
  if (!strategy) {
    throw new Error("No analyzer strategy matched this target. Provide a target with a clear HTTP API or CLI surface.");
  }
  await strategy.analyze(analyzeOptions);
}

async function analyzeImageAgentWeb({ targetPath, baseUrl, outDir, name }: AnalyzeOptions): Promise<void> {
  const manifestDir = path.join(outDir, "manifest");
  ensureDir(manifestDir);

  const requirementsPath = path.join(targetPath, "requirements.txt");
  const mainPath = path.join(targetPath, "main.py");
  const templatesPath = path.join(targetPath, "templates.py");
  const requirements = readTextIfExists(requirementsPath);
  const main = readTextIfExists(mainPath);
  const templates = readTextIfExists(templatesPath);
  const secretFindings = scanPotentialSecrets(targetPath);
  const endpoints = extractFastApiEndpoints(main);
  const endpointCoverage = buildEndpointCoverage(endpoints);
  const frameworks = [
    requirements.includes("fastapi") || main.includes("FastAPI") ? "fastapi" : "",
    requirements.includes("Pillow") ? "pillow" : "",
    requirements.includes("openai") ? "openai" : "",
  ].filter(Boolean);

  const metaProbe = await getJsonWithTimeout(baseUrl ? `${baseUrl}/api/meta` : "", 5000);
  const liveMeta = isImageAgentMeta(metaProbe.data) ? metaProbe.data : undefined;
  const staticMeta = extractStaticImageAgentMeta(templates);
  const meta = liveMeta || staticMeta;
  const metaSource = liveMeta ? "live /api/meta" : staticMeta ? "static templates.py" : "none";
  const firstTemplate = meta?.templates?.[0];
  const defaultSize = firstTemplate?.default_size || firstTemplate?.allowed_sizes?.[0] || "1024x1024";
  const templateFieldMetadata = buildTemplateFieldMetadata(meta);

  const serviceManifest: ServiceManifest = {
    schema_version: "0.2",
    generated_at: new Date().toISOString(),
    service: {
      name,
      target_path: targetPath,
      type: "http_api",
      detected_frameworks: frameworks,
      runtime_mode: "external_service",
      managed_by_lark_deployer: false,
      base_url: baseUrl,
      healthcheck: {
        method: "GET",
        path: "/api/meta",
        status: metaProbe.status,
        detail: metaProbe.detail,
      },
      start_hints: [
        "The target service lifecycle is owned by the user or target project.",
        "For image-agent-web, a typical local command is: python -m uvicorn main:app --host 127.0.0.1 --port 8000",
      ],
    },
    source_scan: {
      analysis_strategy: "http_api_python_image_agent_web",
      files_checked: [
        path.relative(targetPath, requirementsPath),
        path.relative(targetPath, mainPath),
        path.relative(targetPath, templatesPath),
      ],
      endpoints,
      endpoint_coverage: endpointCoverage,
      notes: [
        "MVP preset: image-agent-web FastAPI integration.",
        "Lark-deployer verifies target availability but does not start or manage the target service.",
        secretFindings.length
          ? `Potential target-side secret literals found: ${secretFindings.length}. Values were not copied into Lark-deployer artifacts.`
          : "",
      ].filter(Boolean),
      secret_findings: secretFindings,
    },
  };

  const capabilityMap: CapabilityMap = {
    schema_version: "0.2",
    service_name: name,
    target_profile: "image-agent-web",
    capabilities: [
      {
        id: "image.generate",
        name: "Generate image with image-agent-web",
        kind: "image_generation",
        risk: "write",
        source: {
          type: "http",
          method: "POST",
          path: "/api/generate",
          content_type: "multipart/form-data",
        },
        input_schema: {
          type: "object",
          required: ["template_id", "size", "fields"],
          properties: {
            template_id: {
              type: "string",
              enum: meta?.templates?.map((template) => template.id) || [],
              default: firstTemplate?.id || "product-image",
            },
            size: {
              type: "string",
              default: defaultSize,
              description: "WIDTHxHEIGHT. Must be allowed by the selected image-agent-web template.",
            },
            fields: {
              type: "object",
              description: "Template-specific field values. Derived from /api/meta when available, otherwise from static templates.py.",
              template_fields: templateFieldMetadata.unionFields,
              template_fields_by_template: templateFieldMetadata.fieldsByTemplate,
              allowed_sizes_by_template: templateFieldMetadata.allowedSizesByTemplate,
              default_size_by_template: templateFieldMetadata.defaultSizeByTemplate,
            },
            message: {
              type: "string",
              default: "",
            },
            reference_images: {
              type: "array",
              description: "Optional reference images. MVP runtime starts with preset/no-reference flow.",
            },
          },
        },
        output_schema: {
          type: "object",
          properties: {
            session_id: { type: "string" },
            analysis: { type: "string" },
            image_url: { type: "string" },
            prompt_used: { type: "string" },
            round: { type: "number" },
            template_id: { type: "string" },
            size: { type: "string" },
          },
        },
        artifacts: [
          {
            name: "generated_image",
            type: "image",
            source_field: "image_url",
            delivery: "lark_image",
          },
          {
            name: "analysis",
            type: "text",
            source_field: "analysis",
            delivery: "card_text",
          },
          {
            name: "prompt_used",
            type: "text",
            source_field: "prompt_used",
            delivery: "audit",
          },
        ],
        timeout_seconds: 120,
      },
      {
        id: "image.iterate",
        name: "Iterate generated image with image-agent-web",
        kind: "image_generation",
        risk: "write",
        source: {
          type: "http",
          method: "POST",
          path: "/api/iterate",
          content_type: "application/json",
        },
        input_schema: {
          type: "object",
          required: ["session_id", "feedback"],
          properties: {
            session_id: {
              type: "string",
              description: "Session id returned by /api/generate.",
            },
            feedback: {
              type: "string",
              description: "Operator feedback used to refine the previous generated image.",
            },
          },
        },
        output_schema: {
          type: "object",
          properties: {
            session_id: { type: "string" },
            image_url: { type: "string" },
            prompt_used: { type: "string" },
            round: { type: "number" },
            template_id: { type: "string" },
            size: { type: "string" },
          },
        },
        artifacts: [
          {
            name: "iterated_image",
            type: "image",
            source_field: "image_url",
            delivery: "lark_image",
          },
          {
            name: "prompt_used",
            type: "text",
            source_field: "prompt_used",
            delivery: "audit",
          },
        ],
        timeout_seconds: 120,
      },
      {
        id: "image.batch",
        name: "Create image batch with image-agent-web",
        kind: "image_generation",
        risk: "write",
        source: {
          type: "http",
          method: "POST",
          path: "/api/batch",
          content_type: "multipart/form-data",
        },
        input_schema: {
          type: "object",
          required: ["template_id", "size", "items"],
          properties: {
            template_id: {
              type: "string",
              enum: meta?.templates?.map((template) => template.id) || [],
              default: firstTemplate?.id || "product-image",
            },
            size: {
              type: "string",
              default: defaultSize,
            },
            items: {
              type: "array",
              description: "Array of batch items, each with a fields object.",
            },
          },
        },
        output_schema: {
          type: "object",
          properties: {
            batch_id: { type: "string" },
            total: { type: "number" },
            done: { type: "number" },
            running: { type: "boolean" },
            completed: { type: "array" },
            failed: { type: "array" },
          },
        },
        artifacts: [
          {
            name: "batch_zip",
            type: "json",
            source_field: "batch_id",
            delivery: "card_text",
          },
        ],
        timeout_seconds: 120,
      },
    ],
  };

  const interactionContract: InteractionContract = {
    schema_version: "0.2",
    channel: "lark",
    service_name: name,
    supported_triggers: ["card_action", "http_request", "scheduled_poll", "manual_review"],
    supported_result_modes: ["interactive_card", "structured_result", "artifact", "state_update"],
    interactions: [
      {
        id: "image.generate.card",
        capability_id: "image.generate",
        action_id: IMAGE_AGENT_WEB_PROFILE.actions.generate,
        trigger: "card_action",
        input_mode: "preset_card_action",
        result_mode: "interactive_card",
        states: ["idle", "running", "succeeded", "failed"],
        audit_fields: ["operator_open_id", "chat_id", "trace_id", "template_id", "size", "result_image_url"],
        error_handling: [
          "Target service unavailable -> return failure card with base URL and healthcheck detail.",
          "Lark upload failure -> return result card with target image URL fallback.",
          "Permission/config missing -> fail fast at runtime startup or verify command.",
        ],
      },
      {
        id: "image.iterate.card",
        capability_id: "image.iterate",
        action_id: IMAGE_AGENT_WEB_PROFILE.actions.iterate,
        trigger: "card_action",
        input_mode: "feedback_card_action",
        result_mode: "interactive_card",
        states: ["idle", "running", "succeeded", "failed"],
        audit_fields: ["operator_open_id", "chat_id", "trace_id", "session_id", "result_image_url"],
        error_handling: [
          "Missing session_id or feedback -> return failure card and do not call target service.",
          "Target iteration unavailable -> return failure card with trace ID.",
          "Lark upload failure -> return result card with target image URL fallback.",
        ],
      },
      {
        id: "image.batch.card",
        capability_id: "image.batch",
        action_id: IMAGE_AGENT_WEB_PROFILE.actions.batchSubmit,
        trigger: "card_action",
        input_mode: "batch_form_action",
        result_mode: "interactive_card",
        states: ["idle", "running", "succeeded", "failed"],
        audit_fields: ["operator_open_id", "chat_id", "trace_id", "batch_id", "total", "done"],
        error_handling: [
          "Invalid batch JSON -> return failure card and do not call target service.",
          "Target batch creation unavailable -> return failure card with trace ID.",
          "Batch status unavailable -> return failure card with batch ID and trace ID.",
        ],
      },
      {
        id: "image.batch.status.card",
        capability_id: "image.batch",
        action_id: IMAGE_AGENT_WEB_PROFILE.actions.batchRefresh,
        trigger: "card_action",
        input_mode: "batch_status_action",
        result_mode: "interactive_card",
        states: ["running", "succeeded", "failed"],
        audit_fields: ["operator_open_id", "chat_id", "trace_id", "batch_id", "total", "done"],
        error_handling: [
          "Missing batch_id -> return failure card.",
          "Unknown or expired batch -> return failure card with next action.",
        ],
      },
    ],
  };

  const requiredPermissions: RequiredPermissions = {
    schema_version: "0.2",
    app: {
      type: "custom_app",
      bot_required: true,
      availability_recommendation: "Limit the app to the test operator group or specific FDE users for MVP.",
    },
    context_requirements: [
      "Existing Feishu/Lark custom app or permission to create/update one.",
      "APP_ID and APP_SECRET.",
      "Card callback verification token and optional encrypt key.",
      "Test chat_id or open_id where the bot can send cards.",
      "PUBLIC_CALLBACK_BASE_URL public HTTPS base URL, with Feishu card callback configured to <PUBLIC_CALLBACK_BASE_URL>/webhook/card.",
      "Target image-agent-web base_url that is reachable from bot runtime.",
    ],
    token_strategy: {
      default: "tenant_access_token",
      user_access_token_required: false,
    },
    scopes: [
      {
        scope: "im:message:send_as_bot",
        identity: "tenant",
        required_by: ["image.generate.card", "image.iterate.card", "image.batch.card", "image.batch.status.card"],
        reason: "Send initial, running, success, and failure interactive cards as the bot.",
        risk: "low",
      },
      {
        scope: "im:message:update",
        identity: "tenant",
        required_by: ["image.generate.card.async", "image.iterate.card.async"],
        reason: "Patch the original interactive card with the final success or failure card when CARD_ACTION_MODE=async.",
        risk: "low",
      },
      {
        scope: "im:resource:upload",
        identity: "tenant",
        required_by: ["image.generate", "image.iterate"],
        reason: "Upload the generated or iterated image from image-agent-web so it can be displayed in Feishu.",
        risk: "medium",
      },
    ],
    events: [],
    callbacks: [
      {
        callback: "card.action.trigger",
        required_by: ["image.generate.card", "image.iterate.card", "image.batch.card", "image.batch.status.card"],
        reason: "Receive interactive card button clicks from the generated start card.",
        security: ["verification_token", "encrypt_key_optional"],
      },
    ],
    manual_steps: [
      "Enable bot capability in the Feishu developer console.",
      "Apply message send, optional message update, and resource upload scopes.",
      "Configure card action callback URL to `<PUBLIC_CALLBACK_BASE_URL>/webhook/card`.",
      "Publish the app version after permission or callback changes.",
      "Add the bot to the test chat and confirm it can send messages.",
    ],
    review_flags: [
      "The target service generates external image artifacts. Review whether prompt, analysis, and output images may contain sensitive information before using a broad chat.",
      ...secretFindings.map((finding) => `Potential target-side secret literal in ${finding.file}:${finding.line} (${finding.kind}). ${finding.action}`),
    ],
  };

  writeJson(path.join(manifestDir, "service_manifest.json"), serviceManifest);
  writeJson(path.join(manifestDir, "capability_map.json"), capabilityMap);
  writeJson(path.join(manifestDir, "interaction_contract.json"), interactionContract);
  writeJson(path.join(manifestDir, "required_permissions.json"), requiredPermissions);
  writeJson(path.join(manifestDir, "image_agent_meta.snapshot.json"), meta || {});

  writeText(path.join(outDir, "analysis_report.md"), buildAnalysisReport(serviceManifest, meta, templates, metaSource));

  console.log(`Analysis written to ${outDir}`);
  console.log(`Target healthcheck: ${serviceManifest.service.healthcheck.status} (${serviceManifest.service.healthcheck.detail})`);
  if (secretFindings.length) {
    console.log(`Source security findings: ${secretFindings.length} potential target-side secret literal(s); values were not copied.`);
  }
}

async function analyzeGenericHttpApi({ targetPath, baseUrl, outDir, name }: AnalyzeOptions): Promise<void> {
  const manifestDir = path.join(outDir, "manifest");
  ensureDir(manifestDir);

  const secretFindings = scanPotentialSecrets(targetPath);
  const discovered = discoverHttpEndpoints(targetPath);
  const endpoints = dedupeEndpoints(discovered);
  const capabilityEndpoints = endpoints.filter((endpoint) => !isHealthEndpoint(endpoint));
  const healthPath = endpoints.find(isHealthEndpoint)?.path || endpoints.find((endpoint) => endpoint.method === "GET")?.path || "/";
  const healthProbe = await getJsonWithTimeout(baseUrl ? `${baseUrl}${healthPath}` : "", 5000);
  const frameworks = detectFrameworks(targetPath);

  const serviceManifest: ServiceManifest = {
    schema_version: "0.2",
    generated_at: new Date().toISOString(),
    service: {
      name,
      target_path: targetPath,
      type: "http_api",
      detected_frameworks: frameworks,
      runtime_mode: "external_service",
      managed_by_lark_deployer: false,
      base_url: baseUrl,
      healthcheck: {
        method: "GET",
        path: healthPath,
        status: healthProbe.status,
        detail: healthProbe.detail,
      },
      start_hints: [
        "The target service lifecycle is owned by the user or target project.",
        "The generic HTTP analyzer only inspects source files and optional health probes; it does not start or manage the target service.",
      ],
    },
    source_scan: {
      analysis_strategy: "generic_http_api",
      files_checked: collectGenericFilesChecked(targetPath),
      endpoints,
      endpoint_coverage: endpoints.map((endpoint) => {
        if (isHealthEndpoint(endpoint)) {
          return { ...endpoint, status: "supporting" as const, reason: "Used as a generic target healthcheck." };
        }
        return {
          ...endpoint,
          status: "supported" as const,
          capability_id: capabilityIdForEndpoint(endpoint),
          reason: "Generic HTTP API endpoint exposed as a card-action backed capability.",
        };
      }),
      notes: [
        "Analyzer strategy: generic_http_api.",
        "Generated manifest is a coarse HTTP API draft; review input and output schemas before production use.",
        secretFindings.length
          ? `Potential target-side secret literals found: ${secretFindings.length}. Values were not copied into Lark-deployer artifacts.`
          : "",
      ].filter(Boolean),
      secret_findings: secretFindings,
    },
  };

  const capabilityMap: CapabilityMap = {
    schema_version: "0.2",
    service_name: name,
    target_profile: "generic-http-api",
    capabilities: capabilityEndpoints.map((endpoint) => ({
      id: capabilityIdForEndpoint(endpoint),
      name: `${endpoint.method} ${endpoint.path}`,
      kind: endpoint.method === "GET" ? "query" : "action",
      risk: endpoint.method === "GET" ? "read_only" : "write",
      source: {
        type: "http",
        method: endpoint.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        path: endpoint.path,
        content_type: endpoint.method === "GET" ? "application/json" : "application/json",
      },
      input_schema: buildGenericInputSchema(endpoint),
      output_schema: { type: "object", additionalProperties: true },
      artifacts: [{ name: "response", type: "structured_data", source_field: "$", delivery: "card_json" }],
      timeout_seconds: 30,
    })),
  };

  const interactionContract: InteractionContract = {
    schema_version: "0.2",
    channel: "lark",
    service_name: name,
    supported_triggers: ["card_action", "http_request", "scheduled_poll", "manual_review"],
    supported_result_modes: ["interactive_card", "structured_result", "artifact", "state_update"],
    interactions: capabilityMap.capabilities.map((capability) => ({
      id: `${capability.id}.card`,
      capability_id: capability.id,
      action_id: `${capability.id}.submit`,
      trigger: "card_action",
      input_mode: "form_action",
      result_mode: "interactive_card",
      states: ["idle", "running", "succeeded", "failed"],
      audit_fields: ["operator_open_id", "chat_id", "trace_id", "capability_id"],
      error_handling: [
        "Target service unavailable -> return failure card with base URL and endpoint detail.",
        "Invalid form input -> return failure card and do not call target service.",
      ],
    })),
  };

  const requiredPermissions: RequiredPermissions = {
    schema_version: "0.2",
    app: {
      type: "custom_app",
      bot_required: true,
      availability_recommendation: "Limit the app to the target API operator group until the generated adapter is reviewed.",
    },
    context_requirements: [
      "Existing Feishu/Lark custom app or permission to create/update one.",
      "APP_ID and APP_SECRET.",
      "Card callback verification token and optional encrypt key.",
      "Target HTTP API base_url reachable from the selected host/runtime.",
    ],
    token_strategy: {
      default: "tenant_access_token",
      user_access_token_required: false,
    },
    scopes: [
      {
        scope: "im:message:send_as_bot",
        identity: "tenant",
        required_by: interactionContract.interactions.map((interaction) => interaction.id),
        reason: "Send generic HTTP API start, success, and failure interactive cards as the bot.",
        risk: "low",
      },
    ],
    events: [],
    callbacks: [
      {
        callback: "card.action.trigger",
        required_by: interactionContract.interactions.map((interaction) => interaction.id),
        reason: "Receive interactive card button clicks from the generated start card.",
        security: ["verification_token", "encrypt_key_optional"],
      },
    ],
    manual_steps: [
      "Enable bot capability in the Feishu developer console.",
      "Apply message send scope and configure card.action.trigger callback handling in the selected host mode.",
      "Publish the app version after permission or callback changes.",
    ],
    review_flags: [
      "Generic HTTP schemas are coarse drafts. Review endpoint inputs, authorization, and result rendering before broad usage.",
      ...secretFindings.map((finding) => `Potential target-side secret literal in ${finding.file}:${finding.line} (${finding.kind}). ${finding.action}`),
    ],
  };

  writeJson(path.join(manifestDir, "service_manifest.json"), serviceManifest);
  writeJson(path.join(manifestDir, "capability_map.json"), capabilityMap);
  writeJson(path.join(manifestDir, "interaction_contract.json"), interactionContract);
  writeJson(path.join(manifestDir, "required_permissions.json"), requiredPermissions);
  writeText(path.join(outDir, "analysis_report.md"), buildGenericAnalysisReport(serviceManifest, capabilityMap));

  console.log(`Analysis written to ${outDir}`);
  console.log(`Analyzer strategy: generic_http_api`);
  console.log(`Target healthcheck: ${serviceManifest.service.healthcheck.status} (${serviceManifest.service.healthcheck.detail})`);
}

function isImageAgentWebTarget(targetPath: string): boolean {
  const endpoints = extractFastApiEndpoints(readTextIfExists(path.join(targetPath, "main.py")));
  return fs.existsSync(path.join(targetPath, "templates.py"))
    || endpoints.some((endpoint) => endpoint.method === "POST" && endpoint.path === "/api/generate");
}

function discoverHttpEndpoints(targetPath: string): Array<{ method: string; path: string }> {
  const candidates = ["main.py", "app.py", "server.py", "server.js", "README.md", "readme.md"];
  return candidates.flatMap((file) => {
    const source = readTextIfExists(path.join(targetPath, file));
    const lower = file.toLowerCase();
    if (lower.endsWith(".md")) return extractDocumentedEndpoints(source);
    if (lower.endsWith(".js")) return extractNodeHttpEndpoints(source);
    return extractFastApiEndpoints(source);
  });
}

function detectFrameworks(targetPath: string): string[] {
  const requirements = readTextIfExists(path.join(targetPath, "requirements.txt"));
  const main = readTextIfExists(path.join(targetPath, "main.py"));
  const packageJson = readTextIfExists(path.join(targetPath, "package.json"));
  const serverJs = readTextIfExists(path.join(targetPath, "server.js"));
  return [
    requirements.includes("fastapi") || main.includes("FastAPI") ? "fastapi" : "",
    requirements.includes("flask") || main.includes("Flask") ? "flask" : "",
    packageJson || serverJs.includes("createServer") ? "node-http" : "",
  ].filter(Boolean);
}

function collectGenericFilesChecked(targetPath: string): string[] {
  return ["requirements.txt", "package.json", "main.py", "app.py", "server.py", "server.js", "README.md", "readme.md"]
    .filter((file) => fs.existsSync(path.join(targetPath, file)));
}

function dedupeEndpoints(endpoints: Array<{ method: string; path: string }>): Array<{ method: string; path: string }> {
  const seen = new Set<string>();
  return endpoints.filter((endpoint) => {
    const normalized = { method: endpoint.method.toUpperCase(), path: endpoint.path };
    const key = `${normalized.method} ${normalized.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    endpoint.method = normalized.method;
    endpoint.path = normalized.path;
    return true;
  });
}

function isHealthEndpoint(endpoint: { method: string; path: string }): boolean {
  return endpoint.method === "GET" && /^\/(health|api\/health|status|api\/status)$/.test(endpoint.path);
}

function capabilityIdForEndpoint(endpoint: { method: string; path: string }): string {
  const parts = endpoint.path
    .replace(/^\/+|\/+$/g, "")
    .replace(/[{}]/g, "")
    .split("/")
    .map((part) => part.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase())
    .filter(Boolean);
  return ["http", endpoint.method.toLowerCase(), ...parts].join(".") || `http.${endpoint.method.toLowerCase()}.root`;
}

function buildGenericInputSchema(endpoint: { method: string; path: string }): JsonObject {
  const pathParams = [...endpoint.path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const properties: Record<string, unknown> = Object.fromEntries(pathParams.map((param) => [param, { type: "string", description: `Path parameter for ${endpoint.path}.` }]));
  if (endpoint.method !== "GET") {
    properties.body_json = { type: "object", description: "JSON request body sent to the target endpoint." };
  }
  return {
    type: "object",
    required: pathParams,
    properties,
  };
}

function extractDocumentedEndpoints(source: string): Array<{ method: string; path: string }> {
  return [...source.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[A-Za-z0-9_./{}:-]+)/g)]
    .map((match) => ({ method: match[1].toUpperCase(), path: match[2] }));
}

function extractNodeHttpEndpoints(source: string): Array<{ method: string; path: string }> {
  return [...source.matchAll(/req\.method\s*={2,3}\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`][\s\S]{0,120}?pathname\s*={2,3}\s*['"`](\/api\/[A-Za-z0-9_./{}:-]+)['"`]/g)]
    .map((match) => ({ method: match[1].toUpperCase(), path: match[2] }));
}

function buildEndpointCoverage(endpoints: Array<{ method: string; path: string }>): NonNullable<ServiceManifest["source_scan"]["endpoint_coverage"]> {
  return endpoints.map((endpoint) => {
    const method = endpoint.method.toUpperCase();
    if (method === "POST" && endpoint.path === "/api/generate") {
      return {
        ...endpoint,
        status: "supported" as const,
        capability_id: "image.generate",
        reason: "Generated runtime maps Feishu card submission to this target API.",
      };
    }
    if (method === "POST" && endpoint.path === "/api/iterate") {
      return {
        ...endpoint,
        status: "supported" as const,
        capability_id: "image.iterate",
        reason: "Generated runtime maps Feishu result-card feedback submission to this target API.",
      };
    }
    if (method === "GET" && endpoint.path === "/api/meta") {
      return {
        ...endpoint,
        status: "supporting" as const,
        reason: "Used for healthcheck and template metadata discovery.",
      };
    }
    if (method === "GET" && endpoint.path === "/outputs/{filename}") {
      return {
        ...endpoint,
        status: "supporting" as const,
        reason: "Used as fallback generated-image URL when Feishu image upload is unavailable.",
      };
    }
    if (method === "POST" && endpoint.path === "/api/batch") {
      return {
        ...endpoint,
        status: "supported" as const,
        capability_id: "image.batch",
        reason: "Generated runtime maps Feishu batch form submission to this target API.",
      };
    }
    if (method === "GET" && endpoint.path === "/api/batch/{batch_id}/status") {
      return {
        ...endpoint,
        status: "supporting" as const,
        capability_id: "image.batch",
        reason: "Used to refresh Feishu batch progress cards.",
      };
    }
    if (method === "GET" && endpoint.path === "/api/batch/{batch_id}/download") {
      return {
        ...endpoint,
        status: "supporting" as const,
        capability_id: "image.batch",
        reason: "Used as the completed batch download link.",
      };
    }
    return {
      ...endpoint,
      status: "discovered_not_generated" as const,
      reason: "Discovered in the target service but not generated as a Feishu interaction in MVP-1A.",
    };
  });
}

function scanPotentialSecrets(targetPath: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const files = collectSourceFiles(targetPath);
  for (const filePath of files) {
    if (findings.length >= 50) break;
    const stat = fs.statSync(filePath);
    if (stat.size > SECRET_SCAN_MAX_FILE_BYTES) continue;
    const relativePath = toForwardSlash(path.relative(targetPath, filePath));
    const text = readTextIfExists(filePath);
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const { kind, pattern } of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          findings.push({
            file: relativePath,
            line: index + 1,
            kind,
            action: SECRET_FINDING_ACTION,
          });
          break;
        }
      }
    }
  }
  return dedupeSecretFindings(findings);
}

function collectSourceFiles(root: string): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length && files.length < SECRET_SCAN_MAX_FILES) {
    const current = stack.pop() || "";
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SECRET_SCAN_SKIP_DIRS.has(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }
      if (entry.isFile() && shouldScanFile(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  return files.sort();
}

function shouldScanFile(filePath: string): boolean {
  const name = path.basename(filePath);
  if (name.startsWith(".env")) return true;
  return SECRET_SCAN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function dedupeSecretFindings(findings: SecretFinding[]): SecretFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.file}\0${finding.line}\0${finding.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toForwardSlash(value: string): string {
  return value.replace(/\\/g, "/");
}

function extractFastApiEndpoints(source: string): Array<{ method: string; path: string }> {
  const endpoints: Array<{ method: string; path: string }> = [];
  const endpointPattern = /@app\.(get|post|put|delete|patch)\("([^"]+)"/g;
  let match = endpointPattern.exec(source);
  while (match) {
    endpoints.push({ method: match[1].toUpperCase(), path: match[2] });
    match = endpointPattern.exec(source);
  }
  return endpoints;
}

function isImageAgentMeta(value: unknown): value is ImageAgentMeta {
  if (!value || typeof value !== "object") return false;
  const candidate = value as ImageAgentMeta;
  return Array.isArray(candidate.templates) || Array.isArray(candidate.reference_types);
}

function extractStaticImageAgentMeta(source: string): ImageAgentMeta | undefined {
  if (!source.trim()) return undefined;

  const templatesList = extractAssignedList(source, "TEMPLATES");
  const referenceTypesList = extractAssignedList(source, "REFERENCE_TYPES");
  const templates = templatesList
    ? splitTopLevelObjects(templatesList).map(parseTemplateBlock).filter((template): template is NonNullable<typeof template> => Boolean(template))
    : [];
  const referenceTypes = referenceTypesList
    ? splitTopLevelObjects(referenceTypesList).map(parseReferenceTypeBlock).filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];

  if (!templates.length && !referenceTypes.length) return undefined;
  return {
    templates,
    reference_types: referenceTypes,
  };
}

function buildTemplateFieldMetadata(meta: ImageAgentMeta | undefined): {
  unionFields: Array<{ key: string; label?: string; required?: boolean; placeholder?: string; required_by_templates: string[] }>;
  fieldsByTemplate: Record<string, Array<{ key: string; label?: string; required?: boolean; placeholder?: string }>>;
  allowedSizesByTemplate: Record<string, string[]>;
  defaultSizeByTemplate: Record<string, string>;
} {
  const union = new Map<string, { key: string; label?: string; required?: boolean; placeholder?: string; required_by_templates: string[] }>();
  const fieldsByTemplate: Record<string, Array<{ key: string; label?: string; required?: boolean; placeholder?: string }>> = {};
  const allowedSizesByTemplate: Record<string, string[]> = {};
  const defaultSizeByTemplate: Record<string, string> = {};

  for (const template of meta?.templates || []) {
    fieldsByTemplate[template.id] = template.fields || [];
    allowedSizesByTemplate[template.id] = template.allowed_sizes || [];
    defaultSizeByTemplate[template.id] = template.default_size || template.allowed_sizes?.[0] || "";

    for (const field of template.fields || []) {
      const existing = union.get(field.key);
      if (existing) {
        existing.required = Boolean(existing.required || field.required);
        if (field.required) existing.required_by_templates.push(template.id);
        if (!existing.label && field.label) existing.label = field.label;
        if (!existing.placeholder && field.placeholder) existing.placeholder = field.placeholder;
        continue;
      }
      union.set(field.key, {
        key: field.key,
        label: field.label,
        required: Boolean(field.required),
        placeholder: field.placeholder,
        required_by_templates: field.required ? [template.id] : [],
      });
    }
  }

  return {
    unionFields: Array.from(union.values()),
    fieldsByTemplate,
    allowedSizesByTemplate,
    defaultSizeByTemplate,
  };
}

function extractAssignedList(source: string, name: string): string {
  const assignment = new RegExp(`\\b${name}\\s*=\\s*\\[`).exec(source);
  if (!assignment) return "";
  const openIndex = source.indexOf("[", assignment.index);
  const closeIndex = findMatchingBracket(source, openIndex, "[", "]");
  if (closeIndex < 0) return "";
  return source.slice(openIndex + 1, closeIndex);
}

function splitTopLevelObjects(source: string): string[] {
  const blocks: string[] = [];
  let index = 0;
  while (index < source.length) {
    const openIndex = source.indexOf("{", index);
    if (openIndex < 0) break;
    const closeIndex = findMatchingBracket(source, openIndex, "{", "}");
    if (closeIndex < 0) break;
    blocks.push(source.slice(openIndex, closeIndex + 1));
    index = closeIndex + 1;
  }
  return blocks;
}

function parseTemplateBlock(block: string): ImageAgentMeta["templates"] extends Array<infer T> ? T | undefined : never {
  const id = extractStringProperty(block, "id");
  if (!id) return undefined as never;

  const fieldsList = extractPropertyList(block, "fields");
  const fields = fieldsList
    ? splitTopLevelObjects(fieldsList).map(parseFieldBlock).filter((field): field is NonNullable<typeof field> => Boolean(field))
    : [];

  return {
    id,
    name: extractStringProperty(block, "name"),
    allowed_sizes: extractStringArrayProperty(block, "allowed_sizes"),
    default_size: extractStringProperty(block, "default_size"),
    fields,
  } as never;
}

function parseFieldBlock(block: string): { key: string; label?: string; required?: boolean; placeholder?: string } | undefined {
  const key = extractStringProperty(block, "key");
  if (!key) return undefined;
  return {
    key,
    label: extractStringProperty(block, "label"),
    required: extractBooleanProperty(block, "required"),
    placeholder: extractStringProperty(block, "placeholder"),
  };
}

function parseReferenceTypeBlock(block: string): { id: string; name?: string } | undefined {
  const id = extractStringProperty(block, "id");
  if (!id) return undefined;
  return {
    id,
    name: extractStringProperty(block, "name"),
  };
}

function extractPropertyList(source: string, key: string): string {
  const property = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*\\[`).exec(source);
  if (!property) return "";
  const openIndex = source.indexOf("[", property.index);
  const closeIndex = findMatchingBracket(source, openIndex, "[", "]");
  if (closeIndex < 0) return "";
  return source.slice(openIndex + 1, closeIndex);
}

function extractStringProperty(source: string, key: string): string {
  const match = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(source);
  return match ? unescapePythonLikeString(match[1]) : "";
}

function extractStringArrayProperty(source: string, key: string): string[] {
  const list = extractPropertyList(source, key);
  if (!list) return [];
  return [...list.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) => unescapePythonLikeString(match[1]));
}

function extractBooleanProperty(source: string, key: string): boolean | undefined {
  const match = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*(True|False|true|false)`).exec(source);
  if (!match) return undefined;
  return match[1].toLowerCase() === "true";
}

function findMatchingBracket(source: string, openIndex: number, openChar: string, closeChar: string): number {
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === openChar) {
      depth += 1;
      continue;
    }
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function unescapePythonLikeString(value: string): string {
  return value.replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAnalysisReport(manifest: ServiceManifest, meta: ImageAgentMeta | undefined, templatesSource: string, metaSource: string): string {
  const templateLines = meta?.templates?.length
    ? meta.templates.map((template) => `- ${template.id}: ${oneLine(template.name || "")}`).join("\n")
    : "- No live /api/meta template data captured.";
  const secretFindings = manifest.source_scan.secret_findings || [];
  const secretLines = secretFindings.length
    ? secretFindings.map((finding) => `- ${finding.file}:${finding.line} (${finding.kind}) - ${finding.action}`).join("\n")
    : "- None detected by the lightweight scanner.";
  const coverageLines = manifest.source_scan.endpoint_coverage?.length
    ? manifest.source_scan.endpoint_coverage.map((item) => {
      const capability = item.capability_id ? `, capability=${item.capability_id}` : "";
      return `- ${item.method} ${item.path}: ${item.status}${capability} - ${item.reason}`;
    }).join("\n")
    : "- No endpoint coverage metadata generated.";

  return `# Lark-deployer Analysis Report

## Target

- Name: ${manifest.service.name}
- Path: ${manifest.service.target_path}
- Base URL: ${manifest.service.base_url || "not provided"}
- Runtime mode: external service
- Managed by Lark-deployer: false

## Healthcheck

- ${manifest.service.healthcheck.method} ${manifest.service.healthcheck.path}
- Status: ${manifest.service.healthcheck.status}
- Detail: ${manifest.service.healthcheck.detail}

## Detected Endpoints

${manifest.source_scan.endpoints.map((endpoint) => `- ${endpoint.method} ${endpoint.path}`).join("\n") || "- None detected"}

## Endpoint Coverage

${coverageLines}

## MVP Capabilities

- Capability: image.generate
  - Source: POST /api/generate
  - Interaction: start-card form -> target API -> result card
- Capability: image.iterate
  - Source: POST /api/iterate
  - Interaction: result-card feedback form -> target API -> updated result card
- Capability: image.batch
  - Source: POST /api/batch plus status/download endpoints
  - Interaction: batch form -> progress card -> refresh status -> download link
- Scope: image-agent-web generation, feedback iteration, and batch progress. History and static frontend endpoints are discovered but not generated in this MVP pass.

## Template Snapshot

- Source: ${metaSource}
${templateLines}

## Source Security Findings

${secretLines}

Lark-deployer records only finding metadata here. It does not copy matched secret values into generated artifacts.

## Notes

- Lark-deployer does not start or manage the target service lifecycle.
- The generated bot runtime expects image-agent-web to be reachable from its own environment.
- templates.py was ${templatesSource ? "found" : "not found"} during static scan.
`;
}

function buildGenericAnalysisReport(manifest: ServiceManifest, capabilities: CapabilityMap): string {
  const coverageLines = manifest.source_scan.endpoint_coverage?.length
    ? manifest.source_scan.endpoint_coverage.map((item) => {
      const capability = item.capability_id ? `, capability=${item.capability_id}` : "";
      return `- ${item.method} ${item.path}: ${item.status}${capability} - ${item.reason}`;
    }).join("\n")
    : "- No endpoint coverage metadata generated.";
  return `# Lark-deployer Analysis Report

## Target

- Name: ${manifest.service.name}
- Path: ${manifest.service.target_path}
- Base URL: ${manifest.service.base_url || "not provided"}
- Analyzer strategy: ${manifest.source_scan.analysis_strategy}
- Runtime mode: external service
- Managed by Lark-deployer: false

## Healthcheck

- ${manifest.service.healthcheck.method} ${manifest.service.healthcheck.path}
- Status: ${manifest.service.healthcheck.status}
- Detail: ${manifest.service.healthcheck.detail}

## Detected Endpoints

${manifest.source_scan.endpoints.map((endpoint) => `- ${endpoint.method} ${endpoint.path}`).join("\n") || "- None detected"}

## Endpoint Coverage

${coverageLines}

## Draft Capabilities

${capabilities.capabilities.map((capability) => `- ${capability.id}: ${capability.name} (${capability.kind}, risk=${capability.risk})`).join("\n") || "- None generated"}

## Notes

- Generic HTTP API analysis emits coarse schemas from observable routes and documentation.
- Review generated input and output schemas before production use.
`;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
