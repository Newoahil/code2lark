import fs from "node:fs";
import path from "node:path";
import { getStringOption, hasOption } from "../args.js";
import { writeJson, writeText } from "../fs-utils.js";
import { getJsonWithTimeout } from "../http-utils.js";
import { buildReadinessSummary, type ReadinessSummary } from "./readiness.js";

type DoctorVerdict = "pass" | "not_ready";
type TargetPreflightStatus = "pass" | "warn" | "fail" | "missing";
type TargetLiveProbeStatus = TargetPreflightStatus | "not_requested";

export interface TargetLiveProbeReport {
  requested: boolean;
  status: TargetLiveProbeStatus;
  checked_at: string;
  check_url: string;
  detail: string;
  blocking: boolean;
}

export interface TargetPreflightReport {
  check_name: "target:/api/meta";
  check_path: "/api/meta";
  status: TargetPreflightStatus;
  detail: string;
  last_checked_at: string;
  evidence_source: "verification_report.json" | "none";
  evidence_scope: string;
  target_base_url: string;
  check_url: string;
  start_hints: string[];
  managed_by_lark_deployer: boolean;
  blocking: boolean;
  rerun_command: string;
  live_probe: TargetLiveProbeReport;
}

export interface DoctorReport {
  schema_version: "0.1";
  generated_at: string;
  package_path: string;
  target_service: string;
  state: ReadinessSummary["state"];
  verdict: DoctorVerdict;
  gate_passed: boolean;
  missing_required_values: string[];
  latest_verification: {
    status: string;
    level2: boolean;
    runtime_url: string;
    pass: number;
    warn: number;
    fail: number;
  };
  target_preflight: TargetPreflightReport;
  completion_decision: ReadinessSummary["completionDecision"];
  evidence_paths: {
    context_request: string;
    context_reply_template: string;
    context_reply_local_json: string;
    context_reply_local_markdown: string;
    verification_report: string;
    level2_record: string;
    manual_evidence_template: string;
    manual_evidence_local: string;
  };
  context_reply: {
    template_present: boolean;
    local_json_present: boolean;
    local_markdown_present: boolean;
    parse_error: string;
    answered_questions: number;
    total_questions: number;
    negative_answers: string[];
    permission_status_counts: ReadinessSummary["contextReply"]["permissionStatusCounts"];
    permission_confirmation_count: number;
    expected_permission_confirmation_count: number;
    missing_permission_confirmations: string[];
    blocked_count: number;
    secure_secret_channel_present: boolean;
    public_value_fields: string[];
    ready_for_local_configure: boolean;
  };
  manual_evidence: {
    template_present: boolean;
    local_present: boolean;
    parse_error: string;
    filled_fields: string[];
    imported_fields: string[];
    pending_import_fields: string[];
    missing_fields: string[];
    ready_to_import: boolean;
    import_command: string;
  };
  blockers: string[];
  warnings: string[];
  next_actions: string[];
}

interface EmbeddedAdapterDoctorReport {
  schema_version: "0.1";
  generated_at: string;
  package_path: string;
  integration_mode: "embedded-adapter";
  package_validation: {
    status: "pass" | "fail";
    checks: Array<{ name: string; status: "pass" | "fail"; detail: string }>;
  };
  blockers: string[];
  next_actions: string[];
}

