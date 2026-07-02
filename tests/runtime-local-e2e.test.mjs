import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "dist", "index.js");

test("generated runtime can simulate the image-agent-web card flow locally", { timeout: 240_000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-runtime-"));
  const target = path.join(temp, "image-agent-web");
  const workspace = path.join(temp, "out");
  const generated = path.join(temp, "generated");

  const mockTarget = await startMockImageAgent();
  let runtime;
  let encryptedRuntime;
  let asyncRuntime;
  let authRuntime;
  let timeoutRuntime;
  let placeholderRuntime;
  try {
    writeImageAgentLikeSource(target);

    await runCli(["analyze", target, "--base-url", mockTarget.baseUrl, "--out", workspace]);
    await runCli(["plan", workspace]);
    await runCli(["context", workspace]);
    await runCli(["generate", workspace, "--out", generated]);
    await runCli(["configure", generated]);

    const runtimeDir = path.join(generated, "bot-runtime");
    const runtimePort = await reservePort();

    runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund"], runtimeDir);
    runNpm(["run", "build"], runtimeDir);

    const invalidModeRuntime = startRuntime(runtimeDir, await reservePort(), { CARD_ACTION_MODE: "asnyc" });
    const invalidModeExit = await waitForProcessExit(invalidModeRuntime);
    assert.notEqual(invalidModeExit.code, 0);
    assert.match(invalidModeExit.stderr, /CARD_ACTION_MODE must be sync or async/);

    const invalidPortRuntime = startRuntime(runtimeDir, await reservePort(), { PORT: "70000" });
    const invalidPortExit = await waitForProcessExit(invalidPortRuntime);
    assert.notEqual(invalidPortExit.code, 0);
    assert.match(invalidPortExit.stderr, /PORT must be an integer between 1 and 65535/);

    const placeholderRuntimePort = await reservePort();
    placeholderRuntime = startRuntime(runtimeDir, placeholderRuntimePort, {
      APP_ID: "<APP_ID>",
      APP_SECRET: "{{APP_SECRET}}",
      VERIFICATION_TOKEN: "${VERIFICATION_TOKEN}",
      TEST_CHAT_ID: "replace-me",
      PUBLIC_CALLBACK_BASE_URL: "<PUBLIC_CALLBACK_BASE_URL>",
      IMAGE_AGENT_BASE_URL: "<IMAGE_AGENT_BASE_URL>",
      IMAGE_AGENT_TIMEOUT_MS: "<IMAGE_AGENT_TIMEOUT_MS>",
      CARD_ACTION_MODE: "<CARD_ACTION_MODE>",
      DEBUG_ACCESS_TOKEN: "<DEBUG_ACCESS_TOKEN>",
      ALLOWED_OPERATOR_OPEN_IDS: "<OPEN_ID>",
      ALLOW_DEBUG_WITHOUT_FEISHU: "1",
    });
    const placeholderHealth = await waitForJson(`http://127.0.0.1:${placeholderRuntimePort}/health`);
    assert.equal(placeholderHealth.feishuConfigured, false);
    assert.equal(placeholderHealth.feishuApiConfigured, false);
    assert.equal(placeholderHealth.callbackConfigured, false);
    assert.equal(placeholderHealth.sendConfigured, false);
    assert.deepEqual(placeholderHealth.missingFeishuKeys, ["APP_ID", "APP_SECRET", "VERIFICATION_TOKEN", "TEST_CHAT_ID"]);
    assert.equal(placeholderHealth.imageAgentBaseUrl, "http://127.0.0.1:8000");
    assert.equal(placeholderHealth.imageAgentTimeoutMs, 120000);
    assert.equal(placeholderHealth.cardActionMode, "sync");
    assert.equal(placeholderHealth.debugProtected, false);
    assert.equal(placeholderHealth.operatorAuthConfigured, false);
    assert.equal(placeholderHealth.allowedOperatorCount, 0);
    placeholderRuntime.kill();
    await waitForProcessExit(placeholderRuntime);
    placeholderRuntime = undefined;

    runtime = startRuntime(runtimeDir, runtimePort);
    const runtimeUrl = `http://127.0.0.1:${runtimePort}`;
    const health = await waitForJson(`${runtimeUrl}/health`);

    assert.equal(health.ok, true);
    assert.equal(health.feishuConfigured, false);
    assert.equal(health.feishuApiConfigured, false);
    assert.equal(health.callbackConfigured, false);
    assert.equal(health.sendConfigured, false);
    assert.equal(health.imageAgentBaseUrl, mockTarget.baseUrl);
    assert.equal(health.uploadImageToLark, true);
    assert.equal(health.debugEnabled, true);
    assert.equal(health.debugProtected, false);
    assert.equal(health.operatorAuthConfigured, false);
    assert.equal(health.allowedOperatorCount, 0);

    const challengeResponse = await fetch(`${runtimeUrl}/webhook/card`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ type: "url_verification", challenge: "local-challenge" }),
    });
    assert.equal(challengeResponse.status, 200);
    assert.deepEqual(await challengeResponse.json(), { challenge: "local-challenge" });

    const webhookWithoutConfig = await fetch(`${runtimeUrl}/webhook/card`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({}),
    });
    const webhookWithoutConfigBody = await webhookWithoutConfig.json();
    assert.equal(webhookWithoutConfig.status, 503);
    assert.deepEqual(webhookWithoutConfigBody.missingFeishuKeys, ["VERIFICATION_TOKEN"]);

    const missingRoute = await fetch(`${runtimeUrl}/not-found`);
    assert.equal(missingRoute.status, 404);

    const mockedStartCardSuccess = await fetch(`${runtimeUrl}/debug/start-card`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        mockFeishuResponse: {
          code: 0,
          msg: "success",
          data: { message_id: "om_mock_start_card" },
        },
      }),
    });
    const mockedStartCardSuccessBody = await mockedStartCardSuccess.json();
    assert.equal(mockedStartCardSuccess.status, 200);
    assert.equal(mockedStartCardSuccessBody.ok, true);
    assert.match(mockedStartCardSuccessBody.traceId, /^img_/);
    assert.equal(mockedStartCardSuccessBody.response.data.message_id, "om_mock_start_card");

    const mockedStartCardFailure = await fetch(`${runtimeUrl}/debug/start-card`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        mockFeishuResponse: {
          code: 99991663,
          msg: "missing im:message:send_as_bot",
        },
      }),
    });
    const mockedStartCardFailureBody = await mockedStartCardFailure.json();
    assert.equal(mockedStartCardFailure.status, 500);
    assert.equal(mockedStartCardFailureBody.ok, false);
    assert.match(mockedStartCardFailureBody.traceId, /^img_/);
    assert.match(mockedStartCardFailureBody.error, /Feishu mock message\.create failed with code 99991663/);

    const response = await fetch(`${runtimeUrl}/debug/simulate-generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({}),
    });
    const simulation = await response.json();

    assert.equal(response.status, 200);
    assert.equal(simulation.ok, true);
    assert.equal(simulation.result.analysis, "Mock image generated for local e2e.");
    assert.equal(simulation.result.session_id, "local-e2e");
    assert.equal(simulation.imageUrl, `${mockTarget.baseUrl}/outputs/local-e2e.png`);
    assert.equal(simulation.card.header.template, "green");
    assert.ok(simulation.card.elements.some((element) => element?.tag === "form" && element.name === "image_iterate_form"));
    assert.equal(mockTarget.generateCalls, 1);

    const iterateResponse = await fetch(`${runtimeUrl}/debug/simulate-card-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        action: "image.iterate.submit",
        session_id: simulation.result.session_id,
        formValue: {
          param_feedback: "Make the image warmer and cleaner",
        },
      }),
    });
    const iterateSimulation = await iterateResponse.json();
    assert.equal(iterateResponse.status, 200);
    assert.equal(iterateSimulation.ok, true);
    assert.equal(iterateSimulation.card.header.template, "green");
    assert.equal(mockTarget.iterateCalls, 1);
    assert.match(mockTarget.iterateBodies.at(-1), /local-e2e/);
    assert.match(mockTarget.iterateBodies.at(-1), /warmer and cleaner/);

    const cardActionResponse = await fetch(`${runtimeUrl}/debug/simulate-card-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        formValue: {
          param_size: "640x360",
          param_message: "Custom message from Feishu form",
          field_theme: "Custom Feishu form theme",
        },
      }),
    });
    const cardActionSimulation = await cardActionResponse.json();
    assert.equal(cardActionResponse.status, 200);
    assert.equal(cardActionSimulation.ok, true);
    assert.equal(cardActionSimulation.card.header.template, "green");
    assert.equal(mockTarget.generateCalls, 2);
    assert.match(mockTarget.generateBodies.at(-1), /Custom Feishu form theme/);
    assert.match(mockTarget.generateBodies.at(-1), /640x360/);
    assert.match(mockTarget.generateBodies.at(-1), /Custom message from Feishu form/);

    const v2CardActionResponse = await fetch(`${runtimeUrl}/debug/simulate-card-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        eventShape: "v2",
        valueAsJsonString: true,
        formValue: {
          param_size: "512x512",
          param_message: "Custom message from v2 Feishu form",
          field_theme: "Custom v2 callback theme",
        },
      }),
    });
    const v2CardActionSimulation = await v2CardActionResponse.json();
    assert.equal(v2CardActionResponse.status, 200);
    assert.equal(v2CardActionSimulation.ok, true);
    assert.equal(v2CardActionSimulation.card.header.template, "green");
    assert.equal(mockTarget.generateCalls, 3);
    assert.match(mockTarget.generateBodies.at(-1), /Custom v2 callback theme/);
    assert.match(mockTarget.generateBodies.at(-1), /512x512/);
    assert.match(mockTarget.generateBodies.at(-1), /Custom message from v2 Feishu form/);

    const alternateTemplateResponse = await fetch(`${runtimeUrl}/debug/simulate-card-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        formValue: {
          param_template_id: "carousel-slide",
          param_size: "690x240",
          param_message: "Custom message from alternate template",
          field_theme: "Carousel promo theme",
          field_ad_copy: "Carousel copy",
        },
      }),
    });
    const alternateTemplateSimulation = await alternateTemplateResponse.json();
    assert.equal(alternateTemplateResponse.status, 200);
    assert.equal(alternateTemplateSimulation.ok, true);
    assert.equal(alternateTemplateSimulation.card.header.template, "green");
    assert.equal(mockTarget.generateCalls, 4);
    assert.match(mockTarget.generateBodies.at(-1), /carousel-slide/);
    assert.match(mockTarget.generateBodies.at(-1), /690x240/);
    assert.match(mockTarget.generateBodies.at(-1), /Carousel promo theme/);
    assert.match(mockTarget.generateBodies.at(-1), /Carousel copy/);

    const batchResponse = await fetch(`${runtimeUrl}/debug/simulate-card-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        action: "image.batch.submit",
      }),
    });
    const batchSimulation = await batchResponse.json();
    assert.equal(batchResponse.status, 200);
    assert.equal(batchSimulation.ok, true);
    assert.equal(batchSimulation.card.header.template, "green");
    assert.equal(batchSimulation.batchId, "batch-local-e2e-1");
    assert.match(batchSimulation.downloadUrl, /\/api\/batch\/batch-local-e2e-1\/download$/);
    assert.equal(mockTarget.batchCalls, 1);
    assert.equal(mockTarget.batchStatusCalls, 1);
    assert.match(mockTarget.batchBodies.at(-1), /product-image/);

    const batchRefreshResponse = await fetch(`${runtimeUrl}/debug/simulate-card-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        action: "image.batch.refresh",
        batch_id: batchSimulation.batchId,
      }),
    });
    const batchRefreshSimulation = await batchRefreshResponse.json();
    assert.equal(batchRefreshResponse.status, 200);
    assert.equal(batchRefreshSimulation.ok, true);
    assert.equal(batchRefreshSimulation.card.header.template, "green");
    assert.equal(batchRefreshSimulation.batchId, "batch-local-e2e-1");
    assert.equal(mockTarget.batchStatusCalls, 2);

    const dedupePayload = {
      dedupe: true,
      formValue: {
        param_size: "640x360",
        param_message: "Deduped message from Feishu form",
        field_theme: "Deduped Feishu form theme",
      },
    };
    const dedupeFirstResponse = await fetch(`${runtimeUrl}/debug/simulate-card-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(dedupePayload),
    });
    const dedupeFirstSimulation = await dedupeFirstResponse.json();
    assert.equal(dedupeFirstResponse.status, 200);
    assert.equal(dedupeFirstSimulation.ok, true);
    assert.equal(dedupeFirstSimulation.card.header.template, "green");
    assert.equal(mockTarget.generateCalls, 5);
    const dedupeSecondResponse = await fetch(`${runtimeUrl}/debug/simulate-card-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(dedupePayload),
    });
    const dedupeSecondSimulation = await dedupeSecondResponse.json();
    assert.equal(dedupeSecondResponse.status, 200);
    assert.equal(dedupeSecondSimulation.ok, true);
    assert.equal(dedupeSecondSimulation.card.header.template, "green");
    assert.equal(mockTarget.generateCalls, 5);

    const generateCallsAfterValidAction = mockTarget.generateCalls;

    const invalidSizeResponse = await fetch(`${runtimeUrl}/debug/simulate-card-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        formValue: {
          param_size: "large-square",
        },
      }),
    });
    const invalidSizeSimulation = await invalidSizeResponse.json();
    assert.equal(invalidSizeResponse.status, 500);
    assert.equal(invalidSizeSimulation.ok, false);
    assert.equal(invalidSizeSimulation.card.header.template, "red");
    assert.match(invalidSizeSimulation.card.elements[0].content, /Next step/);
    assert.match(invalidSizeSimulation.card.elements[0].content, /Correct the card parameters/);
    assert.match(invalidSizeSimulation.error, /Size must use WIDTHxHEIGHT/);
    assert.equal(mockTarget.generateCalls, generateCallsAfterValidAction);

    const missingRequiredFieldResponse = await fetch(`${runtimeUrl}/debug/simulate-card-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        formValue: {
          param_size: "640x360",
          field_theme: "",
        },
      }),
    });
    const missingRequiredFieldSimulation = await missingRequiredFieldResponse.json();
    assert.equal(missingRequiredFieldResponse.status, 500);
    assert.equal(missingRequiredFieldSimulation.ok, false);
    assert.equal(missingRequiredFieldSimulation.card.header.template, "red");
    assert.match(missingRequiredFieldSimulation.error, /Theme is required/);
    assert.equal(mockTarget.generateCalls, generateCallsAfterValidAction);

    const auditEvents = readAuditEvents(runtimeDir);
    const startCardAudit = auditEvents.find((entry) => (
      entry.trace_id === mockedStartCardSuccessBody.traceId
      && entry.event === "start_card_sent"
    ));
    assert.equal(startCardAudit.detail.messageId, "om_mock_start_card");
    const failedStartCardAudit = auditEvents.find((entry) => (
      entry.trace_id === mockedStartCardFailureBody.traceId
      && entry.event === "start_card_failed"
    ));
    assert.match(failedStartCardAudit.detail.message, /missing im:message:send_as_bot/);
    const cardActionAudit = auditEvents.find((entry) => (
      entry.trace_id === cardActionSimulation.traceId
      && entry.event === "card_action_received"
    ));
    assert.equal(cardActionAudit.detail.operator_open_id, "debug_open_id");
    assert.equal(cardActionAudit.detail.operator_user_id, "debug_user_id");
    assert.equal(cardActionAudit.detail.open_chat_id, "debug_chat_id");
    assert.equal(cardActionAudit.detail.open_message_id, "debug_message_id");
    assert.deepEqual(cardActionAudit.detail.form_value_keys, ["param_size", "param_message", "field_theme"]);

    const v2CardActionAudit = auditEvents.find((entry) => (
      entry.trace_id === v2CardActionSimulation.traceId
      && entry.event === "card_action_received"
    ));
    assert.equal(v2CardActionAudit.detail.operator_open_id, "debug_v2_open_id");
    assert.equal(v2CardActionAudit.detail.operator_user_id, "debug_v2_user_id");
    assert.equal(v2CardActionAudit.detail.open_chat_id, "debug_v2_chat_id");
    assert.equal(v2CardActionAudit.detail.open_message_id, "debug_v2_message_id");
    assert.deepEqual(v2CardActionAudit.detail.form_value_keys, ["param_size", "param_message", "field_theme"]);

    const validationAudit = auditEvents.find((entry) => (
      entry.trace_id === missingRequiredFieldSimulation.traceId
      && entry.event === "card_action_validation_failed"
    ));
    assert.deepEqual(validationAudit.detail.errors, ["Theme is required."]);
    assert.equal(validationAudit.detail.open_chat_id, "debug_chat_id");
    const duplicateAudit = auditEvents.find((entry) => (
      entry.trace_id === dedupeSecondSimulation.traceId
      && entry.event === "card_action_duplicate"
    ));
    assert.equal(duplicateAudit.detail.original_trace_id, dedupeFirstSimulation.traceId);
    const batchStartedAudit = auditEvents.find((entry) => (
      entry.trace_id === batchSimulation.traceId
      && entry.event === "batch_started"
    ));
    assert.equal(batchStartedAudit.detail.template_id, "product-image");
    assert.equal(batchStartedAudit.detail.total, 1);
    const batchStatusAudit = auditEvents.find((entry) => (
      entry.trace_id === batchRefreshSimulation.traceId
      && entry.event === "batch_status_checked"
    ));
    assert.equal(batchStatusAudit.detail.batchId, "batch-local-e2e-1");
    assert.equal(batchStatusAudit.detail.done, 1);
    assert.equal(batchStatusAudit.detail.completed, 1);

    const shortAuditTailResponse = await fetch(`${runtimeUrl}/debug/audit-tail?limit=3`);
    assert.equal(shortAuditTailResponse.status, 200);
    const shortAuditTail = await shortAuditTailResponse.json();
    assert.equal(shortAuditTail.ok, true);
    assert.ok(shortAuditTail.count <= 3);
    const auditTailResponse = await fetch(`${runtimeUrl}/debug/audit-tail?limit=100`);
    assert.equal(auditTailResponse.status, 200);
    const auditTail = await auditTailResponse.json();
    assert.equal(auditTail.ok, true);
    assert.ok(auditTail.events.some((entry) => (
      entry.trace_id === cardActionSimulation.traceId
      && entry.event === "card_action_received"
    )));

    await runCli(["verify", generated, "--runtime-url", runtimeUrl, "--simulate"]);
    const report = JSON.parse(fs.readFileSync(path.join(generated, "verification_report.json"), "utf8"));
    const targetCheck = report.checks.find((check) => check.name === "target:/api/meta");
    const challengeCheck = report.checks.find((check) => check.name === "runtime:/webhook/card:challenge");
    const runtimeTargetCheck = report.checks.find((check) => check.name === "runtime:/health:target-base-url");
    const runtimeModeCheck = report.checks.find((check) => check.name === "runtime:/health:card-action-mode");
    const runtimeUploadCheck = report.checks.find((check) => check.name === "runtime:/health:upload-image-to-lark");
    const runtimeDebugCheck = report.checks.find((check) => check.name === "runtime:/health:debug-enabled");
    const runtimeDebugProtectedCheck = report.checks.find((check) => check.name === "runtime:/health:debug-protected");
    const simulateCheck = report.checks.find((check) => check.name === "runtime:/debug/simulate-generate");
    const cardActionCheck = report.checks.find((check) => check.name === "runtime:/debug/simulate-card-action");
    const iterateCheck = report.checks.find((check) => check.name === "runtime:/debug/simulate-card-action:iterate");
    const v2CardActionCheck = report.checks.find((check) => check.name === "runtime:/debug/simulate-card-action:v2");
    const alternateTemplateCheck = report.checks.find((check) => check.name === "runtime:/debug/simulate-card-action:alternate-template");
    const batchCheck = report.checks.find((check) => check.name === "runtime:/debug/simulate-card-action:batch");
    const batchRefreshCheck = report.checks.find((check) => check.name === "runtime:/debug/simulate-card-action:batch-refresh");
    const invalidInputCheck = report.checks.find((check) => check.name === "runtime:/debug/simulate-card-action:invalid-input");

    assert.equal(targetCheck?.status, "pass");
    assert.match(targetCheck?.detail || "", /\\u5546\\u54c1\\u56fe/);
    assert.doesNotMatch(targetCheck?.detail || "", /商品图/);
    assert.equal(challengeCheck?.status, "pass");
    assert.equal(runtimeTargetCheck?.status, "pass");
    assert.equal(runtimeModeCheck?.status, "pass");
    assert.equal(runtimeUploadCheck?.status, "pass");
    assert.equal(runtimeDebugCheck?.status, "pass");
    assert.equal(runtimeDebugProtectedCheck?.status, "pass");
    assert.equal(simulateCheck?.status, "pass");
    assert.equal(cardActionCheck?.status, "pass");
    assert.equal(iterateCheck?.status, "pass");
    assert.equal(v2CardActionCheck?.status, "pass");
    assert.equal(alternateTemplateCheck?.status, "pass");
    assert.equal(batchCheck?.status, "pass");
    assert.equal(batchRefreshCheck?.status, "pass");
    assert.equal(invalidInputCheck?.status, "pass");
    assert.equal(report.status, "warn");
    assert.equal(mockTarget.generateCalls, 9);
    assert.equal(mockTarget.iterateCalls, 2);
    assert.equal(mockTarget.batchCalls, 2);
    assert.equal(mockTarget.batchStatusCalls, 4);

    const remoteEvidencePath = path.join(temp, "remote-audit-evidence.md");
    const remoteEvidenceOutput = await runCli(["evidence", generated, "--runtime-url", runtimeUrl, "--out", remoteEvidencePath]);
    assert.match(remoteEvidenceOutput, /Evidence draft written/);
    const remoteEvidenceDraft = fs.readFileSync(remoteEvidencePath, "utf8");
    assert.match(remoteEvidenceDraft, /\/debug\/audit-tail/);
    assert.match(remoteEvidenceDraft, /card_action_received/);
    assert.match(remoteEvidenceDraft, /batch_status_checked/);

    await runCliExpectFailure(["verify", generated, "--runtime-url", runtimeUrl, "--send-start-card"]);
    const sendReport = JSON.parse(fs.readFileSync(path.join(generated, "verification_report.json"), "utf8"));
    const startCardCheck = sendReport.checks.find((check) => check.name === "runtime:/debug/start-card");
    assert.equal(startCardCheck?.status, "fail");
    assert.match(startCardCheck?.detail, /Missing Feishu send config: APP_ID, APP_SECRET, TEST_CHAT_ID/);

    const encryptedRuntimePort = await reservePort();
    const quotedEnvToken = "cli test token #1";
    encryptedRuntime = startRuntime(runtimeDir, encryptedRuntimePort, {
      VERIFICATION_TOKEN: quotedEnvToken,
      ENCRYPT_KEY: "cli_test_encrypt_key",
      DEBUG_ACCESS_TOKEN: "debug-token-123",
    });
    const encryptedRuntimeUrl = `http://127.0.0.1:${encryptedRuntimePort}`;
    const encryptedHealth = await waitForJson(`${encryptedRuntimeUrl}/health`);
    assert.equal(encryptedHealth.debugProtected, true);
    const protectedDebugDenied = await fetch(`${encryptedRuntimeUrl}/debug/simulate-generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({}),
    });
    assert.equal(protectedDebugDenied.status, 403);
    const protectedAuditDenied = await fetch(`${encryptedRuntimeUrl}/debug/audit-tail`);
    assert.equal(protectedAuditDenied.status, 403);
    const protectedAuditAllowed = await fetch(`${encryptedRuntimeUrl}/debug/audit-tail`, {
      headers: { authorization: "Bearer debug-token-123" },
    });
    assert.equal(protectedAuditAllowed.status, 200);
    const protectedAuditAllowedBody = await protectedAuditAllowed.json();
    assert.equal(protectedAuditAllowedBody.ok, true);
    const protectedDebugAllowed = await fetch(`${encryptedRuntimeUrl}/debug/simulate-generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "x-lark-deployer-debug-token": "debug-token-123",
      },
      body: JSON.stringify({}),
    });
    assert.equal(protectedDebugAllowed.status, 200);
    const encryptedEnv = path.join(temp, "encrypted.env");
    fs.writeFileSync(
      encryptedEnv,
      [
        `VERIFICATION_TOKEN=${JSON.stringify(quotedEnvToken)}`,
        "ENCRYPT_KEY=cli_test_encrypt_key",
        "DEBUG_ACCESS_TOKEN=debug-token-123",
        `IMAGE_AGENT_BASE_URL=${mockTarget.baseUrl}`,
        "",
      ].join("\n"),
      "utf8",
    );
    await runCli(["verify", generated, "--env", encryptedEnv, "--runtime-url", encryptedRuntimeUrl, "--simulate"]);
    const encryptedReport = JSON.parse(fs.readFileSync(path.join(generated, "verification_report.json"), "utf8"));
    const encryptedChallengeCheck = encryptedReport.checks.find((check) => check.name === "runtime:/webhook/card:encrypted-challenge");
    const signedActionCheck = encryptedReport.checks.find((check) => check.name === "runtime:/webhook/card:signed-action");
    const encryptedCallbackConfigCheck = encryptedReport.checks.find((check) => check.name === "runtime:/health:callback-config");
    assert.equal(encryptedChallengeCheck?.status, "pass");
    assert.equal(signedActionCheck?.status, "pass");
    assert.equal(encryptedCallbackConfigCheck?.status, "pass");
    const signedActionAudit = readAuditEvents(runtimeDir).find((entry) => (
      entry.event === "card_action_received"
      && entry.detail.operator_open_id === "verify_signed_open_id"
    ));
    assert.ok(signedActionAudit);
    assert.ok(signedActionAudit.detail.form_value_keys.includes("param_template_id"));

    const authRuntimePort = await reservePort();
    authRuntime = startRuntime(runtimeDir, authRuntimePort, {
      ALLOWED_OPERATOR_OPEN_IDS: "debug_open_id",
    });
    const authRuntimeUrl = `http://127.0.0.1:${authRuntimePort}`;
    const authHealth = await waitForJson(`${authRuntimeUrl}/health`);
    assert.equal(authHealth.operatorAuthConfigured, true);
    assert.equal(authHealth.allowedOperatorCount, 1);
    const authAllowedResponse = await fetch(`${authRuntimeUrl}/debug/simulate-card-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({}),
    });
    const authAllowedSimulation = await authAllowedResponse.json();
    assert.equal(authAllowedResponse.status, 200);
    assert.equal(authAllowedSimulation.ok, true);
    const authGenerateCallsAfterAllowed = mockTarget.generateCalls;
    const authDeniedResponse = await fetch(`${authRuntimeUrl}/debug/simulate-card-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ eventShape: "v2", valueAsJsonString: true }),
    });
    const authDeniedSimulation = await authDeniedResponse.json();
    assert.equal(authDeniedResponse.status, 500);
    assert.equal(authDeniedSimulation.ok, false);
    assert.match(authDeniedSimulation.error, /not authorized/);
    assert.equal(authDeniedSimulation.card.header.template, "red");
    assert.match(authDeniedSimulation.card.elements[0].content, /ALLOWED_OPERATOR_OPEN_IDS/);
    assert.equal(mockTarget.generateCalls, authGenerateCallsAfterAllowed);
    assert.ok(readAuditEvents(runtimeDir).some((entry) => entry.event === "card_action_unauthorized"));

    const timeoutRuntimePort = await reservePort();
    timeoutRuntime = startRuntime(runtimeDir, timeoutRuntimePort, {
      IMAGE_AGENT_TIMEOUT_MS: "50",
    });
    const timeoutRuntimeUrl = `http://127.0.0.1:${timeoutRuntimePort}`;
    const timeoutHealth = await waitForJson(`${timeoutRuntimeUrl}/health`);
    assert.equal(timeoutHealth.imageAgentTimeoutMs, 50);
    const timeoutResponse = await fetch(`${timeoutRuntimeUrl}/debug/simulate-card-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        formValue: {
          param_size: "640x360",
          field_theme: "Slow timeout theme",
        },
      }),
    });
    const timeoutSimulation = await timeoutResponse.json();
    assert.equal(timeoutResponse.status, 500);
    assert.equal(timeoutSimulation.ok, false);
    assert.equal(timeoutSimulation.card.header.template, "red");
    assert.match(timeoutSimulation.card.elements[0].content, /IMAGE_AGENT_TIMEOUT_MS/);
    assert.match(timeoutSimulation.error, /timed out after 50ms/);
    assert.ok(readAuditEvents(runtimeDir).some((entry) => (
      entry.trace_id === timeoutSimulation.traceId
      && entry.event === "generation_failed"
      && /timed out/.test(entry.detail.message)
    )));

    const mockFeishu = await startMockFeishuOpenApi();
    try {
      const asyncRuntimePort = await reservePort();
      asyncRuntime = startRuntime(runtimeDir, asyncRuntimePort, {
        APP_ID: "mock_app",
        APP_SECRET: "mock_secret",
        VERIFICATION_TOKEN: "async_test_token",
        CARD_ACTION_MODE: "async",
        FEISHU_OPENAPI_BASE_URL: mockFeishu.baseUrl,
        UPLOAD_IMAGE_TO_LARK: "0",
      });
      const asyncRuntimeUrl = `http://127.0.0.1:${asyncRuntimePort}`;
      const asyncHealth = await waitForJson(`${asyncRuntimeUrl}/health`);
      assert.equal(asyncHealth.cardActionMode, "async");
      assert.equal(asyncHealth.feishuOpenApiBaseUrl, mockFeishu.baseUrl);

      const asyncEnv = path.join(temp, "async.env");
      fs.writeFileSync(
        asyncEnv,
        [
          "APP_ID=mock_app",
          "APP_SECRET=mock_secret",
          "VERIFICATION_TOKEN=async_test_token",
          `FEISHU_OPENAPI_BASE_URL=${mockFeishu.baseUrl}`,
          "CARD_ACTION_MODE=async",
          "UPLOAD_IMAGE_TO_LARK=0",
          `IMAGE_AGENT_BASE_URL=${mockTarget.baseUrl}`,
          "",
        ].join("\n"),
        "utf8",
      );

      await runCli(["verify", generated, "--env", asyncEnv, "--runtime-url", asyncRuntimeUrl, "--simulate"]);
      const asyncReport = JSON.parse(fs.readFileSync(path.join(generated, "verification_report.json"), "utf8"));
      const asyncSignedActionCheck = asyncReport.checks.find((check) => check.name === "runtime:/webhook/card:signed-action");
      const asyncModeCheck = asyncReport.checks.find((check) => check.name === "runtime:/health:card-action-mode");
      const asyncOpenApiCheck = asyncReport.checks.find((check) => check.name === "runtime:/health:feishu-openapi-base-url");
      const asyncApiConfigCheck = asyncReport.checks.find((check) => check.name === "runtime:/health:feishu-api-config");
      const asyncUploadCheck = asyncReport.checks.find((check) => check.name === "runtime:/health:upload-image-to-lark");
      assert.equal(asyncSignedActionCheck?.status, "pass");
      assert.equal(asyncModeCheck?.status, "pass");
      assert.equal(asyncOpenApiCheck?.status, "pass");
      assert.equal(asyncApiConfigCheck?.status, "pass");
      assert.equal(asyncUploadCheck?.status, "pass");

      await waitFor(
        () => mockFeishu.patchCalls.length > 0,
        () => `async message.patch call; requests=${JSON.stringify(mockFeishu.requests)} audit=${JSON.stringify(readAuditEvents(runtimeDir).slice(-8))}`,
      );
      assert.equal(mockFeishu.patchCalls[0].messageId, "verify_signed_message_id");
      const patchedContent = JSON.parse(mockFeishu.patchCalls[0].body.content);
      assert.equal(patchedContent.header.template, "green");
      const asyncAuditEvents = readAuditEvents(runtimeDir);
      assert.ok(asyncAuditEvents.some((entry) => entry.event === "async_generation_queued"));
      assert.ok(asyncAuditEvents.some((entry) => entry.event === "message_patch_succeeded"));
    } finally {
      asyncRuntime?.kill();
      asyncRuntime = undefined;
      await mockFeishu.close();
    }

    const mockLevel2Runtime = await startMockLevel2Runtime("mock_level2_encrypt_key", mockTarget.baseUrl);
    try {
      const level2Env = path.join(temp, "level2.env");
      fs.writeFileSync(
        level2Env,
        [
          "APP_ID=cli_test_app",
          "APP_SECRET=cli_test_secret",
          "VERIFICATION_TOKEN=cli_test_token",
          "ENCRYPT_KEY=mock_level2_encrypt_key",
          "TEST_CHAT_ID=oc_test_chat",
          `PUBLIC_CALLBACK_BASE_URL=${mockLevel2Runtime.baseUrl}`,
          `IMAGE_AGENT_BASE_URL=${mockTarget.baseUrl}`,
          "DEBUG_ACCESS_TOKEN=level2_debug_token",
          "",
        ].join("\n"),
        "utf8",
      );

      await runCli(["verify", generated, "--env", level2Env, "--runtime-url", mockLevel2Runtime.baseUrl, "--level2", "--allow-local-callback"]);
      const level2Report = JSON.parse(fs.readFileSync(path.join(generated, "verification_report.json"), "utf8"));
      const publicCallbackUrlCheck = level2Report.checks.find((check) => check.name === "env:PUBLIC_CALLBACK_BASE_URL:public-url");
      const publicCallbackCheck = level2Report.checks.find((check) => check.name === "callback:/webhook/card:public-challenge");
      const publicEncryptedCallbackCheck = level2Report.checks.find((check) => check.name === "callback:/webhook/card:public-encrypted-challenge");
      const publicSignedActionCheck = level2Report.checks.find((check) => check.name === "callback:/webhook/card:public-signed-action");
      const level2EncryptedChallengeCheck = level2Report.checks.find((check) => check.name === "runtime:/webhook/card:encrypted-challenge");
      const level2SignedActionCheck = level2Report.checks.find((check) => check.name === "runtime:/webhook/card:signed-action");
      const level2TargetCheck = level2Report.checks.find((check) => check.name === "runtime:/health:target-base-url");
      const level2PublicCallbackCheck = level2Report.checks.find((check) => check.name === "runtime:/health:public-callback-base-url");
      const level2SendConfigCheck = level2Report.checks.find((check) => check.name === "runtime:/health:send-config");
      const level2DebugProtectedCheck = level2Report.checks.find((check) => check.name === "runtime:/health:debug-protected");
      const level2DebugPublicProtectionCheck = level2Report.checks.find((check) => check.name === "runtime:/health:debug-public-protection");
      assert.equal(level2Report.status, "pass");
      assert.equal(publicCallbackUrlCheck?.status, "pass");
      assert.equal(publicCallbackCheck?.status, "pass");
      assert.equal(publicEncryptedCallbackCheck?.status, "pass");
      assert.equal(publicSignedActionCheck?.status, "pass");
      assert.equal(level2EncryptedChallengeCheck?.status, "pass");
      assert.equal(level2SignedActionCheck?.status, "pass");
      assert.equal(level2TargetCheck?.status, "pass");
      assert.equal(level2PublicCallbackCheck?.status, "pass");
      assert.equal(level2SendConfigCheck?.status, "pass");
      assert.equal(level2DebugProtectedCheck?.status, "pass");
      assert.equal(level2DebugPublicProtectionCheck?.status, "pass");
      assert.equal(mockLevel2Runtime.publicChallengeCalls, 1);
      assert.equal(mockLevel2Runtime.publicEncryptedChallengeCalls, 1);
      assert.equal(mockLevel2Runtime.signedActionCalls, 2);
      const level2Markdown = fs.readFileSync(path.join(generated, "verification_report.md"), "utf8");
      assert.match(level2Markdown, /manual Feishu card click/);
      assert.match(level2Markdown, /level2_verification_record\.md/);

      const level2StatusPath = path.join(temp, "level2-handoff-status.md");
      const readinessOutput = await runCli(["readiness", generated, "--env", level2Env, "--out", level2StatusPath]);
      assert.match(readinessOutput, /Readiness status: manual_click_evidence_needed/);
      const level2Status = fs.readFileSync(level2StatusPath, "utf8");
      assert.match(level2Status, /manual_click_evidence_needed/);
      assert.match(level2Status, /Level 2 mode: yes/);
      assert.doesNotMatch(level2Status, /cli_test_secret/);

      const recordPath = path.join(generated, "level2_verification_record.md");
      const recordSource = fs.readFileSync(recordPath, "utf8");
      fs.writeFileSync(
        recordPath,
        recordSource.replace("- [ ] Level 2 verified.", "- [x] Level 2 verified."),
        "utf8",
      );
      const partialDecisionPath = path.join(temp, "partial-decision-status.md");
      const partialDecisionOutput = await runCli(["readiness", generated, "--env", level2Env, "--out", partialDecisionPath]);
      assert.match(partialDecisionOutput, /Readiness status: manual_click_evidence_needed/);
      const partialDecisionStatus = fs.readFileSync(partialDecisionPath, "utf8");
      assert.match(partialDecisionStatus, /\| Level 2 verified \| yes \|/);
      assert.match(partialDecisionStatus, /\| Remaining issues documented \| no \|/);
      assert.match(partialDecisionStatus, /\| Package handoff approved \| no \|/);

      fs.writeFileSync(
        recordPath,
        recordSource
          .replace("- [ ] Level 2 verified.", "- [x] Level 2 verified.")
          .replace("- [ ] Remaining issues documented.", "- [x] Remaining issues documented.")
          .replace("- [ ] This generated package can be handed to another FDE", "- [x] This generated package can be handed to another FDE"),
        "utf8",
      );
      const completeWithoutEvidencePath = path.join(temp, "complete-without-evidence-status.md");
      const completeWithoutEvidenceOutput = await runCli(["readiness", generated, "--env", level2Env, "--out", completeWithoutEvidencePath]);
      assert.match(completeWithoutEvidenceOutput, /Readiness status: manual_click_evidence_needed/);
      const completeWithoutEvidenceStatus = fs.readFileSync(completeWithoutEvidencePath, "utf8");
      assert.match(completeWithoutEvidenceStatus, /\| Manual evidence present \| no \|/);
      assert.match(completeWithoutEvidenceStatus, /Missing manual evidence: .*Start card message ID/);
      assert.match(completeWithoutEvidenceStatus, /Missing manual evidence: .*Batch ID/);

      fs.writeFileSync(
        recordPath,
        recordSource
          .replace("- [ ] Level 2 verified.", "- [x] Level 2 verified.")
          .replace("- [ ] Remaining issues documented.", "- [x] Remaining issues documented.")
          .replace("- [ ] This generated package can be handed to another FDE", "- [x] This generated package can be handed to another FDE")
          .replace("- Start card message ID:", "- Start card message ID: om_level2_start_card")
          .replace("- Result card message ID or screenshot:", "- Result card message ID or screenshot: screenshot://result-card.png")
          .replace("- Generated image URL or image key:", "- Generated image URL or image key: img_v3_level2")
          .replace("- Batch ID:", "- Batch ID: batch_level2_123")
          .replace("- Batch status card message ID or screenshot:", "- Batch status card message ID or screenshot: screenshot://batch-status.png")
          .replace("- Batch download URL or screenshot:", "- Batch download URL or screenshot: http://127.0.0.1:8000/api/batch/batch_level2_123/download")
          .replace("- Trace ID:", "- Trace ID: trace_level2_123"),
        "utf8",
      );
      const completeDecisionPath = path.join(temp, "complete-decision-status.md");
      const completeDecisionOutput = await runCli(["readiness", generated, "--env", level2Env, "--out", completeDecisionPath]);
      assert.match(completeDecisionOutput, /Readiness status: handoff_ready/);
      const completeDecisionStatus = fs.readFileSync(completeDecisionPath, "utf8");
      assert.match(completeDecisionStatus, /Completion decision complete: yes/);
      assert.match(completeDecisionStatus, /\| Manual evidence present \| yes \|/);
      const completeDoctorOutput = await runCli(["doctor", generated, "--env", level2Env, "--gate"]);
      assert.match(completeDoctorOutput, /MVP doctor: PASS/);
      assert.match(completeDoctorOutput, /Gate passed: yes/);
      const completeDoctorJson = JSON.parse(await runCli(["doctor", generated, "--env", level2Env, "--json"]));
      assert.equal(completeDoctorJson.gate_passed, true);
      assert.equal(completeDoctorJson.state, "handoff_ready");

      const evidencePath = path.join(temp, "level2-evidence-draft.md");
      const evidenceOutput = await runCli(["evidence", generated, "--env", level2Env, "--out", evidencePath]);
      assert.match(evidenceOutput, /Evidence draft written/);
      const evidenceDraft = fs.readFileSync(evidencePath, "utf8");
      assert.match(evidenceDraft, /Level 2 Evidence Draft/);
      assert.match(evidenceDraft, /\| SUPPORTED \| `verify --level2` succeeds\./);
      assert.match(evidenceDraft, /manual Feishu click/);
      assert.match(evidenceDraft, /om_level2_start_card/);
      assert.match(evidenceDraft, /local-e2e\.png/);
      assert.match(evidenceDraft, /Recent trace ids: img_/);
      assert.match(evidenceDraft, /\| 20\d{2}-\d{2}-\d{2}T[^|]+ \| img_/);
      assert.match(evidenceDraft, /Manual Completion Still Required/);
      assert.doesNotMatch(evidenceDraft, /cli_test_secret/);
    } finally {
      await mockLevel2Runtime.close();
    }
  } finally {
    runtime?.kill();
    encryptedRuntime?.kill();
    asyncRuntime?.kill();
    authRuntime?.kill();
    timeoutRuntime?.kill();
    placeholderRuntime?.kill();
    await mockTarget.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

function writeImageAgentLikeSource(target) {
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(
    path.join(target, "requirements.txt"),
    ["fastapi==0.115.0", "uvicorn[standard]==0.30.0", "python-multipart==0.0.9", "openai==1.65.0", "Pillow==11.0.0"].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(target, "main.py"),
    [
      "from fastapi import FastAPI",
      "app = FastAPI()",
      "@app.get(\"/api/meta\")",
      "async def get_meta(): pass",
      "@app.post(\"/api/generate\")",
      "async def generate(): pass",
      "@app.post(\"/api/iterate\")",
      "async def iterate(): pass",
      "@app.post(\"/api/batch\")",
      "async def create_batch(): pass",
      "@app.get(\"/api/batch/{batch_id}/status\")",
      "async def get_batch_status(batch_id: str): pass",
      "@app.get(\"/api/batch/{batch_id}/download\")",
      "async def download_batch(batch_id: str): pass",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(path.join(target, "templates.py"), "TEMPLATES = []\nREFERENCE_TYPES = []\n", "utf8");
}

function runCli(args) {
  return spawnCommand(process.execPath, [cli, ...args], root);
}

async function runCliExpectFailure(args) {
  const result = await spawnCommandResult(process.execPath, [cli, ...args], root);
  assert.notEqual(result.code, 0, `Command unexpectedly succeeded: ${args.join(" ")}\n${result.stdout}`);
  return result;
}

function spawnCommand(command, args, cwd) {
  return spawnCommandResult(command, args, cwd).then((result) => {
    if (result.code === 0) return result.stdout;
    throw new Error(`Command failed (${result.code ?? result.signal}): ${command} ${args.join(" ")}\n${result.stdout}${result.stderr}`);
  });
}

function spawnCommandResult(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function runNpm(args, cwd) {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npm", ...args], {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
    });
    return;
  }

  execFileSync("npm", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function readAuditEvents(runtimeDir) {
  const auditPath = path.join(runtimeDir, "audit.log");
  return fs.readFileSync(auditPath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function startMockImageAgent() {
  let generateCalls = 0;
  let iterateCalls = 0;
  let batchCalls = 0;
  let batchStatusCalls = 0;
  const generateBodies = [];
  const iterateBodies = [];
  const batchBodies = [];
  const batches = new Map();
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "GET" && requestUrl.pathname === "/api/meta") {
      writeJson(res, 200, {
        templates: [
          {
            id: "product-image",
            name: "Product Image",
            description: "商品图",
            allowed_sizes: ["1024x1024"],
            default_size: "1024x1024",
            fields: [{ key: "theme", label: "Theme", required: true }],
          },
          {
            id: "carousel-slide",
            name: "Carousel Slide",
            allowed_sizes: ["690x240"],
            default_size: "690x240",
            fields: [
              { key: "theme", label: "Theme", required: true },
              { key: "ad_copy", label: "Ad Copy", required: false },
            ],
          },
        ],
        reference_types: [],
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/generate") {
      let raw = Buffer.alloc(0);
      req.on("data", (chunk) => {
        raw = Buffer.concat([raw, Buffer.from(chunk)]);
      });
      req.on("end", () => {
        generateCalls += 1;
        const body = raw.toString("utf8");
        generateBodies.push(body);
        const respond = () => writeJson(res, 200, {
          session_id: "local-e2e",
          analysis: "Mock image generated for local e2e.",
          image_url: "/outputs/local-e2e.png",
          prompt_used: "mock prompt",
          round: 1,
          template_id: "product-image",
          size: "1024x1024",
        });
        if (body.includes("Slow timeout theme")) {
          setTimeout(respond, 250);
          return;
        }
        respond();
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/iterate") {
      let raw = Buffer.alloc(0);
      req.on("data", (chunk) => {
        raw = Buffer.concat([raw, Buffer.from(chunk)]);
      });
      req.on("end", () => {
        iterateCalls += 1;
        const body = raw.toString("utf8");
        iterateBodies.push(body);
        writeJson(res, 200, {
          session_id: "local-e2e",
          image_url: "/outputs/local-e2e-iterated.png",
          prompt_used: "mock iterated prompt",
          round: 2,
          template_id: "product-image",
          size: "1024x1024",
        });
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/batch") {
      let raw = Buffer.alloc(0);
      req.on("data", (chunk) => {
        raw = Buffer.concat([raw, Buffer.from(chunk)]);
      });
      req.on("end", () => {
        batchCalls += 1;
        const body = raw.toString("utf8");
        batchBodies.push(body);
        const batchId = `batch-local-e2e-${batchCalls}`;
        batches.set(batchId, {
          batch_id: batchId,
          template_id: body.includes("carousel-slide") ? "carousel-slide" : "product-image",
          size: body.includes("690x240") ? "690x240" : "1024x1024",
          total: 1,
          done: 1,
          running: false,
          completed: [{ index: 0, image_url: "/outputs/batch-local-e2e.png" }],
          failed: [],
        });
        writeJson(res, 200, { batch_id: batchId });
      });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/api/batch/") && requestUrl.pathname.endsWith("/status")) {
      batchStatusCalls += 1;
      const batchId = decodeURIComponent(requestUrl.pathname.split("/").at(-2) || "");
      const status = batches.get(batchId);
      writeJson(res, status ? 200 : 404, status || { detail: "Batch not found or expired" });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/api/batch/") && requestUrl.pathname.endsWith("/download")) {
      res.writeHead(200, { "Content-Type": "application/zip" });
      res.end(Buffer.from("mock zip"));
      return;
    }

    writeJson(res, 404, { detail: "not found" });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Mock target did not bind to a TCP port."));
        return;
      }
      resolve({
        get baseUrl() {
          return `http://127.0.0.1:${address.port}`;
        },
        get generateCalls() {
          return generateCalls;
        },
        get generateBodies() {
          return generateBodies;
        },
        get iterateCalls() {
          return iterateCalls;
        },
        get iterateBodies() {
          return iterateBodies;
        },
        get batchCalls() {
          return batchCalls;
        },
        get batchBodies() {
          return batchBodies;
        },
        get batchStatusCalls() {
          return batchStatusCalls;
        },
        close() {
          return new Promise((closeResolve, closeReject) => {
            server.close((error) => error ? closeReject(error) : closeResolve());
          });
        },
      });
    });
  });
}

function startMockLevel2Runtime(encryptKey, targetBaseUrl) {
  let publicChallengeCalls = 0;
  let publicEncryptedChallengeCalls = 0;
  let signedActionCalls = 0;
  let baseUrl = "";
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "GET" && requestUrl.pathname === "/health") {
      writeJson(res, 200, {
        ok: true,
        imageAgentBaseUrl: targetBaseUrl,
        imageAgentTimeoutMs: 120000,
        cardActionMode: "sync",
        feishuOpenApiBaseUrl: "",
        uploadImageToLark: true,
        debugProtected: false,
        publicCallbackBaseUrl: baseUrl,
        debugEnabled: true,
        debugProtected: true,
        feishuConfigured: true,
        feishuApiConfigured: true,
        callbackConfigured: true,
        sendConfigured: true,
        missingFeishuKeys: [],
        missingFeishuApiKeys: [],
        missingCallbackKeys: [],
        missingSendKeys: [],
      });
      return;
    }

    if (req.method === "POST") {
      readJsonBody(req).then((body) => {
        if (requestUrl.pathname === "/webhook/card") {
          const payload = body?.encrypt ? decryptFeishuPayload(body.encrypt, encryptKey) : body;
          if (payload?.challenge === "lark-deployer-public-challenge") {
            publicChallengeCalls += 1;
          }
          if (payload?.challenge === "lark-deployer-public-encrypted-challenge") {
            publicEncryptedChallengeCalls += 1;
          }
          if (payload?.action?.value?.action === "image.generate.submit") {
            signedActionCalls += 1;
            writeJson(res, 200, { header: { template: "green" }, elements: [] });
            return;
          }
          writeJson(res, 200, { challenge: payload?.challenge || "" });
          return;
        }

        if (requestUrl.pathname === "/debug/simulate-generate") {
          writeJson(res, 200, { ok: true, result: { session_id: "level2_session" } });
          return;
        }

        if (requestUrl.pathname === "/debug/simulate-card-action") {
          if (body?.formValue?.param_size === "invalid-size") {
            writeJson(res, 200, {
              ok: false,
              error: "Size must use WIDTHxHEIGHT format.",
              card: { header: { template: "red" } },
            });
            return;
          }
          if (body?.action === "image.batch.submit") {
            writeJson(res, 200, {
              ok: true,
              batchId: "level2_batch",
              batchStatus: { batch_id: "level2_batch", total: 1, done: 1, running: false, completed: [{}], failed: [] },
              card: { header: { template: "green" } },
            });
            return;
          }
          if (body?.action === "image.batch.refresh") {
            writeJson(res, 200, {
              ok: true,
              batchId: body.batch_id || "level2_batch",
              card: { header: { template: "green" } },
            });
            return;
          }
          writeJson(res, 200, { ok: true, card: { header: { template: "green" } } });
          return;
        }

        if (requestUrl.pathname === "/debug/start-card") {
          writeJson(res, 200, {
            ok: true,
            response: { code: 0, msg: "success", data: { message_id: "om_level2_start_card" } },
          });
          return;
        }

        writeJson(res, 404, { detail: "not found" });
      }).catch((error) => {
        writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      });
      return;
    }

    writeJson(res, 404, { detail: "not found" });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Mock Level 2 runtime did not bind to a TCP port."));
        return;
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve({
        get baseUrl() {
          return baseUrl;
        },
        get publicChallengeCalls() {
          return publicChallengeCalls;
        },
        get publicEncryptedChallengeCalls() {
          return publicEncryptedChallengeCalls;
        },
        get signedActionCalls() {
          return signedActionCalls;
        },
        close() {
          return new Promise((closeResolve, closeReject) => {
            server.close((error) => error ? closeReject(error) : closeResolve());
          });
        },
      });
    });
  });
}

