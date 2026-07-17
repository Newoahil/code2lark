import fs from "node:fs";
import path from "node:path";
import { getStringOption } from "../args.js";
import { readEnvFileIfExists } from "../env-utils.js";
import { readJsonFile, readTextIfExists, writeText } from "../fs-utils.js";
import { configuredValue } from "../placeholder-utils.js";
import type { RequiredPermissions, ServiceManifest } from "../types.js";
import { publicCallbackWarnings } from "../url-validation.js";
import type { ContextReplyTemplate, ContextTemplate } from "./context.js";

export type ReadinessState =
  | "external_context_missing"
  | "runtime_preflight_needed"
  | "verification_failing"
  | "level2_preflight_needed"
  | "level2_preflight_has_warnings"
  | "manual_evidence_invalid"
  | "manual_click_evidence_needed"
  | "handoff_ready";

export interface RequiredValueRow {
  key: string;
  status: "provided" | "missing" | "optional";
  source: "env" | "context" | "manifest" | "default" | "none";
  note: string;
}

export interface VerificationReport {
  generated_at?: string;
  status?: "pass" | "warn" | "fail";
  context?: {
    mode?: string;
    hostReceiveMode?: string;
    runtimeUrl?: string;
    hostRuntimeUrl?: string;
    level2?: boolean;
    simulate?: boolean;
    sendStartCard?: boolean;
    targetBaseUrl?: string;
  };
  checks?: Array<{
    name: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }>;
}

export interface ReadinessSummary {
  generatedAt: string;
  packagePath: string;
  envPath: string;
  contextPath: string;
  contextRequestPath: string;
  contextReply: ContextReplyStatus;
  manualEvidence: ManualEvidenceStatus;
  reportPath: string;
  level2RecordPath: string;
  service: ServiceManifest;
  permissions: RequiredPermissions;
  context?: ContextTemplate;
  requiredValues: RequiredValueRow[];
  runtimeRows: RequiredValueRow[];
  report?: VerificationReport;
  reportCounts: Record<"pass" | "warn" | "fail", number>;
  state: ReadinessState;
  completionDecision: CompletionDecision;
  securityWarnings: string[];
  nextActions: string[];
}

export interface CompletionDecision {
  level2Verified: boolean;
  manualEvidencePresent: boolean;
  missingManualEvidence: string[];
  remainingIssuesDocumented: boolean;
  handoffApproved: boolean;
  complete: boolean;
}

export interface ManualEvidenceStatus {
  templatePath: string;
  templatePresent: boolean;
  localPath: string;
  localPresent: boolean;
  parseError: string;
  filledFields: string[];
  missingFields: string[];
  importedFields: string[];
  pendingImportFields: string[];
  readyToImport: boolean;
  importCommand: string;
}

export interface ContextReplyStatus {
  templatePath: string;
  templatePresent: boolean;
  localJsonPath: string;
  localJsonPresent: boolean;
  localMarkdownPath: string;
  localMarkdownPresent: boolean;
  parseError: string;
  answeredQuestions: number;
  totalQuestions: number;
  negativeAnswers: string[];
  permissionStatusCounts: {
    unknown: number;
    confirmed: number;
    blocked: number;
    notNeeded: number;
  };
  permissionConfirmationCount: number;
  expectedPermissionConfirmationCount: number;
  missingPermissionConfirmations: string[];
  blockedCount: number;
  secureSecretChannelPresent: boolean;
  publicValueFields: string[];
  readyForLocalConfigure: boolean;
}

export type HandoffProfile = "image-agent-web" | "generic-http-api" | "calendar-stock-updater";

const REQUIRED_VALUE_DEFS = [
  {
    key: "APP_ID",
    note: "Feishu custom app id. Value is intentionally hidden in this status file.",
  },
  {
    key: "APP_SECRET",
    note: "Feishu custom app secret. Value is intentionally hidden in this status file.",
  },
  {
    key: "VERIFICATION_TOKEN",
    note: "Card callback verification token. Value is intentionally hidden in this status file.",
  },
  {
    key: "TEST_CHAT_ID",
    note: "Chat receive id where the bot has been added and can send messages.",
  },
  {
    key: "PUBLIC_CALLBACK_BASE_URL",
    note: "Public HTTPS base URL that routes to the generated bot runtime.",
  },
  {
    key: "IMAGE_AGENT_BASE_URL",
    note: "Target service base URL reachable from the bot runtime environment.",
  },
  {
    key: "TARGET_BASE_URL",
    note: "Target service base URL reachable from the existing host or sidecar.",
  },
] as const;

const SELF_HOSTED_REQUIRED_VALUE_DEFS = [
  { key: "FEISHU_APP_ID", note: "Feishu custom app id for feishu-host/.env. Value is intentionally hidden in this status file." },
  { key: "FEISHU_APP_SECRET", note: "Feishu custom app secret for feishu-host/.env. Value is intentionally hidden in this status file." },
  { key: "FEISHU_CONNECTION_MODE", note: "Must be websocket for self-hosted-runtime." },
  { key: "IMAGE_AGENT_BASE_URL", note: "Target service base URL reachable from feishu-host." },
  { key: "FEISHU_ALLOWED_USERS", note: "Optional comma-separated Feishu operator open_id allowlist." },
  { key: "IMAGE_AGENT_TIMEOUT_MS", note: "Target HTTP timeout in milliseconds." },
  { key: "TEST_CHAT_ID", note: "Optional chat receive id for sending the start card during manual Level 2." },
] as const;

const CALENDAR_REQUIRED_VALUE_DEFS = [
  { key: "FEISHU_APP_ID", note: "Feishu custom app id for integrations/lark/.env. Value is intentionally hidden in this status file." },
  { key: "FEISHU_APP_SECRET", note: "Feishu custom app secret for integrations/lark/.env. Value is intentionally hidden in this status file." },
  { key: "TEST_CHAT_ID", note: "Chat receive id where the bot has been added and can send the calendar start card." },
  { key: "TARGET_BASE_URL", note: "Existing calendar service base URL reachable from the installed integrations/lark module." },
  { key: "ALLOWED_OPERATOR_OPEN_IDS", note: "Required comma-separated Feishu operator open_id allowlist for mutating calendar actions." },
] as const;

export async function readinessCommand(args: string[], options: Record<string, string | boolean>): Promise<void> {
  const packageArg = args[0];
  if (!packageArg) {
    throw new Error("Usage: lark-deployer readiness <generated-package> [--env <file>] [--out <file>]");
  }

  const packagePath = path.resolve(packageArg);
  const summary = buildReadinessSummary(packagePath, options);
  const markdown = buildReadinessMarkdown(summary);
  const outPath = path.resolve(getStringOption(options, "out", path.join(packagePath, "handoff_status.md")));

  writeText(outPath, markdown);
  printReadinessSummary(summary, outPath);
}

