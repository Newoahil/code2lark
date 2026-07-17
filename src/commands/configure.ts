import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getStringOption, hasOption } from "../args.js";
import { ensureDir, readJsonFile, writeJson, writeText } from "../fs-utils.js";
import { configuredValue, isPlaceholderValue } from "../placeholder-utils.js";
import { publicCallbackWarnings, requireHttpBaseUrl } from "../url-validation.js";

interface FeishuContext {
  target_service?: {
    base_url?: string;
  };
  feishu_app?: {
    app_id?: string;
    app_secret?: string;
    verification_token?: string;
    encrypt_key?: string;
    test_chat_id?: string;
    public_callback_base_url?: string;
  };
  runtime_config?: {
    host?: unknown;
    port?: unknown;
    upload_image_to_lark?: unknown;
    target_timeout_seconds?: unknown;
    card_action_mode?: unknown;
    feishu_openapi_base_url?: unknown;
    debug_access_token?: unknown;
    allowed_operator_open_ids?: unknown;
    allow_debug_without_feishu?: unknown;
  };
}

interface NormalizedRuntimeConfig {
  host: string;
  port: string;
  uploadImageToLark: string;
  imageAgentTimeoutMs: string;
  cardActionMode: "sync" | "async";
  feishuOpenApiBaseUrl: string;
  debugAccessToken: string;
  allowedOperatorOpenIds: string;
  allowDebugWithoutFeishu: string;
}

type ConfigureValueSource = "context" | "context_reply" | "env" | "generated" | "default" | "missing";
type ConfigureValueStatus = "provided" | "missing" | "optional";

interface ConfigureReportRow {
  key: string;
  status: ConfigureValueStatus;
  source: ConfigureValueSource;
  secret: boolean;
  required_for_level_2: boolean;
  note: string;
}

interface ConfigureReport {
  schema_version: "0.1";
  generated_at: string;
  package_path: string;
  context_file: string;
  env_file: string;
  dry_run: boolean;
  strict: boolean;
  missing_required_values: string[];
  strict_context_reply_issues: string[];
  generated_values: string[];
  preserved_values: string[];
  warnings: string[];
  context_reply: ConfigureContextReplyReport;
  rows: ConfigureReportRow[];
}

interface ConfigureContextReplyReport {
  template_file: string;
  template_present: boolean;
  local_json_file: string;
  local_json_present: boolean;
  local_markdown_file: string;
  local_markdown_present: boolean;
  parse_error: string;
  answered_questions: number;
  total_questions: number;
  negative_answers: string[];
  permission_status_counts: {
    unknown: number;
    confirmed: number;
    blocked: number;
    not_needed: number;
  };
  permission_confirmation_count: number;
  expected_permission_confirmation_count: number;
  missing_permission_confirmations: string[];
  blocked_count: number;
  secure_secret_channel_present: boolean;
  public_value_fields: string[];
  used_public_value_fields: string[];
  ready_for_local_configure: boolean;
}

interface ConfigureContextReplyPublicValues {
  testChatId: string;
  publicCallbackBaseUrl: string;
  targetBaseUrl: string;
}

const REQUIRED_CONTEXT_KEYS = [
  "APP_ID",
  "APP_SECRET",
  "VERIFICATION_TOKEN",
  "TEST_CHAT_ID",
  "PUBLIC_CALLBACK_BASE_URL",
  "IMAGE_AGENT_BASE_URL",
] as const;