function buildEmbeddedAdapterDoctorReport(packagePath: string): EmbeddedAdapterDoctorReport {
  const checks = [
    embeddedFileCheck("manifest:service_manifest", path.join(packagePath, "manifest", "service_manifest.json")),
    embeddedFileCheck("manifest:capability_map", path.join(packagePath, "manifest", "capability_map.json")),
    embeddedFileCheck("manifest:interaction_contract", path.join(packagePath, "manifest", "interaction_contract.json")),
    embeddedFileCheck("manifest:required_permissions", path.join(packagePath, "manifest", "required_permissions.json")),
    embeddedFileCheck("adapter:handlers", path.join(packagePath, "adapter", "handlers.ts")),
    embeddedFileCheck("adapter:cards", path.join(packagePath, "adapter", "cards.ts")),
    embeddedFileCheck("adapter:service-client", path.join(packagePath, "adapter", "service-client.ts")),
    embeddedFileCheck("adapter:validation", path.join(packagePath, "adapter", "validation.ts")),
    embeddedFileCheck("adapter:types", path.join(packagePath, "adapter", "types.ts")),
    embeddedFileCheck("adapter:audit-events", path.join(packagePath, "adapter", "audit-events.ts")),
    embeddedFileCheck("adapter:integration-guide", path.join(packagePath, "docs", "integration_guide.md")),
    embeddedFileCheck("adapter:level2-record", path.join(packagePath, "level2_verification_record.md")),
  ];
  checks.push(...embeddedActionChecks(packagePath));
  const failed = checks.filter((check) => check.status === "fail");
  return {
    schema_version: "0.1",
    generated_at: new Date().toISOString(),
    package_path: packagePath,
    integration_mode: "embedded-adapter",
    package_validation: {
      status: failed.length ? "fail" : "pass",
      checks,
    },
    blockers: failed.map((check) => check.detail),
    next_actions: failed.length
      ? ["Regenerate the package, then rerun `verify --mode embedded-adapter --strict`." ]
      : [
        "Integrate adapter/handlers.ts into the existing Feishu SDK service.",
        "Run `verify --mode embedded-adapter --strict` after any package regeneration.",
        "Use the existing host service and real Feishu evidence to complete Level 2; standalone bot-runtime is not required for embedded mode.",
      ],
  };
}

function embeddedActionChecks(packagePath: string): Array<{ name: string; status: "pass" | "fail"; detail: string }> {
  const interactionPath = path.join(packagePath, "manifest", "interaction_contract.json");
  const handlerPath = path.join(packagePath, "adapter", "handlers.ts");
  if (!fs.existsSync(interactionPath) || !fs.existsSync(handlerPath)) return [];
  const interactions = readEmbeddedInteractions(interactionPath);
  const handlerSource = fs.readFileSync(handlerPath, "utf8");
  return interactions
    .map((interaction) => ({ interaction, actionId: embeddedActionIdForInputMode(interaction.input_mode) }))
    .filter((item): item is { interaction: EmbeddedInteraction; actionId: string } => Boolean(item.actionId))
    .map(({ interaction, actionId }) => {
      const supportsAction = handlerSource.includes(actionId);
      return {
        name: `adapter:action:${actionId}`,
        status: supportsAction ? "pass" : "fail",
        detail: supportsAction
          ? `adapter/handlers.ts supports ${actionId} for ${interaction.capability_id}.`
          : `adapter/handlers.ts does not support ${actionId} for ${interaction.capability_id}.`,
      };
    });
}

interface EmbeddedInteraction {
  trigger: string;
  input_mode: string;
  capability_id: string;
}

function readEmbeddedInteractions(filePath: string): EmbeddedInteraction[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.interactions)) return [];
    return parsed.interactions.filter((item: unknown): item is EmbeddedInteraction => {
      return Boolean(item && typeof item === "object" && !Array.isArray(item)
        && (item as { trigger?: unknown }).trigger === "card_action"
        && typeof (item as { input_mode?: unknown }).input_mode === "string"
        && typeof (item as { capability_id?: unknown }).capability_id === "string");
    });
  } catch {
    return [];
  }
}

function embeddedActionIdForInputMode(inputMode: string): string {
  if (inputMode === "preset_card_action") return "image.generate.submit";
  if (inputMode === "feedback_card_action") return "image.iterate.submit";
  if (inputMode === "batch_form_action") return "image.batch.submit";
  if (inputMode === "batch_status_action") return "image.batch.refresh";
  return "";
}

function embeddedFileCheck(name: string, filePath: string): { name: string; status: "pass" | "fail"; detail: string } {
  return fs.existsSync(filePath)
    ? { name, status: "pass", detail: filePath }
    : { name, status: "fail", detail: `Missing ${filePath}` };
}

function printEmbeddedAdapterDoctorReport(report: EmbeddedAdapterDoctorReport, gateMode: boolean): void {
  console.log("Embedded adapter doctor: " + (report.package_validation.status === "pass" ? "PACKAGE VALID" : "NOT READY"));
  console.log(`Package: ${report.package_path}`);
  console.log(`Gate passed: ${report.package_validation.status === "pass" ? "yes" : "no"}`);
  console.log("Integration mode: embedded-adapter");
  if (report.blockers.length) {
    console.log("Blockers:");
    for (const blocker of report.blockers) console.log(`- ${blocker}`);
  }
  console.log("Next actions:");
  for (const action of report.next_actions) console.log(`- ${action}`);
  if (!gateMode) {
    console.log("Gate mode: rerun with --gate to exit non-zero when package validation fails.");
  }
}