export function buildReadinessSummary(
  packagePath: string,
  options: Record<string, string | boolean>,
): ReadinessSummary {
  const manifestDir = path.join(packagePath, "manifest");
  const service = readJsonFile<ServiceManifest>(path.join(manifestDir, "service_manifest.json"));
  const permissions = readJsonFile<RequiredPermissions>(path.join(manifestDir, "required_permissions.json"));
  const { contextPath, context } = readContext(packagePath);
  const selfHosted = context?.integration_mode === "self-hosted-runtime";
  const embedded = context?.integration_mode === "embedded-adapter";
  const profile = resolveHandoffProfile(context, service);
  const envPath = path.resolve(getStringOption(options, "env", profile === "calendar-stock-updater" ? path.join(packagePath, "integrations", "lark", ".env") : embedded ? path.join(packagePath, "existing-host.env") : path.join(packagePath, selfHosted ? "feishu-host" : "bot-runtime", ".env")));
  const env = readEnvFileIfExists(envPath);
  const contextRequestPath = path.join(packagePath, "feishu_context.request.md");
  const contextReply = buildContextReplyStatus(packagePath);
  const reportPath = path.join(packagePath, "verification_report.json");
  const report = readOptionalJson<VerificationReport>(reportPath);
  const level2RecordPath = path.join(packagePath, "level2_verification_record.md");
  const level2Record = readTextIfExists(level2RecordPath);
  const manualEvidence = buildManualEvidenceStatus(packagePath, context, service, level2Record);
  const completionDecision = parseCompletionDecision(level2Record, profile);

  const requiredValueDefs = profile === "calendar-stock-updater" ? CALENDAR_REQUIRED_VALUE_DEFS : selfHosted ? SELF_HOSTED_REQUIRED_VALUE_DEFS : REQUIRED_VALUE_DEFS;
  const requiredValues = requiredValueDefs
    .filter((item) => keepRequiredValueDef(item.key, context, service))
    .map((item) => buildRequiredValueRow(item.key, item.note, env, context, service));
  const runtimeRows = buildRuntimeRows(env, context, service);
  const reportCounts = countReportChecks(report);
  const securityWarnings = buildSecurityWarnings(env, context, service);
  const state = determineState(requiredValues, report, completionDecision, manualEvidence, profile);
  const nextActions = buildNextActions(state, context, report, requiredValues, contextRequestPath, contextReply, manualEvidence, packagePath, service);

  return {
    generatedAt: new Date().toISOString(),
    packagePath,
    envPath,
    contextPath,
    contextRequestPath,
    contextReply,
    manualEvidence,
    reportPath,
    level2RecordPath,
    service,
    permissions,
    context,
    requiredValues,
    runtimeRows,
    report,
    reportCounts,
    state,
    completionDecision,
    securityWarnings,
    nextActions,
  };
}

function keepRequiredValueDef(key: string, context: ContextTemplate | undefined, service: ServiceManifest): boolean {
  if (resolveHandoffProfile(context, service) === "calendar-stock-updater") return true;
  if (context?.integration_mode === "self-hosted-runtime") return true;
  const genericTarget = service.source_scan?.analysis_strategy === "generic_http_api"
    || context?.handoff_request.required_values.some((item) => item.key === "TARGET_BASE_URL") === true;
  if (genericTarget && context?.host_receive_mode === "embedded-long-connection" && (key === "PUBLIC_CALLBACK_BASE_URL" || key === "VERIFICATION_TOKEN")) return false;
  if (genericTarget) return key !== "IMAGE_AGENT_BASE_URL";
  return key !== "TARGET_BASE_URL";
}

export function resolveHandoffProfile(context: ContextTemplate | undefined, service: ServiceManifest): HandoffProfile {
  if (context?.target_profile === "calendar-stock-updater" || context?.target_profile === "generic-http-api" || context?.target_profile === "image-agent-web") {
    return context.target_profile;
  }
  if (service.source_scan?.analysis_strategy === "calendar_stock_updater") return "calendar-stock-updater";
  if (service.source_scan?.analysis_strategy === "generic_http_api") return "generic-http-api";
  return "image-agent-web";
}

function parseCompletionDecision(record: string, profile: HandoffProfile): CompletionDecision {
  const level2Verified = isChecked(record, "Level 2 verified.");
  const missingManualEvidence = findMissingManualEvidence(record, profile);
  const manualEvidencePresent = missingManualEvidence.length === 0;
  const remainingIssuesDocumented = isChecked(record, "Remaining issues documented.");
  const handoffApproved = /-\s*\[[xX]\]\s*This generated package can be handed to another FDE/.test(record);
  return {
    level2Verified,
    manualEvidencePresent,
    missingManualEvidence,
    remainingIssuesDocumented,
    handoffApproved,
    complete: level2Verified && manualEvidencePresent && remainingIssuesDocumented && handoffApproved,
  };
}

function findMissingManualEvidence(record: string, profile: HandoffProfile): string[] {
  const requiredFields = profile === "generic-http-api" ? [
    "Start card message ID",
    "Generic action ID",
    "Target request summary",
    "Target response summary",
    "Result card message ID or screenshot",
    "Trace ID",
  ] : profile === "calendar-stock-updater" ? [
    "Start card message ID",
    "Status result message ID or screenshot",
    "Dry-run result message ID or screenshot",
    "Formal-run confirmation/result message IDs or screenshots",
    "Stop confirmation/result message IDs or screenshots",
    "Sanitized host log path",
    "Trace ID",
  ] : [
    "Start card message ID",
    "Result card message ID or screenshot",
    "Generated image URL or image key",
    "Batch ID",
    "Batch status card message ID or screenshot",
    "Batch download URL or screenshot",
    "Trace ID",
  ];
  return requiredFields.filter((field) => !readRecordField(record, field));
}

function readRecordField(record: string, field: string): string {
  const pattern = new RegExp(`^-\\s*${escapeRegExp(field)}:[^\\S\\r\\n]*(\\S.*?)\\s*$`, "im");
  const match = record.match(pattern);
  return configuredValue(match?.[1]);
}