const CONFIGURE_KEY_NOTES: Record<string, string> = {
  APP_ID: "Feishu custom app id.",
  APP_SECRET: "Feishu custom app secret.",
  VERIFICATION_TOKEN: "Card callback verification token.",
  ENCRYPT_KEY: "Optional Feishu callback encrypt key.",
  TEST_CHAT_ID: "Test chat receive id where the bot is installed.",
  PUBLIC_CALLBACK_BASE_URL: "Public HTTPS base URL that routes to the bot runtime.",
  IMAGE_AGENT_BASE_URL: "Target service base URL reachable from the bot runtime.",
  HOST: "Runtime HTTP bind host.",
  PORT: "Runtime HTTP port.",
  UPLOAD_IMAGE_TO_LARK: "Whether result images should be uploaded to Feishu.",
  IMAGE_AGENT_TIMEOUT_MS: "Target service call and image download timeout in milliseconds.",
  CARD_ACTION_MODE: "sync waits for generation; async patches the message later.",
  FEISHU_OPENAPI_BASE_URL: "Optional Feishu OpenAPI base URL override.",
  DEBUG_ACCESS_TOKEN: "Optional token protecting /debug/* endpoints.",
  ALLOWED_OPERATOR_OPEN_IDS: "Optional comma-separated Feishu operator open_id allowlist.",
  ALLOW_DEBUG_WITHOUT_FEISHU: "Whether local debug endpoints stay available before real Feishu credentials are filled.",
};

const SECRET_KEYS = new Set(["APP_SECRET", "VERIFICATION_TOKEN", "ENCRYPT_KEY", "DEBUG_ACCESS_TOKEN"]);
const OPTIONAL_KEYS = new Set(["ENCRYPT_KEY", "FEISHU_OPENAPI_BASE_URL", "DEBUG_ACCESS_TOKEN", "ALLOWED_OPERATOR_OPEN_IDS"]);

