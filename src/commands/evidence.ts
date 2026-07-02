import fs from "node:fs";
import path from "node:path";
import { getStringOption, hasOption } from "../args.js";
import { readEnvFileIfExists } from "../env-utils.js";
import { readJsonFile, writeText } from "../fs-utils.js";
import { getJsonWithTimeout, normalizeBaseUrl } from "../http-utils.js";
import { configuredValue } from "../placeholder-utils.js";
import type { RequiredPermissions, ServiceManifest } from "../types.js";

type EvidenceStatus = "SUPPORTED" | "PENDING" | "FAIL";

interface VerificationReport {
  generated_at?: string;
  status?: "pass" | "warn" | "fail";
  context?: {
    packagePath?: string;
    envPath?: string;
    runtimeUrl?: string;
    simulate?: boolean;
    sendStartCard?: boolean;
    level2?: boolean;
    targetBaseUrl?: string;
  };
  checks?: VerificationCheck[];
}

interface VerificationCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

interface AuditEvent {
  ts?: string;
  time?: string;
  trace_id?: string;
  event?: string;
  detail?: Record<string, unknown>;
}

interface EvidenceRow {
  item: string;
  status: EvidenceStatus;
  source: string;
  note: string;
}

interface RecordUpdate {
  field: string;
  value: string;
  source: string;
  redactInDraft?: boolean;
}

interface ManualEvidenceValues {
  date?: string;
  operator?: string;
  feishuAppName?: string;
  testChat?: string;
  startMessageId?: string;
  resultMessageId?: string;
  resultScreenshot?: string;
  generatedImage?: string;
  generatedImageUrl?: string;
  generatedImageKey?: string;
  batchId?: string;
  batchStatusMessageId?: string;
  batchStatusScreenshot?: string;
  batchDownloadUrl?: string;
  batchDownloadScreenshot?: string;
  traceId?: string;
  notes?: string;
}

interface ManualEvidenceSource {
  values: ManualEvidenceValues;
  source: string;
  baseDir: string;
}

interface EvidenceDraft {
  generatedAt: string;
  packagePath: string;
  envPath: string;
  reportPath: string;
  auditPath: string;
  auditSource: string;
  service: ServiceManifest;
  permissions: RequiredPermissions;
  env: Record<string, string>;
  report?: VerificationReport;
  auditEvents: AuditEvent[];
  preflightRows: EvidenceRow[];
  interactionRows: EvidenceRow[];
  failureRows: EvidenceRow[];
  artifactRows: EvidenceRow[];
}

export async function evidenceCommand(args: string[], options: Record<string, string | boolean>): Promise<void> {
  const packageArg = args[0];
  if (!packageArg) {
    throw new Error("Usage: lark-deployer evidence <generated-package> [--env <file>] [--report <file>] [--audit <file>] [--runtime-url <url>] [--out <file>] [--update-record] [--manual-evidence <file>] [--start-message-id <id>] [--result-message-id <id>] [--result-screenshot <path-or-url>] [--generated-image-url <url>] [--generated-image-key <key>] [--batch-id <id>] [--batch-status-message-id <id>] [--batch-status-screenshot <path-or-url>] [--batch-download-url <url>] [--batch-download-screenshot <path-or-url>] [--trace-id <id>]");
  }

  const packagePath = path.resolve(packageArg);
  const draft = await buildEvidenceDraft(packagePath, options);
  const manualUpdates = buildManualRecordUpdates(packagePath, options);
  const outPath = path.resolve(getStringOption(options, "out", path.join(packagePath, "level2_evidence_draft.md")));
  writeText(outPath, buildEvidenceMarkdown(draft, manualUpdates));
  const updateRecord = hasOption(options, "update-record") || hasOption(options, "updateRecord");
  const recordUpdate = updateRecord ? updateLevel2Record(draft, manualUpdates) : undefined;
  printEvidenceSummary(draft, outPath);
  if (recordUpdate) {
    console.log(`Level 2 record updated: ${recordUpdate.applied.length ? recordUpdate.applied.join(", ") : "none"}`);
    if (recordUpdate.skipped.length) {
      console.log(`Level 2 record preserved existing fields: ${recordUpdate.skipped.join(", ")}`);
    }
  }
}

async function buildEvidenceDraft(packagePath: string, options: Record<string, string | boolean>): Promise<EvidenceDraft> {
  const manifestDir = path.join(packagePath, "manifest");
  const service = readJsonFile<ServiceManifest>(path.join(manifestDir, "service_manifest.json"));
  const permissions = readJsonFile<RequiredPermissions>(path.join(manifestDir, "required_permissions.json"));
  const envPath = path.resolve(getStringOption(options, "env", path.join(packagePath, "bot-runtime", ".env")));
  const reportPath = path.resolve(getStringOption(options, "report", path.join(packagePath, "verification_report.json")));
  const auditPath = path.resolve(getStringOption(options, "audit", path.join(packagePath, "bot-runtime", "audit.log")));
  const runtimeUrl = normalizeBaseUrl(getStringOption(options, "runtime-url", ""));
  const env = readEnvFileIfExists(envPath);
  const report = readOptionalJson<VerificationReport>(reportPath);
  const audit = await readAuditEvents(auditPath, runtimeUrl, env.DEBUG_ACCESS_TOKEN || process.env.DEBUG_ACCESS_TOKEN || "");
  const checks = new Map((report?.checks || []).map((check) => [check.name, check]));

  return {
    generatedAt: new Date().toISOString(),
    packagePath,
    envPath,
    reportPath,
    auditPath,
    auditSource: audit.source,
    service,
    permissions,
    env,
    report,
    auditEvents: audit.events,
    preflightRows: buildPreflightRows(checks, report),
    interactionRows: buildInteractionRows(checks, audit.events, audit.source, service),
    failureRows: buildFailureRows(checks, audit.events, audit.source),
    artifactRows: buildArtifactRows(packagePath, reportPath, auditPath, audit.source, audit.events, checks),
  };
}

function readOptionalJson<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  return readJsonFile<T>(filePath);
}