function isChecked(record: string, label: string): boolean {
  return new RegExp(`-\\s*\\[[xX]\\]\\s*${escapeRegExp(label)}`).test(record);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readContext(packagePath: string): { contextPath: string; context?: ContextTemplate } {
  const localPath = path.join(packagePath, "feishu_context.local.json");
  const templatePath = path.join(packagePath, "feishu_context.template.json");
  const contextPath = fs.existsSync(localPath) ? localPath : templatePath;
  return {
    contextPath,
    context: readOptionalJson<ContextTemplate>(contextPath),
  };
}

function buildRequiredValueRow(
  key: string,
  note: string,
  env: Record<string, string>,
  context: ContextTemplate | undefined,
  service: ServiceManifest,
): RequiredValueRow {
  const profile = resolveHandoffProfile(context, service);
  if (profile === "calendar-stock-updater" && key === "ALLOWED_OPERATOR_OPEN_IDS") {
    const resolved = resolveRequiredValue(key, env, context, service);
    return { key, status: resolved.value ? "provided" : "missing", source: resolved.source, note };
  }
  if (context?.integration_mode === "self-hosted-runtime" && (key === "FEISHU_ALLOWED_USERS" || key === "IMAGE_AGENT_TIMEOUT_MS" || key === "TEST_CHAT_ID")) {
    const resolved = resolveRequiredValue(key, env, context, service);
    return { key, status: resolved.value ? "provided" : "optional", source: resolved.source, note };
  }
  if (context?.host_receive_mode === "embedded-long-connection" && (key === "PUBLIC_CALLBACK_BASE_URL" || key === "VERIFICATION_TOKEN")) {
    const resolved = resolveRequiredValue(key, env, context, service);
    return {
      key,
      status: resolved.value ? "provided" : "optional",
      source: resolved.source,
      note: key === "PUBLIC_CALLBACK_BASE_URL"
        ? "Optional for embedded-long-connection; required only for webhook or hybrid callback verification."
        : "Optional for embedded-long-connection; Feishu SDK long connection uses app credentials rather than webhook token verification.",
    };
  }
  const resolved = resolveRequiredValue(key, env, context, service);
  return {
    key,
    status: resolved.value ? "provided" : "missing",
    source: resolved.source,
    note,
  };
}

function resolveRequiredValue(
  key: string,
  env: Record<string, string>,
  context: ContextTemplate | undefined,
  service: ServiceManifest,
): { value: string; source: RequiredValueRow["source"] } {
  const envValue = configuredValue(env[key]);
  if (envValue) return { value: envValue, source: "env" };

  const feishu = context?.feishu_app;
  const contextValueByKey: Record<string, string | undefined> = {
    APP_ID: feishu?.app_id,
    FEISHU_APP_ID: feishu?.app_id,
    APP_SECRET: feishu?.app_secret,
    FEISHU_APP_SECRET: feishu?.app_secret,
    FEISHU_CONNECTION_MODE: context?.host_receive_mode === "embedded-long-connection" ? "websocket" : undefined,
    VERIFICATION_TOKEN: feishu?.verification_token,
    ENCRYPT_KEY: feishu?.encrypt_key,
    TEST_CHAT_ID: feishu?.test_chat_id,
    PUBLIC_CALLBACK_BASE_URL: feishu?.public_callback_base_url,
    IMAGE_AGENT_BASE_URL: context?.target_service.base_url,
    TARGET_BASE_URL: context?.target_service.base_url,
    FEISHU_ALLOWED_USERS: context?.runtime_config.allowed_operator_open_ids?.join(","),
    ALLOWED_OPERATOR_OPEN_IDS: context?.runtime_config.allowed_operator_open_ids?.join(","),
    IMAGE_AGENT_TIMEOUT_MS: context?.runtime_config.target_timeout_seconds ? String(context.runtime_config.target_timeout_seconds * 1000) : "120000",
  };
  const contextValue = configuredValue(contextValueByKey[key]);
  if (contextValue) return { value: contextValue, source: "context" };

  const manifestBaseUrl = configuredValue(service.service.base_url);
  if ((key === "IMAGE_AGENT_BASE_URL" || key === "TARGET_BASE_URL") && manifestBaseUrl) {
    return { value: manifestBaseUrl, source: "manifest" };
  }

  return { value: "", source: "none" };
}

function buildRuntimeRows(env: Record<string, string>, context: ContextTemplate | undefined, service: ServiceManifest): RequiredValueRow[] {
  const rows: RequiredValueRow[] = [];
  if (resolveHandoffProfile(context, service) === "calendar-stock-updater") {
    rows.push(buildRuntimeRow("TARGET_TIMEOUT_MS", env.TARGET_TIMEOUT_MS, "30000", "Target HTTP timeout for /api/state, /api/run, and /api/stop from integrations/lark."));
    rows.push(buildRuntimeRow("TARGET_WAIT_MS", env.TARGET_WAIT_MS, "30000", "Maximum startup wait for the existing calendar service before module checks."));
    return rows;
  }
  if (context?.integration_mode === "self-hosted-runtime") {
    rows.push(buildRuntimeRow("FEISHU_CONNECTION_MODE", env.FEISHU_CONNECTION_MODE, "websocket", "Required by feishu-host long connection."));
    rows.push(buildRuntimeRow("IMAGE_AGENT_TIMEOUT_MS", env.IMAGE_AGENT_TIMEOUT_MS, context?.runtime_config.target_timeout_seconds ? String(context.runtime_config.target_timeout_seconds * 1000) : "120000", "Target HTTP timeout for service_client.py."));
    rows.push(buildOptionalRuntimeRow("FEISHU_ALLOWED_USERS", env.FEISHU_ALLOWED_USERS, operatorOpenIdStatus(context?.runtime_config.allowed_operator_open_ids), "Optional operator open_id allowlist for card actions."));
    rows.push(buildOptionalRuntimeRow("TEST_CHAT_ID", env.TEST_CHAT_ID, context?.feishu_app.test_chat_id || "", "Optional chat id for manual start-card send."));
    return rows;
  }
  rows.push(buildRuntimeRow("CARD_ACTION_MODE", env.CARD_ACTION_MODE, context?.runtime_config.card_action_mode || "sync", "sync waits for target completion; async returns a running card and patches later."));
  rows.push(buildRuntimeRow("UPLOAD_IMAGE_TO_LARK", env.UPLOAD_IMAGE_TO_LARK, boolToEnv(context?.runtime_config.upload_image_to_lark, "1"), "1 uploads result images to Feishu when API credentials and scope are available."));
  if (context?.handoff_request.required_values.some((item) => item.key === "TARGET_BASE_URL")) {
    rows.push(buildRuntimeRow("TARGET_TIMEOUT_MS", env.TARGET_TIMEOUT_MS, context?.runtime_config.target_timeout_seconds ? String(context.runtime_config.target_timeout_seconds * 1000) : "120000", "Target service call timeout."));
  } else {
    rows.push(buildRuntimeRow("IMAGE_AGENT_TIMEOUT_MS", env.IMAGE_AGENT_TIMEOUT_MS, context?.runtime_config.target_timeout_seconds ? String(context.runtime_config.target_timeout_seconds * 1000) : "120000", "Target service call and image download timeout."));
  }
  rows.push(buildRuntimeRow("HOST", env.HOST, context?.runtime_config.host || "127.0.0.1", "HTTP bind host for the generated bot runtime."));
  rows.push(buildRuntimeRow("PORT", env.PORT, context?.runtime_config.port ? String(context.runtime_config.port) : "3978", "HTTP port for the generated bot runtime."));
  rows.push(buildOptionalRuntimeRow("DEBUG_ACCESS_TOKEN", env.DEBUG_ACCESS_TOKEN, context?.runtime_config.debug_access_token || "", context?.host_receive_mode === "embedded-long-connection" ? "Protects host-owned debug endpoints if the host exposes them. Value is intentionally hidden." : "Protects /debug/* endpoints when the runtime is reachable through a public callback URL. Value is intentionally hidden."));
  rows.push(buildOptionalRuntimeRow("ALLOWED_OPERATOR_OPEN_IDS", env.ALLOWED_OPERATOR_OPEN_IDS, operatorOpenIdStatus(context?.runtime_config.allowed_operator_open_ids), "Optional operator open_id allowlist for card actions. Values are not printed in this status file."));
  rows.push(buildRuntimeRow("ALLOW_DEBUG_WITHOUT_FEISHU", env.ALLOW_DEBUG_WITHOUT_FEISHU, boolToEnv(context?.runtime_config.allow_debug_without_feishu, "0"), "1 explicitly enables local debug simulation before real Feishu credentials are filled."));
  return rows;
}

function operatorOpenIdStatus(value: string[] | undefined): string {
  const configured = (value || []).map((item) => configuredValue(item)).filter(Boolean);
  if (!configured.length) return "";
  return `${configured.length} configured`;
}

function buildRuntimeRow(key: string, envValue: string | undefined, contextValue: string, note: string): RequiredValueRow {
  const configuredEnvValue = configuredValue(envValue);
  const configuredContextValue = configuredValue(contextValue);
  if (configuredEnvValue) {
    return { key, status: "provided", source: "env", note };
  }
  return {
    key,
    status: configuredContextValue ? "provided" : "missing",
    source: configuredContextValue ? "context" : "none",
    note,
  };
}

function buildOptionalRuntimeRow(key: string, envValue: string | undefined, contextValue: string, note: string): RequiredValueRow {
  const configuredEnvValue = configuredValue(envValue);
  const configuredContextValue = configuredValue(contextValue);
  if (configuredEnvValue) {
    return { key, status: "provided", source: "env", note };
  }
  if (configuredContextValue) {
    return { key, status: "provided", source: "context", note };
  }
  return { key, status: "optional", source: "none", note };
}

function boolToEnv(value: boolean | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  return value ? "1" : "0";
}

function readOptionalJson<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  return readJsonFile<T>(filePath);
}