export async function configureCommand(args: string[], options: Record<string, string | boolean>): Promise<void> {
  const packageArg = args[0];
  if (!packageArg) {
    throw new Error("Usage: lark-deployer configure <generated-package> [--context <file>] [--out-env <file>] [--report <file>] [--strict] [--dry-run]");
  }

  const packagePath = path.resolve(packageArg);
  const runtimeDir = path.join(packagePath, "bot-runtime");
  const localContext = path.join(packagePath, "feishu_context.local.json");
  const templateContext = path.join(packagePath, "feishu_context.template.json");
  const defaultContext = fs.existsSync(localContext) ? localContext : templateContext;
  const explicitContext = getStringOption(options, "context", "");
  const contextPath = path.resolve(explicitContext || defaultContext);
  const envExamplePath = path.join(runtimeDir, ".env.example");
  const outEnvPath = path.resolve(getStringOption(options, "out-env", path.join(runtimeDir, ".env")));
  const reportPath = path.resolve(getStringOption(options, "report", path.join(packagePath, "configure_report.json")));
  const strict = hasOption(options, "strict");
  const dryRun = hasOption(options, "dry-run") || hasOption(options, "dryRun");
  const contextReply = buildConfigureContextReplyReport(packagePath);
  const contextReplyPublicValues = readConfigureContextReplyPublicValues(contextReply);
  const contextReplyIssues = buildContextReplyStrictIssues(contextReply);

  if (!fs.existsSync(runtimeDir)) {
    throw new Error(`Generated bot-runtime directory does not exist: ${runtimeDir}`);
  }
  if (!fs.existsSync(contextPath)) {
    throw new Error(`Context file does not exist: ${contextPath}`);
  }

  const context = readJsonFile<FeishuContext>(contextPath);
  const runtime = normalizeRuntimeConfig(context.runtime_config || {});
  const existingEnv = fs.existsSync(outEnvPath) ? parseEnvFile(fs.readFileSync(outEnvPath, "utf8")) : {};
  const testChatId = configuredValue(context.feishu_app?.test_chat_id)
    || contextReplyPublicValues.testChatId;
  const publicCallbackBaseUrl = requireHttpBaseUrl(
    configuredValue(context.feishu_app?.public_callback_base_url)
      || contextReplyPublicValues.publicCallbackBaseUrl,
    "feishu_app.public_callback_base_url",
  );
  const targetBaseUrl = requireHttpBaseUrl(
    configuredValue(context.target_service?.base_url)
      || contextReplyPublicValues.targetBaseUrl,
    "target_service.base_url",
  );
  const contextWarnings = publicCallbackWarnings(publicCallbackBaseUrl);
  const sourcesBeforePreserve = buildSourceMap(context, runtime, testChatId, publicCallbackBaseUrl, targetBaseUrl, contextReplyPublicValues);
  contextReply.used_public_value_fields = Object.entries(sourcesBeforePreserve)
    .filter(([, source]) => source === "context_reply")
    .map(([key]) => contextReplyPublicFieldForConfigureKey(key))
    .filter((field) => field.length > 0);
  const replacementsBeforePreserve: Record<string, string> = {
    APP_ID: configuredValue(context.feishu_app?.app_id),
    APP_SECRET: configuredValue(context.feishu_app?.app_secret),
    VERIFICATION_TOKEN: configuredValue(context.feishu_app?.verification_token),
    ENCRYPT_KEY: configuredValue(context.feishu_app?.encrypt_key),
    TEST_CHAT_ID: testChatId,
    PUBLIC_CALLBACK_BASE_URL: publicCallbackBaseUrl,
    IMAGE_AGENT_BASE_URL: targetBaseUrl,
    HOST: runtime.host,
    PORT: runtime.port,
    UPLOAD_IMAGE_TO_LARK: runtime.uploadImageToLark,
    IMAGE_AGENT_TIMEOUT_MS: runtime.imageAgentTimeoutMs,
    CARD_ACTION_MODE: runtime.cardActionMode,
    FEISHU_OPENAPI_BASE_URL: runtime.feishuOpenApiBaseUrl,
    DEBUG_ACCESS_TOKEN: runtime.debugAccessToken,
    ALLOWED_OPERATOR_OPEN_IDS: runtime.allowedOperatorOpenIds,
    ALLOW_DEBUG_WITHOUT_FEISHU: runtime.allowDebugWithoutFeishu,
  };
  const { replacements, preservedKeys } = preserveExistingValues(replacementsBeforePreserve, existingEnv);
  const generatedKeys = applyPublicDebugProtections(replacements);
  const sourceByKey = finalizeSourceMap(sourcesBeforePreserve, replacements, preservedKeys, generatedKeys);

  const source = fs.existsSync(envExamplePath)
    ? fs.readFileSync(envExamplePath, "utf8")
    : defaultEnvSource();
  const env = applyEnvReplacements(source, replacements);
  if (!dryRun) {
    ensureDir(path.dirname(outEnvPath));
    writeText(outEnvPath, env);
  }

  const missing = REQUIRED_CONTEXT_KEYS
    .filter((key) => !replacements[key]);
  const warnings = [...contextWarnings, ...contextReplyIssues];
  const report = buildConfigureReport({
    packagePath,
    contextPath,
    outEnvPath,
    dryRun,
    strict,
    replacements,
    sourceByKey,
    missing,
    contextReply,
    contextReplyIssues,
    generatedKeys,
    preservedKeys,
    warnings,
  });
  writeJson(reportPath, report);
  writeText(reportPath.replace(/\.json$/i, ".md") === reportPath ? `${reportPath}.md` : reportPath.replace(/\.json$/i, ".md"), buildConfigureMarkdown(report));

  console.log(`Context file used: ${contextPath}`);
  if (dryRun) {
    console.log(`Dry run: runtime env not written. Would write to ${outEnvPath}`);
  } else {
    console.log(`Runtime env written to ${outEnvPath}`);
  }
  console.log(`Configure report written to ${reportPath}`);
  if (preservedKeys.length) {
    console.log(`Preserved existing .env values for blank context fields: ${preservedKeys.join(", ")}`);
  }
  if (generatedKeys.includes("DEBUG_ACCESS_TOKEN")) {
    console.log(dryRun
      ? "Dry run would generate DEBUG_ACCESS_TOKEN because PUBLIC_CALLBACK_BASE_URL is set while debug endpoints are enabled. Secret value was not printed."
      : "Generated DEBUG_ACCESS_TOKEN because PUBLIC_CALLBACK_BASE_URL is set while debug endpoints are enabled. Secret value was written to .env and not printed.");
  }
  if (contextReply.local_json_present) {
    console.log(`Context reply local JSON: ${contextReply.local_json_file} (answered=${contextReply.answered_questions}/${contextReply.total_questions}, blockers=${contextReply.blocked_count})`);
  }
  for (const warning of warnings) {
    console.log(`Warning: ${warning}`);
  }
  if (missing.length) {
    console.log(`Missing values still need to be filled: ${missing.join(", ")}`);
  } else {
    console.log("All required MVP context values were written. Secrets were not printed.");
  }
  if (strict && missing.length) {
    console.error(`Configure strict mode failed: missing required values ${missing.join(", ")}.`);
    process.exitCode = 1;
  }
  if (strict && contextReplyIssues.length) {
    console.error(`Configure strict mode failed: context reply issues ${contextReplyIssues.join("; ")}.`);
    process.exitCode = 1;
  }
}