function startMockFeishuOpenApi() {
  const patchCalls = [];
  const requests = [];
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    requests.push({ method: req.method, path: requestUrl.pathname });

    if (req.method === "POST" && requestUrl.pathname === "/open-apis/auth/v3/tenant_access_token/internal") {
      writeJson(res, 200, { code: 0, msg: "success", tenant_access_token: "mock_tenant_token", expire: 7200 });
      return;
    }

    if (req.method === "PATCH" && requestUrl.pathname.startsWith("/open-apis/im/v1/messages/")) {
      readJsonBody(req).then((body) => {
        const messageId = decodeURIComponent(requestUrl.pathname.split("/").pop() || "");
        patchCalls.push({ messageId, body });
        writeJson(res, 200, { code: 0, msg: "success", data: {} });
      }).catch((error) => {
        writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      });
      return;
    }

    writeJson(res, 404, { code: 404, msg: "not found" });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Mock Feishu OpenAPI did not bind to a TCP port."));
        return;
      }
      resolve({
        get baseUrl() {
          return `http://127.0.0.1:${address.port}`;
        },
        patchCalls,
        requests,
        close() {
          return new Promise((closeResolve, closeReject) => {
            server.close((error) => error ? closeReject(error) : closeResolve());
          });
        },
      });
    });
  });
}

function decryptFeishuPayload(encrypt, encryptKey) {
  const encryptedBuffer = Buffer.from(encrypt, "base64");
  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, encryptedBuffer.subarray(0, 16));
  const decrypted = Buffer.concat([
    decipher.update(encryptedBuffer.subarray(16)),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = Buffer.alloc(0);
    req.on("data", (chunk) => {
      raw = Buffer.concat([raw, Buffer.from(chunk)]);
    });
    req.on("error", reject);
    req.on("end", () => {
      try {
        resolve(raw.length ? JSON.parse(raw.toString("utf8")) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function startRuntime(runtimeDir, port, extraEnv = {}) {
  const child = spawn(process.execPath, [path.join(runtimeDir, "dist", "index.js")], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      ALLOW_DEBUG_WITHOUT_FEISHU: "1",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  return child;
}

function waitForProcessExit(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out waiting for process exit. stdout=${stdout} stderr=${stderr}`));
    }, 10_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function reservePort() {
  const server = http.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not reserve a TCP port."));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForJson(url) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`GET ${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function waitFor(predicate, describe) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const description = typeof describe === "function" ? describe() : describe;
  throw new Error(`Timed out waiting for ${description}.`);
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