function buildContextReplyStatus(packagePath: string): ContextReplyStatus {
  const templatePath = path.join(packagePath, "feishu_context.reply.template.json");
  const localJsonPath = path.join(packagePath, "feishu_context.reply.local.json");
  const localMarkdownPath = path.join(packagePath, "feishu_context.reply.local.md");
  const expectedPermissionConfirmations = readPermissionConfirmationItems(templatePath);
  const base: ContextReplyStatus = {
    templatePath,
    templatePresent: fs.existsSync(templatePath),
    localJsonPath,
    localJsonPresent: fs.existsSync(localJsonPath),
    localMarkdownPath,
    localMarkdownPresent: fs.existsSync(localMarkdownPath),
    parseError: "",
    answeredQuestions: 0,
    totalQuestions: 0,
    negativeAnswers: [],
    permissionStatusCounts: {
      unknown: 0,
      confirmed: 0,
      blocked: 0,
      notNeeded: 0,
    },
    permissionConfirmationCount: 0,
    expectedPermissionConfirmationCount: expectedPermissionConfirmations.length,
    missingPermissionConfirmations: [],
    blockedCount: 0,
    secureSecretChannelPresent: false,
    publicValueFields: [],
    readyForLocalConfigure: false,
  };

  if (!base.localJsonPresent) return base;

  try {
    const parsed = readJsonFile<unknown>(localJsonPath);
    const reply = isRecord(parsed) ? parsed as Partial<ContextReplyTemplate> : {};
    const answers = isRecord(reply.answers) ? reply.answers : {};
    const answerEntries = Object.entries(answers);
    const negativeAnswers = answerEntries
      .filter(([, value]) => value === false)
      .map(([key]) => key);
    const permissionStatusCounts = countPermissionReplyStatuses(reply.permission_confirmations);
    const permissionConfirmationItems = permissionConfirmationItemNames(reply.permission_confirmations);
    const missingPermissionConfirmations = expectedPermissionConfirmations.filter((item) => !permissionConfirmationItems.includes(item));
    const blockedCount = countNonEmptyStrings(reply.blocked_by);
    const publicValues = isRecord(reply.public_values) ? reply.public_values : {};
    const publicValueFields = Object.entries(publicValues)
      .filter(([, value]) => Boolean(configuredValue(value)))
      .map(([key]) => key);
    const secureSecretChannelPresent = Boolean(configuredValue(reply.secure_secret_channel));
    const answeredQuestions = answerEntries.filter(([, value]) => typeof value === "boolean").length;

    return {
      ...base,
      answeredQuestions,
      totalQuestions: answerEntries.length,
      negativeAnswers,
      permissionStatusCounts,
      permissionConfirmationCount: permissionConfirmationItems.length,
      expectedPermissionConfirmationCount: expectedPermissionConfirmations.length,
      missingPermissionConfirmations,
      blockedCount,
      secureSecretChannelPresent,
      publicValueFields,
      readyForLocalConfigure: answeredQuestions > 0
        && negativeAnswers.length === 0
        && permissionStatusCounts.blocked === 0
        && permissionStatusCounts.unknown === 0
        && missingPermissionConfirmations.length === 0
        && blockedCount === 0
        && secureSecretChannelPresent,
    };
  } catch (error) {
    return {
      ...base,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function countPermissionReplyStatuses(value: unknown): ContextReplyStatus["permissionStatusCounts"] {
  const counts: ContextReplyStatus["permissionStatusCounts"] = {
    unknown: 0,
    confirmed: 0,
    blocked: 0,
    notNeeded: 0,
  };
  if (!Array.isArray(value)) return counts;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const status = item.status;
    if (status === "confirmed") counts.confirmed += 1;
    else if (status === "blocked") counts.blocked += 1;
    else if (status === "not_needed") counts.notNeeded += 1;
    else counts.unknown += 1;
  }
  return counts;
}

function readPermissionConfirmationItems(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = readJsonFile<unknown>(filePath);
    if (!isRecord(parsed)) return [];
    return permissionConfirmationItemNames(parsed.permission_confirmations);
  } catch {
    return [];
  }
}

function permissionConfirmationItemNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = configuredValue(item.item);
    if (name && !items.includes(name)) items.push(name);
  }
  return items;
}

function countNonEmptyStrings(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((item) => Boolean(configuredValue(item))).length;
}