async function readAuditEvents(
  filePath: string,
  runtimeUrl: string,
  debugAccessToken: string,
): Promise<{ events: AuditEvent[]; source: string }> {
  if (runtimeUrl) {
    const remote = await readRemoteAuditEvents(runtimeUrl, debugAccessToken);
    if (remote.events.length || remote.checked) {
      return {
        events: remote.events,
        source: `${runtimeUrl}/debug/audit-tail`,
      };
    }
  }
  return {
    events: readAuditEventsFromFile(filePath),
    source: filePath,
  };
}

async function readRemoteAuditEvents(
  runtimeUrl: string,
  debugAccessToken: string,
): Promise<{ events: AuditEvent[]; checked: boolean }> {
  const headers = buildDebugHeaders(debugAccessToken);
  const probe = await getJsonWithTimeout(`${runtimeUrl}/debug/audit-tail?limit=100`, 5000, headers);
  if (probe.status !== "available") return { events: [], checked: false };
  const body = isRecord(probe.data) ? probe.data : {};
  const events = Array.isArray(body.events)
    ? body.events.filter(isRecord).map((event) => event as AuditEvent)
    : [];
  return { events, checked: true };
}

function readAuditEventsFromFile(filePath: string): AuditEvent[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        return isRecord(parsed) ? parsed as AuditEvent : undefined;
      } catch {
        return undefined;
      }
    })
    .filter((event): event is AuditEvent => Boolean(event));
}

function buildDebugHeaders(debugAccessToken: string): Record<string, string> {
  if (!debugAccessToken) return {};
  return {
    authorization: `Bearer ${debugAccessToken}`,
    "x-lark-deployer-debug-token": debugAccessToken,
  };
}

function buildPreflightRows(checks: Map<string, VerificationCheck>, report: VerificationReport | undefined): EvidenceRow[] {
  const noFailChecks = report?.checks?.filter((check) => check.status === "fail") || [];
  return [
    rowFromCheck(checks, "target:/api/meta", "`GET <target_base_url>/api/meta` succeeds from the bot runtime environment."),
    rowFromCheck(checks, "runtime:/health", "`GET <bot_runtime_url>/health` succeeds."),
    rowFromCheck(checks, "runtime:/webhook/card:challenge", "Local `/webhook/card` answers a `url_verification` challenge."),
    rowFromCheck(checks, "callback:/webhook/card:public-challenge", "Public `/webhook/card` answers a `url_verification` challenge."),
    rowFromAnyChecks(checks, ["runtime:/webhook/card:signed-action", "callback:/webhook/card:public-signed-action"], "Signed card-action payloads return success cards when `VERIFICATION_TOKEN` is set."),
    rowFromAnyChecks(checks, ["runtime:/webhook/card:encrypted-challenge", "callback:/webhook/card:public-encrypted-challenge"], "Encrypted `url_verification` challenges succeed when `ENCRYPT_KEY` is enabled.", true),
    rowFromCheck(checks, "runtime:/debug/simulate-generate", "`POST <bot_runtime_url>/debug/simulate-generate` succeeds."),
    rowFromCheck(checks, "runtime:/debug/simulate-card-action", "`POST <bot_runtime_url>/debug/simulate-card-action` succeeds."),
    rowFromAnyChecks(checks, [
      "runtime:/debug/simulate-card-action",
      "runtime:/debug/simulate-card-action:v2",
      "runtime:/debug/simulate-card-action:iterate",
      "runtime:/debug/simulate-card-action:batch",
      "runtime:/debug/simulate-card-action:batch-refresh",
      "runtime:/debug/simulate-card-action:invalid-input",
    ], "`verify --simulate` records card-action, v2 card-action, iterate, batch, batch-refresh, and invalid-input checks."),
    {
      item: "`verify --level2` succeeds.",
      status: report?.context?.level2 && report.status === "pass" ? "SUPPORTED" : report?.context?.level2 && report.status === "fail" ? "FAIL" : "PENDING",
      source: "verification_report.json",
      note: report?.context?.level2 ? `Level 2 mode was run with report status ${report.status || "unknown"}.` : "Latest report was not generated with `--level2`.",
    },
    {
      item: "`verification_report.md` has no FAIL checks.",
      status: report ? noFailChecks.length ? "FAIL" : "SUPPORTED" : "PENDING",
      source: "verification_report.json",
      note: report ? `${noFailChecks.length} FAIL checks found.` : "No verification report found.",
    },
  ];
}