function applyEnvReplacements(source: string, replacements: Record<string, string>): string {
  const seen = new Set<string>();
  const lines = source.split(/\r?\n/).map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match) return line;
    const key = match[1];
    if (!(key in replacements)) return line;
    seen.add(key);
    return `${key}=${escapeEnvValue(replacements[key])}`;
  });

  for (const [key, value] of Object.entries(replacements)) {
    if (!seen.has(key)) {
      lines.push(`${key}=${escapeEnvValue(value)}`);
    }
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function preserveExistingValues(
  replacements: Record<string, string>,
  existingEnv: Record<string, string>,
): { replacements: Record<string, string>; preservedKeys: string[] } {
  const merged = { ...replacements };
  const preservedKeys: string[] = [];
  for (const key of Object.keys(merged)) {
    const existingValue = configuredValue(existingEnv[key]);
    if (!merged[key] && existingValue) {
      merged[key] = existingValue;
      preservedKeys.push(key);
    }
  }
  return { replacements: merged, preservedKeys };
}

function applyPublicDebugProtections(replacements: Record<string, string>): string[] {
  const generated: string[] = [];
  const publicCallbackBaseUrl = replacements.PUBLIC_CALLBACK_BASE_URL || "";
  const allowDebug = replacements.ALLOW_DEBUG_WITHOUT_FEISHU === "1";
  if (publicCallbackBaseUrl && allowDebug && !replacements.DEBUG_ACCESS_TOKEN) {
    replacements.DEBUG_ACCESS_TOKEN = crypto.randomBytes(32).toString("hex");
    generated.push("DEBUG_ACCESS_TOKEN");
  }
  return generated;
}

function buildSourceMap(
  context: FeishuContext,
  runtime: NormalizedRuntimeConfig,
  testChatId: string,
  publicCallbackBaseUrl: string,
  targetBaseUrl: string,
  contextReplyPublicValues: ConfigureContextReplyPublicValues,
): Record<string, ConfigureValueSource> {
  const runtimeConfig = context.runtime_config || {};
  return {
    APP_ID: configuredValue(context.feishu_app?.app_id) ? "context" : "missing",
    APP_SECRET: configuredValue(context.feishu_app?.app_secret) ? "context" : "missing",
    VERIFICATION_TOKEN: configuredValue(context.feishu_app?.verification_token) ? "context" : "missing",
    ENCRYPT_KEY: configuredValue(context.feishu_app?.encrypt_key) ? "context" : "missing",
    TEST_CHAT_ID: sourceFromContextOrReply(context.feishu_app?.test_chat_id, contextReplyPublicValues.testChatId, testChatId),
    PUBLIC_CALLBACK_BASE_URL: sourceFromContextOrReply(context.feishu_app?.public_callback_base_url, contextReplyPublicValues.publicCallbackBaseUrl, publicCallbackBaseUrl),
    IMAGE_AGENT_BASE_URL: sourceFromContextOrReply(context.target_service?.base_url, contextReplyPublicValues.targetBaseUrl, targetBaseUrl),
    HOST: runtimeConfig.host === undefined || isPlaceholderValue(runtimeConfig.host) ? "default" : "context",
    PORT: runtimeConfig.port === undefined ? "default" : "context",
    UPLOAD_IMAGE_TO_LARK: runtimeConfig.upload_image_to_lark === undefined ? "default" : "context",
    IMAGE_AGENT_TIMEOUT_MS: runtimeConfig.target_timeout_seconds === undefined ? "default" : "context",
    CARD_ACTION_MODE: runtimeConfig.card_action_mode === undefined || isPlaceholderValue(runtimeConfig.card_action_mode) ? "default" : "context",
    FEISHU_OPENAPI_BASE_URL: runtime.feishuOpenApiBaseUrl ? "context" : "missing",
    DEBUG_ACCESS_TOKEN: runtime.debugAccessToken ? "context" : "missing",
    ALLOWED_OPERATOR_OPEN_IDS: runtime.allowedOperatorOpenIds ? "context" : "missing",
    ALLOW_DEBUG_WITHOUT_FEISHU: runtimeConfig.allow_debug_without_feishu === undefined ? "default" : "context",
  };
}

function sourceFromContextOrReply(contextValue: unknown, replyValue: string, resolvedValue: string): ConfigureValueSource {
  if (configuredValue(contextValue)) return "context";
  if (replyValue && resolvedValue) return "context_reply";
  return "missing";
}

function contextReplyPublicFieldForConfigureKey(key: string): string {
  if (key === "TEST_CHAT_ID") return "test_chat_id";
  if (key === "PUBLIC_CALLBACK_BASE_URL") return "public_callback_base_url";
  if (key === "IMAGE_AGENT_BASE_URL") return "target_base_url";
  return "";
}

function finalizeSourceMap(
  sourceByKey: Record<string, ConfigureValueSource>,
  replacements: Record<string, string>,
  preservedKeys: string[],
  generatedKeys: string[],
): Record<string, ConfigureValueSource> {
  const finalized: Record<string, ConfigureValueSource> = { ...sourceByKey };
  for (const key of preservedKeys) {
    finalized[key] = "env";
  }
  for (const key of generatedKeys) {
    finalized[key] = "generated";
  }
  for (const key of Object.keys(replacements)) {
    if (!replacements[key] && !OPTIONAL_KEYS.has(key)) {
      finalized[key] = "missing";
    }
  }
  return finalized;
}

function buildConfigureContextReplyReport(packagePath: string): ConfigureContextReplyReport {
  const templateFile = path.join(packagePath, "feishu_context.reply.template.json");
  const localJsonFile = path.join(packagePath, "feishu_context.reply.local.json");
  const localMarkdownFile = path.join(packagePath, "feishu_context.reply.local.md");
  const expectedPermissionConfirmations = readPermissionConfirmationItems(templateFile);
  const base: ConfigureContextReplyReport = {
    template_file: templateFile,
    template_present: fs.existsSync(templateFile),
    local_json_file: localJsonFile,
    local_json_present: fs.existsSync(localJsonFile),
    local_markdown_file: localMarkdownFile,
    local_markdown_present: fs.existsSync(localMarkdownFile),
    parse_error: "",
    answered_questions: 0,
    total_questions: 0,
    negative_answers: [],
    permission_status_counts: {
      unknown: 0,
      confirmed: 0,
      blocked: 0,
      not_needed: 0,
    },
    permission_confirmation_count: 0,
    expected_permission_confirmation_count: expectedPermissionConfirmations.length,
    missing_permission_confirmations: [],
    blocked_count: 0,
    secure_secret_channel_present: false,
    public_value_fields: [],
    used_public_value_fields: [],
    ready_for_local_configure: false,
  };

  if (!base.local_json_present) return base;

  try {
    const parsed = readJsonFile<unknown>(localJsonFile);
    const reply = isRecord(parsed) ? parsed : {};
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
      answered_questions: answeredQuestions,
      total_questions: answerEntries.length,
      negative_answers: negativeAnswers,
      permission_status_counts: permissionStatusCounts,
      permission_confirmation_count: permissionConfirmationItems.length,
      expected_permission_confirmation_count: expectedPermissionConfirmations.length,
      missing_permission_confirmations: missingPermissionConfirmations,
      blocked_count: blockedCount,
      secure_secret_channel_present: secureSecretChannelPresent,
      public_value_fields: publicValueFields,
      ready_for_local_configure: answeredQuestions > 0
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
      parse_error: error instanceof Error ? error.message : String(error),
    };
  }
}