function buildManualEvidenceStatus(packagePath: string, context: ContextTemplate | undefined, service: ServiceManifest, level2Record: string): ManualEvidenceStatus {
  const templatePath = path.join(packagePath, "level2_manual_evidence.template.json");
  const localPath = path.join(packagePath, "level2_manual_evidence.local.json");
  const profile = resolveHandoffProfile(context, service);
  const fields = profile === "generic-http-api" ? [
    "date",
    "operator",
    "feishu_app_name",
    "test_chat",
    "start_message_id",
    "generic_action_id",
    "target_request_summary",
    "target_response_summary",
    "result_message_id",
    "result_screenshot",
    "trace_id",
    "notes",
  ] : profile === "calendar-stock-updater" ? [
    "date",
    "operator",
    "feishu_app_name",
    "test_chat",
    "start_message_id",
    "status_result_message_id",
    "status_screenshot",
    "dry_run_result_message_id",
    "dry_run_screenshot",
    "run_confirmation_message_id",
    "run_result_message_id",
    "run_result_screenshot",
    "stop_confirmation_message_id",
    "stop_result_message_id",
    "stop_result_screenshot",
    "sanitized_host_log_path",
    "trace_id",
    "notes",
  ] : [
    "date",
    "operator",
    "feishu_app_name",
    "test_chat",
    "start_message_id",
    "result_message_id",
    "result_screenshot",
    "generated_image_url",
    "generated_image_key",
    "batch_id",
    "batch_status_message_id",
    "batch_status_screenshot",
    "batch_download_url",
    "batch_download_screenshot",
    "trace_id",
    "notes",
  ];
  let parseError = "";
  let filledFields: string[] = [];
  if (fs.existsSync(localPath)) {
    try {
      const parsed = readJsonFile<unknown>(localPath);
      const record = isRecord(parsed) ? parsed : {};
      const values = isRecord(record.values) ? record.values : record;
      filledFields = fields.filter((field) => hasNonEmptyString(values[field]));
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }

  const missingFields = fields.filter((field) => !filledFields.includes(field));
  const importedFields = filledFields.filter((field) => manualEvidenceFieldImported(field, level2Record));
  const pendingImportFields = filledFields.filter((field) => !importedFields.includes(field));
  const calendarModeB = profile === "calendar-stock-updater";
  return {
    templatePath,
    templatePresent: fs.existsSync(templatePath),
    localPath,
    localPresent: fs.existsSync(localPath),
    parseError,
    filledFields,
    missingFields,
    importedFields,
    pendingImportFields,
    readyToImport: !calendarModeB && fs.existsSync(localPath) && !parseError && pendingImportFields.length > 0,
    importCommand: calendarModeB ? "" : manualEvidenceImportCommand(packagePath, context),
  };
}

function manualEvidenceFieldImported(field: string, level2Record: string): boolean {
  const recordField = manualEvidenceRecordField(field);
  if (!recordField) return false;
  return Boolean(readRecordField(level2Record, recordField));
}

function manualEvidenceRecordField(field: string): string {
  const map: Record<string, string> = {
    date: "Date",
    operator: "Operator",
    feishu_app_name: "Feishu app name",
    test_chat: "Test chat",
    start_message_id: "Start card message ID",
    generic_action_id: "Generic action ID",
    target_request_summary: "Target request summary",
    target_response_summary: "Target response summary",
    result_message_id: "Result card message ID or screenshot",
    result_screenshot: "Result card message ID or screenshot",
    status_result_message_id: "Status result message ID or screenshot",
    status_screenshot: "Status result message ID or screenshot",
    dry_run_result_message_id: "Dry-run result message ID or screenshot",
    dry_run_screenshot: "Dry-run result message ID or screenshot",
    run_confirmation_message_id: "Formal-run confirmation/result message IDs or screenshots",
    run_result_message_id: "Formal-run confirmation/result message IDs or screenshots",
    run_result_screenshot: "Formal-run confirmation/result message IDs or screenshots",
    stop_confirmation_message_id: "Stop confirmation/result message IDs or screenshots",
    stop_result_message_id: "Stop confirmation/result message IDs or screenshots",
    stop_result_screenshot: "Stop confirmation/result message IDs or screenshots",
    sanitized_host_log_path: "Sanitized host log path",
    generated_image_url: "Generated image URL or image key",
    generated_image_key: "Generated image URL or image key",
    batch_id: "Batch ID",
    batch_status_message_id: "Batch status card message ID or screenshot",
    batch_status_screenshot: "Batch status card message ID or screenshot",
    batch_download_url: "Batch download URL or screenshot",
    batch_download_screenshot: "Batch download URL or screenshot",
    trace_id: "Trace ID",
    notes: "Notes",
  };
  return map[field] || "";
}

function manualEvidenceImportCommand(packagePath: string, context: ContextTemplate | undefined): string {
  const base = findPackageCommand(packagePath, context, " evidence ")
    || "node ..\\..\\dist\\index.js evidence . --runtime-url http://127.0.0.1:3978";
  const withoutUpdate = base.replace(/\s+--update-record\b/g, "").replace(/\s+--updateRecord\b/g, "");
  const withoutManualEvidence = withoutUpdate.replace(/\s+--manual-evidence\s+\S+/g, "");
  return `${withoutManualEvidence} --manual-evidence level2_manual_evidence.local.json --update-record`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasNonEmptyString(value: unknown): boolean {
  return Boolean(configuredValue(value));
}

function countReportChecks(report: VerificationReport | undefined): Record<"pass" | "warn" | "fail", number> {
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const check of report?.checks || []) {
    counts[check.status] += 1;
  }
  return counts;
}

function buildSecurityWarnings(
  env: Record<string, string>,
  context: ContextTemplate | undefined,
  service: ServiceManifest,
): string[] {
  const selfHosted = context?.integration_mode === "self-hosted-runtime";
  const publicCallback = configuredValue(env.PUBLIC_CALLBACK_BASE_URL) || configuredValue(context?.feishu_app.public_callback_base_url);
  const debugAccessToken = configuredValue(env.DEBUG_ACCESS_TOKEN) || configuredValue(context?.runtime_config.debug_access_token);
  const debugEnabled = env.ALLOW_DEBUG_WITHOUT_FEISHU
    ? envFlagValue(env.ALLOW_DEBUG_WITHOUT_FEISHU)
    : context?.runtime_config.allow_debug_without_feishu !== false;
  const warnings: string[] = [];
  if (!selfHosted) warnings.push(...publicCallbackWarnings(publicCallback));
  for (const finding of service.source_scan.secret_findings || []) {
    warnings.push(`Target source scan found a potential secret literal in ${finding.file}:${finding.line} (${finding.kind}). ${finding.action} No secret value was copied.`);
  }

  if (!selfHosted && debugEnabled && !debugAccessToken && publicCallback) {
    warnings.push("PUBLIC_CALLBACK_BASE_URL is set while /debug/* endpoints are enabled without DEBUG_ACCESS_TOKEN. Set a random DEBUG_ACCESS_TOKEN before exposing this runtime publicly.");
  } else if (!selfHosted && debugEnabled && !debugAccessToken && context?.host_receive_mode !== "embedded-long-connection") {
    warnings.push("Set DEBUG_ACCESS_TOKEN before publishing the runtime behind a public callback URL.");
  }

  return warnings;
}

function envFlagValue(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === "1" || normalized === "true";
}

function determineState(
  requiredValues: RequiredValueRow[],
  report: VerificationReport | undefined,
  completionDecision: CompletionDecision,
  manualEvidence: ManualEvidenceStatus,
  profile: HandoffProfile,
): ReadinessState {
  const selfHosted = report?.context?.mode === "self-hosted-runtime";
  if (requiredValues.some((item) => item.status === "missing")) return "external_context_missing";
  if (!report) return "runtime_preflight_needed";
  if (report.status === "fail") return "verification_failing";
  if (selfHosted) {
    if (report.status === "warn") return "level2_preflight_has_warnings";
    if (manualEvidence.parseError) return "manual_evidence_invalid";
    if (!completionDecision.complete) return "manual_click_evidence_needed";
    return "handoff_ready";
  }
  if (report.context?.mode === "embedded-adapter") {
    if (profile === "calendar-stock-updater") {
      if (report.status === "warn") return "level2_preflight_has_warnings";
      if (manualEvidence.parseError) return "manual_evidence_invalid";
      if (!completionDecision.complete) return "manual_click_evidence_needed";
      return "handoff_ready";
    }
    if (!report.context.hostRuntimeUrl || report.context.simulate !== true) return "runtime_preflight_needed";
  } else if (!report.context?.runtimeUrl || report.context.simulate !== true) return "runtime_preflight_needed";
  if (report.context?.mode !== "embedded-adapter" && report.context?.level2 !== true) return "level2_preflight_needed";
  if (report.status === "warn") return "level2_preflight_has_warnings";
  if (manualEvidence.parseError) return "manual_evidence_invalid";
  if (!completionDecision.complete) return "manual_click_evidence_needed";
  return "handoff_ready";
}

function buildNextActions(
  state: ReadinessState,
  context: ContextTemplate | undefined,
  report: VerificationReport | undefined,
  requiredValues: RequiredValueRow[],
  contextRequestPath: string,
  contextReply: ContextReplyStatus,
  manualEvidence: ManualEvidenceStatus,
  packagePath: string,
  service: ServiceManifest,
): string[] {
  if (resolveHandoffProfile(context, service) === "calendar-stock-updater") {
    return buildCalendarNextActions(state, context, report, requiredValues, manualEvidence, packagePath, service);
  }
  const configureCommand = withoutConfigureDryRun(withConfigureStrict(findPackageCommand(packagePath, context, " configure ") || "node ..\\..\\dist\\index.js configure ."));
  const configureDryRunCommand = withConfigureDryRun(configureCommand);
  const initContextCommand = findPackageCommand(packagePath, context, " init-local ") || "node ..\\..\\dist\\index.js init-local . --context --reply";
  const initManualEvidenceCommand = replaceInitLocalSelection(initContextCommand, "--manual-evidence");
  const verifyCommand = findPackageCommand(packagePath, context, " verify ") || "node ..\\..\\dist\\index.js verify .";
  const simulateCommand = findPackageCommand(packagePath, context, " --simulate") || "node ..\\..\\dist\\index.js verify . --runtime-url http://127.0.0.1:3978 --simulate";
  const evidenceCommand = findPackageCommand(packagePath, context, " evidence ") || "node ..\\..\\dist\\index.js evidence .";
  const embedded = contextUsesEmbeddedAdapter(context);
  const selfHosted = context?.integration_mode === "self-hosted-runtime";
  const selfHostedSetupActions = [
    "Copy feishu-host/.env.example to feishu-host/.env and fill FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_CONNECTION_MODE=websocket, IMAGE_AGENT_BASE_URL, and optional FEISHU_ALLOWED_USERS/IMAGE_AGENT_TIMEOUT_MS/TEST_CHAT_ID.",
    "Run python -m pip install -r feishu-host/requirements.txt.",
    "Run python feishu-host/local_contract_test.py.",
    "Run python feishu-host/app.py --selfcheck.",
    "Enable Feishu long connection and subscribe the app to card.action.trigger.",
    "Run verify --mode self-hosted-runtime --strict.",
  ];
  const level2Command = embedded
    ? simulateCommand
    : findPackageCommand(packagePath, context, " --level2") || "node ..\\..\\dist\\index.js verify . --runtime-url http://127.0.0.1:3978 --level2";
  const missingValues = requiredValues
    .filter((item) => item.status === "missing")
    .map((item) => item.key);
  const manualEvidenceParseActions = manualEvidence.parseError
    ? [
        `Fix invalid level2_manual_evidence.local.json before importing manual evidence: ${manualEvidence.parseError}`,
      ]
    : [];
  const contextReplyActions = buildContextReplyActions(contextReply);
  const targetPreflightActions = buildTargetPreflightActions(report, service, verifyCommand, context);
  const manualEvidenceCommands = manualEvidence.readyToImport
    ? [manualEvidence.importCommand]
    : manualEvidence.localPresent && manualEvidence.filledFields.length
      ? [evidenceCommand]
      : [initManualEvidenceCommand, evidenceCommand];

  switch (state) {
    case "external_context_missing":
      return [
        ...contextReplyActions,
        ...manualEvidenceParseActions,
        ...(selfHosted ? ["Prepare feishu-host/.env from feishu-host/.env.example, then run the generated Python local contract and selfcheck after the Feishu app owner confirms credentials."] : []),
        contextReply.localJsonPresent
          ? `Use the recorded non-secret owner reply to fill feishu_context.local.json, then validate the missing values: ${missingValues.join(", ") || "none"}.`
          : `Send feishu_context.request.md to the Feishu app owner/FDE to confirm who can provide the missing values: ${missingValues.join(", ") || "none"}. Request file: ${contextRequestPath}`,
        ...targetPreflightActions,
        selfHosted
          ? "After confirmation, fill feishu-host/.env through a secure channel and run the Python local contract and selfcheck before real Feishu Level 2."
          : embedded
          ? "After confirmation, initialize local-only context files, then mount the adapter in the existing Feishu SDK host with its secret/config system."
          : "After confirmation, initialize local-only context files, fill secrets through a secure channel, then run configure --strict --dry-run before writing bot-runtime/.env.",
        ...(selfHosted ? selfHostedSetupActions : [initContextCommand, configureDryRunCommand, ...(embedded ? [] : ["If configure_report.md shows no missing required values, run configure --strict to write bot-runtime/.env.", configureCommand])]),
      ];
    case "runtime_preflight_needed":
      return [
        ...contextReplyActions,
        ...manualEvidenceParseActions,
        ...targetPreflightActions,
        selfHosted
          ? "Run the generated Python local contract, app selfcheck, and self-hosted verify strict before manual Feishu Level 2."
          : embedded
          ? "Start the externally managed target service and existing Feishu SDK host, then run embedded host simulation verification."
          : "Start the externally managed target service and generated bot runtime, then run local simulation verification.",
        ...(selfHosted ? selfHostedSetupActions : [simulateCommand]),
      ];
    case "verification_failing":
      return [
        ...contextReplyActions,
        ...manualEvidenceParseActions,
        ...targetPreflightActions,
        "Open verification_report.md and fix each FAIL check before handoff.",
        report?.context?.level2 ? level2Command : simulateCommand,
      ];
    case "level2_preflight_needed":
      return [
        ...contextReplyActions,
        ...manualEvidenceParseActions,
        ...targetPreflightActions,
        selfHosted ? "Use feishu-host long connection with card.action.trigger for manual Feishu Level 2; no webhook/public callback is required." : embedded ? "Run embedded host verification with a public callback URL and Feishu test chat evidence path." : "Run real Level 2 preflight with a public callback URL and Feishu test chat.",
        ...(selfHosted ? ["Run verify --mode self-hosted-runtime --strict after any package regeneration."] : [level2Command]),
      ];
    case "level2_preflight_has_warnings":
      return [
        ...contextReplyActions,
        ...manualEvidenceParseActions,
        ...targetPreflightActions,
        embedded ? "Resolve the WARN checks in verification_report.md, then rerun embedded host verification." : "Resolve the WARN checks in verification_report.md, then rerun Level 2 preflight with --strict.",
        level2Command,
      ];
    case "manual_click_evidence_needed":
      return [
        ...contextReplyActions,
        ...manualEvidenceParseActions,
        manualEvidence.readyToImport
          ? "Import filled level2_manual_evidence.local.json into level2_verification_record.md, then review and check the final completion boxes manually."
          : manualEvidence.localPresent && manualEvidence.filledFields.length
            ? "Filled manual evidence fields already appear imported into level2_verification_record.md. Review the record, attach final screenshots if needed, and check completion boxes manually."
            : "Initialize level2_manual_evidence.local.json, fill the real Feishu result evidence, then import it into level2_verification_record.md.",
        ...manualEvidenceCommands,
      ];
    case "manual_evidence_invalid":
      return [
        ...contextReplyActions,
        ...manualEvidenceParseActions,
      ];
    case "handoff_ready":
      return [
        ...contextReplyActions,
        ...manualEvidenceParseActions,
        "The generated package has Level 2 evidence marked complete. Hand off README.md, deployment_checklist.md, verification_report.md, and level2_verification_record.md together.",
      ];
  }
}

function buildCalendarNextActions(
  state: ReadinessState,
  context: ContextTemplate | undefined,
  report: VerificationReport | undefined,
  requiredValues: RequiredValueRow[],
  manualEvidence: ManualEvidenceStatus,
  packagePath: string,
  service: ServiceManifest,
): string[] {
  const targetBaseUrl = configuredValue(context?.target_service.base_url) || configuredValue(service.service.base_url) || "<TARGET_BASE_URL>";
  const installDryRun = `node $env:LARK_DEPLOYER_CLI install . --target <calendar-project> --target-base-url ${targetBaseUrl}`;
  const installApply = installDryRun.includes("--apply") ? installDryRun : `${installDryRun} --apply`;
  const missingValues = requiredValues.filter((item) => item.status === "missing").map((item) => item.key);
  const actions = [
    `Start or expose the calendar target service so \`GET <TARGET_BASE_URL>/api/state\` passes from the target project environment. Current target base URL: ${targetBaseUrl}.`,
    `Run \`${installDryRun}\` to review the zero-write install plan.`,
    `Run \`${installApply}\` after reviewing the dry-run.`,
    "Copy `integrations/lark/.env.example` to `integrations/lark/.env` and fill FEISHU_APP_ID, FEISHU_APP_SECRET, TEST_CHAT_ID, TARGET_BASE_URL, and ALLOWED_OPERATOR_OPEN_IDS through a secure channel.",
    "Run `npm install` inside `integrations/lark`.",
    "Run `npm test` inside `integrations/lark`.",
    "Run `npm start` inside `integrations/lark` for the Feishu long-connection module when ready for manual Level 2.",
  ];
  if (missingValues.length) {
    actions.unshift(`Current required module values are missing or incomplete: ${missingValues.map((item) => `\`${item}\``).join(", ")}.`);
  }
  if (report?.status === "fail") {
    actions.push("Open verification_report.md and fix each FAIL check before handoff.");
  }
  if (manualEvidence.parseError) {
    actions.push(`Fix invalid level2_manual_evidence.local.json before using manual evidence status: ${manualEvidence.parseError}`);
  }
  if (state === "manual_click_evidence_needed" || state === "handoff_ready") {
    actions.push("Manually copy private worksheet values into matching fields in `level2_verification_record.md`, then review and check the final completion boxes manually.");
  }
  return actions;
}

function replaceInitLocalSelection(command: string, selection: string): string {
  const base = command
    .replace(/\s+--context\b/g, "")
    .replace(/\s+--reply\b/g, "")
    .replace(/\s+--manual-evidence\b/g, "")
    .replace(/\s+--manualEvidence\b/g, "")
    .replace(/\s+--all\b/g, "")
    .trim();
  return `${base} ${selection}`;
}

function buildContextReplyActions(contextReply: ContextReplyStatus): string[] {
  if (contextReply.parseError) {
    return [`Fix invalid feishu_context.reply.local.json before using owner reply status: ${contextReply.parseError}`];
  }
  if (!contextReply.localJsonPresent) {
    return [];
  }
  const actions: string[] = [];
  if (contextReply.blockedCount || contextReply.permissionStatusCounts.blocked || contextReply.negativeAnswers.length) {
    actions.push(`Resolve owner reply blockers before requesting secrets or running configure: blocked_by=${contextReply.blockedCount}, blocked_permissions=${contextReply.permissionStatusCounts.blocked}, negative_answers=${contextReply.negativeAnswers.length}.`);
  }
  if (contextReply.permissionStatusCounts.unknown || contextReply.missingPermissionConfirmations.length) {
    actions.push(`Confirm every required permission in feishu_context.reply.local.json before running configure: unknown_permissions=${contextReply.permissionStatusCounts.unknown}, missing_permissions=${contextReply.missingPermissionConfirmations.length}.`);
  }
  if (!contextReply.secureSecretChannelPresent) {
    actions.push("Record secure_secret_channel in feishu_context.reply.local.json before asking for APP_SECRET, VERIFICATION_TOKEN, ENCRYPT_KEY, or DEBUG_ACCESS_TOKEN.");
  }
  return actions;
}

function buildTargetPreflightActions(report: VerificationReport | undefined, service: ServiceManifest, verifyCommand: string, context?: ContextTemplate): string[] {
  const spec = targetPreflightSpec(resolveHandoffProfile(context, service));
  const targetCheck = report?.checks?.find((check) => check.name === spec.checkName);
  if (!targetCheck) return [];
  if (targetCheck.status === "pass") {
    const checkedAt = report?.generated_at || "unknown time";
    return [
      `Latest target preflight pass is a verification_report snapshot from ${checkedAt}; rerun verify after starting or exposing the target service to prove it is reachable now. ${verifyCommand}`,
    ];
  }
  const targetBaseUrl = report?.context?.targetBaseUrl || spec.baseUrlPlaceholder;
  const actions = [
    `Start or expose the externally managed target service so GET ${targetBaseUrl}${spec.checkPath} passes, then rerun verify. Current target preflight status: ${targetCheck.status}.`,
  ];
  for (const hint of service.service.start_hints || []) {
    actions.push(`Target start hint: ${hint}`);
  }
  actions.push(verifyCommand);
  return actions;
}

function targetPreflightSpec(profile: HandoffProfile): { checkName: string; checkPath: string; baseUrlPlaceholder: string } {
  if (profile === "calendar-stock-updater") {
    return { checkName: "target:/api/state", checkPath: "/api/state", baseUrlPlaceholder: "<TARGET_BASE_URL>" };
  }
  return { checkName: "target:/api/meta", checkPath: "/api/meta", baseUrlPlaceholder: profile === "generic-http-api" ? "<TARGET_BASE_URL>" : "<IMAGE_AGENT_BASE_URL>" };
}

function withConfigureStrict(command: string): string {
  if (/\sconfigure\s/.test(`${command} `) && !/(^|\s)--strict(\s|$)/.test(command)) {
    return `${command} --strict`;
  }
  return command;
}

function withConfigureDryRun(command: string): string {
  if (/\sconfigure\s/.test(`${command} `) && !/(^|\s)--dry-run(\s|$)/.test(command)) {
    return `${command} --dry-run`;
  }
  return command;
}

function withoutConfigureDryRun(command: string): string {
  if (!/\sconfigure\s/.test(`${command} `)) return command;
  return command.replace(/\s+--dry-run\b/g, "").replace(/\s+--dryRun\b/g, "").trim();
}

function findPackageCommand(packagePath: string, context: ContextTemplate | undefined, needle: string): string {
  const generatedCommand = commandFromSet(context, "generated_package_root", needle);
  if (generatedCommand && commandCliExists(packagePath, generatedCommand)) {
    return generatedCommand;
  }
  return commandFromSet(context, "moved_package_root", needle) || generatedCommand || "";
}

function commandFromSet(context: ContextTemplate | undefined, setName: string, needle: string): string {
  const commandSet = context?.handoff_request.command_sets.find((set) => set.name === setName);
  return commandSet?.commands.find((command) => command.includes(needle)) || "";
}

function contextUsesEmbeddedAdapter(context: ContextTemplate | undefined): boolean {
  return Boolean(context?.handoff_request.command_sets.some((set) => (
    set.commands.some((command) => command.includes("--mode embedded-adapter"))
  )));
}

function commandCliExists(packagePath: string, command: string): boolean {
  const cliPath = readNodeCommandScript(command);
  if (!cliPath) return false;
  if (cliPath.includes("$env:") || cliPath.includes("%")) return true;
  const resolved = path.isAbsolute(cliPath) ? cliPath : path.resolve(packagePath, cliPath);
  return fs.existsSync(resolved);
}

function readNodeCommandScript(command: string): string {
  const trimmed = command.trim();
  const match = trimmed.match(/^node\s+(?:"([^"]+)"|'([^']+)'|(\S+))/i);
  return match?.[1] || match?.[2] || match?.[3] || "";
}

function printReadinessSummary(summary: ReadinessSummary, outPath: string): void {
  const missing = summary.requiredValues.filter((item) => item.status === "missing").map((item) => item.key);
  console.log(`Readiness status: ${summary.state}`);
  console.log(`Delivery mode: ${readinessDeliveryMode(summary)}`);
  console.log(`Target service: ${summary.service.service.name}`);
  console.log(`Missing required values: ${missing.length ? missing.join(", ") : "none"}`);
  console.log(`Latest verification: ${summary.report?.status || "missing"} (pass=${summary.reportCounts.pass}, warn=${summary.reportCounts.warn}, fail=${summary.reportCounts.fail})`);
  if (summary.state === "external_context_missing") {
    console.log(`Context request: ${summary.contextRequestPath}`);
  }
  if (summary.contextReply.localJsonPresent) {
    console.log(`Context reply local JSON: ${summary.contextReply.localJsonPath} (answered=${summary.contextReply.answeredQuestions}/${summary.contextReply.totalQuestions}, blockers=${summary.contextReply.blockedCount})`);
    if (summary.contextReply.parseError) {
      console.log(`Context reply parse error: ${summary.contextReply.parseError}`);
    }
  }
  if (summary.manualEvidence.localPresent) {
    console.log(`Manual evidence local file: ${summary.manualEvidence.localPath} (${summary.manualEvidence.filledFields.length} filled field(s))`);
    if (summary.manualEvidence.parseError) {
      console.log(`Manual evidence parse error: ${summary.manualEvidence.parseError}`);
    }
  }
  if (summary.securityWarnings.length) {
    console.log(`Security warnings: ${summary.securityWarnings.length}`);
  }
  console.log(`Next action: ${summary.nextActions[0]}`);
  console.log(`Readiness summary written to ${outPath}`);
}

export function buildReadinessMarkdown(summary: ReadinessSummary): string {
  const missing = summary.requiredValues.filter((item) => item.status === "missing").map((item) => item.key);
  const profile = resolveHandoffProfile(summary.context, summary.service);
  const calendarModeB = profile === "calendar-stock-updater";
  const genericLongConnection = summary.context?.host_receive_mode === "embedded-long-connection"
    && summary.context?.handoff_request.required_values.some((item) => item.key === "TARGET_BASE_URL") === true;
  const requiredRows = summary.requiredValues.map(formatValueRow).join("\n");
  const runtimeRows = summary.runtimeRows.map(formatValueRow).join("\n");
  const scopeRows = summary.permissions.scopes
    .map((scope) => `| \`${scope.scope}\` | ${scope.risk} | ${scope.reason} |`)
    .join("\n");
  const callbackRows = summary.permissions.callbacks
    .map((callback) => `| \`${callback.callback}\` | ${genericLongConnection ? "Receive interactive card button clicks through the Feishu SDK long connection." : callback.reason} | ${genericLongConnection ? "long_connection" : callback.security.join(", ")} |`)
    .join("\n");
  const secretHandling = calendarModeB
    ? "confirm availability in normal chat, but send `FEISHU_APP_SECRET` and operator allowlist values through a secure channel only."
    : genericLongConnection
    ? "confirm availability in normal chat, but send `APP_SECRET`, `ENCRYPT_KEY`, and `DEBUG_ACCESS_TOKEN` through a secure channel only."
    : "confirm availability in normal chat, but send `APP_SECRET`, `VERIFICATION_TOKEN`, `ENCRYPT_KEY`, and `DEBUG_ACCESS_TOKEN` through a secure channel only.";
  const failedChecks = (summary.report?.checks || [])
    .filter((check) => check.status === "fail")
    .map((check) => `- ${check.name}: ${check.detail}`)
    .join("\n") || "- none";
  const warnChecks = (summary.report?.checks || [])
    .filter((check) => check.status === "warn")
    .map((check) => `- ${check.name}: ${check.detail}`)
    .join("\n") || "- none";
  const securityWarnings = summary.securityWarnings
    .map((warning) => `- ${warning}`)
    .join("\n") || "- none";
  const manualEvidenceImportBlock = calendarModeB
    ? "Manual evidence values for calendar Mode B stay in the private worksheet or ignored local evidence file. Manually copy private worksheet values into matching fields in `level2_verification_record.md`; this command does not automate calendar evidence import."
    : `Import command:\n\n\`\`\`powershell\n${summary.manualEvidence.importCommand}\n\`\`\``;
  const contextReplyReadyLabel = calendarModeB ? "Ready for local module env intake" : "Ready for local configure intake";

  return `# Handoff Status

- Generated at: ${summary.generatedAt}
- Readiness status: ${summary.state}
- Delivery mode: ${readinessDeliveryMode(summary)}
- Package: ${summary.packagePath}
- Target service: ${summary.service.service.name}
- Env file checked: ${summary.envPath}
- Context file checked: ${summary.contextPath}
- Context request file: ${fs.existsSync(summary.contextRequestPath) ? summary.contextRequestPath : "missing"}
- Context reply template: ${summary.contextReply.templatePresent ? summary.contextReply.templatePath : "missing"}
- Context reply local JSON: ${summary.contextReply.localJsonPresent ? summary.contextReply.localJsonPath : "missing"}
- Manual evidence template: ${summary.manualEvidence.templatePresent ? summary.manualEvidence.templatePath : "missing"}
- Manual evidence local file: ${summary.manualEvidence.localPresent ? summary.manualEvidence.localPath : "missing"}
- Verification report checked: ${fs.existsSync(summary.reportPath) ? summary.reportPath : "missing"}
- Level 2 evidence record: ${summary.level2RecordPath}
- Completion decision complete: ${summary.completionDecision.complete ? "yes" : "no"}

## Completion Decision

| Item | Checked |
| --- | --- |
| Level 2 verified | ${summary.completionDecision.level2Verified ? "yes" : "no"} |
| Manual evidence present | ${summary.completionDecision.manualEvidencePresent ? "yes" : "no"} |
| Remaining issues documented | ${summary.completionDecision.remainingIssuesDocumented ? "yes" : "no"} |
| Package handoff approved | ${summary.completionDecision.handoffApproved ? "yes" : "no"} |

Missing manual evidence: ${summary.completionDecision.missingManualEvidence.length ? summary.completionDecision.missingManualEvidence.map((item) => `\`${item}\``).join(", ") : "none"}