function buildEmbeddedAdapterDoctorMarkdown(report: EmbeddedAdapterDoctorReport): string {
  const rows = report.package_validation.checks
    .map((check) => `| ${check.status.toUpperCase()} | ${check.name} | ${check.detail.replace(/\|/g, "\\|")} |`)
    .join("\n");
  return `# Embedded Adapter Doctor Report

- Generated at: ${report.generated_at}
- Package: ${report.package_path}
- Integration mode: embedded-adapter
- Package validation: ${report.package_validation.status}

## Checks

| Status | Check | Detail |
| --- | --- | --- |
${rows}

## Next Actions

${report.next_actions.map((action) => `- ${action}`).join("\n")}
`;
}

export async function doctorCommand(args: string[], options: Record<string, string | boolean>): Promise<void> {
  const packageArg = args[0];
  if (!packageArg) {
    throw new Error("Usage: lark-deployer doctor <generated-package> [--env <file>] [--json] [--out <json-file>] [--gate] [--probe-target]");
  }

  const packagePath = path.resolve(packageArg);
  const mode = getStringOption(options, "mode", getStringOption(options, "integration-mode", getStringOption(options, "integrationMode", "standalone-runtime")));
  if (mode === "embedded-adapter" || mode === "embedded") {
    const report = buildEmbeddedAdapterDoctorReport(packagePath);
    const gateMode = hasOption(options, "gate") || hasOption(options, "check");
    const outFile = getStringOption(options, "out", "");
    if (outFile) {
      const jsonPath = path.resolve(outFile);
      const markdownPath = jsonPath.replace(/\.json$/i, ".md") === jsonPath ? `${jsonPath}.md` : jsonPath.replace(/\.json$/i, ".md");
      writeJson(jsonPath, report);
      writeText(markdownPath, buildEmbeddedAdapterDoctorMarkdown(report));
      console.log(`Doctor report written to ${jsonPath}`);
      console.log(`Doctor checklist written to ${markdownPath}`);
    }
    if (hasOption(options, "json")) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printEmbeddedAdapterDoctorReport(report, gateMode);
    }
    if (gateMode && report.package_validation.status !== "pass") {
      console.error(`Embedded adapter gate failed: ${report.blockers[0] || "package validation failed"}`);
      process.exitCode = 1;
    }
    return;
  }
  const report = await buildDoctorReportFromPackageForCommand(packagePath, options);
  const gateMode = hasOption(options, "gate") || hasOption(options, "check");
  const outFile = getStringOption(options, "out", "");

  if (outFile) {
    const { jsonPath, markdownPath } = writeDoctorReportFiles(packagePath, path.resolve(outFile), options, report);
    console.log(`Doctor report written to ${jsonPath}`);
    console.log(`Doctor checklist written to ${markdownPath}`);
  }

  if (hasOption(options, "json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printDoctorReport(report, gateMode);
  }

  if (gateMode && !report.gate_passed) {
    console.error(`MVP gate failed: ${report.blockers[0] || report.state}`);
    process.exitCode = 1;
  }
}

export function writeDoctorReportFiles(
  packagePath: string,
  outFile: string,
  options: Record<string, string | boolean> = {},
  report = buildDoctorReportFromPackage(packagePath, options),
): { jsonPath: string; markdownPath: string; report: DoctorReport } {
  const jsonPath = path.resolve(outFile);
  const markdownPath = jsonPath.replace(/\.json$/i, ".md") === jsonPath
    ? `${jsonPath}.md`
    : jsonPath.replace(/\.json$/i, ".md");
  writeJson(jsonPath, report);
  writeText(markdownPath, buildDoctorMarkdown(report));
  return { jsonPath, markdownPath, report };
}

export function buildDoctorReportFromPackage(
  packagePath: string,
  options: Record<string, string | boolean> = {},
): DoctorReport {
  const summary = buildReadinessSummary(packagePath, options);
  return buildDoctorReport(summary);
}