function readConfigureContextReplyPublicValues(reply: ConfigureContextReplyReport): ConfigureContextReplyPublicValues {
  const empty = {
    testChatId: "",
    publicCallbackBaseUrl: "",
    targetBaseUrl: "",
  };
  if (!reply.local_json_present || reply.parse_error) return empty;

  try {
    const parsed = readJsonFile<unknown>(reply.local_json_file);
    if (!isRecord(parsed) || !isRecord(parsed.public_values)) return empty;
    return {
      testChatId: configuredValue(parsed.public_values.test_chat_id),
      publicCallbackBaseUrl: configuredValue(parsed.public_values.public_callback_base_url),
      targetBaseUrl: configuredValue(parsed.public_values.target_base_url),
    };
  } catch {
    return empty;
  }
}

function buildContextReplyStrictIssues(reply: ConfigureContextReplyReport): string[] {
  if (!reply.local_json_present) return [];
  const issues: string[] = [];
  if (reply.parse_error) {
    issues.push(`feishu_context.reply.local.json is invalid: ${reply.parse_error}`);
  }
  if (reply.blocked_count || reply.permission_status_counts.blocked || reply.negative_answers.length) {
    issues.push(`owner reply reports blockers: blocked_by=${reply.blocked_count}, blocked_permissions=${reply.permission_status_counts.blocked}, negative_answers=${reply.negative_answers.length}`);
  }
  if (reply.permission_status_counts.unknown || reply.missing_permission_confirmations.length) {
    issues.push(`owner reply has unconfirmed permissions: unknown_permissions=${reply.permission_status_counts.unknown}, missing_permissions=${reply.missing_permission_confirmations.length}`);
  }
  if (!reply.secure_secret_channel_present) {
    issues.push("owner reply has no secure_secret_channel for Feishu secrets");
  }
  return issues;
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

function countPermissionReplyStatuses(value: unknown): ConfigureContextReplyReport["permission_status_counts"] {
  const counts: ConfigureContextReplyReport["permission_status_counts"] = {
    unknown: 0,
    confirmed: 0,
    blocked: 0,
    not_needed: 0,
  };
  if (!Array.isArray(value)) return counts;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const status = item.status;
    if (status === "confirmed") counts.confirmed += 1;
    else if (status === "blocked") counts.blocked += 1;
    else if (status === "not_needed") counts.not_needed += 1;
    else counts.unknown += 1;
  }
  return counts;
}