## Required External Values

Secret values are never printed here; only their presence and source are reported.

| Key | Status | Source | Note |
| --- | --- | --- | --- |
${requiredRows}

Missing required values: ${missing.length ? missing.map((item) => `\`${item}\``).join(", ") : "none"}

## Context Request

- Request file: ${fs.existsSync(summary.contextRequestPath) ? summary.contextRequestPath : "missing"}
- Intended recipient: Feishu app owner, permission admin, infrastructure owner, or FDE.
- Missing values to request: ${missing.length ? missing.map((item) => `\`${item}\``).join(", ") : "none"}
- Secret handling: ${secretHandling}

## Context Reply Intake

The local owner reply may include internal contact or deployment context. This status reports counts and field names only, not reply values.

| Item | Status |
| --- | --- |
| Reply template | ${summary.contextReply.templatePresent ? "present" : "missing"} |
| Local JSON reply | ${summary.contextReply.localJsonPresent ? "present" : "missing"} |
| Local Markdown reply | ${summary.contextReply.localMarkdownPresent ? "present" : "missing"} |
| Parse status | ${summary.contextReply.parseError ? `invalid: ${summary.contextReply.parseError.replace(/\|/g, "\\|")}` : "ok"} |
| Answered questions | ${summary.contextReply.answeredQuestions}/${summary.contextReply.totalQuestions || 0} |
| Negative answers | ${summary.contextReply.negativeAnswers.length ? summary.contextReply.negativeAnswers.map((field) => `\`${field}\``).join(", ") : "none"} |
| Permission statuses | confirmed=${summary.contextReply.permissionStatusCounts.confirmed}, blocked=${summary.contextReply.permissionStatusCounts.blocked}, unknown=${summary.contextReply.permissionStatusCounts.unknown}, not_needed=${summary.contextReply.permissionStatusCounts.notNeeded} |
| Permission confirmations | ${summary.contextReply.permissionConfirmationCount}/${summary.contextReply.expectedPermissionConfirmationCount} |
| Missing permission confirmations | ${summary.contextReply.missingPermissionConfirmations.length ? summary.contextReply.missingPermissionConfirmations.map((field) => `\`${field}\``).join(", ") : "none"} |
| Blocked-by entries | ${summary.contextReply.blockedCount} |
| Secure secret channel recorded | ${summary.contextReply.secureSecretChannelPresent ? "yes" : "no"} |
| Public value fields filled | ${summary.contextReply.publicValueFields.length ? summary.contextReply.publicValueFields.map((field) => `\`${field}\``).join(", ") : "none"} |
| ${contextReplyReadyLabel} | ${summary.contextReply.readyForLocalConfigure ? "yes" : "no"} |

