import path from "node:path";
import { hasOption } from "../args.js";
import { buildReadinessSummary, type ReadinessSummary } from "./readiness.js";

interface PackageStatus {
  schema_version: "0.1";
  generated_at: string;
  package_path: string;
  context_request_path: string;
  context_reply: ReadinessSummary["contextReply"];
  manual_evidence: ReadinessSummary["manualEvidence"];
  target_service: string;
  state: ReadinessSummary["state"];
  handoff_ready: boolean;
  missing_required_values: string[];
  latest_verification: {
    generated_at: string;
    evidence_scope: string;
    status: string;
    level2: boolean;
    runtime_url: string;
    pass: number;
    warn: number;
    fail: number;
  };
  completion_decision: ReadinessSummary["completionDecision"];
  security_warnings: string[];
  next_actions: string[];
}

export async function statusCommand(args: string[], options: Record<string, string | boolean>): Promise<void> {
  const packageArg = args[0];
  if (!packageArg) {
    throw new Error("Usage: lark-deployer status <generated-package> [--env <file>] [--json]");
  }

  const packagePath = path.resolve(packageArg);
  const summary = buildReadinessSummary(packagePath, options);
  const status = buildPackageStatus(summary);

  if (hasOption(options, "json")) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  printPackageStatus(status);
}

function buildPackageStatus(summary: ReadinessSummary): PackageStatus {
  return {
    schema_version: "0.1",
    generated_at: new Date().toISOString(),
    package_path: summary.packagePath,
    context_request_path: summary.contextRequestPath,
    context_reply: summary.contextReply,
    manual_evidence: summary.manualEvidence,
    target_service: summary.service.service.name,
    state: summary.state,
    handoff_ready: summary.state === "handoff_ready",
    missing_required_values: summary.requiredValues
      .filter((item) => item.status === "missing")
      .map((item) => item.key),
    latest_verification: {
      generated_at: summary.report?.generated_at || "",
      evidence_scope: summary.report
        ? "verification_report snapshot; status does not probe the network or start the target service"
        : "missing verification_report",
      status: summary.report?.status || "missing",
      level2: summary.report?.context?.level2 === true,
      runtime_url: summary.report?.context?.runtimeUrl || "",
      pass: summary.reportCounts.pass,
      warn: summary.reportCounts.warn,
      fail: summary.reportCounts.fail,
    },
    completion_decision: summary.completionDecision,
    security_warnings: summary.securityWarnings,
    next_actions: summary.nextActions,
  };
}

function printPackageStatus(status: PackageStatus): void {
  const missing = status.missing_required_values.length
    ? status.missing_required_values.join(", ")
    : "none";
  const verification = status.latest_verification;

  console.log(`MVP status: ${status.state}`);
  console.log(`Target service: ${status.target_service}`);
  console.log(`Package: ${status.package_path}`);
  if (status.state === "external_context_missing") {
    console.log(`Context request: ${status.context_request_path}`);
  }
  if (status.context_reply.localJsonPresent) {
    console.log(`Context reply local JSON: ${status.context_reply.localJsonPath}`);
    if (status.context_reply.parseError) {
      console.log(`Context reply parse error: ${status.context_reply.parseError}`);
    } else {
      console.log(`Context reply: answered=${status.context_reply.answeredQuestions}/${status.context_reply.totalQuestions}, blockers=${status.context_reply.blockedCount}, secure_channel=${status.context_reply.secureSecretChannelPresent ? "yes" : "no"}`);
    }
  }
  if (status.manual_evidence.localPresent) {
    console.log(`Manual evidence local file: ${status.manual_evidence.localPath}`);
    if (status.manual_evidence.parseError) {
      console.log(`Manual evidence parse error: ${status.manual_evidence.parseError}`);
    }
  }
  console.log(`Handoff ready: ${status.handoff_ready ? "yes" : "no"}`);
  console.log(`Missing required values: ${missing}`);
  console.log(`Latest verification: ${verification.status} (level2=${verification.level2 ? "yes" : "no"}, pass=${verification.pass}, warn=${verification.warn}, fail=${verification.fail})`);
  console.log(`Latest verification generated at: ${verification.generated_at || "missing"}`);
  console.log(`Latest verification scope: ${verification.evidence_scope}`);
  if (verification.runtime_url) {
    console.log(`Runtime URL checked: ${verification.runtime_url}`);
  }
  console.log(`Completion decision: level2=${status.completion_decision.level2Verified ? "yes" : "no"}, evidence=${status.completion_decision.manualEvidencePresent ? "yes" : "no"}, issues=${status.completion_decision.remainingIssuesDocumented ? "yes" : "no"}, handoff=${status.completion_decision.handoffApproved ? "yes" : "no"}`);
  if (status.security_warnings.length) {
    console.log(`Security warnings: ${status.security_warnings.length}`);
  }
  console.log(`Next action: ${status.next_actions[0] || "none"}`);
}