function buildInteractionRows(
  checks: Map<string, VerificationCheck>,
  auditEvents: AuditEvent[],
  auditSource: string,
  service: ServiceManifest,
): EvidenceRow[] {
  return [
    rowFromCheck(checks, "runtime:/debug/start-card", "`POST <bot_runtime_url>/debug/start-card` returns success."),
    rowFromCheck(checks, "runtime:/debug/start-card", "`/debug/start-card` response does not contain a non-zero Feishu OpenAPI `code`."),
    pendingManual("Test chat receives the start card.", "Needs real Feishu chat observation or screenshot."),
    pendingManual("Start card shows expected template fields from `manifest/image_agent_meta.snapshot.json`.", "Needs real Feishu card observation."),
    pendingManual("Start card shows `Size`, optional `Message`, and batch items JSON inputs.", "Needs real Feishu card observation."),
    pendingManual("Operator submits a valid card form in Feishu.", "Needs real Feishu click evidence."),
    rowFromAudit(auditEvents, auditSource, "card_action_received", "Bot runtime receives the card callback."),
    rowFromAudit(auditEvents, auditSource, "card_action_received", "Bot runtime writes an audit event with `card_action_received`."),
    rowFromAudit(auditEvents, auditSource, "card_action_duplicate", "Repeating the same card action immediately writes `card_action_duplicate` and does not call the target service twice.", "Only required when duplicate-action behavior is observed."),
    rowFromAudit(auditEvents, auditSource, "generation_started", `Bot runtime calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/generate\`.`),
    rowFromAudit(auditEvents, auditSource, "generation_started", "Submitted field, size, and message values appear in target request or output behavior.", "Review the `generation_started` audit detail for submitted preset values."),
    rowFromAudit(auditEvents, auditSource, "generation_succeeded", "Target service returns `image_url`.", "Audit should include `imageUrl` in `generation_succeeded`."),
    rowFromAnyAudit(auditEvents, auditSource, ["generation_succeeded", "image_upload_failed"], "Bot runtime uploads image to Feishu or records fallback URL."),
    pendingManual("Test chat card updates to success.", "Needs real Feishu result-card observation or screenshot."),
    pendingManual("Success card shows `Feedback` input and `Iterate image` action when `session_id` is present.", "Needs real Feishu result-card observation or screenshot."),
    rowFromCheck(checks, "runtime:/debug/simulate-card-action:iterate", "Local simulation submits feedback and calls the iteration action."),
    rowFromAudit(auditEvents, auditSource, "iteration_started", `Bot runtime calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/iterate\`.`),
    rowFromAudit(auditEvents, auditSource, "iteration_succeeded", "Target service returns an iterated image result.", "Audit should include `imageUrl` in `iteration_succeeded`."),
    rowFromCheck(checks, "runtime:/debug/simulate-card-action:batch", "Local simulation submits a batch job and receives a progress/result card."),
    rowFromAudit(auditEvents, auditSource, "batch_started", `Bot runtime calls \`${service.service.base_url || "<IMAGE_AGENT_BASE_URL>"}/api/batch\`.`),
    rowFromAudit(auditEvents, auditSource, "batch_status_checked", "Bot runtime checks batch progress/status.", "Audit should include batch id, done, total, completed, and failed counts."),
    rowFromCheck(checks, "runtime:/debug/simulate-card-action:batch-refresh", "Local simulation refreshes a batch progress card by batch id."),
    rowFromAnyAudit(auditEvents, auditSource, ["batch_completed", "batch_failed", "batch_status_checked"], "Batch progress card includes refresh state and final download evidence when available."),
    pendingManual("Real Feishu batch card shows progress and refresh action.", "Needs real Feishu card observation or screenshot."),
    pendingManual("Completed Feishu batch card shows the download link when completed images exist.", "Needs real Feishu card observation or screenshot."),
    rowFromAudit(auditEvents, auditSource, "message_patch_succeeded", "If `CARD_ACTION_MODE=async`, `bot-runtime/audit.log` includes `message_patch_succeeded`.", "Only required for async mode."),
    rowFromAudit(auditEvents, auditSource, "generation_succeeded", "Success card includes trace ID and result summary.", "Audit trace id can be matched to the returned card or screenshot."),
  ];
}

function buildFailureRows(checks: Map<string, VerificationCheck>, auditEvents: AuditEvent[], auditSource: string): EvidenceRow[] {
  return [
    rowFromCheck(checks, "runtime:/debug/simulate-card-action:invalid-input", "Invalid card input returns a red failure card and does not call the target service."),
    rowFromAnyAudit(auditEvents, auditSource, ["generation_failed", "debug_simulate_failed", "debug_card_action_failed"], "Missing or invalid target base URL returns a readable failure card.", true),
    rowFromAnyAudit(auditEvents, auditSource, ["generation_failed", "debug_simulate_failed", "debug_card_action_failed"], "Slow or stuck target response returns a readable timeout failure card.", true),
    rowFromAnyChecks(checks, ["runtime:/webhook/card:signed-action"], "Missing Feishu `.env` values are caught before accepting real non-challenge callbacks.", true),
    rowFromAudit(auditEvents, auditSource, "image_upload_failed", "Image upload failure falls back to target output URL when available.", "Only required when upload failure is observed."),
  ];
}

function buildArtifactRows(
  packagePath: string,
  reportPath: string,
  auditPath: string,
  auditSource: string,
  auditEvents: AuditEvent[],
  checks: Map<string, VerificationCheck>,
): EvidenceRow[] {
  const traceIds = Array.from(new Set(auditEvents.map((event) => event.trace_id).filter(Boolean))).slice(-5);
  const startCardMessageId = extractStartCardMessageId(checks, auditEvents);
  const generationResult = extractLatestGenerationResult(auditEvents);
  const batchResult = extractLatestBatchResult(auditEvents);
  return [
    fileRow("`verification_report.md` path", path.join(packagePath, "verification_report.md")),
    auditArtifactRow("`bot-runtime/audit.log` path", auditPath, auditSource, auditEvents),
    {
      item: "Start card message ID.",
      status: startCardMessageId ? "SUPPORTED" : "PENDING",
      source: startCardMessageId ? "runtime:/debug/start-card" : "manual Feishu observation",
      note: startCardMessageId
        ? `message_id=${startCardMessageId}. Copy this into level2_verification_record.md after confirming the card is visible in the test chat.`
        : "Record from `/debug/start-card` response or Feishu chat message metadata.",
    },
    pendingManual("Result card message ID or screenshot.", "Attach or reference the real Feishu result card evidence."),
    {
      item: "Generated image URL or image key.",
      status: generationResult.imageEvidence ? "SUPPORTED" : "PENDING",
      source: auditSource,
      note: generationResult.imageEvidence
        ? `${generationResult.imageEvidence}; trace_id=${generationResult.traceId || "unknown"}.`
        : "No generation_succeeded audit event with imageUrl or imageKey found yet.",
    },
    {
      item: "Trace ID.",
      status: traceIds.length ? "SUPPORTED" : "PENDING",
      source: auditSource,
      note: traceIds.length ? `Recent trace ids: ${traceIds.join(", ")}.` : "No audit trace ids found yet.",
    },
    {
      item: "Batch ID.",
      status: batchResult.batchId ? "SUPPORTED" : "PENDING",
      source: auditSource,
      note: batchResult.batchId ? `batch_id=${batchResult.batchId}; trace_id=${batchResult.traceId || "unknown"}.` : "No batch_status_checked audit event with batchId found yet.",
    },
    pendingManual("Batch status card message ID or screenshot.", "Attach or reference the real Feishu batch progress/status card evidence."),
    {
      item: "Batch download URL or screenshot.",
      status: batchResult.downloadUrl ? "SUPPORTED" : "PENDING",
      source: auditSource,
      note: batchResult.downloadUrl ? `downloadUrl=${batchResult.downloadUrl}; trace_id=${batchResult.traceId || "unknown"}.` : "No completed batch audit event with downloadUrl found yet.",
    },
    fileRow("Package README, deployment checklist, and Level 2 record are present.", path.join(packagePath, "README.md")),
    fileRow("Verification report JSON path", reportPath),
  ];
}