function buildDoctorReport(summary: ReadinessSummary): DoctorReport {
  return buildDoctorReportWithLiveProbe(summary, defaultTargetLiveProbe(summary));
}

function buildDoctorReportWithLiveProbe(summary: ReadinessSummary, liveProbe: TargetLiveProbeReport): DoctorReport {
  const missingRequiredValues = summary.requiredValues
    .filter((item) => item.status === "missing")
    .map((item) => item.key);
  const liveProbePassed = !liveProbe.requested || liveProbe.status === "pass";
  const gatePassed = summary.state === "handoff_ready"
    && summary.completionDecision.complete
    && !summary.manualEvidence.parseError
    && liveProbePassed;

  return {
    schema_version: "0.1",
    generated_at: new Date().toISOString(),
    package_path: summary.packagePath,
    target_service: summary.service.service.name,
    state: summary.state,
    verdict: gatePassed ? "pass" : "not_ready",
    gate_passed: gatePassed,
    missing_required_values: missingRequiredValues,
    latest_verification: {
      status: summary.report?.status || "missing",
      level2: summary.report?.context?.level2 === true,
      runtime_url: summary.report?.context?.runtimeUrl || "",
      pass: summary.reportCounts.pass,
      warn: summary.reportCounts.warn,
      fail: summary.reportCounts.fail,
    },
    target_preflight: buildTargetPreflightReport(summary, liveProbe),
    completion_decision: summary.completionDecision,
    evidence_paths: {
      context_request: summary.contextRequestPath,
      context_reply_template: summary.contextReply.templatePath,
      context_reply_local_json: summary.contextReply.localJsonPath,
      context_reply_local_markdown: summary.contextReply.localMarkdownPath,
      verification_report: summary.reportPath,
      level2_record: summary.level2RecordPath,
      manual_evidence_template: summary.manualEvidence.templatePath,
      manual_evidence_local: summary.manualEvidence.localPath,
    },
    context_reply: {
      template_present: summary.contextReply.templatePresent,
      local_json_present: summary.contextReply.localJsonPresent,
      local_markdown_present: summary.contextReply.localMarkdownPresent,
      parse_error: summary.contextReply.parseError,
      answered_questions: summary.contextReply.answeredQuestions,
      total_questions: summary.contextReply.totalQuestions,
      negative_answers: summary.contextReply.negativeAnswers,
      permission_status_counts: summary.contextReply.permissionStatusCounts,
      permission_confirmation_count: summary.contextReply.permissionConfirmationCount,
      expected_permission_confirmation_count: summary.contextReply.expectedPermissionConfirmationCount,
      missing_permission_confirmations: summary.contextReply.missingPermissionConfirmations,
      blocked_count: summary.contextReply.blockedCount,
      secure_secret_channel_present: summary.contextReply.secureSecretChannelPresent,
      public_value_fields: summary.contextReply.publicValueFields,
      ready_for_local_configure: summary.contextReply.readyForLocalConfigure,
    },
    manual_evidence: {
      template_present: summary.manualEvidence.templatePresent,
      local_present: summary.manualEvidence.localPresent,
      parse_error: summary.manualEvidence.parseError,
      filled_fields: summary.manualEvidence.filledFields,
      imported_fields: summary.manualEvidence.importedFields,
      pending_import_fields: summary.manualEvidence.pendingImportFields,
      missing_fields: summary.manualEvidence.missingFields,
      ready_to_import: summary.manualEvidence.readyToImport,
      import_command: summary.manualEvidence.importCommand,
    },
    blockers: buildBlockers(summary, missingRequiredValues, liveProbe),
    warnings: summary.securityWarnings,
    next_actions: summary.nextActions,
  };
}

async function buildDoctorReportFromPackageForCommand(
  packagePath: string,
  options: Record<string, string | boolean> = {},
): Promise<DoctorReport> {
  const summary = buildReadinessSummary(packagePath, options);
  const liveProbe = shouldProbeTarget(options)
    ? await probeLiveTarget(summary)
    : defaultTargetLiveProbe(summary);
  return buildDoctorReportWithLiveProbe(summary, liveProbe);
}

function shouldProbeTarget(options: Record<string, string | boolean>): boolean {
  return hasOption(options, "probe-target") || hasOption(options, "probeTarget") || hasOption(options, "live-target") || hasOption(options, "liveTarget");
}