function countNonEmptyStrings(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((item) => Boolean(configuredValue(item))).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function buildConfigureReport(context: {
  packagePath: string;
  contextPath: string;
  outEnvPath: string;
  dryRun: boolean;
  strict: boolean;
  replacements: Record<string, string>;
  sourceByKey: Record<string, ConfigureValueSource>;
  missing: readonly string[];
  contextReply: ConfigureContextReplyReport;
  contextReplyIssues: string[];
  generatedKeys: string[];
  preservedKeys: string[];
  warnings: string[];
}): ConfigureReport {
  return {
    schema_version: "0.1",
    generated_at: new Date().toISOString(),
    package_path: context.packagePath,
    context_file: context.contextPath,
    env_file: context.outEnvPath,
    dry_run: context.dryRun,
    strict: context.strict,
    missing_required_values: [...context.missing],
    strict_context_reply_issues: context.contextReplyIssues,
    generated_values: context.generatedKeys,
    preserved_values: context.preservedKeys,
    warnings: context.warnings,
    context_reply: context.contextReply,
    rows: Object.keys(context.replacements).map((key) => buildConfigureRow(key, context.replacements[key], context.sourceByKey[key] || "missing")),
  };
}

function buildConfigureRow(key: string, value: string, source: ConfigureValueSource): ConfigureReportRow {
  const required = REQUIRED_CONTEXT_KEYS.includes(key as typeof REQUIRED_CONTEXT_KEYS[number]);
  const optional = OPTIONAL_KEYS.has(key);
  return {
    key,
    status: value ? "provided" : optional ? "optional" : "missing",
    source: value ? source : "missing",
    secret: SECRET_KEYS.has(key),
    required_for_level_2: required,
    note: CONFIGURE_KEY_NOTES[key] || "",
  };
}

function buildConfigureMarkdown(report: ConfigureReport): string {
  const missing = report.missing_required_values.length
    ? report.missing_required_values.map((item) => `\`${item}\``).join(", ")
    : "none";
  const generated = report.generated_values.length
    ? report.generated_values.map((item) => `\`${item}\``).join(", ")
    : "none";
  const preserved = report.preserved_values.length
    ? report.preserved_values.map((item) => `\`${item}\``).join(", ")
    : "none";
  const contextReplyIssues = report.strict_context_reply_issues.length
    ? report.strict_context_reply_issues.map((item) => `- ${item}`).join("\n")
    : "- none";
  const warnings = report.warnings.length ? report.warnings.map((item) => `- ${item}`).join("\n") : "- none";
  const rows = report.rows
    .map((row) => `| \`${row.key}\` | ${row.status} | ${row.source} | ${row.secret ? "yes" : "no"} | ${row.required_for_level_2 ? "yes" : "no"} | ${escapeMarkdownTableCell(row.note)} |`)
    .join("\n");
  const contextReplyRows = [
    ["Template present", report.context_reply.template_present ? "yes" : "no"],
    ["Local JSON present", report.context_reply.local_json_present ? "yes" : "no"],
    ["Local Markdown present", report.context_reply.local_markdown_present ? "yes" : "no"],
    ["Parse status", report.context_reply.parse_error ? `invalid: ${report.context_reply.parse_error}` : "ok"],
    ["Answered questions", `${report.context_reply.answered_questions}/${report.context_reply.total_questions}`],
    ["Negative answers", inlineList(report.context_reply.negative_answers)],
    ["Permission statuses", `confirmed=${report.context_reply.permission_status_counts.confirmed}, blocked=${report.context_reply.permission_status_counts.blocked}, unknown=${report.context_reply.permission_status_counts.unknown}, not_needed=${report.context_reply.permission_status_counts.not_needed}`],
    ["Permission confirmations", `${report.context_reply.permission_confirmation_count}/${report.context_reply.expected_permission_confirmation_count}`],
    ["Missing permission confirmations", inlineList(report.context_reply.missing_permission_confirmations)],
    ["Blocked-by entries", String(report.context_reply.blocked_count)],
    ["Secure secret channel recorded", report.context_reply.secure_secret_channel_present ? "yes" : "no"],
    ["Public value fields filled", inlineList(report.context_reply.public_value_fields)],
    ["Public value fields used for configure", inlineList(report.context_reply.used_public_value_fields)],
    ["Ready for local configure intake", report.context_reply.ready_for_local_configure ? "yes" : "no"],
  ].map(([item, value]) => `| ${item} | ${escapeMarkdownTableCell(String(value))} |`).join("\n");

  return `# Configure Report

This report shows where configuration values came from without printing secret values.

- Generated at: ${report.generated_at}
- Package: ${report.package_path}
- Context file: ${report.context_file}
- Env file ${report.dry_run ? "would be written" : "written"}: ${report.env_file}
- Dry run: ${report.dry_run ? "yes" : "no"}
- Strict mode: ${report.strict ? "yes" : "no"}
- Missing required values: ${missing}
- Strict context reply issues: ${report.strict_context_reply_issues.length ? report.strict_context_reply_issues.length : "none"}
- Generated values: ${generated}
- Preserved existing env values: ${preserved}

## Values

| Key | Status | Source | Secret | Required for Level 2 | Note |
| --- | --- | --- | --- | --- | --- |
${rows}

## Context Reply Intake

The local owner reply may include internal contact or deployment context. This report only shows counts and field names, not reply values.

| Item | Status |
| --- | --- |
${contextReplyRows}

### Strict Context Reply Issues

${contextReplyIssues}

## Warnings

${warnings}
`;
}

function inlineList(values: string[]): string {
  return values.length ? values.map((item) => `\`${item}\``).join(", ") : "none";
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function parseEnvFile(source: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index);
    env[key] = unquoteEnvValue(trimmed.slice(index + 1));
  }
  return env;
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function escapeEnvValue(value: string): string {
  if (!value) return "";
  if (/[\s#"'=]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function normalizeRuntimeConfig(runtime: NonNullable<FeishuContext["runtime_config"]>): NormalizedRuntimeConfig {
  return {
    host: stringValue(runtime.host, "runtime_config.host", "0.0.0.0"),
    port: portValue(runtime.port, "runtime_config.port", "3978"),
    uploadImageToLark: envFlag(runtime.upload_image_to_lark, "runtime_config.upload_image_to_lark", "1"),
    imageAgentTimeoutMs: timeoutMsValue(runtime.target_timeout_seconds, "runtime_config.target_timeout_seconds", "120000"),
    cardActionMode: cardActionModeValue(runtime.card_action_mode, "runtime_config.card_action_mode"),
    feishuOpenApiBaseUrl: requireHttpBaseUrl(
      stringValue(runtime.feishu_openapi_base_url, "runtime_config.feishu_openapi_base_url", ""),
      "runtime_config.feishu_openapi_base_url",
    ),
    debugAccessToken: stringValue(runtime.debug_access_token, "runtime_config.debug_access_token", ""),
    allowedOperatorOpenIds: stringListValue(runtime.allowed_operator_open_ids, "runtime_config.allowed_operator_open_ids").join(","),
    allowDebugWithoutFeishu: envFlag(runtime.allow_debug_without_feishu, "runtime_config.allow_debug_without_feishu", "1"),
  };
}

function stringValue(value: unknown, key: string, defaultValue: string): string {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string.`);
  }
  return configuredValue(value) || defaultValue;
}

function portValue(value: unknown, key: string, defaultValue: string): string {
  if (value === undefined || value === null || value === "" || isPlaceholderValue(value)) return defaultValue;
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : NaN;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${key} must be an integer between 1 and 65535.`);
  }
  return String(parsed);
}

function timeoutMsValue(value: unknown, key: string, defaultValue: string): string {
  if (value === undefined || value === null || value === "" || isPlaceholderValue(value)) return defaultValue;
  const seconds = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : NaN;
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
    throw new Error(`${key} must be an integer between 1 and 3600 seconds.`);
  }
  return String(seconds * 1000);
}