function buildLevel2RecordUpdates(draft: EvidenceDraft): RecordUpdate[] {
  const checks = new Map((draft.report?.checks || []).map((check) => [check.name, check]));
  const startCardMessageId = extractStartCardMessageId(checks, draft.auditEvents);
  const generationResult = extractLatestGenerationResult(draft.auditEvents);
  const batchResult = extractLatestBatchResult(draft.auditEvents);
  const traceIds = Array.from(new Set(draft.auditEvents.map((event) => event.trace_id).filter(Boolean)));
  const latestTraceId = batchResult.traceId || generationResult.traceId || traceIds.at(-1) || "";
  const publicCallbackBaseUrl = draft.env.PUBLIC_CALLBACK_BASE_URL
    ? `${draft.env.PUBLIC_CALLBACK_BASE_URL.replace(/\/+$/, "")}/webhook/card`
    : "";

  return [
    {
      field: "Generated package path",
      value: draft.packagePath,
      source: "evidence package path",
    },
    {
      field: "Bot runtime URL",
      value: draft.report?.context?.runtimeUrl || "",
      source: "verification_report.json",
    },
    {
      field: "Public callback URL",
      value: publicCallbackBaseUrl,
      source: "bot-runtime/.env",
    },
    {
      field: "`verification_report.md` path",
      value: fs.existsSync(path.join(draft.packagePath, "verification_report.md"))
        ? path.join(draft.packagePath, "verification_report.md")
        : "",
      source: "generated package",
    },
    {
      field: "`bot-runtime/audit.log` path",
      value: fs.existsSync(draft.auditPath)
        ? draft.auditPath
        : draft.auditSource !== draft.auditPath && draft.auditEvents.length
          ? draft.auditSource
          : "",
      source: draft.auditSource,
    },
    {
      field: "Start card message ID",
      value: startCardMessageId,
      source: "runtime:/debug/start-card or audit.log",
    },
    {
      field: "Generated image URL or image key",
      value: generationResult.imageEvidence,
      source: "bot-runtime/audit.log",
    },
    {
      field: "Batch ID",
      value: batchResult.batchId,
      source: "bot-runtime/audit.log",
    },
    {
      field: "Batch download URL or screenshot",
      value: batchResult.downloadUrl ? `downloadUrl=${batchResult.downloadUrl}` : "",
      source: "bot-runtime/audit.log",
    },
    {
      field: "Trace ID",
      value: latestTraceId,
      source: "bot-runtime/audit.log",
    },
  ];
}

function buildManualRecordUpdates(packagePath: string, options: Record<string, string | boolean>): RecordUpdate[] {
  const fileInput = readManualEvidenceFile(packagePath, options);
  const cliInput: ManualEvidenceSource = {
    values: readManualEvidenceOptions(options),
    source: "manual CLI options",
    baseDir: process.cwd(),
  };
  const merged = mergeManualEvidence(fileInput, cliInput);
  const resultEvidence = buildResultCardEvidence(merged);
  const generatedImageEvidence = buildGeneratedImageEvidence(merged);
  const batchStatusEvidence = buildBatchStatusEvidence(merged);
  const batchDownloadEvidence = buildBatchDownloadEvidence(merged);
  return [
    {
      field: "Date",
      value: merged.values.date || "",
      source: sourceForManualFields(merged, ["date"]),
    },
    {
      field: "Operator",
      value: merged.values.operator || "",
      source: sourceForManualFields(merged, ["operator"]),
    },
    {
      field: "Feishu app name",
      value: merged.values.feishuAppName || "",
      source: sourceForManualFields(merged, ["feishuAppName"]),
    },
    {
      field: "Test chat",
      value: merged.values.testChat || "",
      source: sourceForManualFields(merged, ["testChat"]),
    },
    {
      field: "Start card message ID",
      value: merged.values.startMessageId || "",
      source: sourceForManualFields(merged, ["startMessageId"]),
    },
    {
      field: "Result card message ID or screenshot",
      value: resultEvidence,
      source: sourceForManualFields(merged, ["resultMessageId", "resultScreenshot"]),
    },
    {
      field: "Generated image URL or image key",
      value: generatedImageEvidence,
      source: sourceForManualFields(merged, ["generatedImage", "generatedImageUrl", "generatedImageKey"]),
    },
    {
      field: "Batch ID",
      value: merged.values.batchId || "",
      source: sourceForManualFields(merged, ["batchId"]),
    },
    {
      field: "Batch status card message ID or screenshot",
      value: batchStatusEvidence,
      source: sourceForManualFields(merged, ["batchStatusMessageId", "batchStatusScreenshot"]),
    },
    {
      field: "Batch download URL or screenshot",
      value: batchDownloadEvidence,
      source: sourceForManualFields(merged, ["batchDownloadUrl", "batchDownloadScreenshot"]),
    },
    {
      field: "Trace ID",
      value: merged.values.traceId || "",
      source: sourceForManualFields(merged, ["traceId"]),
    },
    {
      field: "Notes",
      value: merged.values.notes || "",
      source: sourceForManualFields(merged, ["notes"]),
    },
  ].map((update) => ({
    ...update,
    value: normalizeRecordValue(update.value),
    redactInDraft: true,
  }));
}