## Manual Evidence Helper

The local manual evidence file may include operator, chat, message, screenshot, and trace context. Secret values should not be written there.

| Item | Status |
| --- | --- |
| Template file | ${summary.manualEvidence.templatePresent ? "present" : "missing"} |
| Local evidence file | ${summary.manualEvidence.localPresent ? "present" : "missing"} |
| Parse status | ${summary.manualEvidence.parseError ? `invalid: ${summary.manualEvidence.parseError.replace(/\|/g, "\\|")}` : "ok"} |
| Filled fields | ${summary.manualEvidence.filledFields.length ? summary.manualEvidence.filledFields.map((field) => `\`${field}\``).join(", ") : "none"} |
| Missing fields | ${summary.manualEvidence.missingFields.length ? summary.manualEvidence.missingFields.map((field) => `\`${field}\``).join(", ") : "none"} |
| Imported fields | ${summary.manualEvidence.importedFields.length ? summary.manualEvidence.importedFields.map((field) => `\`${field}\``).join(", ") : "none"} |
| Pending import fields | ${summary.manualEvidence.pendingImportFields.length ? summary.manualEvidence.pendingImportFields.map((field) => `\`${field}\``).join(", ") : "none"} |
| Ready to import | ${summary.manualEvidence.readyToImport ? "yes" : "no"} |

