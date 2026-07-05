import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { getStringOption, hasOption } from "../args.js";
import { readEnvFileIfExists } from "../env-utils.js";
import { readJsonFile, writeJson, writeText } from "../fs-utils.js";
import { getJsonWithTimeout, normalizeBaseUrl, postJsonWithTimeout } from "../http-utils.js";
import { configuredValue } from "../placeholder-utils.js";
import { buildFormFieldMaps, formFieldName } from "../field-mapping.js";
import { hostModeUsesLongConnection, hostModeUsesWebhook, normalizeHostReceiveMode, type HostReceiveMode, type IntegrationMode } from "../host-mode.js";
import type { ProbeResult } from "../http-utils.js";
import type { CapabilityMap, InteractionContract, RequiredPermissions, ServiceManifest } from "../types.js";
import { assessPublicCallbackBaseUrl } from "../url-validation.js";

interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export async function verifyCommand(args: string[], options: Record<string, string | boolean>): Promise<void> {
  const packageArg = args[0];
  if (!packageArg) {
    throw new Error("Usage: lark-deployer verify <generated-package-or-analysis-workspace> [--env <file>] [--mode embedded-adapter|standalone-runtime|self-hosted-runtime] [--host-mode embedded-webhook|embedded-long-connection|hybrid|standalone-runtime] [--runtime-url <url>] [--host-runtime-url <url>] [--simulate] [--send-start-card] [--level2] [--strict] [--allow-local-callback]");
  }

  const packagePath = path.resolve(packageArg);
  const mode = getStringOption(options, "mode", getStringOption(options, "integration-mode", getStringOption(options, "integrationMode", "standalone-runtime")));
  const integrationMode = normalizeVerifyIntegrationMode(mode);
  const hostReceiveMode = normalizeHostReceiveMode(getStringOption(options, "host-mode", getStringOption(options, "hostMode", "")), integrationMode);
  const level2 = hasOption(options, "level2");
  const strict = hasOption(options, "strict") || level2;
  const envPath = getStringOption(options, "env", path.join(packagePath, "bot-runtime", ".env"));
  const hostRuntimeUrl = normalizeBaseUrl(getStringOption(options, "host-runtime-url", getStringOption(options, "hostRuntimeUrl", "")));
  const runtimeUrl = normalizeBaseUrl(getStringOption(options, "runtime-url", getStringOption(options, "runtimeUrl", "")));
  const simulate = hasOption(options, "simulate") || level2;
  const sendStartCard = hasOption(options, "send-start-card") || hasOption(options, "sendStartCard") || level2;
  const allowLocalCallback = hasOption(options, "allow-local-callback") || hasOption(options, "allowLocalCallback");
  const reportDir = path.resolve(getStringOption(options, "report-dir", packagePath));
  const checks: CheckResult[] = [];

  const manifestDir = fs.existsSync(path.join(packagePath, "manifest"))
    ? path.join(packagePath, "manifest")
    : path.join(packagePath, "manifest");

  checks.push(checkFile("service_manifest", path.join(manifestDir, "service_manifest.json")));
  checks.push(checkFile("capability_map", path.join(manifestDir, "capability_map.json")));
  checks.push(checkFile("interaction_contract", path.join(manifestDir, "interaction_contract.json")));
  checks.push(checkFile("required_permissions", path.join(manifestDir, "required_permissions.json")));

  let service: ServiceManifest | undefined;
  let permissions: RequiredPermissions | undefined;
  let capabilities: CapabilityMap | undefined;
  let interactions: InteractionContract | undefined;
  try {
    service = readJsonFile<ServiceManifest>(path.join(manifestDir, "service_manifest.json"));
    capabilities = readJsonFile<CapabilityMap>(path.join(manifestDir, "capability_map.json"));
    interactions = readJsonFile<InteractionContract>(path.join(manifestDir, "interaction_contract.json"));
    permissions = readJsonFile<RequiredPermissions>(path.join(manifestDir, "required_permissions.json"));
  } catch (error) {
    checks.push({
      name: "manifest_parse",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (mode === "embedded-adapter" || mode === "embedded") {
    checks.push(...buildEmbeddedAdapterChecks(packagePath, interactions, permissions));
    checks.push(...await buildEmbeddedHostValidationChecks({ hostRuntimeUrl, hostReceiveMode, simulate, sendStartCard, level2 }));
    printChecks(checks);
    writeReports(reportDir, checks, {
      packagePath,
      envPath,
      runtimeUrl,
      hostRuntimeUrl,
      hostReceiveMode,
      simulate,
      sendStartCard,
      level2,
      targetBaseUrl: "",
      mode: "embedded-adapter",
    });
    const failed = checks.some((check) => check.status === "fail");
    const warned = checks.some((check) => check.status === "warn");
    if (failed || (strict && warned)) {
      process.exitCode = 1;
    }
    return;
  }

  if (integrationMode === "self-hosted-runtime") {
    checks.push(...buildSelfHostedRuntimeChecks(packagePath));
    printChecks(checks);
    writeReports(reportDir, checks, {
      packagePath,
      envPath: path.join(packagePath, "feishu-host", ".env"),
      runtimeUrl: "",
      hostRuntimeUrl,
      hostReceiveMode,
      simulate: false,
      sendStartCard: false,
      level2,
      targetBaseUrl: "",
      mode: "self-hosted-runtime",
    });
    const failed = checks.some((check) => check.status === "fail");
    const warned = checks.some((check) => check.status === "warn");
    if (failed || (strict && warned)) {
      process.exitCode = 1;
    }
    return;
  }

  const env = sanitizeEnv(readEnvFileIfExists(envPath));
  if (fs.existsSync(envPath)) {
    checks.push({ name: "env_file", status: "pass", detail: envPath });
  } else {
    checks.push({ name: "env_file", status: "warn", detail: `No .env file found at ${envPath}. Use .env.example before real verification.` });
  }

  const requiredEnv = ["APP_ID", "APP_SECRET", "VERIFICATION_TOKEN", "TEST_CHAT_ID"];
  for (const key of requiredEnv) {
    const value = envValue(env, key);
    checks.push({
      name: `env:${key}`,
      status: value ? "pass" : "warn",
      detail: value ? "provided" : "missing; required for real Feishu verification",
    });
  }

  const callbackBaseUrl = envValue(env, "PUBLIC_CALLBACK_BASE_URL");
  const callbackUrlAssessment = assessPublicCallbackBaseUrl(callbackBaseUrl, { level2, allowLocalCallback });
  const verificationToken = envValue(env, "VERIFICATION_TOKEN");
  const encryptKey = envValue(env, "ENCRYPT_KEY");
  const debugHeaders = buildDebugHeaders(envValue(env, "DEBUG_ACCESS_TOKEN"));
  checks.push({
    name: "env:PUBLIC_CALLBACK_BASE_URL",
    status: callbackBaseUrl ? "pass" : "warn",
    detail: callbackBaseUrl
      ? `${callbackUrlAssessment.normalizedBaseUrl || normalizeBaseUrl(callbackBaseUrl)}/webhook/card`
      : "missing; required to configure Feishu card callback for real Level 2 verification",
  });
  if (callbackBaseUrl) {
    checks.push({
      name: "env:PUBLIC_CALLBACK_BASE_URL:public-url",
      status: callbackUrlAssessment.status,
      detail: callbackUrlAssessment.detail,
    });
  }
  if (level2 && callbackBaseUrl && callbackUrlAssessment.canProbe) {
    const callbackProbeBaseUrl = callbackUrlAssessment.normalizedBaseUrl || normalizeBaseUrl(callbackBaseUrl);
    const publicChallenge = "lark-deployer-public-challenge";
    const callbackProbe = await postJsonWithTimeout(
      `${callbackProbeBaseUrl}/webhook/card`,
      { type: "url_verification", challenge: publicChallenge },
      5000,
    );
    checks.push({
      name: "callback:/webhook/card:public-challenge",
      status: isExpectedChallenge(callbackProbe.data, publicChallenge) ? "pass" : "fail",
      detail: callbackProbe.status === "available"
        ? `POST ${callbackProbeBaseUrl}/webhook/card returned ${JSON.stringify(callbackProbe.data)}.`
        : formatProbeDetail(callbackProbe),
    });
    if (encryptKey) {
      const publicEncryptedChallenge = "lark-deployer-public-encrypted-challenge";
      const encryptedCallbackProbe = await postJsonWithTimeout(
        `${callbackProbeBaseUrl}/webhook/card`,
        buildUrlVerificationPayload(publicEncryptedChallenge, encryptKey),
        5000,
      );
      checks.push({
        name: "callback:/webhook/card:public-encrypted-challenge",
        status: isExpectedChallenge(encryptedCallbackProbe.data, publicEncryptedChallenge) ? "pass" : "fail",
        detail: encryptedCallbackProbe.status === "available"
          ? `POST ${normalizeBaseUrl(callbackBaseUrl)}/webhook/card accepted an encrypted URL verification payload.`
        : formatProbeDetail(encryptedCallbackProbe),
      });
    }
    if (verificationToken && capabilities) {
      const signedActionPayload = buildWebhookCardActionPayload(capabilities);
      const publicSignedActionProbe = await postSignedCardAction(
        `${callbackProbeBaseUrl}/webhook/card`,
        signedActionPayload,
        verificationToken,
        180000,
      );
      checks.push({
        name: "callback:/webhook/card:public-signed-action",
        status: isExpectedAcceptedActionCard(publicSignedActionProbe.data) ? "pass" : "fail",
        detail: isExpectedAcceptedActionCard(publicSignedActionProbe.data)
          ? `POST ${callbackProbeBaseUrl}/webhook/card accepted a signed card action.`
          : formatProbeDetail(publicSignedActionProbe),
      });
    }
  }

  const targetBaseUrl = normalizeBaseUrl(
    configuredValue(getStringOption(options, "base-url", env.IMAGE_AGENT_BASE_URL || configuredValue(service?.service.base_url) || "")),
  );
  const targetProbe = await getJsonWithTimeout(targetBaseUrl ? `${targetBaseUrl}/api/meta` : "", 5000);
  checks.push({
    name: "target:/api/meta",
    status: targetProbe.status === "available" ? "pass" : "warn",
    detail: formatProbeDetail(targetProbe),
  });

  if (runtimeUrl) {
    const runtimeProbe = await getJsonWithTimeout(`${runtimeUrl}/health`, 3000);
    checks.push({
      name: "runtime:/health",
      status: runtimeProbe.status === "available" ? "pass" : "fail",
      detail: formatProbeDetail(runtimeProbe),
    });
    if (runtimeProbe.status === "available") {
      checks.push(...buildRuntimeHealthChecks(runtimeProbe.data, {
        targetBaseUrl,
        callbackBaseUrl: callbackUrlAssessment.normalizedBaseUrl || normalizeBaseUrl(callbackBaseUrl),
        env,
        level2,
      }));
    }

    const challengeProbe = await postJsonWithTimeout(
      `${runtimeUrl}/webhook/card`,
      { type: "url_verification", challenge: "lark-deployer-local-challenge" },
      3000,
    );
    checks.push({
      name: "runtime:/webhook/card:challenge",
      status: isExpectedChallenge(challengeProbe.data, "lark-deployer-local-challenge") ? "pass" : "fail",
      detail: challengeProbe.status === "available"
        ? `POST ${runtimeUrl}/webhook/card returned ${JSON.stringify(challengeProbe.data)}.`
        : formatProbeDetail(challengeProbe),
    });

    if (encryptKey) {
      const localEncryptedChallenge = "lark-deployer-local-encrypted-challenge";
      const encryptedChallengeProbe = await postJsonWithTimeout(
        `${runtimeUrl}/webhook/card`,
        buildUrlVerificationPayload(localEncryptedChallenge, encryptKey),
        3000,
      );
      checks.push({
        name: "runtime:/webhook/card:encrypted-challenge",
        status: isExpectedChallenge(encryptedChallengeProbe.data, localEncryptedChallenge) ? "pass" : "fail",
        detail: encryptedChallengeProbe.status === "available"
          ? `POST ${runtimeUrl}/webhook/card accepted an encrypted URL verification payload.`
          : formatProbeDetail(encryptedChallengeProbe),
      });
    }

    if (simulate) {
      const simulationProbe = await postJsonWithTimeout(`${runtimeUrl}/debug/simulate-generate`, {}, 180000, debugHeaders);
      checks.push({
        name: "runtime:/debug/simulate-generate",
        status: simulationProbe.status === "available" ? "pass" : "fail",
        detail: formatProbeDetail(simulationProbe),
      });
      const iterateSessionId = extractSessionIdFromSimulation(simulationProbe.data);
      if (iterateSessionId) {
        const iterateProbe = await postJsonWithTimeout(
          `${runtimeUrl}/debug/simulate-card-action`,
          {
            action: "image.iterate.submit",
            session_id: iterateSessionId,
            formValue: { param_feedback: "Make the image cleaner and more conversion-focused." },
          },
          180000,
          debugHeaders,
        );
        checks.push({
          name: "runtime:/debug/simulate-card-action:iterate",
          status: iterateProbe.status === "available" ? "pass" : "fail",
          detail: formatProbeDetail(iterateProbe),
        });
      } else {
        checks.push({
          name: "runtime:/debug/simulate-card-action:iterate",
          status: "warn",
          detail: "simulate-generate did not return result.session_id, so /api/iterate was not checked.",
        });
      }

      const cardActionProbe = await postJsonWithTimeout(`${runtimeUrl}/debug/simulate-card-action`, {}, 180000, debugHeaders);
      checks.push({
        name: "runtime:/debug/simulate-card-action",
        status: cardActionProbe.status === "available" ? "pass" : "fail",
        detail: formatProbeDetail(cardActionProbe),
      });

      const v2CardActionProbe = await postJsonWithTimeout(
        `${runtimeUrl}/debug/simulate-card-action`,
        { eventShape: "v2", valueAsJsonString: true },
        180000,
        debugHeaders,
      );
      checks.push({
        name: "runtime:/debug/simulate-card-action:v2",
        status: v2CardActionProbe.status === "available" ? "pass" : "fail",
        detail: formatProbeDetail(v2CardActionProbe),
      });

      const alternateTemplateFormValue = capabilities ? buildAlternateTemplateFormValue(capabilities) : undefined;
      if (alternateTemplateFormValue) {
        const alternateTemplateProbe = await postJsonWithTimeout(
          `${runtimeUrl}/debug/simulate-card-action`,
          { formValue: alternateTemplateFormValue },
          180000,
          debugHeaders,
        );
        checks.push({
          name: "runtime:/debug/simulate-card-action:alternate-template",
          status: alternateTemplateProbe.status === "available" ? "pass" : "fail",
          detail: formatProbeDetail(alternateTemplateProbe),
        });
      }

      if (capabilities && hasCapability(capabilities, "image.batch")) {
        const batchProbe = await postJsonWithTimeout(
          `${runtimeUrl}/debug/simulate-card-action`,
          { action: "image.batch.submit" },
          180000,
          debugHeaders,
        );
        const batchId = extractBatchIdFromSimulation(batchProbe.data);
        checks.push({
          name: "runtime:/debug/simulate-card-action:batch",
          status: batchProbe.status === "available" && batchId ? "pass" : "fail",
          detail: batchProbe.status === "available" && batchId
            ? `${formatProbeDetail(batchProbe)} Batch id: ${batchId}.`
            : formatProbeDetail(batchProbe),
        });

        if (batchId) {
          const batchRefreshProbe = await postJsonWithTimeout(
            `${runtimeUrl}/debug/simulate-card-action`,
            {
              action: "image.batch.refresh",
              batch_id: batchId,
            },
            180000,
            debugHeaders,
          );
          checks.push({
            name: "runtime:/debug/simulate-card-action:batch-refresh",
            status: batchRefreshProbe.status === "available" ? "pass" : "fail",
            detail: formatProbeDetail(batchRefreshProbe),
          });
        } else {
          checks.push({
            name: "runtime:/debug/simulate-card-action:batch-refresh",
            status: "fail",
            detail: "Batch submit simulation did not return batchId, so refresh could not be checked.",
          });
        }
      }

      const invalidCardActionProbe = await postJsonWithTimeout(
        `${runtimeUrl}/debug/simulate-card-action`,
        { formValue: { param_size: "invalid-size" } },
        30000,
        debugHeaders,
      );
      checks.push({
        name: "runtime:/debug/simulate-card-action:invalid-input",
        status: isExpectedValidationFailure(invalidCardActionProbe.data) ? "pass" : "fail",
        detail: isExpectedValidationFailure(invalidCardActionProbe.data)
          ? "Runtime rejected invalid form input with a failure card."
          : formatProbeDetail(invalidCardActionProbe),
      });

      if (verificationToken && capabilities) {
        const signedActionProbe = await postSignedCardAction(
          `${runtimeUrl}/webhook/card`,
          buildWebhookCardActionPayload(capabilities),
          verificationToken,
          180000,
        );
        checks.push({
          name: "runtime:/webhook/card:signed-action",
          status: isExpectedAcceptedActionCard(signedActionProbe.data) ? "pass" : "fail",
          detail: isExpectedAcceptedActionCard(signedActionProbe.data)
            ? `POST ${runtimeUrl}/webhook/card accepted a signed card action.`
            : formatProbeDetail(signedActionProbe),
        });
      } else {
        checks.push({
          name: "runtime:/webhook/card:signed-action",
          status: "warn",
          detail: verificationToken
            ? "capability_map.json was not available; signed webhook card action was not checked."
            : "VERIFICATION_TOKEN missing; signed webhook card action was not checked.",
        });
      }
    }

    if (sendStartCard) {
      const startCardProbe = await postJsonWithTimeout(`${runtimeUrl}/debug/start-card`, {}, 30000, debugHeaders);
      checks.push({
        name: "runtime:/debug/start-card",
        status: startCardProbe.status === "available" ? "pass" : "fail",
        detail: formatProbeDetail(startCardProbe),
      });
    }
  } else {
    checks.push({
      name: "runtime:/health",
      status: "warn",
      detail: "No --runtime-url provided; runtime health was not checked.",
    });
    if (simulate) {
      if (capabilities && buildAlternateTemplateFormValue(capabilities)) {
        checks.push({
          name: "runtime:/debug/simulate-card-action:alternate-template",
          status: "fail",
          detail: "--simulate requires --runtime-url.",
        });
      }
      checks.push({
        name: "runtime:/debug/simulate-generate",
        status: "fail",
        detail: "--simulate requires --runtime-url.",
      });
      checks.push({
        name: "runtime:/debug/simulate-card-action",
        status: "fail",
        detail: "--simulate requires --runtime-url.",
      });
      checks.push({
        name: "runtime:/debug/simulate-card-action:iterate",
        status: "fail",
        detail: "--simulate requires --runtime-url.",
      });
      checks.push({
        name: "runtime:/debug/simulate-card-action:v2",
        status: "fail",
        detail: "--simulate requires --runtime-url.",
      });
      checks.push({
        name: "runtime:/debug/simulate-card-action:invalid-input",
        status: "fail",
        detail: "--simulate requires --runtime-url.",
      });
      if (capabilities && hasCapability(capabilities, "image.batch")) {
        checks.push({
          name: "runtime:/debug/simulate-card-action:batch",
          status: "fail",
          detail: "--simulate requires --runtime-url.",
        });
        checks.push({
          name: "runtime:/debug/simulate-card-action:batch-refresh",
          status: "fail",
          detail: "--simulate requires --runtime-url.",
        });
      }
    }
    if (sendStartCard) {
      checks.push({
        name: "runtime:/debug/start-card",
        status: "fail",
        detail: "--send-start-card requires --runtime-url.",
      });
    }
  }

  if (permissions) {
    checks.push({
      name: "permission_context",
      status: permissions.context_requirements.length ? "pass" : "warn",
      detail: `${permissions.context_requirements.length} context requirements listed.`,
    });
  }

  printChecks(checks);
  writeReports(reportDir, checks, {
    packagePath,
    envPath,
    runtimeUrl,
    simulate,
    sendStartCard,
    level2,
    targetBaseUrl,
    mode,
  });
  const failed = checks.some((check) => check.status === "fail");
  const warned = checks.some((check) => check.status === "warn");
  if (failed || (strict && warned)) {
    process.exitCode = 1;
  }
}

function normalizeVerifyIntegrationMode(value: string): IntegrationMode {
  const normalized = value.trim() || "standalone-runtime";
  if (normalized === "embedded" || normalized === "embedded-adapter") return "embedded-adapter";
  if (normalized === "standalone" || normalized === "standalone-runtime") return "standalone-runtime";
  if (normalized === "self-hosted" || normalized === "self-hosted-runtime") return "self-hosted-runtime";
  throw new Error('--mode must be "embedded-adapter", "standalone-runtime", or "self-hosted-runtime".');
}

function checkFile(name: string, filePath: string): CheckResult {
  return fs.existsSync(filePath)
    ? { name, status: "pass", detail: filePath }
    : { name, status: "fail", detail: `Missing ${filePath}` };
}

function buildEmbeddedAdapterChecks(packagePath: string, interactions: InteractionContract | undefined, permissions: RequiredPermissions | undefined): CheckResult[] {
  const handlerPath = path.join(packagePath, "adapter", "handlers.ts");
  const handlerSource = fs.existsSync(handlerPath) ? fs.readFileSync(handlerPath, "utf8") : "";
  const checks = [
    checkFile("adapter:handlers", path.join(packagePath, "adapter", "handlers.ts")),
    checkFile("adapter:cards", path.join(packagePath, "adapter", "cards.ts")),
    checkFile("adapter:service-client", path.join(packagePath, "adapter", "service-client.ts")),
    checkFile("adapter:validation", path.join(packagePath, "adapter", "validation.ts")),
    checkFile("adapter:types", path.join(packagePath, "adapter", "types.ts")),
    checkFile("adapter:audit-events", path.join(packagePath, "adapter", "audit-events.ts")),
    checkFile("adapter:integration-guide", path.join(packagePath, "docs", "integration_guide.md")),
    checkFile("adapter:level2-record", path.join(packagePath, "level2_verification_record.md")),
  ];
  const cardActionInteractions = interactions?.interactions.filter((item) => item.trigger === "card_action") || [];
  for (const interaction of cardActionInteractions) {
    const actionId = adapterActionIdForInteraction(interaction.input_mode);
    if (!actionId) continue;
    const supportsAction = handlerSource.includes(actionId);
    checks.push({
      name: `adapter:action:${actionId}`,
      status: supportsAction ? "pass" : "fail",
      detail: supportsAction
        ? `adapter/handlers.ts supports ${actionId} for ${interaction.capability_id}.`
        : `adapter/handlers.ts does not support ${actionId} for ${interaction.capability_id}.`,
    });
  }
  checks.push(checkRequiredPermissionsMatchInteractions(interactions, permissions));
  checks.push(checkAdapterStartCardBuilder(packagePath));
  checks.push(checkAdapterTypeScriptCompile(packagePath));
  checks.push(...executeEmbeddedAdapterSmoke(packagePath));
  return checks;
}

function buildSelfHostedRuntimeChecks(packagePath: string): CheckResult[] {
  const checks: CheckResult[] = [];
  const feishuHostDir = path.join(packagePath, "feishu-host");
  const specDir = path.join(feishuHostDir, "spec");
  const summaryPath = path.join(packagePath, "generation_summary.json");
  checks.push(checkFile("self-hosted:feishu-host", feishuHostDir));
  checks.push(checkFile("self-hosted:integration-guide", path.join(packagePath, "docs", "integration_guide.md")));
  for (const file of [
    ".env.example",
    "requirements.txt",
    "config.py",
    "cards.py",
    "service_client.py",
    "validation.py",
    "handlers.py",
    "app.py",
    "local_contract_test.py",
    "README.md",
  ]) {
    checks.push(checkFile(`self-hosted:${file}`, path.join(feishuHostDir, file)));
  }
  const specNames = ["start_card.json", "field_map.json", "endpoints.json", "preset.json", "template_specs.json", "field_specs.json"];
  for (const file of specNames) {
    checks.push(checkFile(`self-hosted:spec:${file}`, path.join(specDir, file)));
  }

  const summary = readJsonCheck<Record<string, unknown>>(summaryPath, "self-hosted:summary:parse", checks);
  if (summary) {
    checks.push({
      name: "self-hosted:summary:integration-mode",
      status: summary.integration_mode === "self-hosted-runtime" ? "pass" : "fail",
      detail: `generation_summary.json integration_mode=${String(summary.integration_mode)}.`,
    });
    checks.push({
      name: "self-hosted:summary:host-receive-mode",
      status: summary.host_receive_mode === "embedded-long-connection" ? "pass" : "fail",
      detail: `generation_summary.json host_receive_mode=${String(summary.host_receive_mode)}.`,
    });
  }

  const specs: Record<string, unknown> = {};
  for (const file of specNames) {
    const parsed = readJsonCheck<unknown>(path.join(specDir, file), `self-hosted:spec:${file}:parse`, checks);
    if (parsed !== undefined) specs[file] = parsed;
  }
  checks.push(checkSelfHostedEnvExample(path.join(feishuHostDir, ".env.example")));
  checks.push(checkSelfHostedEndpoints(specs["endpoints.json"]));
  checks.push(checkSelfHostedStartCard(specs["start_card.json"]));
  checks.push(checkSelfHostedFieldMap(specs["field_map.json"]));
  checks.push(...runSelfHostedPythonChecks(feishuHostDir));
  return checks;
}

function readJsonCheck<T>(filePath: string, name: string, checks: CheckResult[]): T | undefined {
  try {
    const parsed = readJsonFile<T>(filePath);
    checks.push({ name, status: "pass", detail: `${filePath} parsed as JSON.` });
    return parsed;
  } catch (error) {
    checks.push({ name, status: "fail", detail: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

function checkSelfHostedEnvExample(envExamplePath: string): CheckResult {
  const source = fs.existsSync(envExamplePath) ? fs.readFileSync(envExamplePath, "utf8") : "";
  const required = [
    "FEISHU_APP_ID",
    "FEISHU_APP_SECRET",
    "FEISHU_CONNECTION_MODE=websocket",
    "IMAGE_AGENT_BASE_URL",
    "FEISHU_ALLOWED_USERS",
    "IMAGE_AGENT_TIMEOUT_MS",
    "TEST_CHAT_ID",
  ];
  const missing = required.filter((key) => !new RegExp(`^${escapeRegExp(key)}`, "m").test(source));
  return {
    name: "self-hosted:env-example",
    status: missing.length ? "fail" : "pass",
    detail: missing.length ? `.env.example missing keys: ${missing.join(", ")}.` : ".env.example contains locked self-hosted env keys.",
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkSelfHostedEndpoints(value: unknown): CheckResult {
  const actions = isRecord(value) && isRecord(value.actions) ? value.actions : {};
  const required = ["image.generate.submit", "image.iterate.submit", "image.batch.submit", "image.batch.refresh"];
  const missing = required.filter((action) => !isRecord(actions[action]));
  const supporting = isRecord(value) && isRecord(value.supporting_endpoints) ? value.supporting_endpoints : {};
  if (!missing.length && isRecord(supporting.batch_download)) {
    return { name: "self-hosted:endpoints", status: "pass", detail: "endpoints.json covers four card actions and batch_download." };
  }
  return {
    name: "self-hosted:endpoints",
    status: "fail",
    detail: `endpoints.json missing actions/supporting endpoints: ${[...missing, ...(!isRecord(supporting.batch_download) ? ["batch_download"] : [])].join(", ")}.`,
  };
}

function checkSelfHostedStartCard(value: unknown): CheckResult {
  const actions = collectCardActionValues(value);
  const missing = ["image.generate.submit", "image.batch.submit"].filter((action) => !actions.includes(action));
  return {
    name: "self-hosted:start-card-actions",
    status: missing.length ? "fail" : "pass",
    detail: missing.length ? `start_card.json missing actions: ${missing.join(", ")}.` : "start_card.json contains generate and batch submit actions.",
  };
}

function checkSelfHostedFieldMap(value: unknown): CheckResult {
  const ok = isRecord(value) && isRecord(value.templateKeyToFormField) && isRecord(value.formFieldToTemplateKey);
  return {
    name: "self-hosted:field-map",
    status: ok ? "pass" : "fail",
    detail: ok ? "field_map.json contains templateKeyToFormField and formFieldToTemplateKey." : "field_map.json is missing bidirectional mapping objects.",
  };
}

function collectCardActionValues(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const current = isRecord(record.value) && typeof record.value.action === "string" ? [record.value.action] : [];
  const children = Array.isArray(value) ? value : Object.values(record);
  return current.concat(children.flatMap(collectCardActionValues));
}

function runSelfHostedPythonChecks(feishuHostDir: string): CheckResult[] {
  const checks: CheckResult[] = [];
  const python = findPythonCommand();
  if (!python) {
    checks.push({ name: "self-hosted:python", status: "warn", detail: "No runnable Python command found; py_compile, local contract, and selfcheck were not run." });
    return checks;
  }
  checks.push({ name: "self-hosted:python", status: "pass", detail: `Using Python command: ${python}.` });
  const pyFiles = ["config.py", "cards.py", "service_client.py", "validation.py", "handlers.py", "app.py", "local_contract_test.py"].map((file) => path.join(feishuHostDir, file));
  checks.push(runCommandCheck("self-hosted:python:py_compile", python, ["-m", "py_compile", ...pyFiles], feishuHostDir, "Generated Python files compile."));
  if (!pythonCanImport(python, "requests", feishuHostDir)) {
    checks.push({ name: "self-hosted:python:requests", status: "warn", detail: "Python cannot import requests; local_contract_test.py was not run. Install feishu-host/requirements.txt." });
  } else {
    checks.push({ name: "self-hosted:python:requests", status: "pass", detail: "Python can import requests." });
    checks.push(runCommandCheck("self-hosted:python:local-contract", python, [path.join(feishuHostDir, "local_contract_test.py")], feishuHostDir, "local_contract_test.py passed."));
  }
  if (!pythonCanImport(python, "lark_oapi", feishuHostDir)) {
    checks.push({ name: "self-hosted:python:lark-oapi", status: "warn", detail: "Python cannot import lark_oapi; app.py --selfcheck was not run. Install feishu-host/requirements.txt." });
  } else {
    checks.push({ name: "self-hosted:python:lark-oapi", status: "pass", detail: "Python can import lark_oapi." });
    checks.push(runCommandCheck("self-hosted:python:selfcheck", python, [path.join(feishuHostDir, "app.py"), "--selfcheck"], feishuHostDir, "app.py --selfcheck passed."));
  }
  return checks;
}

function findPythonCommand(): string {
  for (const command of ["python", "py"]) {
    try {
      execFileSync(command, ["--version"], { stdio: "pipe" });
      return command;
    } catch {
      // try next
    }
  }
  return "";
}

function pythonCanImport(python: string, moduleName: string, cwd: string): boolean {
  try {
    execFileSync(python, ["-c", `import ${moduleName}`], { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function runCommandCheck(name: string, command: string, args: string[], cwd: string, passDetail: string): CheckResult {
  try {
    const output = execFileSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
    return { name, status: "pass", detail: output ? `${passDetail} Output: ${output}` : passDetail };
  } catch (error) {
    const detailParts: string[] = [];
    if (error && typeof error === "object" && "stdout" in error) detailParts.push(String((error as { stdout?: Buffer | string }).stdout || "").trim());
    if (error && typeof error === "object" && "stderr" in error) detailParts.push(String((error as { stderr?: Buffer | string }).stderr || "").trim());
    if (error instanceof Error) detailParts.push(error.message);
    return { name, status: "fail", detail: detailParts.filter(Boolean).join("\n") || `${command} ${args.join(" ")} failed.` };
  }
}

function checkAdapterStartCardBuilder(packagePath: string): CheckResult {
  const cardsPath = path.join(packagePath, "adapter", "cards.ts");
  const source = fs.existsSync(cardsPath) ? fs.readFileSync(cardsPath, "utf8") : "";
  const hasBuilder = source.includes("export function buildStartCard")
    && source.includes("image_generate_form")
    && source.includes("image.batch.submit")
    && source.includes("param_batch_items_json");
  return {
    name: "adapter:start-card-builder",
    status: hasBuilder ? "pass" : "fail",
    detail: hasBuilder
      ? "adapter/cards.ts exports buildStartCard with generate and batch form actions."
      : "adapter/cards.ts does not export a complete buildStartCard generate/batch form builder.",
  };
}

function checkAdapterTypeScriptCompile(packagePath: string): CheckResult {
  const tscPath = path.resolve("node_modules", "typescript", "bin", "tsc");
  if (!fs.existsSync(tscPath)) {
    return { name: "adapter:typescript-compile", status: "warn", detail: "typescript is not installed; cannot compile generated adapter." };
  }
  const files = ["audit-events.ts", "cards.ts", "service-client.ts", "validation.ts", "types.ts", "handlers.ts"]
    .map((file) => path.join(packagePath, "adapter", file));
  try {
    execFileSync(process.execPath, [
      tscPath,
      "--noEmit",
      "--target", "ES2022",
      "--module", "NodeNext",
      "--moduleResolution", "NodeNext",
      "--strict",
      "--skipLibCheck",
      ...files,
    ], { cwd: packagePath, stdio: "pipe" });
    return { name: "adapter:typescript-compile", status: "pass", detail: "Generated adapter TypeScript compiles with tsc --noEmit." };
  } catch (error) {
    const detail = error && typeof error === "object" && "stderr" in error
      ? String((error as { stderr?: Buffer }).stderr || "").trim()
      : error instanceof Error ? error.message : String(error);
    return { name: "adapter:typescript-compile", status: "fail", detail: detail || "Generated adapter TypeScript compilation failed." };
  }
}

function executeEmbeddedAdapterSmoke(packagePath: string): CheckResult[] {
  try {
    const cardsUrl = pathToFileURL(path.join(packagePath, "adapter", "cards.js")).href;
    const handlersUrl = pathToFileURL(path.join(packagePath, "adapter", "handlers.js")).href;
    const script = `
      const cards = await import(${JSON.stringify(cardsUrl)});
      const handlers = await import(${JSON.stringify(handlersUrl)});
      const startCard = cards.buildStartCard();
      if (!startCard?.elements?.some((item) => item?.name === "image_generate_form")) throw new Error("missing image_generate_form");
      if (!JSON.stringify(startCard).includes("image.batch.submit")) throw new Error("missing image.batch.submit");
      const result = await handlers.handleImageAgentCardAction({ action: "unsupported.action" }, { imageAgentBaseUrl: "http://127.0.0.1:1" });
      if (result?.ok !== false || !result?.card) throw new Error("handler did not return a failure card for unsupported action");
    `;
    execFileSync(process.execPath, ["--input-type=module", "--eval", script], { cwd: packagePath, stdio: "pipe" });
    return [
      { name: "adapter:start-card-execution", status: "pass", detail: "Generated adapter JS buildStartCard executes and returns generate/batch forms." },
      { name: "adapter:handler-execution", status: "pass", detail: "Generated adapter JS handler executes and returns failure cards for unsupported actions." },
    ];
  } catch (error) {
    const detail = error && typeof error === "object" && "stderr" in error
      ? String((error as { stderr?: Buffer }).stderr || "").trim()
      : error instanceof Error ? error.message : String(error);
    return [
      { name: "adapter:start-card-execution", status: "fail", detail: detail || "Generated adapter JS start-card execution failed." },
      { name: "adapter:handler-execution", status: "fail", detail: detail || "Generated adapter JS handler execution failed." },
    ];
  }
}

function checkRequiredPermissionsMatchInteractions(interactions: InteractionContract | undefined, permissions: RequiredPermissions | undefined): CheckResult {
  if (!interactions || !permissions) {
    return {
      name: "adapter:permissions-interactions",
      status: "fail",
      detail: "Cannot compare required_permissions.json with interaction_contract.json because one or both did not parse.",
    };
  }

  const interactionIds = new Set(interactions.interactions.map((interaction) => interaction.id));
  const capabilityIds = new Set(interactions.interactions.map((interaction) => interaction.capability_id));
  const validRequiredBy = new Set<string>();
  for (const id of interactionIds) {
    validRequiredBy.add(id);
    validRequiredBy.add(`${id}.async`);
  }
  for (const capabilityId of capabilityIds) validRequiredBy.add(capabilityId);

  const unknownRefs: string[] = [];
  for (const scope of permissions.scopes) {
    for (const ref of scope.required_by) {
      if (!validRequiredBy.has(ref)) unknownRefs.push(`scope ${scope.scope}: ${ref}`);
    }
  }
  for (const callback of permissions.callbacks) {
    for (const ref of callback.required_by) {
      if (!validRequiredBy.has(ref)) unknownRefs.push(`callback ${callback.callback}: ${ref}`);
    }
  }

  return {
    name: "adapter:permissions-interactions",
    status: unknownRefs.length ? "fail" : "pass",
    detail: unknownRefs.length
      ? `required_permissions.json references entries not present in interaction_contract.json: ${unknownRefs.join(", ")}.`
      : "required_permissions.json required_by entries match interaction_contract.json interactions or capabilities.",
  };
}

async function buildEmbeddedHostValidationChecks(context: {
  hostRuntimeUrl: string;
  hostReceiveMode: HostReceiveMode;
  simulate: boolean;
  sendStartCard: boolean;
  level2: boolean;
}): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  if (!context.hostRuntimeUrl) {
    if (context.simulate || context.sendStartCard || context.level2) {
      checks.push({
        name: "embedded:host-runtime-url",
        status: "warn",
        detail: `Provide --host-runtime-url to run embedded host health${hostModeUsesWebhook(context.hostReceiveMode) ? " and callback" : ""} probes; package validation still does not require a generated bot-runtime.`,
      });
    }
    return checks;
  }

  const healthProbe = await getJsonWithTimeout(`${context.hostRuntimeUrl}/health`, 3000);
  checks.push({
    name: "embedded:host:/health",
    status: healthProbe.status === "available" ? "pass" : "fail",
    detail: healthProbe.status === "available"
      ? `Embedded host /health responded at ${context.hostRuntimeUrl}/health.`
      : formatProbeDetail(healthProbe),
  });

  if (hostModeUsesWebhook(context.hostReceiveMode)) {
    const challenge = "lark-deployer-embedded-host-challenge";
    const callbackProbe = await postJsonWithTimeout(
      `${context.hostRuntimeUrl}/webhook/card`,
      { type: "url_verification", challenge },
      3000,
    );
    checks.push({
      name: "embedded:host:/webhook/card:challenge",
      status: isExpectedChallenge(callbackProbe.data, challenge) ? "pass" : "fail",
      detail: isExpectedChallenge(callbackProbe.data, challenge)
        ? "Embedded host answered a Feishu-style URL verification challenge."
        : formatProbeDetail(callbackProbe),
    });
  }

  if (hostModeUsesLongConnection(context.hostReceiveMode)) {
    checks.push({
      name: "embedded:host:card.action.trigger",
      status: "warn",
      detail: "Confirm the Feishu SDK long-connection host is online, subscribed to card.action.trigger, and routes events into adapter/handlers.ts. This evidence is host-owned and cannot be proven by a webhook challenge.",
    });
  }

  if (context.simulate) {
    const debugProbe = await postJsonWithTimeout(
      `${context.hostRuntimeUrl}/debug/simulate-card-action`,
      {},
      5000,
    );
    checks.push({
      name: "embedded:host:/debug/simulate-card-action",
      status: isExpectedSimulation(debugProbe.data) ? "pass" : "warn",
      detail: isExpectedSimulation(debugProbe.data)
        ? "Embedded host debug simulation accepted an adapter-backed card action."
        : "Embedded host debug simulation endpoint is unavailable or non-standard; run the host-owned manual card-action checklist. " + formatProbeDetail(debugProbe),
    });
  }

  if (context.sendStartCard) {
    checks.push({
      name: "embedded:host:start-card",
      status: "warn",
      detail: `Embedded adapter mode cannot know the existing host's send-card endpoint. Send the first card from the existing Feishu SDK service (${context.hostReceiveMode}) and record evidence.`,
    });
  }
  if (context.level2) {
    checks.push({
      name: "embedded:level2",
      status: "warn",
      detail: context.hostReceiveMode === "embedded-long-connection"
        ? "Real Level 2 for embedded-long-connection requires the existing Feishu SDK long-connection host, target reachability, card.action.trigger evidence, and manual Feishu evidence."
        : "Real Level 2 for embedded adapter mode requires the existing Feishu SDK host, public callback, target reachability, and manual Feishu evidence.",
    });
  }
  return checks;
}

function isExpectedSimulation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.ok === true || isExpectedAcceptedActionCard(value.card);
}

function adapterActionIdForInteraction(inputMode: string): string {
  if (inputMode === "preset_card_action") return "image.generate.submit";
  if (inputMode === "feedback_card_action") return "image.iterate.submit";
  if (inputMode === "batch_form_action") return "image.batch.submit";
  if (inputMode === "batch_status_action") return "image.batch.refresh";
  return "";
}

function sanitizeEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, configuredValue(value)]));
}

function envValue(env: Record<string, string>, key: string): string {
  return configuredValue(env[key]) || configuredValue(process.env[key]) || "";
}

function printChecks(checks: CheckResult[]): void {
  console.log("Verification checks:");
  for (const check of checks) {
    const icon = check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL";
    console.log(`- [${icon}] ${check.name}: ${check.detail}`);
  }
}

function formatProbeDetail(probe: ProbeResult, maxLength = 800): string {
  if (probe.data === undefined) return probe.detail;
  const data = safeJsonStringify(probe.data);
  if (!data || data === "null") return probe.detail;
  const suffix = data.length > maxLength ? `${data.slice(0, maxLength)}...` : data;
  return `${probe.detail} Response: ${suffix}`;
}

function buildRuntimeHealthChecks(
  data: unknown,
  context: {
    targetBaseUrl: string;
    callbackBaseUrl: string;
    env: Record<string, string>;
    level2: boolean;
  },
): CheckResult[] {
  const checks: CheckResult[] = [];
  if (!isRecord(data)) {
    return [{
      name: "runtime:/health:shape",
      status: "fail",
      detail: "Runtime /health did not return a JSON object.",
    }];
  }

  checks.push({
    name: "runtime:/health:ok",
    status: data.ok === true ? "pass" : "fail",
    detail: data.ok === true ? "Runtime reported ok=true." : `Runtime reported ok=${safeJsonStringify(data.ok)}.`,
  });

  checks.push(compareRuntimeString(
    data,
    "imageAgentBaseUrl",
    "runtime:/health:target-base-url",
    normalizeBaseUrl(context.targetBaseUrl),
    "target base URL",
  ));

  const expectedCardActionMode = envValue(context.env, "CARD_ACTION_MODE") || "sync";
  checks.push(compareRuntimeString(
    data,
    "cardActionMode",
    "runtime:/health:card-action-mode",
    expectedCardActionMode === "async" ? "async" : "sync",
    "card action mode",
  ));

  if (context.callbackBaseUrl) {
    checks.push(compareRuntimeString(
      data,
      "publicCallbackBaseUrl",
      "runtime:/health:public-callback-base-url",
      normalizeBaseUrl(context.callbackBaseUrl),
      "public callback base URL",
    ));
  }

  const expectedOpenApiBaseUrl = normalizeBaseUrl(context.env.FEISHU_OPENAPI_BASE_URL || process.env.FEISHU_OPENAPI_BASE_URL || "");
  if (expectedOpenApiBaseUrl) {
    checks.push(compareRuntimeString(
      data,
      "feishuOpenApiBaseUrl",
      "runtime:/health:feishu-openapi-base-url",
      expectedOpenApiBaseUrl,
      "Feishu OpenAPI base URL",
    ));
  }

  checks.push(compareRuntimeBoolean(
    data,
    "uploadImageToLark",
    "runtime:/health:upload-image-to-lark",
    envFlag(context.env.UPLOAD_IMAGE_TO_LARK || process.env.UPLOAD_IMAGE_TO_LARK || "1"),
    "image upload flag",
  ));

  const expectedDebugFlag = context.env.ALLOW_DEBUG_WITHOUT_FEISHU || process.env.ALLOW_DEBUG_WITHOUT_FEISHU || "";
  if (expectedDebugFlag) {
    checks.push(compareRuntimeBoolean(
      data,
      "debugEnabled",
      "runtime:/health:debug-enabled",
      envFlag(expectedDebugFlag),
      "debug endpoint flag",
    ));
  }

  const expectedDebugProtected = Boolean(envValue(context.env, "DEBUG_ACCESS_TOKEN"));
  checks.push(compareRuntimeBoolean(
    data,
    "debugProtected",
    "runtime:/health:debug-protected",
    expectedDebugProtected,
    "debug endpoint token protection",
  ));

  const expectedAllowedOperatorCount = parseCsv(envValue(context.env, "ALLOWED_OPERATOR_OPEN_IDS")).length;
  if (expectedAllowedOperatorCount > 0) {
    checks.push(compareRuntimeBoolean(
      data,
      "operatorAuthConfigured",
      "runtime:/health:operator-auth-configured",
      true,
      "operator authorization guard",
    ));
    checks.push(compareRuntimeNumber(
      data,
      "allowedOperatorCount",
      "runtime:/health:allowed-operator-count",
      expectedAllowedOperatorCount,
      "allowed operator count",
    ));
  }

  const expectedTimeoutMs = Number(envValue(context.env, "IMAGE_AGENT_TIMEOUT_MS") || "120000");
  if (Number.isInteger(expectedTimeoutMs) && expectedTimeoutMs > 0) {
    checks.push(compareRuntimeNumber(
      data,
      "imageAgentTimeoutMs",
      "runtime:/health:image-agent-timeout",
      expectedTimeoutMs,
      "target timeout",
    ));
  }

  if (context.callbackBaseUrl && data.debugEnabled === true) {
    const debugProtected = data.debugProtected === true;
    checks.push({
      name: "runtime:/health:debug-public-protection",
      status: debugProtected ? "pass" : context.level2 ? "fail" : "warn",
      detail: debugProtected
        ? "Runtime debug endpoints are token-protected while a public callback URL is configured."
        : "Runtime debug endpoints are enabled without DEBUG_ACCESS_TOKEN while a public callback URL is configured.",
    });
  }

  const hasApiEnv = Boolean(envValue(context.env, "APP_ID") && envValue(context.env, "APP_SECRET"));
  const hasCallbackEnv = Boolean(envValue(context.env, "VERIFICATION_TOKEN"));
  const hasSendEnv = Boolean(
    envValue(context.env, "APP_ID")
    && envValue(context.env, "APP_SECRET")
    && envValue(context.env, "TEST_CHAT_ID"),
  );

  if (hasApiEnv) {
    checks.push(compareRuntimeBoolean(
      data,
      "feishuApiConfigured",
      "runtime:/health:feishu-api-config",
      true,
      "Feishu API config",
    ));
  }
  if (hasCallbackEnv) {
    checks.push(compareRuntimeBoolean(
      data,
      "callbackConfigured",
      "runtime:/health:callback-config",
      true,
      "Feishu callback config",
    ));
  }
  if (hasSendEnv) {
    checks.push(compareRuntimeBoolean(
      data,
      "sendConfigured",
      "runtime:/health:send-config",
      true,
      "Feishu send config",
    ));
  }

  return checks;
}

function envFlag(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === "1" || normalized === "true";
}

function compareRuntimeString(
  data: Record<string, unknown>,
  field: string,
  name: string,
  expected: string,
  label: string,
): CheckResult {
  const actual = typeof data[field] === "string" ? normalizeBaseUrl(data[field] as string) : "";
  if (!expected) {
    return {
      name,
      status: actual ? "pass" : "warn",
      detail: actual ? `Runtime reports ${label}: ${actual}.` : `Runtime did not report ${label}.`,
    };
  }
  if (!actual) {
    return {
      name,
      status: "warn",
      detail: `Runtime did not report ${label}; expected ${expected}.`,
    };
  }
  return {
    name,
    status: actual === expected ? "pass" : "fail",
    detail: actual === expected
      ? `Runtime ${label} matches ${expected}.`
      : `Runtime ${label} is ${actual}; expected ${expected}. Restart the bot runtime after changing .env.`,
  };
}

function compareRuntimeBoolean(
  data: Record<string, unknown>,
  field: string,
  name: string,
  expected: boolean,
  label: string,
): CheckResult {
  const actual = data[field];
  if (typeof actual !== "boolean") {
    return {
      name,
      status: "warn",
      detail: `Runtime did not report ${label}.`,
    };
  }
  return {
    name,
    status: actual === expected ? "pass" : "fail",
    detail: actual === expected
      ? `Runtime ${label} is ${String(actual)}.`
      : `Runtime ${label} is ${String(actual)}; expected ${String(expected)}. Restart the bot runtime after changing .env.`,
  };
}

function compareRuntimeNumber(
  data: Record<string, unknown>,
  field: string,
  name: string,
  expected: number,
  label: string,
): CheckResult {
  const actual = data[field];
  if (typeof actual !== "number") {
    return {
      name,
      status: "warn",
      detail: `Runtime did not report ${label}.`,
    };
  }
  return {
    name,
    status: actual === expected ? "pass" : "fail",
    detail: actual === expected
      ? `Runtime ${label} is ${String(actual)}.`
      : `Runtime ${label} is ${String(actual)}; expected ${String(expected)}. Restart the bot runtime after changing .env.`,
  };
}

function parseCsv(value: string): string[] {
  return value.split(",").map((item) => configuredValue(item)).filter(Boolean);
}

function safeJsonStringify(value: unknown): string {
  try {
    return escapeNonAscii(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function escapeNonAscii(value: string): string {
  return Array.from(value).map((char) => {
    const codePoint = char.codePointAt(0) || 0;
    if (codePoint >= 0x20 && codePoint <= 0x7e) return char;
    if (codePoint <= 0xffff) return `\\u${codePoint.toString(16).padStart(4, "0")}`;
    const offset = codePoint - 0x10000;
    const high = 0xd800 + Math.floor(offset / 0x400);
    const low = 0xdc00 + (offset % 0x400);
    return `\\u${high.toString(16).padStart(4, "0")}\\u${low.toString(16).padStart(4, "0")}`;
  }).join("");
}

function writeReports(
  reportDir: string,
  checks: CheckResult[],
  context: {
    packagePath: string;
    envPath: string;
    runtimeUrl: string;
    hostRuntimeUrl?: string;
    hostReceiveMode?: HostReceiveMode;
    simulate: boolean;
    sendStartCard: boolean;
    level2: boolean;
    targetBaseUrl: string;
    mode?: string;
  },
): void {
  const summary = {
    generated_at: new Date().toISOString(),
    status: summarize(checks),
    level2_evidence_record_path: getLevel2EvidenceRecordPath(context.packagePath),
    context,
    checks,
  };
  writeJson(path.join(reportDir, "verification_report.json"), summary);
  writeText(path.join(reportDir, "verification_report.md"), buildMarkdownReport(summary));
}

function summarize(checks: CheckResult[]): "pass" | "warn" | "fail" {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

function isExpectedChallenge(value: unknown, expected: string): boolean {
  if (!value || typeof value !== "object") return false;
  return (value as { challenge?: unknown }).challenge === expected;
}

function buildUrlVerificationPayload(challenge: string, encryptKey: string): unknown {
  const payload = { type: "url_verification", challenge };
  if (!encryptKey) return payload;
  return { encrypt: encryptFeishuPayload(payload, encryptKey) };
}

function encryptFeishuPayload(payload: unknown, encryptKey: string): string {
  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, encrypted]).toString("base64");
}

function isExpectedValidationFailure(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const body = value as {
    ok?: unknown;
    error?: unknown;
    card?: { header?: { template?: unknown } };
  };
  return body.ok === false
    && typeof body.error === "string"
    && body.error.includes("Size must use WIDTHxHEIGHT")
    && body.card?.header?.template === "red";
}

function extractSessionIdFromSimulation(value: unknown): string {
  if (!isRecord(value)) return "";
  const result = isRecord(value.result) ? value.result : {};
  return stringValue(result.session_id) || stringValue(result.sessionId) || stringValue(value.session_id) || stringValue(value.sessionId);
}

function extractBatchIdFromSimulation(value: unknown): string {
  if (!isRecord(value)) return "";
  const batchStatus = isRecord(value.batchStatus) ? value.batchStatus : {};
  return stringValue(value.batchId)
    || stringValue(value.batch_id)
    || stringValue(batchStatus.batch_id)
    || stringValue(batchStatus.batchId);
}

function isExpectedAcceptedActionCard(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const body = value as { header?: { template?: unknown } };
  return body.header?.template === "green" || body.header?.template === "blue";
}

async function postSignedCardAction(
  url: string,
  payload: unknown,
  verificationToken: string,
  timeoutMs: number,
): Promise<ProbeResult> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(8).toString("hex");
  const signature = crypto
    .createHash("sha1")
    .update(timestamp + nonce + verificationToken + JSON.stringify(payload))
    .digest("hex");
  return postJsonWithTimeout(url, payload, timeoutMs, {
    "x-lark-request-timestamp": timestamp,
    "x-lark-request-nonce": nonce,
    "x-lark-signature": signature,
  });
}

function buildDebugHeaders(debugAccessToken: string): Record<string, string> {
  if (!debugAccessToken) return {};
  return {
    authorization: `Bearer ${debugAccessToken}`,
    "x-lark-deployer-debug-token": debugAccessToken,
  };
}

function buildWebhookCardActionPayload(capabilities: CapabilityMap): Record<string, unknown> {
  const capability = capabilities.capabilities.find((item) => item.id === "image.generate") || capabilities.capabilities[0];
  const properties: Record<string, unknown> = isRecord(capability?.input_schema.properties) ? capability.input_schema.properties : {};
  const templateProperty = isRecord(properties.template_id) ? properties.template_id : {};
  const sizeProperty = isRecord(properties.size) ? properties.size : {};
  const fieldsProperty = isRecord(properties.fields) ? properties.fields : {};
  const templateFields = Array.isArray(fieldsProperty.template_fields)
    ? fieldsProperty.template_fields.filter(isRecord)
    : [];
  const preset = {
    template_id: firstString(templateProperty.enum) || stringValue(templateProperty.default) || "product-image",
    size: stringValue(sizeProperty.default) || firstString(sizeProperty.enum) || "1024x1024",
    fields: Object.fromEntries(
      templateFields.length
        ? templateFields.map((field) => [stringValue(field.key), `Signed webhook ${humanizeKey(stringValue(field.key))}`])
        : [["theme", "Signed webhook MVP test visual"]],
    ),
    message: "Signed webhook action from Lark-deployer verification.",
  };
  const templateFieldInputs = templateFields.map((field) => ({ key: stringValue(field.key) })).filter((field) => field.key);
  const fieldMaps = buildFormFieldMaps(templateFieldInputs);
  const formValue = {
    param_template_id: preset.template_id,
    param_size: preset.size,
    param_message: preset.message,
    ...Object.fromEntries(Object.keys(preset.fields).map((key) => [fieldMaps.templateKeyToFormField[key] || formFieldName(key), preset.fields[key]])),
  };
  return {
    open_id: "verify_signed_open_id",
    user_id: "verify_signed_user_id",
    tenant_key: "verify_signed_tenant_key",
    open_message_id: "verify_signed_message_id",
    context: {
      open_chat_id: "verify_signed_chat_id",
      open_message_id: "verify_signed_message_id",
    },
    action: {
      tag: "button",
      form_value: formValue,
      value: {
        action: "image.generate.submit",
        preset,
      },
    },
  };
}

function buildAlternateTemplateFormValue(capabilities: CapabilityMap): Record<string, string> | undefined {
  const capability = capabilities.capabilities.find((item) => item.id === "image.generate") || capabilities.capabilities[0];
  const properties: Record<string, unknown> = isRecord(capability?.input_schema.properties) ? capability.input_schema.properties : {};
  const templateProperty = isRecord(properties.template_id) ? properties.template_id : {};
  const fieldsProperty = isRecord(properties.fields) ? properties.fields : {};
  const templateIds = Array.isArray(templateProperty.enum)
    ? templateProperty.enum.filter((item): item is string => typeof item === "string")
    : [];
  if (templateIds.length < 2) return undefined;

  const templateId = templateIds[1];
  const fieldsByTemplate = isRecord(fieldsProperty.template_fields_by_template) ? fieldsProperty.template_fields_by_template : {};
  const defaultSizeByTemplate = isRecord(fieldsProperty.default_size_by_template) ? fieldsProperty.default_size_by_template : {};
  const allowedSizesByTemplate = isRecord(fieldsProperty.allowed_sizes_by_template) ? fieldsProperty.allowed_sizes_by_template : {};
  const templateFields = Array.isArray(fieldsByTemplate[templateId])
    ? fieldsByTemplate[templateId].filter(isRecord)
    : [];
  const allowedSizes = Array.isArray(allowedSizesByTemplate[templateId])
    ? allowedSizesByTemplate[templateId].filter((item): item is string => typeof item === "string")
    : [];
  const defaultSize = stringValue(defaultSizeByTemplate[templateId]) || allowedSizes[0] || "1024x1024";
  const fields = templateFields.length
    ? templateFields
    : (Array.isArray(fieldsProperty.template_fields) ? fieldsProperty.template_fields.filter(isRecord) : []);
  const fieldMaps = buildFormFieldMaps(fields.map((field) => ({ key: stringValue(field.key) })).filter((field) => field.key));

  return {
    param_template_id: templateId,
    param_size: defaultSize,
    param_message: "Alternate template action from Lark-deployer verification.",
    ...Object.fromEntries(fields.map((field) => {
      const key = stringValue(field.key);
      return [fieldMaps.templateKeyToFormField[key] || formFieldName(key), `Alternate template ${humanizeKey(key)}`];
    })),
  };
}

function hasCapability(capabilities: CapabilityMap, id: string): boolean {
  return capabilities.capabilities.some((item) => item.id === id);
}

function firstString(value: unknown): string {
  return Array.isArray(value) ? stringValue(value.find((item) => typeof item === "string")) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "value";
}

function buildMarkdownReport(summary: {
  generated_at: string;
  status: string;
  level2_evidence_record_path: string;
  context: {
    packagePath: string;
    envPath: string;
    runtimeUrl: string;
    hostRuntimeUrl?: string;
    hostReceiveMode?: HostReceiveMode;
    simulate: boolean;
    sendStartCard: boolean;
      level2: boolean;
      targetBaseUrl: string;
      mode?: string;
    };
  checks: CheckResult[];
}): string {
  const rows = summary.checks
    .map((check) => `| ${check.status.toUpperCase()} | ${check.name} | ${check.detail.replace(/\|/g, "\\|")} |`)
    .join("\n");
  const runtimeLine = summary.context.mode === "embedded-adapter"
    ? `- Host runtime URL: ${summary.context.hostRuntimeUrl || "not checked"}`
    : `- Runtime URL: ${summary.context.runtimeUrl || "not checked"}`;

  return `# Verification Report

- Generated at: ${summary.generated_at}
- Overall status: ${summary.status}
- Package: ${summary.context.packagePath}
- Env file: ${summary.context.envPath}
- Target base URL: ${summary.context.targetBaseUrl || "not provided"}
${runtimeLine}
- Integration mode: ${summary.context.mode || "standalone-runtime"}
- Host receive mode: ${summary.context.hostReceiveMode || "standalone-runtime"}
- Simulation requested: ${summary.context.simulate ? "yes" : "no"}
- Send start card requested: ${summary.context.sendStartCard ? "yes" : "no"}
- Level 2 mode: ${summary.context.level2 ? "yes" : "no"}
- Level 2 evidence record: ${summary.level2_evidence_record_path}

## Checks

| Status | Check | Detail |
| --- | --- | --- |
${rows}

## Interpretation

- PASS means the required local evidence was present.
- WARN means the item is missing or unavailable but may be supplied by external context before real Feishu verification.
- FAIL means the generated package is structurally incomplete or the requested runtime check failed.

## Next Steps

${buildNextSteps(summary.checks, summary.context)}
`;
}

function getLevel2EvidenceRecordPath(packagePath: string): string {
  const packageRecord = path.join(packagePath, "level2_verification_record.md");
  if (fs.existsSync(packageRecord)) return packageRecord;
  return "docs/level-2-verification-record.md";
}

function buildNextSteps(
  checks: CheckResult[],
  context: {
    packagePath: string;
    level2: boolean;
    mode?: string;
    hostReceiveMode?: HostReceiveMode;
  },
): string {
  const steps: string[] = [];
  const byName = new Map(checks.map((check) => [check.name, check]));
  const evidenceRecordPath = getLevel2EvidenceRecordPath(context.packagePath);
  const embedded = context.mode === "embedded-adapter";

  if (!embedded && ["env:APP_ID", "env:APP_SECRET", "env:VERIFICATION_TOKEN", "env:TEST_CHAT_ID"].some((name) => byName.get(name)?.status !== "pass")) {
    steps.push("Fill Feishu app credentials and test chat values in `bot-runtime/.env`, then rerun `verify`.");
  }
  const hostReceiveMode = context.mode === "embedded-adapter" ? context.hostReceiveMode || "embedded-webhook" : "standalone-runtime";
  const usesWebhook = hostModeUsesWebhook(hostReceiveMode);
  const usesLongConnection = hostModeUsesLongConnection(hostReceiveMode);

  if (usesWebhook && byName.get("env:PUBLIC_CALLBACK_BASE_URL")?.status !== "pass") {
    steps.push("Provide `PUBLIC_CALLBACK_BASE_URL` and configure Feishu card callback to `<PUBLIC_CALLBACK_BASE_URL>/webhook/card`.");
  }
  if (byName.get("callback:/webhook/card:public-challenge")?.status === "fail") {
    steps.push(embedded
      ? "Check the public tunnel or reverse proxy for `PUBLIC_CALLBACK_BASE_URL`; it must route `POST /webhook/card` to the existing Feishu SDK host."
      : "Check the public tunnel or reverse proxy for `PUBLIC_CALLBACK_BASE_URL`; it must route `POST /webhook/card` to the generated bot runtime.");
  }
  if (
    byName.get("runtime:/webhook/card:encrypted-challenge")?.status === "fail"
    || byName.get("callback:/webhook/card:public-encrypted-challenge")?.status === "fail"
  ) {
    steps.push("Check that `ENCRYPT_KEY` exactly matches the Feishu callback encryption key, or disable encrypted callbacks and rerun verification.");
  }
  if (
    byName.get("runtime:/webhook/card:signed-action")?.status === "fail"
    || byName.get("callback:/webhook/card:public-signed-action")?.status === "fail"
  ) {
    steps.push("Check that `VERIFICATION_TOKEN` matches the Feishu callback token, the public proxy preserves request body and `x-lark-*` headers, and the target service can complete the signed action request.");
  }
  if (byName.get("target:/api/meta")?.status !== "pass") {
    steps.push(embedded
      ? "Start or expose the target service so the existing host can reach `GET <IMAGE_AGENT_BASE_URL>/api/meta`."
      : "Start or expose the target service so the bot runtime can reach `GET <IMAGE_AGENT_BASE_URL>/api/meta`.");
  }
  if (!embedded && byName.get("runtime:/health")?.status !== "pass") {
    steps.push("Start the generated `bot-runtime` and rerun `verify --runtime-url <runtime_url>`.");
  }
  if (embedded && byName.get("embedded:host-runtime-url")?.status === "warn") {
    const hostModeOption = hostReceiveMode === "embedded-webhook" ? "" : ` --host-mode ${hostReceiveMode}`;
    steps.push(`Mount the adapter in the existing Feishu SDK host, then rerun \`verify --mode embedded-adapter${hostModeOption} --host-runtime-url <host_runtime_url> --simulate\`.`);
  }
  if (usesLongConnection && byName.get("embedded:host:card.action.trigger")?.status === "warn") {
    steps.push("Record host-owned long-connection evidence: SDK connection online, card.action.trigger subscription active, and events routed into adapter/handlers.ts.");
  }
  if (checks.some((check) => check.name.startsWith("runtime:/health:") && check.status === "fail")) {
    steps.push("Compare `bot-runtime/.env` with the values reported by `/health`, then restart the generated runtime after any `.env` change.");
  }
  if (byName.get("runtime:/webhook/card:challenge")?.status === "fail") {
    steps.push("Check the public callback route and ensure `/webhook/card` can answer Feishu URL verification challenges.");
  }
  if (
    byName.get("runtime:/debug/simulate-generate")?.status === "fail"
    || byName.get("runtime:/debug/simulate-card-action")?.status === "fail"
    || byName.get("runtime:/debug/simulate-card-action:v2")?.status === "fail"
    || byName.get("runtime:/debug/simulate-card-action:iterate")?.status === "fail"
    || byName.get("runtime:/debug/simulate-card-action:batch")?.status === "fail"
    || byName.get("runtime:/debug/simulate-card-action:batch-refresh")?.status === "fail"
    || byName.get("runtime:/debug/simulate-card-action:alternate-template")?.status === "fail"
    || byName.get("runtime:/debug/simulate-card-action:invalid-input")?.status === "fail"
  ) {
    steps.push("Use the debug endpoint response and `bot-runtime/audit.log` to identify whether the failure is target-service, action-payload, or card-rendering related.");
  }
  if (byName.get("runtime:/debug/start-card")?.status === "fail") {
    steps.push("Confirm the bot is enabled, added to the test chat, and has `im:message:send_as_bot` before rerunning `--send-start-card` or `--level2`.");
  }

  if (!steps.length) {
    return `- No automated follow-up detected. Complete the manual Feishu card click and record evidence in \`${evidenceRecordPath}\`.`;
  }

  if (context.level2) {
    steps.push(`After the automated Level 2 checks pass, click the card in Feishu and record evidence in \`${evidenceRecordPath}\`.`);
  }

  return [...new Set(steps)].map((step) => `- ${step}`).join("\n");
}