async function probeLiveTarget(summary: ReadinessSummary): Promise<TargetLiveProbeReport> {
  const checkUrl = joinUrlPath(resolveTargetBaseUrl(summary), "/api/meta");
  const checkedAt = new Date().toISOString();
  const probe = await getJsonWithTimeout(checkUrl, 5000);
  const status: TargetLiveProbeStatus = probe.status === "available"
    ? "pass"
    : probe.status === "not_checked"
      ? "missing"
      : "fail";

  return {
    requested: true,
    status,
    checked_at: checkedAt,
    check_url: checkUrl,
    detail: summarizeTargetPreflightDetail(probe.detail),
    blocking: status !== "pass",
  };
}

function defaultTargetLiveProbe(summary: ReadinessSummary): TargetLiveProbeReport {
  return {
    requested: false,
    status: "not_requested",
    checked_at: "",
    check_url: joinUrlPath(resolveTargetBaseUrl(summary), "/api/meta"),
    detail: "Not requested; run doctor --probe-target to test current target reachability without rewriting verification_report.json.",
    blocking: false,
  };
}

function resolveTargetBaseUrl(summary: ReadinessSummary): string {
  return summary.report?.context?.targetBaseUrl
    || summary.context?.target_service.base_url
    || summary.service.service.base_url
    || "";
}

function buildBlockers(summary: ReadinessSummary, missingRequiredValues: string[], liveProbe: TargetLiveProbeReport): string[] {
  const blockers: string[] = [];
  if (missingRequiredValues.length) {
    blockers.push(`Missing required external values: ${missingRequiredValues.join(", ")}.`);
  }
  if (summary.contextReply.parseError) {
    blockers.push(`Context owner reply local JSON is invalid: ${summary.contextReply.parseError}.`);
  }
  if (summary.contextReply.blockedCount || summary.contextReply.permissionStatusCounts.blocked || summary.contextReply.negativeAnswers.length) {
    blockers.push(`Context owner reply reports unresolved blockers: blocked_by=${summary.contextReply.blockedCount}, blocked_permissions=${summary.contextReply.permissionStatusCounts.blocked}, negative_answers=${summary.contextReply.negativeAnswers.length}.`);
  }
  if (summary.contextReply.localJsonPresent && (summary.contextReply.permissionStatusCounts.unknown || summary.contextReply.missingPermissionConfirmations.length)) {
    blockers.push(`Context owner reply has unconfirmed permissions: unknown_permissions=${summary.contextReply.permissionStatusCounts.unknown}, missing_permissions=${summary.contextReply.missingPermissionConfirmations.length}.`);
  }
  if (summary.manualEvidence.parseError) {
    blockers.push(`Manual evidence local file is invalid: ${summary.manualEvidence.parseError}.`);
  }

  if (!summary.report) {
    blockers.push("No verification_report.json is present; run verify after configuring the generated package.");
  } else if (summary.report.status === "fail") {
    blockers.push(`Latest verification has FAIL checks: ${summary.reportCounts.fail}.`);
  }

  const targetPreflight = summary.report?.checks?.find((check) => check.name === "target:/api/meta");
  if (targetPreflight && targetPreflight.status !== "pass") {
    blockers.push(`Target service preflight is not passing (${targetPreflight.status}): ${targetPreflight.detail}. Lark-deployer does not start or manage the target service.`);
  }
  if (liveProbe.requested && liveProbe.status !== "pass") {
    blockers.push(`Live target probe is not passing (${liveProbe.status}): ${liveProbe.detail}. Lark-deployer does not start or manage the target service.`);
  }

  if (summary.report?.context?.level2 !== true) {
    blockers.push("Latest verification was not run in real Level 2 mode with verify --level2.");
  } else if (summary.report.status === "warn") {
    blockers.push(`Level 2 preflight still has WARN checks: ${summary.reportCounts.warn}.`);
  }

  if (!summary.completionDecision.level2Verified) {
    blockers.push("level2_verification_record.md has not checked 'Level 2 verified'.");
  }
  if (!summary.completionDecision.manualEvidencePresent) {
    blockers.push(`Manual Feishu evidence is missing: ${summary.completionDecision.missingManualEvidence.join(", ")}.`);
  }
  if (!summary.completionDecision.remainingIssuesDocumented) {
    blockers.push("level2_verification_record.md has not checked 'Remaining issues documented'.");
  }
  if (!summary.completionDecision.handoffApproved) {
    blockers.push("level2_verification_record.md has not checked final FDE handoff approval.");
  }

  return blockers;
}