function readManualEvidenceFile(packagePath: string, options: Record<string, string | boolean>): ManualEvidenceSource {
  const explicit = optionString(options, ["manual-evidence", "manualEvidence"]);
  const defaultPath = path.join(packagePath, "level2_manual_evidence.local.json");
  const filePath = explicit ? path.resolve(explicit) : fs.existsSync(defaultPath) ? defaultPath : "";
  if (!filePath) {
    return { values: {}, source: "", baseDir: process.cwd() };
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Manual evidence file does not exist: ${filePath}`);
  }
  const parsed = readJsonFile<unknown>(filePath);
  const record = isRecord(parsed) ? parsed : {};
  const valuesRecord = isRecord(record.values) ? record.values : record;
  return {
    values: readManualEvidenceValues(valuesRecord),
    source: `manual evidence file ${filePath}`,
    baseDir: path.dirname(filePath),
  };
}

function readManualEvidenceOptions(options: Record<string, string | boolean>): ManualEvidenceValues {
  return {
    date: optionString(options, ["level2-date", "level2Date", "date"]),
    operator: optionString(options, ["operator"]),
    feishuAppName: optionString(options, ["feishu-app-name", "feishuAppName"]),
    testChat: optionString(options, ["test-chat", "testChat"]),
    startMessageId: optionString(options, ["start-message-id", "startMessageId"]),
    resultMessageId: optionString(options, ["result-message-id", "resultMessageId"]),
    resultScreenshot: optionString(options, ["result-screenshot", "resultScreenshot"]),
    generatedImage: optionString(options, ["generated-image", "generatedImage"]),
    generatedImageUrl: optionString(options, ["generated-image-url", "generatedImageUrl"]),
    generatedImageKey: optionString(options, ["generated-image-key", "generatedImageKey"]),
    batchId: optionString(options, ["batch-id", "batchId"]),
    batchStatusMessageId: optionString(options, ["batch-status-message-id", "batchStatusMessageId"]),
    batchStatusScreenshot: optionString(options, ["batch-status-screenshot", "batchStatusScreenshot"]),
    batchDownloadUrl: optionString(options, ["batch-download-url", "batchDownloadUrl"]),
    batchDownloadScreenshot: optionString(options, ["batch-download-screenshot", "batchDownloadScreenshot"]),
    traceId: optionString(options, ["trace-id", "traceId"]),
    notes: optionString(options, ["notes"]),
  };
}

function readManualEvidenceValues(record: Record<string, unknown>): ManualEvidenceValues {
  return {
    date: recordString(record, ["date", "level2_date"]),
    operator: recordString(record, ["operator"]),
    feishuAppName: recordString(record, ["feishu_app_name", "feishuAppName"]),
    testChat: recordString(record, ["test_chat", "testChat"]),
    startMessageId: recordString(record, ["start_message_id", "startMessageId"]),
    resultMessageId: recordString(record, ["result_message_id", "resultMessageId"]),
    resultScreenshot: recordString(record, ["result_screenshot", "resultScreenshot"]),
    generatedImage: recordString(record, ["generated_image", "generatedImage"]),
    generatedImageUrl: recordString(record, ["generated_image_url", "generatedImageUrl"]),
    generatedImageKey: recordString(record, ["generated_image_key", "generatedImageKey"]),
    batchId: recordString(record, ["batch_id", "batchId"]),
    batchStatusMessageId: recordString(record, ["batch_status_message_id", "batchStatusMessageId"]),
    batchStatusScreenshot: recordString(record, ["batch_status_screenshot", "batchStatusScreenshot"]),
    batchDownloadUrl: recordString(record, ["batch_download_url", "batchDownloadUrl"]),
    batchDownloadScreenshot: recordString(record, ["batch_download_screenshot", "batchDownloadScreenshot"]),
    traceId: recordString(record, ["trace_id", "traceId"]),
    notes: recordString(record, ["notes"]),
  };
}

function recordString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = configuredValue(record[key]);
    if (value) return value;
  }
  return "";
}

function mergeManualEvidence(fileInput: ManualEvidenceSource, cliInput: ManualEvidenceSource): ManualEvidenceSource {
  const values: ManualEvidenceValues = {};
  for (const key of Object.keys({ ...fileInput.values, ...cliInput.values }) as Array<keyof ManualEvidenceValues>) {
    values[key] = cliInput.values[key] || fileInput.values[key] || "";
  }
  return {
    values,
    source: [fileInput.source, hasManualEvidenceValues(cliInput.values) ? cliInput.source : ""].filter(Boolean).join(" + "),
    baseDir: hasManualEvidenceValues(cliInput.values) ? cliInput.baseDir : fileInput.baseDir,
  };
}

function sourceForManualFields(input: ManualEvidenceSource, keys: Array<keyof ManualEvidenceValues>): string {
  const hasValue = keys.some((key) => input.values[key]);
  if (!hasValue) return "manual evidence";
  return input.source || "manual evidence";
}

function hasManualEvidenceValues(values: ManualEvidenceValues): boolean {
  return Object.values(values).some(Boolean);
}

function buildResultCardEvidence(input: ManualEvidenceSource): string {
  const messageId = input.values.resultMessageId || "";
  const screenshot = input.values.resultScreenshot || "";
  return [
    messageId ? `messageId=${messageId}` : "",
    screenshot ? `screenshot=${normalizeEvidencePathOrUrl(screenshot, input.baseDir)}` : "",
  ].filter(Boolean).join("; ");
}

function buildGeneratedImageEvidence(input: ManualEvidenceSource): string {
  const generic = input.values.generatedImage || "";
  const imageUrl = input.values.generatedImageUrl || "";
  const imageKey = input.values.generatedImageKey || "";
  if (generic) return generic;
  return [
    imageUrl ? `imageUrl=${imageUrl}` : "",
    imageKey ? `imageKey=${imageKey}` : "",
  ].filter(Boolean).join("; ");
}

function buildBatchStatusEvidence(input: ManualEvidenceSource): string {
  const messageId = input.values.batchStatusMessageId || "";
  const screenshot = input.values.batchStatusScreenshot || "";
  return [
    messageId ? `messageId=${messageId}` : "",
    screenshot ? `screenshot=${normalizeEvidencePathOrUrl(screenshot, input.baseDir)}` : "",
  ].filter(Boolean).join("; ");
}

function buildBatchDownloadEvidence(input: ManualEvidenceSource): string {
  const downloadUrl = input.values.batchDownloadUrl || "";
  const screenshot = input.values.batchDownloadScreenshot || "";
  return [
    downloadUrl ? `downloadUrl=${downloadUrl}` : "",
    screenshot ? `screenshot=${normalizeEvidencePathOrUrl(screenshot, input.baseDir)}` : "",
  ].filter(Boolean).join("; ");
}

function optionString(options: Record<string, string | boolean>, keys: string[]): string {
  for (const key of keys) {
    const value = configuredValue(getStringOption(options, key, ""));
    if (value) return value;
  }
  return "";
}

function normalizeEvidencePathOrUrl(value: string, baseDir = process.cwd()): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  return path.resolve(baseDir, value);
}

function normalizeRecordValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function updateLevel2Record(draft: EvidenceDraft, manualUpdates: RecordUpdate[] = []): { applied: string[]; skipped: string[] } {
  const recordPath = path.join(draft.packagePath, "level2_verification_record.md");
  if (!fs.existsSync(recordPath)) {
    throw new Error(`Cannot update Level 2 record because it does not exist: ${recordPath}`);
  }

  const original = fs.readFileSync(recordPath, "utf8");
  const result = applyRecordUpdates(original, combinedRecordUpdates(draft, manualUpdates));
  if (result.updated !== original) {
    fs.writeFileSync(recordPath, result.updated, "utf8");
  }
  return {
    applied: result.applied,
    skipped: result.skipped,
  };
}

function combinedRecordUpdates(draft: EvidenceDraft, manualUpdates: RecordUpdate[]): RecordUpdate[] {
  const updates: RecordUpdate[] = [];
  const seen = new Set<string>();
  for (const update of [...manualUpdates, ...buildLevel2RecordUpdates(draft)]) {
    if (!update.value) continue;
    if (seen.has(update.field)) continue;
    seen.add(update.field);
    updates.push(update);
  }
  return updates;
}

function applyRecordUpdates(record: string, updates: RecordUpdate[]): { updated: string; applied: string[]; skipped: string[] } {
  let updated = record;
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const update of updates) {
    if (!update.value) continue;
    const pattern = new RegExp(`^(-[^\\S\\r\\n]*${escapeRegExp(update.field)}:[^\\S\\r\\n]*)([^\\r\\n]*)$`, "im");
    let matched = false;
    updated = updated.replace(pattern, (line, prefix: string, currentValue: string) => {
      matched = true;
      if (recordFieldCanBeFilled(currentValue)) {
        applied.push(update.field);
        return `${prefix.replace(/[^\S\r\n]*$/, " ")}${update.value}`;
      }
      skipped.push(update.field);
      return line;
    });
    if (!matched) {
      continue;
    }
  }

  return { updated, applied, skipped };
}

function recordFieldCanBeFilled(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || !configuredValue(trimmed);
}

function extractStartCardMessageId(checks: Map<string, VerificationCheck>, auditEvents: AuditEvent[]): string {
  const detail = checks.get("runtime:/debug/start-card")?.detail || "";
  const fromReport = firstMatch(detail, [
    /"message_id"\s*:\s*"([^"]+)"/,
    /"messageId"\s*:\s*"([^"]+)"/,
    /"open_message_id"\s*:\s*"([^"]+)"/,
  ]);
  if (fromReport) return fromReport;

  const sentEvent = auditEvents
    .slice()
    .reverse()
    .find((event) => event.event === "start_card_sent" && isRecord(event.detail));
  if (!sentEvent || !isRecord(sentEvent.detail)) return "";
  return typeof sentEvent.detail.messageId === "string" ? sentEvent.detail.messageId : "";
}

function extractLatestGenerationResult(auditEvents: AuditEvent[]): { imageEvidence: string; traceId: string } {
  const latest = auditEvents
    .slice()
    .reverse()
    .find((event) => event.event === "generation_succeeded" && isRecord(event.detail));
  if (!latest || !isRecord(latest.detail)) return { imageEvidence: "", traceId: "" };
  const imageUrl = typeof latest.detail.imageUrl === "string" ? latest.detail.imageUrl : "";
  const imageKey = typeof latest.detail.imageKey === "string" ? latest.detail.imageKey : "";
  const evidence = [
    imageUrl ? `imageUrl=${imageUrl}` : "",
    imageKey ? `imageKey=${imageKey}` : "",
  ].filter(Boolean).join("; ");
  return {
    imageEvidence: evidence,
    traceId: latest.trace_id || "",
  };
}

function extractLatestBatchResult(auditEvents: AuditEvent[]): { batchId: string; downloadUrl: string; traceId: string } {
  const latest = auditEvents
    .slice()
    .reverse()
    .find((event) => (
      (event.event === "batch_completed" || event.event === "batch_status_checked" || event.event === "batch_failed")
      && isRecord(event.detail)
    ));
  if (!latest || !isRecord(latest.detail)) return { batchId: "", downloadUrl: "", traceId: "" };
  return {
    batchId: typeof latest.detail.batchId === "string" ? latest.detail.batchId : "",
    downloadUrl: typeof latest.detail.downloadUrl === "string" ? latest.detail.downloadUrl : "",
    traceId: latest.trace_id || "",
  };
}

function firstMatch(value: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rowFromCheck(checks: Map<string, VerificationCheck>, name: string, item: string): EvidenceRow {
  const check = checks.get(name);
  if (!check) {
    return { item, status: "PENDING", source: name, note: "Check was not present in the latest verification report." };
  }
  return {
    item,
    status: check.status === "pass" ? "SUPPORTED" : check.status === "fail" ? "FAIL" : "PENDING",
    source: name,
    note: check.detail,
  };
}

function rowFromAnyChecks(
  checks: Map<string, VerificationCheck>,
  names: string[],
  item: string,
  optional = false,
): EvidenceRow {
  const present = names.map((name) => checks.get(name)).filter((check): check is VerificationCheck => Boolean(check));
  if (!present.length) {
    return { item, status: optional ? "PENDING" : "PENDING", source: names.join(", "), note: optional ? "Optional or not applicable unless configured." : "No matching checks were present in the latest verification report." };
  }
  if (present.some((check) => check.status === "fail")) {
    return { item, status: "FAIL", source: present.map((check) => check.name).join(", "), note: present.filter((check) => check.status === "fail").map((check) => check.detail).join(" ") };
  }
  if (present.some((check) => check.status === "pass")) {
    return { item, status: "SUPPORTED", source: present.map((check) => check.name).join(", "), note: present.map((check) => `${check.name}=${check.status}`).join("; ") };
  }
  return { item, status: "PENDING", source: present.map((check) => check.name).join(", "), note: present.map((check) => `${check.name}: ${check.detail}`).join(" ") };
}

function rowFromAudit(auditEvents: AuditEvent[], auditSource: string, eventName: string, item: string, note = ""): EvidenceRow {
  const matches = auditEvents.filter((event) => event.event === eventName);
  return {
    item,
    status: matches.length ? "SUPPORTED" : "PENDING",
    source: auditSource,
    note: matches.length ? formatAuditNote(matches) : note || `No \`${eventName}\` audit event found.`,
  };
}