function envFlag(value: unknown, key: string, defaultValue: "0" | "1"): string {
  if (value === undefined || isPlaceholderValue(value)) return defaultValue;
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "1" || normalized === "true") return "1";
    if (normalized === "0" || normalized === "false") return "0";
  }
  throw new Error(`${key} must be a boolean, "1", "0", "true", or "false".`);
}

function cardActionModeValue(value: unknown, key: string): "sync" | "async" {
  if (value === undefined || value === null || value === "" || isPlaceholderValue(value)) return "sync";
  if (value === "sync" || value === "async") return value;
  throw new Error(`${key} must be "sync" or "async".`);
}

function stringListValue(value: unknown, key: string): string[] {
  if (value === undefined || value === null || value === "" || isPlaceholderValue(value)) return [];
  if (typeof value === "string") {
    return value.split(",").map((item) => configuredValue(item)).filter(Boolean);
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.map((item) => configuredValue(item)).filter(Boolean);
  }
  throw new Error(`${key} must be an array of strings or a comma-separated string.`);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function defaultEnvSource(): string {
  return `APP_ID=
APP_SECRET=
VERIFICATION_TOKEN=
ENCRYPT_KEY=
TEST_CHAT_ID=
PUBLIC_CALLBACK_BASE_URL=
IMAGE_AGENT_BASE_URL=
IMAGE_AGENT_TIMEOUT_MS=120000
HOST=127.0.0.1
PORT=3978
UPLOAD_IMAGE_TO_LARK=1
CARD_ACTION_MODE=sync
FEISHU_OPENAPI_BASE_URL=
DEBUG_ACCESS_TOKEN=
ALLOWED_OPERATOR_OPEN_IDS=
ALLOW_DEBUG_WITHOUT_FEISHU=0
`;
}