function buildTargetPreflightReport(summary: ReadinessSummary, liveProbe: TargetLiveProbeReport): TargetPreflightReport {
  const checkName = "target:/api/meta";
  const checkPath = "/api/meta";
  const targetCheck = summary.report?.checks?.find((check) => check.name === checkName);
  const status = targetCheck?.status || "missing";
  const targetBaseUrl = resolveTargetBaseUrl(summary);

  return {
    check_name: checkName,
    check_path: checkPath,
    status,
    detail: summarizeTargetPreflightDetail(targetCheck?.detail || "No target preflight check is present; run verify to probe the target service."),
    last_checked_at: summary.report?.generated_at || "",
    evidence_source: summary.report ? "verification_report.json" : "none",
    evidence_scope: "last verify snapshot; doctor does not probe the network or start the target service",
    target_base_url: targetBaseUrl,
    check_url: joinUrlPath(targetBaseUrl, checkPath),
    start_hints: summary.service.service.start_hints || [],
    managed_by_lark_deployer: Boolean(summary.service.service.managed_by_lark_deployer),
    blocking: status !== "pass",
    rerun_command: findVerifyCommand(summary) || "node $env:LARK_DEPLOYER_CLI verify .",
    live_probe: liveProbe,
  };
}

function joinUrlPath(baseUrl: string, urlPath: string): string {
  if (!baseUrl) return "";
  return `${baseUrl.replace(/\/+$/g, "")}/${urlPath.replace(/^\/+/g, "")}`;
}