function rowFromAnyAudit(auditEvents: AuditEvent[], auditSource: string, eventNames: string[], item: string, optional = false): EvidenceRow {
  const matches = auditEvents.filter((event) => event.event && eventNames.includes(event.event));
  return {
    item,
    status: matches.length ? "SUPPORTED" : "PENDING",
    source: auditSource,
    note: matches.length ? formatAuditNote(matches) : optional ? "Optional or not yet observed." : `No audit event found for ${eventNames.join(", ")}.`,
  };
}

function pendingManual(item: string, note: string): EvidenceRow {
  return { item, status: "PENDING", source: "manual Feishu observation", note };
}

function fileRow(item: string, filePath: string): EvidenceRow {
  return {
    item,
    status: fs.existsSync(filePath) ? "SUPPORTED" : "PENDING",
    source: filePath,
    note: fs.existsSync(filePath) ? "File exists." : "File is missing.",
  };
}

function auditArtifactRow(item: string, filePath: string, auditSource: string, auditEvents: AuditEvent[]): EvidenceRow {
  if (fs.existsSync(filePath)) {
    return {
      item,
      status: "SUPPORTED",
      source: filePath,
      note: "File exists.",
    };
  }
  if (auditSource !== filePath && auditEvents.length) {
    return {
      item,
      status: "SUPPORTED",
      source: auditSource,
      note: `${auditEvents.length} event(s) fetched from protected runtime audit tail.`,
    };
  }
  return {
    item,
    status: "PENDING",
    source: auditSource,
    note: "File is missing and no remote audit events were fetched.",
  };
}