${manualEvidenceImportBlock}

## Runtime Choices

| Key | Status | Source | Note |
| --- | --- | --- | --- |
${runtimeRows}

## Security Notes

${securityWarnings}

## Feishu Permissions

| Scope | Risk | Why it is needed |
| --- | --- | --- |
${scopeRows || "| none | n/a | No explicit scopes were generated. |"}

## Feishu Callbacks

| Callback | Why it is needed | Security |
| --- | --- | --- |
${callbackRows || "| none | No explicit callbacks were generated. | n/a |"}

## Latest Verification

- Report status: ${summary.report?.status || "missing"}
- Report generated at: ${summary.report?.generated_at || "missing"}
- Evidence scope: ${summary.report ? "verification_report snapshot; readiness does not probe the network or start the target service" : "missing verification_report"}
- Level 2 mode: ${summary.report?.context?.level2 ? "yes" : "no"}
- Runtime URL checked: ${summary.report?.context?.runtimeUrl || "not checked"}
- Check counts: pass=${summary.reportCounts.pass}, warn=${summary.reportCounts.warn}, fail=${summary.reportCounts.fail}

### FAIL Checks

${failedChecks}

### WARN Checks

${warnChecks}

## Next Actions

${summary.nextActions.map((action) => `- ${action}`).join("\n")}
`;
}

function readinessDeliveryMode(summary: ReadinessSummary): string {
  const integrationMode = summary.context?.integration_mode || summary.report?.context?.mode || "standalone-runtime";
  if (resolveHandoffProfile(summary.context, summary.service) === "calendar-stock-updater") {
    return "installable Mode B integrations/lark module for the calendar target project.";
  }
  if (integrationMode === "self-hosted-runtime") {
    return "Mode B embedded host-module path foundation; self-hosted-runtime host module verified externally today.";
  }
  if (integrationMode === "embedded-adapter") {
    return "embedded-adapter package for an existing host; use Mode A when that host is external, and use Mode B only after embedding a host module into the target project.";
  }
  return "standalone-runtime reference host; not the primary product shape.";
}

function formatValueRow(row: RequiredValueRow): string {
  return `| \`${row.key}\` | ${row.status} | ${row.source} | ${row.note} |`;
}