function summarizeTargetPreflightDetail(detail: string): string {
  const normalized = detail.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const responseIndex = normalized.indexOf(" Response:");
  if (responseIndex >= 0) {
    return `${normalized.slice(0, responseIndex).trim()} Response body omitted from doctor report; see verification_report.json for full probe detail.`;
  }
  const maxLength = 500;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function findVerifyCommand(summary: ReadinessSummary): string {
  for (const action of summary.nextActions) {
    const command = extractNodeVerifyCommand(action);
    if (command) return command;
  }
  return "";
}

function extractNodeVerifyCommand(action: string): string {
  const normalized = action.replace(/\s+/g, " ").trim();
  const match = normalized.match(/\bnode\s+.*?\bverify\b.*$/);
  if (!match) return "";
  return match[0].replace(/[`"']+$/g, "").trim();
}

function printDoctorReport(report: DoctorReport, gateMode: boolean): void {
  const latest = report.latest_verification;
  const missing = report.missing_required_values.length ? report.missing_required_values.join(", ") : "none";
  const status = report.gate_passed ? "PASS" : "NOT READY";

  console.log(`MVP doctor: ${status}`);
  console.log(`State: ${report.state}`);
  console.log(`Target service: ${report.target_service}`);
  console.log(`Package: ${report.package_path}`);
  console.log(`Gate passed: ${report.gate_passed ? "yes" : "no"}`);
  console.log(`Missing required values: ${missing}`);
  console.log(`Latest verification: ${latest.status} (level2=${latest.level2 ? "yes" : "no"}, pass=${latest.pass}, warn=${latest.warn}, fail=${latest.fail})`);
  if (latest.runtime_url) {
    console.log(`Runtime URL checked: ${latest.runtime_url}`);
  }
  const targetChecked = report.target_preflight.last_checked_at || "not checked";
  console.log(`Target preflight: ${report.target_preflight.status} (${report.target_preflight.check_url || report.target_preflight.check_name}; last checked: ${targetChecked})`);
  if (report.target_preflight.live_probe.requested) {
    const liveChecked = report.target_preflight.live_probe.checked_at || "not checked";
    console.log(`Live target probe: ${report.target_preflight.live_probe.status} (${report.target_preflight.live_probe.check_url || report.target_preflight.check_name}; checked: ${liveChecked})`);
  }
  console.log(`Level 2 record: ${report.evidence_paths.level2_record}`);
  console.log(`Context request: ${report.evidence_paths.context_request}`);
  if (report.context_reply.local_json_present) {
    console.log(`Context reply: answered=${report.context_reply.answered_questions}/${report.context_reply.total_questions}, blockers=${report.context_reply.blocked_count}, secure_channel=${report.context_reply.secure_secret_channel_present ? "yes" : "no"}`);
    if (report.context_reply.parse_error) {
      console.log(`Context reply parse error: ${report.context_reply.parse_error}`);
    }
  }
  if (report.manual_evidence.local_present) {
    console.log(`Manual evidence local file: ${report.evidence_paths.manual_evidence_local}`);
    if (report.manual_evidence.parse_error) {
      console.log(`Manual evidence parse error: ${report.manual_evidence.parse_error}`);
    }
    console.log(`Manual evidence fields: filled=${report.manual_evidence.filled_fields.length}, pending_import=${report.manual_evidence.pending_import_fields.length}`);
  }

  console.log("Blockers:");
  if (report.blockers.length) {
    for (const blocker of report.blockers) {
      console.log(`- ${blocker}`);
    }
  } else {
    console.log("- none");
  }

  if (report.warnings.length) {
    console.log("Warnings:");
    for (const warning of report.warnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log("Next actions:");
  for (const action of report.next_actions.length ? report.next_actions : ["none"]) {
    console.log(`- ${action}`);
  }

  if (!gateMode && !report.gate_passed) {
    console.log("Gate mode: rerun with --gate to exit non-zero until the generated package reaches handoff_ready.");
  }
}

function buildDoctorMarkdown(report: DoctorReport): string {
  const latest = report.latest_verification;
  const missing = report.missing_required_values.length
    ? report.missing_required_values.map((item) => `\`${item}\``).join(", ")
    : "none";
  const blockers = report.blockers.length ? report.blockers.map((item) => `- ${item}`).join("\n") : "- none";
  const warnings = report.warnings.length ? report.warnings.map((item) => `- ${item}`).join("\n") : "- none";
  const nextActions = report.next_actions.length ? report.next_actions.map((item) => `- ${item}`).join("\n") : "- none";
  const targetPreflightRows = [
    ["Check", report.target_preflight.check_name],
    ["Status", report.target_preflight.status],
    ["Last checked at", report.target_preflight.last_checked_at || "not checked"],
    ["Evidence source", report.target_preflight.evidence_source],
    ["Evidence scope", report.target_preflight.evidence_scope],
    ["Target base URL", report.target_preflight.target_base_url || "not provided"],
    ["Check URL", report.target_preflight.check_url || "not available"],
    ["Detail", report.target_preflight.detail],
    ["Managed by Lark-deployer", report.target_preflight.managed_by_lark_deployer ? "yes" : "no"],
    ["Blocking gate", report.target_preflight.blocking ? "yes" : "no"],
    ["Start hints", report.target_preflight.start_hints.length ? report.target_preflight.start_hints.map((item) => `\`${item}\``).join("<br>") : "none"],
    ["Rerun command", `\`${report.target_preflight.rerun_command}\``],
    ["Live probe requested", report.target_preflight.live_probe.requested ? "yes" : "no"],
    ["Live probe status", report.target_preflight.live_probe.status],
    ["Live probe checked at", report.target_preflight.live_probe.checked_at || "not checked"],
    ["Live probe detail", report.target_preflight.live_probe.detail],
  ].map(([item, value]) => `| ${item} | ${markdownTableValue(String(value))} |`).join("\n");
  const manualRows = [
    ["Template present", report.manual_evidence.template_present ? "yes" : "no"],
    ["Local evidence file present", report.manual_evidence.local_present ? "yes" : "no"],
    ["Parse status", report.manual_evidence.parse_error ? `invalid: ${report.manual_evidence.parse_error}` : "ok"],
    ["Filled field names", inlineList(report.manual_evidence.filled_fields)],
    ["Imported field names", inlineList(report.manual_evidence.imported_fields)],
    ["Pending import field names", inlineList(report.manual_evidence.pending_import_fields)],
    ["Missing field names", inlineList(report.manual_evidence.missing_fields)],
    ["Ready to import", report.manual_evidence.ready_to_import ? "yes" : "no"],
  ].map(([item, value]) => `| ${item} | ${String(value).replace(/\|/g, "\\|")} |`).join("\n");
  const contextReplyRows = [
    ["Template present", report.context_reply.template_present ? "yes" : "no"],
    ["Local JSON present", report.context_reply.local_json_present ? "yes" : "no"],
    ["Local Markdown present", report.context_reply.local_markdown_present ? "yes" : "no"],
    ["Parse status", report.context_reply.parse_error ? `invalid: ${report.context_reply.parse_error}` : "ok"],
    ["Answered questions", `${report.context_reply.answered_questions}/${report.context_reply.total_questions}`],
    ["Negative answers", inlineList(report.context_reply.negative_answers)],
    ["Permission statuses", `confirmed=${report.context_reply.permission_status_counts.confirmed}, blocked=${report.context_reply.permission_status_counts.blocked}, unknown=${report.context_reply.permission_status_counts.unknown}, not_needed=${report.context_reply.permission_status_counts.notNeeded}`],
    ["Permission confirmations", `${report.context_reply.permission_confirmation_count}/${report.context_reply.expected_permission_confirmation_count}`],
    ["Missing permission confirmations", inlineList(report.context_reply.missing_permission_confirmations)],
    ["Blocked-by entries", String(report.context_reply.blocked_count)],
    ["Secure secret channel recorded", report.context_reply.secure_secret_channel_present ? "yes" : "no"],
    ["Public value fields filled", inlineList(report.context_reply.public_value_fields)],
    ["Ready for local configure intake", report.context_reply.ready_for_local_configure ? "yes" : "no"],
  ].map(([item, value]) => `| ${item} | ${String(value).replace(/\|/g, "\\|")} |`).join("\n");

  return `# MVP Doctor Report

This report is generated from readiness evidence. It does not include Feishu secrets or local manual evidence values.

- Generated at: ${report.generated_at}
- Verdict: ${report.verdict}
- Gate passed: ${report.gate_passed ? "yes" : "no"}
- State: ${report.state}
- Target service: ${report.target_service}
- Package: ${report.package_path}
- Missing required values: ${missing}

## Latest Verification

- Report status: ${latest.status}
- Level 2 mode: ${latest.level2 ? "yes" : "no"}
- Runtime URL checked: ${latest.runtime_url || "not checked"}
- Check counts: pass=${latest.pass}, warn=${latest.warn}, fail=${latest.fail}

## Target Preflight

| Item | Status |
| --- | --- |
${targetPreflightRows}

## Completion Decision

| Item | Checked |
| --- | --- |
| Level 2 verified | ${report.completion_decision.level2Verified ? "yes" : "no"} |
| Manual evidence present | ${report.completion_decision.manualEvidencePresent ? "yes" : "no"} |
| Remaining issues documented | ${report.completion_decision.remainingIssuesDocumented ? "yes" : "no"} |
| Package handoff approved | ${report.completion_decision.handoffApproved ? "yes" : "no"} |

Missing manual evidence: ${report.completion_decision.missingManualEvidence.length ? report.completion_decision.missingManualEvidence.map((item) => `\`${item}\``).join(", ") : "none"}

## Evidence Paths

| Artifact | Path |
| --- | --- |
| Context request | ${report.evidence_paths.context_request} |
| Context reply template | ${report.evidence_paths.context_reply_template} |
| Context reply local JSON | ${report.evidence_paths.context_reply_local_json} |
| Context reply local Markdown | ${report.evidence_paths.context_reply_local_markdown} |
| Verification report | ${report.evidence_paths.verification_report} |
| Level 2 record | ${report.evidence_paths.level2_record} |
| Manual evidence template | ${report.evidence_paths.manual_evidence_template} |
| Manual evidence local file | ${report.evidence_paths.manual_evidence_local} |

## Context Reply Intake

The local owner reply may include internal contact or deployment context. This report only shows counts and field names, not reply values.

| Item | Status |
| --- | --- |
${contextReplyRows}

## Manual Evidence Helper

| Item | Status |
| --- | --- |
${manualRows}

Import command:

\`\`\`powershell
${report.manual_evidence.import_command}
\`\`\`

## Blockers

${blockers}

## Warnings

${warnings}

## Next Actions

${nextActions}
`;
}

function inlineList(values: string[]): string {
  return values.length ? values.map((item) => `\`${item}\``).join(", ") : "none";
}

function markdownTableValue(value: string): string {
  return value.replace(/\|/g, "\\|");
}