function formatAuditNote(events: AuditEvent[]): string {
  const latest = events.at(-1);
  const trace = latest?.trace_id ? `latest trace_id=${latest.trace_id}` : "trace id unavailable";
  return `${events.length} matching event(s); ${trace}.`;
}

function buildEvidenceMarkdown(draft: EvidenceDraft, manualUpdates: RecordUpdate[] = []): string {
  const reportCounts = countChecks(draft.report?.checks || []);
  const envRows = [
    ["APP_ID", provided(draft.env.APP_ID)],
    ["APP_SECRET", provided(draft.env.APP_SECRET)],
    ["VERIFICATION_TOKEN", provided(draft.env.VERIFICATION_TOKEN)],
    ["ENCRYPT_KEY", draft.env.ENCRYPT_KEY ? "provided" : "optional/missing"],
    ["TEST_CHAT_ID", provided(draft.env.TEST_CHAT_ID)],
    ["PUBLIC_CALLBACK_BASE_URL", provided(draft.env.PUBLIC_CALLBACK_BASE_URL)],
    ["DEBUG_ACCESS_TOKEN", draft.env.DEBUG_ACCESS_TOKEN ? "provided" : "optional/missing"],
  ].map(([key, status]) => `| \`${key}\` | ${status} |`).join("\n");
  const latestAudit = draft.auditEvents.slice(-10)
    .map((event) => `| ${auditEventTime(event)} | ${event.trace_id || ""} | ${event.event || ""} | ${safeInlineJson(summarizeAuditDetail(event))} |`)
    .join("\n") || "|  |  | none | No audit events found. |";

  return `# Level 2 Evidence Draft

This draft is generated from machine-readable verification output and runtime audit logs. It does not prove the manual Feishu click by itself. Keep real chat screenshots, message ids, and operator notes in \`level2_verification_record.md\`.
Recent audit details are summarized for sharing; submitted field values, operator ids, and chat ids are not printed in this Markdown draft.
Manual evidence values supplied through CLI options or \`level2_manual_evidence.local.json\` are applied to the Level 2 record when \`--update-record\` is used, but their raw values are redacted from this draft.

## Environment

- Generated at: ${draft.generatedAt}
- Package: ${draft.packagePath}
- Target service: ${draft.service.service.name}
- Target base URL: ${draft.report?.context?.targetBaseUrl || draft.service.service.base_url || "not provided"}
- Runtime URL checked: ${draft.report?.context?.runtimeUrl || "not checked"}
- Public callback URL: ${draft.env.PUBLIC_CALLBACK_BASE_URL ? `${draft.env.PUBLIC_CALLBACK_BASE_URL.replace(/\/+$/, "")}/webhook/card` : "missing"}
- Verification report: ${fs.existsSync(draft.reportPath) ? draft.reportPath : "missing"}
- Audit log: ${auditSourceLabel(draft)}

## Secret Presence

Secret values are not printed here.

| Key | Presence |
| --- | --- |
${envRows}

## Latest Verification Summary

- Report status: ${draft.report?.status || "missing"}
- Report generated at: ${draft.report?.generated_at || "missing"}
- Level 2 mode: ${draft.report?.context?.level2 ? "yes" : "no"}
- Simulation requested: ${draft.report?.context?.simulate ? "yes" : "no"}
- Send start card requested: ${draft.report?.context?.sendStartCard ? "yes" : "no"}
- Check counts: pass=${reportCounts.pass}, warn=${reportCounts.warn}, fail=${reportCounts.fail}

## Preflight Evidence

${tableRows(draft.preflightRows)}

## Interaction Evidence

${tableRows(draft.interactionRows)}

## Failure-Path Evidence

${tableRows(draft.failureRows)}

## Artifacts

${tableRows(draft.artifactRows)}

## Suggested Record Updates

\`evidence --update-record\` copies the machine-supported values and supplied manual options below into blank fields in \`level2_verification_record.md\`. It does not check completion boxes.

${recordUpdateRows(draft, manualUpdates)}

## Manual Record Inputs

${manualRecordRows(manualUpdates)}

## Recent Audit Events

| Time | Trace ID | Event | Detail |
| --- | --- | --- | --- |
${latestAudit}

## Manual Completion Still Required

- Confirm a real Feishu test chat received the start card.
- Submit a real card form from Feishu and record the result card screenshot or message id.
- Confirm the result matches the expected target-service output.
- Fill and check the final completion section in \`level2_verification_record.md\`.
`;
}

function auditSourceLabel(draft: EvidenceDraft): string {
  if (fs.existsSync(draft.auditPath)) return draft.auditPath;
  if (draft.auditSource !== draft.auditPath) {
    return draft.auditEvents.length
      ? `${draft.auditSource} (${draft.auditEvents.length} event(s))`
      : `${draft.auditSource} (no events)`;
  }
  return "missing";
}

function recordUpdateRows(draft: EvidenceDraft, manualUpdates: RecordUpdate[]): string {
  const rows = combinedRecordUpdates(draft, manualUpdates).map((update) => (
    `| ${recordCell(update.field)} | ${recordCell(displayRecordUpdateValue(update))} | ${recordCell(displayRecordUpdateSource(update))} |`
  ));
  return [
    "| Field | Suggested value | Source |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function manualRecordRows(manualUpdates: RecordUpdate[]): string {
  const supplied = manualUpdates.filter((update) => update.value);
  if (!supplied.length) return "No manual evidence options were supplied.";
  return [
    "| Field | Supplied value | Source |",
    "| --- | --- | --- |",
    ...supplied.map((update) => `| ${recordCell(update.field)} | ${recordCell(displayRecordUpdateValue(update))} | ${recordCell(displayRecordUpdateSource(update))} |`),
  ].join("\n");
}

function displayRecordUpdateValue(update: RecordUpdate): string {
  if (!update.value) return "pending";
  return update.redactInDraft ? "provided (redacted in shared draft)" : update.value;
}

function displayRecordUpdateSource(update: RecordUpdate): string {
  if (!update.redactInDraft) return update.source;
  const hasFile = update.source.includes("manual evidence file");
  const hasCli = update.source.includes("manual CLI options");
  if (hasFile && hasCli) return "manual evidence file (redacted path) + manual CLI options";
  if (hasFile) return "manual evidence file (redacted path)";
  if (hasCli) return "manual CLI options";
  return update.source || "manual evidence";
}

function recordCell(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
}

function tableRows(rows: EvidenceRow[]): string {
  return [
    "| Status | Item | Source | Note |",
    "| --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.status} | ${row.item} | ${row.source} | ${formatNote(row.note, row.status)} |`),
  ].join("\n");
}

function formatNote(note: string, status: EvidenceStatus): string {
  const compact = note.replace(/\s+/g, " ").trim();
  const maxLength = status === "FAIL" ? 600 : 220;
  const summarized = compact.length > maxLength
    ? `${compact.slice(0, maxLength - 43).trim()}... (full detail in source report/log)`
    : compact;
  return summarized.replace(/\|/g, "\\|");
}

function countChecks(checks: VerificationCheck[]): Record<"pass" | "warn" | "fail", number> {
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const check of checks) counts[check.status] += 1;
  return counts;
}

function provided(value: string | undefined): string {
  return value ? "provided" : "missing";
}

function printEvidenceSummary(draft: EvidenceDraft, outPath: string): void {
  const rows = [...draft.preflightRows, ...draft.interactionRows, ...draft.failureRows, ...draft.artifactRows];
  const supported = rows.filter((row) => row.status === "SUPPORTED").length;
  const pending = rows.filter((row) => row.status === "PENDING").length;
  const failed = rows.filter((row) => row.status === "FAIL").length;
  console.log(`Evidence draft written to ${outPath}`);
  console.log(`Evidence rows: supported=${supported}, pending=${pending}, fail=${failed}`);
  console.log(`Latest verification: ${draft.report?.status || "missing"}`);
  console.log(`Audit events read: ${draft.auditEvents.length}`);
}

function summarizeAuditDetail(event: AuditEvent): Record<string, unknown> {
  const detail = isRecord(event.detail) ? event.detail : {};
  const summary: Record<string, unknown> = {};
  for (const key of [
    "message",
    "error",
    "responseCode",
    "messageId",
    "imageUrl",
    "imageKey",
    "original_trace_id",
    "dedupe_ttl_seconds",
    "uploadToLark",
    "form_value_keys",
    "errors",
    "batchId",
    "total",
    "done",
    "running",
    "completed",
    "failed",
    "downloadUrl",
  ]) {
    if (detail[key] !== undefined) {
      summary[key] = summarizeAuditValue(detail[key]);
    }
  }

  if (isRecord(detail.preset)) {
    summary.preset = summarizePreset(detail.preset);
  }
  if (isRecord(detail.running)) {
    summary.running_card_built = true;
  }
  return summary;
}

function summarizePreset(preset: Record<string, unknown>): Record<string, unknown> {
  const fields = isRecord(preset.fields) ? preset.fields : {};
  const message = typeof preset.message === "string" ? preset.message : "";
  return {
    template_id: typeof preset.template_id === "string" ? preset.template_id : undefined,
    size: typeof preset.size === "string" ? preset.size : undefined,
    field_keys: Object.keys(fields),
    message_length: message.length,
  };
}

function summarizeAuditValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 160 ? `${value.slice(0, 157)}...` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => summarizeAuditValue(item));
  }
  return value;
}

function safeInlineJson(value: unknown): string {
  if (!value) return "";
  try {
    return JSON.stringify(value).replace(/\|/g, "\\|").slice(0, 500);
  } catch {
    return String(value).replace(/\|/g, "\\|").slice(0, 500);
  }
}

function auditEventTime(event: AuditEvent): string {
  return event.time || event.ts || "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
