import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "dist", "index.js");
const genericLevel2Template = fs.readFileSync(path.join(root, "docs", "level-2-verification-record.md"), "utf8");

assert.match(genericLevel2Template, /batch, batch-refresh/);
assert.match(genericLevel2Template, /Batch ID:/);
assert.match(genericLevel2Template, /Batch status card message ID or screenshot:/);
assert.match(genericLevel2Template, /Batch download URL or screenshot:/);

test("CLI can analyze, plan, generate, and verify an image-agent-web-like target", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-smoke-"));
  const target = path.join(temp, "image-agent-web");
  const workspace = path.join(temp, "out");
  const generated = path.join(temp, "generated");

  const rootHelp = run(["--help"]);
  assert.match(rootHelp, /--mode embedded-adapter\|standalone-runtime/);
  assert.match(rootHelp, /--host-runtime-url <url>/);
  const generateHelp = run(["generate", "--help"]);
  assert.match(generateHelp, /--mode embedded-adapter\|standalone-runtime/);

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
  fs.writeFileSync(
    path.join(target, "agent.py"),
    [
      "import os",
      "OPENAI_API_KEY = os.environ.get(\"OPENAI_API_KEY\", \"sk-test-secret-should-not-leak-123456\")",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(target, "templates.py"),
    [
      "TEMPLATES = [",
      "  {",
      "    \"id\": \"launch-banner\",",
      "    \"name\": \"Launch Banner\",",
      "    \"allowed_sizes\": [\"1200x628\", \"1024x1024\"],",
      "    \"default_size\": \"1200x628\",",
      "    \"fields\": [",
      "      {\"key\": \"headline\", \"label\": \"主题\", \"required\": True, \"placeholder\": \"请输入主题\"},",
      "      {\"key\": \"body_copy\", \"label\": \"Body Copy\", \"required\": False},",
      "    ],",
      "  }",
      "  ,",
      "  {",
      "    \"id\": \"square-social\",",
      "    \"name\": \"Square Social\",",
      "    \"allowed_sizes\": [\"1024x1024\"],",
      "    \"default_size\": \"1024x1024\",",
      "    \"fields\": [",
      "      {\"key\": \"headline\", \"label\": \"Headline\", \"required\": True},",
      "      {\"key\": \"cta\", \"label\": \"CTA\", \"required\": True},",
      "    ],",
      "  }",
      "]",
      "REFERENCE_TYPES = [",
      "  {\"id\": \"style\", \"name\": \"Style\"}",
      "]",
    ].join("\n"),
    "utf8",
  );

  run(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace]);
  const serviceManifest = JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "service_manifest.json"), "utf8"));
  assert.ok(serviceManifest.source_scan.secret_findings.some((item) => (
    item.file === "agent.py"
    && item.kind === "openai_api_key_literal"
    && item.line === 2
  )));
  assert.ok(serviceManifest.source_scan.endpoint_coverage.some((item) => (
    item.method === "POST"
    && item.path === "/api/generate"
    && item.status === "supported"
    && item.capability_id === "image.generate"
  )));
  assert.ok(serviceManifest.source_scan.endpoint_coverage.some((item) => (
    item.method === "POST"
    && item.path === "/api/iterate"
    && item.status === "supported"
    && item.capability_id === "image.iterate"
  )));
  assert.ok(serviceManifest.source_scan.endpoint_coverage.some((item) => (
    item.method === "POST"
    && item.path === "/api/batch"
    && item.status === "supported"
    && item.capability_id === "image.batch"
  )));
  assert.ok(serviceManifest.source_scan.endpoint_coverage.some((item) => (
    item.method === "GET"
    && item.path === "/api/batch/{batch_id}/status"
    && item.status === "supporting"
    && item.capability_id === "image.batch"
  )));
  assert.ok(serviceManifest.source_scan.endpoint_coverage.some((item) => (
    item.method === "GET"
    && item.path === "/api/batch/{batch_id}/download"
    && item.status === "supporting"
    && item.capability_id === "image.batch"
  )));
  assert.equal(serviceManifest.source_scan.endpoint_coverage.filter((item) => item.status === "supported").length, 3);
  const analysisReport = fs.readFileSync(path.join(workspace, "analysis_report.md"), "utf8");
  assert.match(analysisReport, /Source Security Findings/);
  assert.match(analysisReport, /Endpoint Coverage/);
  assert.match(analysisReport, /POST \/api\/iterate: supported, capability=image\.iterate/);
  assert.match(analysisReport, /POST \/api\/batch: supported, capability=image\.batch/);
  assert.match(analysisReport, /GET \/api\/batch\/\{batch_id\}\/status: supporting, capability=image\.batch/);
  assert.match(analysisReport, /agent\.py:2 \(openai_api_key_literal\)/);
  assert.doesNotMatch(analysisReport, /sk-test-secret-should-not-leak/);
  run(["plan", workspace]);
  const permissionReview = fs.readFileSync(path.join(workspace, "permission_review.md"), "utf8");
  assert.match(permissionReview, /Potential target-side secret literal in agent\.py:2/);
  assert.match(permissionReview, /<PUBLIC_CALLBACK_BASE_URL>\/webhook\/card/);
  assert.doesNotMatch(permissionReview, /Configure card action callback URL to the generated bot runtime/);
  assert.doesNotMatch(permissionReview, /sk-test-secret-should-not-leak/);
  run(["context", workspace]);
  const contextFile = path.join(workspace, "feishu_context.template.json");
  const context = JSON.parse(fs.readFileSync(contextFile, "utf8"));
  assert.ok(context.required_permissions.manual_steps.some((item) => item.includes("<PUBLIC_CALLBACK_BASE_URL>/webhook/card")));
  assert.equal(context.handoff_request.required_values.find((item) => item.key === "APP_ID").owner, "Feishu app owner");
  assert.equal(context.handoff_request.required_values.find((item) => item.key === "IMAGE_AGENT_BASE_URL").required_for_level_2, true);
  assert.ok(context.handoff_request.permission_confirmations.some((item) => item.item === "im:message:update"));
  assert.equal(context.handoff_request.permission_confirmations.find((item) => item.item === "im:message:update").risk, "low");
  assert.equal(context.handoff_request.permission_confirmations.find((item) => item.item === "card.action.trigger").owner, "Feishu app owner or FDE");
  assert.ok(context.handoff_request.permission_confirmations.find((item) => item.item === "card.action.trigger").security.includes("verification_token"));
  assert.ok(context.handoff_request.runtime_choices.some((item) => item.key === "CARD_ACTION_MODE"));
  assert.ok(context.handoff_request.runtime_choices.some((item) => item.key === "DEBUG_ACCESS_TOKEN"));
  assert.equal(context.runtime_config.card_action_mode, "sync");
  assert.equal(context.runtime_config.upload_image_to_lark, true);
  assert.equal(context.runtime_config.target_timeout_seconds, 120);
  assert.equal(context.runtime_config.debug_access_token, "");
  assert.deepEqual(context.runtime_config.allowed_operator_open_ids, []);
  assert.equal(context.handoff_request.generated_package_hint, "generated\\image-agent-web-lark");
  assert.ok(context.handoff_request.verification_commands.some((command) => command.includes("configure ") && command.includes("--strict") && command.includes("--dry-run")));
  assert.ok(context.handoff_request.verification_commands.some((command) => command.includes("--level2")));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(" status "))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(" configure ") && command.includes("--strict"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(" configure ") && command.includes("--strict") && command.includes("--dry-run"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(" doctor "))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(" doctor ") && command.includes("--gate"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(" doctor ") && command.includes("--probe-target") && command.includes("--gate"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes("generated\\image-agent-web-lark"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("status ."))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("configure . --strict"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("configure . --strict --dry-run"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("doctor ."))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("doctor .") && command.includes("--probe-target") && command.includes("--gate"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("verify . --runtime-url"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("evidence ."))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("handoff ."))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "moved_package_root" && set.commands.some((command) => command.includes("status ."))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "moved_package_root" && set.commands.some((command) => command.includes("configure . --strict"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "moved_package_root" && set.commands.some((command) => command.includes("configure . --strict --dry-run"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "moved_package_root" && set.commands.some((command) => command.includes("LARK_DEPLOYER_CLI"))));
  const contextRequest = fs.readFileSync(path.join(workspace, "feishu_context.request.md"), "utf8");
  assert.match(contextRequest, /# Feishu Context Request/);
  assert.match(contextRequest, /can_provide_existing_app_context: yes\/no/);
  assert.match(contextRequest, /card_callback_url_configured: <PUBLIC_CALLBACK_BASE_URL>\/webhook\/card yes\/no/);
  assert.match(contextRequest, /secure_secret_channel:/);
  assert.match(contextRequest, /card\.action\.trigger/);
  assert.match(contextRequest, /<PUBLIC_CALLBACK_BASE_URL>\/webhook\/card/);
  assert.match(contextRequest, /verification_token/);
  assert.match(contextRequest, /Feishu permission admin/);
  assert.match(contextRequest, /Do not paste real secrets/);
  assert.match(contextRequest, /replace placeholder strings completely/);
  assert.match(contextRequest, /configure --strict --dry-run` treats/);
  assert.ok(fs.existsSync(path.join(workspace, "feishu_context.reply.template.json")));
  assert.ok(fs.existsSync(path.join(workspace, "feishu_context.reply.template.md")));
  const contextReplyTemplate = JSON.parse(fs.readFileSync(path.join(workspace, "feishu_context.reply.template.json"), "utf8"));
  assert.equal(contextReplyTemplate.purpose.includes("non-secret"), true);
  assert.equal(contextReplyTemplate.answers.can_grant_permissions, null);
  assert.equal(contextReplyTemplate.public_values.target_base_url, "http://127.0.0.1:1");
  assert.ok(contextReplyTemplate.permission_confirmations.some((item) => item.item === "card.action.trigger" && item.status === "unknown"));
  assert.ok(contextReplyTemplate.secret_red_lines.some((item) => item.includes("APP_SECRET")));
  const contextReplyMarkdown = fs.readFileSync(path.join(workspace, "feishu_context.reply.template.md"), "utf8");
  assert.match(contextReplyMarkdown, /Feishu Context Reply Template/);
  assert.match(contextReplyMarkdown, /Secure secret channel/);
  assert.doesNotMatch(contextReplyMarkdown, /sk-test-secret-should-not-leak/);
  const missingGenerated = path.join(temp, "generated-missing-context");
  run(["generate", workspace, "--out", missingGenerated]);
  for (const relativePath of [
    "adapter/cards.ts",
    "adapter/handlers.ts",
    "adapter/service-client.ts",
    "adapter/validation.ts",
    "adapter/types.ts",
    "adapter/audit-events.ts",
    "docs/integration_guide.md",
    "bot-runtime/src/index.ts",
  ]) {
    assert.ok(fs.existsSync(path.join(missingGenerated, relativePath)), `${relativePath} should be generated`);
  }
  const runtimeIndex = fs.readFileSync(path.join(missingGenerated, "bot-runtime", "src", "index.ts"), "utf8");
  assert.match(runtimeIndex, /adapterHandlersModule = "\.\.\/\.\.\/adapter\/handlers\.js"/);
  assert.match(runtimeIndex, /handleImageAgentCardAction/);
  assert.doesNotMatch(runtimeIndex, /generateImage\(/);
  assert.doesNotMatch(runtimeIndex, /iterateImage\(/);
  assert.doesNotMatch(runtimeIndex, /createBatch\(/);
  assert.doesNotMatch(runtimeIndex, /getBatchStatus\(/);
  const runtimeClient = fs.readFileSync(path.join(missingGenerated, "bot-runtime", "src", "image-agent-client.ts"), "utf8");
  assert.doesNotMatch(runtimeClient, /export async function generateImage\(/);
  assert.doesNotMatch(runtimeClient, /export async function iterateImage\(/);
  assert.doesNotMatch(runtimeClient, /export async function createBatch\(/);
  assert.doesNotMatch(runtimeClient, /export async function getBatchStatus\(/);
  const adapterCards = fs.readFileSync(path.join(missingGenerated, "adapter", "cards.ts"), "utf8");
  assert.match(adapterCards, /name: "image_iterate_form"/);
  assert.match(adapterCards, /name: "param_feedback"/);
  assert.match(adapterCards, /content: "Feedback"/);
  assert.match(adapterCards, /content: "Iterate image"/);
  assert.match(adapterCards, /action: "image\.iterate\.submit"/);
  const adapterTypes = fs.readFileSync(path.join(missingGenerated, "adapter", "types.ts"), "utf8");
  assert.doesNotMatch(adapterTypes, /uploadImageToFeishu/);
  const generatedStartHere = fs.readFileSync(path.join(missingGenerated, "START_HERE.md"), "utf8");
  assert.match(generatedStartHere, /adapter\//);
  const generatedReadmeWithAdapter = fs.readFileSync(path.join(missingGenerated, "README.md"), "utf8");
  assert.match(generatedReadmeWithAdapter, /Embedded adapter/);
  assert.match(generatedReadmeWithAdapter, /--host-runtime-url/);
  const embeddedVerifyOutput = run(["verify", missingGenerated, "--mode", "embedded-adapter", "--strict"]);
  assert.match(embeddedVerifyOutput, /adapter:handlers/);
  const embeddedVerifyReport = JSON.parse(fs.readFileSync(path.join(missingGenerated, "verification_report.json"), "utf8"));
  assert.equal(embeddedVerifyReport.status, "pass");
  assert.equal(embeddedVerifyReport.context.mode, "embedded-adapter");
  assert.ok(embeddedVerifyReport.checks.some((item) => item.name === "adapter:integration-guide" && item.status === "pass"));
  assert.ok(embeddedVerifyReport.checks.some((item) => item.name === "adapter:action:image.generate.submit" && item.status === "pass"));
  assert.ok(embeddedVerifyReport.checks.some((item) => item.name === "adapter:action:image.iterate.submit" && item.status === "pass"));
  assert.ok(embeddedVerifyReport.checks.some((item) => item.name === "adapter:action:image.batch.submit" && item.status === "pass"));
  assert.ok(embeddedVerifyReport.checks.some((item) => item.name === "adapter:action:image.batch.refresh" && item.status === "pass"));
  assert.equal(embeddedVerifyReport.checks.some((item) => item.name.startsWith("runtime:/debug/")), false);
  const embeddedHostVerifyOutput = runExpectFailure(["verify", missingGenerated, "--mode", "embedded-adapter", "--host-runtime-url", "http://127.0.0.1:3978", "--simulate", "--strict"]);
  assert.match(embeddedHostVerifyOutput, /embedded:host:\/health/);
  assert.match(embeddedHostVerifyOutput, /embedded:host:\/webhook\/card:challenge/);
  const embeddedHostVerifyReport = JSON.parse(fs.readFileSync(path.join(missingGenerated, "verification_report.json"), "utf8"));
  assert.equal(embeddedHostVerifyReport.status, "fail");
  assert.equal(embeddedHostVerifyReport.context.runtimeUrl, "http://127.0.0.1:3978");
  assert.equal(embeddedHostVerifyReport.context.hostRuntimeUrl, "http://127.0.0.1:3978");
  assert.equal(embeddedHostVerifyReport.context.simulate, true);
  assert.ok(embeddedHostVerifyReport.checks.some((item) => item.name === "embedded:host:/health" && item.status === "fail"));
  assert.ok(embeddedHostVerifyReport.checks.some((item) => item.name === "embedded:host:/webhook/card:challenge" && item.status === "fail"));
  assert.ok(embeddedHostVerifyReport.checks.some((item) => item.name === "embedded:host:/debug/simulate-card-action" && item.status === "warn"));
  const generatedIntegrationGuide = fs.readFileSync(path.join(missingGenerated, "docs", "integration_guide.md"), "utf8");
  assert.match(generatedIntegrationGuide, /--host-runtime-url/);
  assert.match(generatedIntegrationGuide, /\/health/);
  assert.match(generatedIntegrationGuide, /\/webhook\/card/);
  assert.match(generatedIntegrationGuide, /\/debug\/simulate-card-action/);
  assert.doesNotMatch(generatedIntegrationGuide, /uploadImageToFeishu/);
  const embeddedOnlyGenerated = path.join(temp, "generated-embedded-only");
  run(["generate", workspace, "--out", embeddedOnlyGenerated, "--mode", "embedded-adapter"]);
  assert.ok(fs.existsSync(path.join(embeddedOnlyGenerated, "adapter", "handlers.ts")));
  assert.ok(fs.existsSync(path.join(embeddedOnlyGenerated, "docs", "integration_guide.md")));
  assert.equal(fs.existsSync(path.join(embeddedOnlyGenerated, "bot-runtime")), false);
  const embeddedOnlyStartHere = fs.readFileSync(path.join(embeddedOnlyGenerated, "START_HERE.md"), "utf8");
  const embeddedOnlyReadme = fs.readFileSync(path.join(embeddedOnlyGenerated, "README.md"), "utf8");
  assert.match(embeddedOnlyStartHere, /does not include `bot-runtime\/`/);
  assert.match(embeddedOnlyStartHere, /--host-runtime-url/);
  assert.doesNotMatch(embeddedOnlyStartHere, /cd bot-runtime/);
  assert.doesNotMatch(embeddedOnlyStartHere, /npm start/);
  assert.match(embeddedOnlyReadme, /does not include a standalone `bot-runtime\/` host/);
  assert.match(embeddedOnlyReadme, /What The Embedded Adapter Does/);
  assert.match(embeddedOnlyReadme, /--host-runtime-url/);
  assert.doesNotMatch(embeddedOnlyReadme, /## What This Runtime Does/);
  assert.doesNotMatch(embeddedOnlyReadme, /cd bot-runtime/);
  assert.doesNotMatch(embeddedOnlyReadme, /npm start/);
  const embeddedOnlyChecklist = fs.readFileSync(path.join(embeddedOnlyGenerated, "deployment_checklist.md"), "utf8");
  assert.match(embeddedOnlyChecklist, /Embedded Host Environment/);
  assert.match(embeddedOnlyChecklist, /--mode embedded-adapter --host-runtime-url <host_runtime_url> --simulate/);
  assert.doesNotMatch(embeddedOnlyChecklist, /Run npm install in bot-runtime/);
  assert.doesNotMatch(embeddedOnlyChecklist, /Run npm start/);
  assert.doesNotMatch(embeddedOnlyChecklist, /--runtime-url <bot_runtime_url>/);
  const embeddedOnlyLevel2Record = fs.readFileSync(path.join(embeddedOnlyGenerated, "level2_verification_record.md"), "utf8");
  assert.match(embeddedOnlyLevel2Record, /Existing host service URL:/);
  assert.match(embeddedOnlyLevel2Record, /existing host service's secret\/config system/);
  assert.match(embeddedOnlyLevel2Record, /--mode embedded-adapter --host-runtime-url <host_runtime_url> --simulate/);
  assert.doesNotMatch(embeddedOnlyLevel2Record, /Bot runtime URL:/);
  assert.doesNotMatch(embeddedOnlyLevel2Record, /bot-runtime\.env/);
  assert.doesNotMatch(embeddedOnlyLevel2Record, /<bot_runtime_url>/);
  assert.doesNotMatch(embeddedOnlyLevel2Record, /bot-runtime\/audit\.log/);
  const embeddedOnlyIntegrationGuide = fs.readFileSync(path.join(embeddedOnlyGenerated, "docs", "integration_guide.md"), "utf8");
  assert.match(embeddedOnlyIntegrationGuide, /does not include a generated `bot-runtime\/` directory/);
  assert.match(embeddedOnlyIntegrationGuide, /--mode standalone-runtime/);
  assert.doesNotMatch(embeddedOnlyIntegrationGuide, /`bot-runtime\/` is a standalone reference host/);
  run(["verify", embeddedOnlyGenerated, "--mode", "embedded-adapter", "--strict"]);
  const embeddedOnlyDoctorJson = JSON.parse(run(["doctor", embeddedOnlyGenerated, "--mode", "embedded-adapter", "--json"]));
  assert.equal(embeddedOnlyDoctorJson.integration_mode, "embedded-adapter");
  assert.equal(embeddedOnlyDoctorJson.package_validation.status, "pass");
  assert.equal(embeddedOnlyDoctorJson.gate_passed, false);
  assert.ok(embeddedOnlyDoctorJson.blockers.some((item) => item.includes("real Feishu Level 2 evidence")));
  assert.ok(embeddedOnlyDoctorJson.package_validation.checks.some((item) => item.name === "adapter:action:image.iterate.submit" && item.status === "pass"));
  assert.ok(embeddedOnlyDoctorJson.package_validation.checks.some((item) => item.name === "adapter:action:image.batch.submit" && item.status === "pass"));
  assert.ok(embeddedOnlyDoctorJson.package_validation.checks.some((item) => item.name === "adapter:action:image.batch.refresh" && item.status === "pass"));
  assert.equal(embeddedOnlyDoctorJson.blockers.some((item) => item.includes("bot-runtime/.env")), false);
  assert.match(runExpectFailure(["doctor", embeddedOnlyGenerated, "--mode", "embedded-adapter", "--gate"]), /Embedded adapter gate failed/);
  const missingStatusOutput = run(["status", missingGenerated]);
  assert.match(missingStatusOutput, /MVP status: external_context_missing/);
  assert.match(missingStatusOutput, /Context request: /);
  assert.match(missingStatusOutput, /feishu_context\.request\.md/);
  assert.match(missingStatusOutput, /Send feishu_context\.request\.md to the Feishu app owner\/FDE/);
  const missingStatusJson = JSON.parse(run(["status", missingGenerated, "--json"]));
  assert.equal(missingStatusJson.state, "external_context_missing");
  assert.equal(missingStatusJson.context_request_path, path.join(missingGenerated, "feishu_context.request.md"));
  assert.equal(missingStatusJson.manual_evidence.templatePresent, true);
  assert.equal(missingStatusJson.manual_evidence.localPresent, false);
  assert.equal(missingStatusJson.manual_evidence.readyToImport, false);
  assert.ok(missingStatusJson.next_actions[0].includes("APP_ID"));
  assert.ok(missingStatusJson.next_actions[0].includes("PUBLIC_CALLBACK_BASE_URL"));
  assert.ok(missingStatusJson.next_actions.some((item) => item.includes("init-local") && item.includes("--context") && item.includes("--reply")));
  assert.ok(missingStatusJson.next_actions.some((item) => item.includes("configure . --strict") || item.includes("configure generated") && item.includes("--strict")));
  assert.ok(missingStatusJson.next_actions.some((item) => item.includes("--dry-run")));
  assert.ok(missingStatusJson.next_actions.some((item) => item.includes("configure . --strict") && !item.includes("--dry-run")));
  const initLocalPackage = path.join(temp, "init-local-package");
  fs.cpSync(missingGenerated, initLocalPackage, { recursive: true });
  assert.match(
    runExpectFailure(["init-local", initLocalPackage]),
    /Choose at least one local file group/,
  );
  const initLocalOutput = run(["init-local", initLocalPackage, "--all"]);
  assert.match(initLocalOutput, /Created: .*feishu_context\.local\.json/);
  assert.match(initLocalOutput, /Created: .*feishu_context\.reply\.local\.json/);
  assert.match(initLocalOutput, /Created: .*feishu_context\.reply\.local\.md/);
  assert.match(initLocalOutput, /Created: .*level2_manual_evidence\.local\.json/);
  assert.ok(fs.existsSync(path.join(initLocalPackage, "feishu_context.local.json")));
  assert.ok(fs.existsSync(path.join(initLocalPackage, "feishu_context.reply.local.json")));
  assert.ok(fs.existsSync(path.join(initLocalPackage, "feishu_context.reply.local.md")));
  assert.ok(fs.existsSync(path.join(initLocalPackage, "level2_manual_evidence.local.json")));
  assert.doesNotMatch(fs.readFileSync(path.join(initLocalPackage, "feishu_context.local.json"), "utf8"), /sk-test-secret-should-not-leak/);
  fs.writeFileSync(path.join(initLocalPackage, "feishu_context.local.json"), "{\"sentinel\":true}\n", "utf8");
  const initLocalSkipOutput = run(["init-local", initLocalPackage, "--context"]);
  assert.match(initLocalSkipOutput, /Skipped existing: .*feishu_context\.local\.json/);
  assert.match(fs.readFileSync(path.join(initLocalPackage, "feishu_context.local.json"), "utf8"), /sentinel/);
  const initLocalForceOutput = run(["init-local", initLocalPackage, "--context", "--force"]);
  assert.match(initLocalForceOutput, /Created: .*feishu_context\.local\.json/);
  assert.doesNotMatch(fs.readFileSync(path.join(initLocalPackage, "feishu_context.local.json"), "utf8"), /sentinel/);
  const missingDoctorOutput = run(["doctor", missingGenerated]);
  assert.match(missingDoctorOutput, /MVP doctor: NOT READY/);
  assert.match(missingDoctorOutput, /State: external_context_missing/);
  assert.match(missingDoctorOutput, /Gate passed: no/);
  assert.match(missingDoctorOutput, /--dry-run/);
  assert.match(missingDoctorOutput, /Missing required external values: APP_ID/);
  const missingDoctorJson = JSON.parse(run(["doctor", missingGenerated, "--json"]));
  assert.equal(missingDoctorJson.state, "external_context_missing");
  assert.equal(missingDoctorJson.gate_passed, false);
  assert.ok(missingDoctorJson.blockers.some((item) => item.includes("APP_ID")));
  assert.ok(missingDoctorJson.next_actions.some((item) => item.includes("--dry-run")));
  assert.ok(missingDoctorJson.next_actions.some((item) => item.includes("configure . --strict") && !item.includes("--dry-run")));
  assert.doesNotMatch(JSON.stringify(missingDoctorJson), /sk-test-secret-should-not-leak/);
  assert.equal(missingDoctorJson.context_reply.template_present, true);
  assert.equal(missingDoctorJson.context_reply.local_json_present, false);
  const contextReplyPackage = path.join(temp, "context-reply-package");
  fs.cpSync(missingGenerated, contextReplyPackage, { recursive: true });
  const contextReplyLocalJson = path.join(contextReplyPackage, "feishu_context.reply.local.json");
  fs.writeFileSync(contextReplyLocalJson, "{ invalid context reply json", "utf8");
  const invalidContextReplyStatus = JSON.parse(run(["status", contextReplyPackage, "--json"]));
  assert.equal(invalidContextReplyStatus.context_reply.localJsonPresent, true);
  assert.match(invalidContextReplyStatus.context_reply.parseError, /JSON/);
  assert.ok(invalidContextReplyStatus.next_actions[0].includes("Fix invalid feishu_context.reply.local.json"));
  fs.writeFileSync(
    contextReplyLocalJson,
    JSON.stringify({
      schema_version: "0.1",
      purpose: "local owner reply",
      generated_package_hint: contextReplyPackage,
      answers: {
        can_provide_existing_app_context: true,
        can_grant_permissions: false,
        can_configure_card_callback: true,
        card_callback_url_configured: false,
        can_add_bot_to_test_chat: true,
        can_keep_target_reachable: true,
      },
      public_values: {
        feishu_app_name: "Internal Image Agent Bot",
        test_chat_id: "oc_internal_reply_chat",
        public_callback_base_url: "https://reply-tunnel.example.com",
        target_base_url: "http://127.0.0.1:1",
      },
      secure_secret_channel: "internal vault item",
      permission_confirmations: [
        { item: "im:message:send_as_bot", status: "confirmed", owner: "Permission Admin", note: "ok" },
        { item: "card.action.trigger", status: "blocked", owner: "App Owner", note: "callback owner unavailable" },
      ],
      blocked_by: ["permission admin unavailable until Friday"],
      next_local_steps: [],
      secret_red_lines: [],
    }, null, 2) + "\n",
    "utf8",
  );
  const contextReplyStatus = JSON.parse(run(["status", contextReplyPackage, "--json"]));
  assert.equal(contextReplyStatus.context_reply.localJsonPresent, true);
  assert.equal(contextReplyStatus.context_reply.parseError, "");
  assert.equal(contextReplyStatus.context_reply.answeredQuestions, 6);
  assert.ok(contextReplyStatus.context_reply.negativeAnswers.includes("can_grant_permissions"));
  assert.ok(contextReplyStatus.context_reply.negativeAnswers.includes("card_callback_url_configured"));
  assert.equal(contextReplyStatus.context_reply.permissionStatusCounts.blocked, 1);
  assert.ok(contextReplyStatus.context_reply.expectedPermissionConfirmationCount >= contextReplyStatus.context_reply.permissionConfirmationCount);
  assert.equal(contextReplyStatus.context_reply.blockedCount, 1);
  assert.equal(contextReplyStatus.context_reply.secureSecretChannelPresent, true);
  assert.ok(contextReplyStatus.context_reply.publicValueFields.includes("public_callback_base_url"));
  assert.ok(contextReplyStatus.next_actions[0].includes("Resolve owner reply blockers"));
  assert.doesNotMatch(JSON.stringify(contextReplyStatus.context_reply), /Internal Image Agent Bot/);
  assert.doesNotMatch(JSON.stringify(contextReplyStatus.context_reply), /reply-tunnel/);
  assert.doesNotMatch(JSON.stringify(contextReplyStatus.context_reply), /permission admin unavailable/);
  const contextReplyDoctorJson = JSON.parse(run(["doctor", contextReplyPackage, "--json"]));
  assert.ok(contextReplyDoctorJson.blockers.some((item) => item.includes("Context owner reply reports unresolved blockers")));
  assert.doesNotMatch(JSON.stringify(contextReplyDoctorJson.context_reply), /oc_internal_reply_chat/);
  run(["readiness", contextReplyPackage]);
  const contextReplyHandoffStatus = fs.readFileSync(path.join(contextReplyPackage, "handoff_status.md"), "utf8");
  assert.match(contextReplyHandoffStatus, /## Context Reply Intake/);
  assert.match(contextReplyHandoffStatus, /Permission statuses \| confirmed=1, blocked=1/);
  assert.doesNotMatch(contextReplyHandoffStatus, /reply-tunnel/);
  assert.doesNotMatch(contextReplyHandoffStatus, /permission admin unavailable/);
  const permissionUnknownPackage = path.join(temp, "context-reply-permission-unknown");
  fs.cpSync(missingGenerated, permissionUnknownPackage, { recursive: true });
  const permissionUnknownTemplate = JSON.parse(fs.readFileSync(path.join(permissionUnknownPackage, "feishu_context.reply.template.json"), "utf8"));
  fs.writeFileSync(
    path.join(permissionUnknownPackage, "feishu_context.reply.local.json"),
    JSON.stringify({
      schema_version: "0.1",
      purpose: "local owner reply with unconfirmed permissions",
      generated_package_hint: permissionUnknownPackage,
      answers: {
        can_provide_existing_app_context: true,
        can_grant_permissions: true,
        can_configure_card_callback: true,
        card_callback_url_configured: true,
        can_add_bot_to_test_chat: true,
        can_keep_target_reachable: true,
      },
      public_values: {
        test_chat_id: "oc_permission_unknown_chat",
        public_callback_base_url: "https://permission-unknown.example.com",
        target_base_url: "http://127.0.0.1:1",
      },
      secure_secret_channel: "vault",
      permission_confirmations: permissionUnknownTemplate.permission_confirmations.slice(0, 1).map((item) => ({
        ...item,
        status: "unknown",
      })),
      blocked_by: [],
    }, null, 2) + "\n",
    "utf8",
  );
  const permissionUnknownStatus = JSON.parse(run(["status", permissionUnknownPackage, "--json"]));
  assert.equal(permissionUnknownStatus.context_reply.permissionStatusCounts.unknown, 1);
  assert.ok(permissionUnknownStatus.context_reply.missingPermissionConfirmations.length > 0);
  assert.equal(permissionUnknownStatus.context_reply.readyForLocalConfigure, false);
  assert.ok(permissionUnknownStatus.next_actions.some((item) => item.includes("Confirm every required permission")));
  const missingDoctorReportPath = path.join(missingGenerated, "doctor_report.json");
  const missingDoctorReportOutput = run(["doctor", missingGenerated, "--out", missingDoctorReportPath]);
  assert.match(missingDoctorReportOutput, /Doctor report written/);
  assert.ok(fs.existsSync(missingDoctorReportPath));
  assert.ok(fs.existsSync(path.join(missingGenerated, "doctor_report.md")));
  const missingDoctorReport = fs.readFileSync(path.join(missingGenerated, "doctor_report.md"), "utf8");
  assert.match(missingDoctorReport, /MVP Doctor Report/);
  assert.match(missingDoctorReport, /Missing required external values: APP_ID/);
  assert.doesNotMatch(missingDoctorReport, /sk-test-secret-should-not-leak/);
  const doctorDetailPackage = path.join(temp, "doctor-detail-package");
  fs.cpSync(missingGenerated, doctorDetailPackage, { recursive: true });
  fs.writeFileSync(
    path.join(doctorDetailPackage, "verification_report.json"),
    JSON.stringify({
      generated_at: "2026-07-02T00:00:00.000Z",
      status: "warn",
      context: {
        packagePath: doctorDetailPackage,
        runtimeUrl: "",
        level2: false,
        targetBaseUrl: "http://127.0.0.1:8000",
      },
      checks: [
        {
          name: "target:/api/meta",
          status: "pass",
          detail: `GET http://127.0.0.1:8000/api/meta returned HTTP 200. Response: ${JSON.stringify({ templates: [{ id: "large-template", description: "x".repeat(2000) }] })}`,
        },
      ],
    }, null, 2) + "\n",
    "utf8",
  );
  const summarizedDoctorJson = JSON.parse(run(["doctor", doctorDetailPackage, "--json"]));
  assert.equal(summarizedDoctorJson.target_preflight.status, "pass");
  assert.equal(summarizedDoctorJson.target_preflight.check_url, "http://127.0.0.1:8000/api/meta");
  assert.equal(summarizedDoctorJson.target_preflight.last_checked_at, "2026-07-02T00:00:00.000Z");
  assert.equal(summarizedDoctorJson.target_preflight.evidence_source, "verification_report.json");
  assert.match(summarizedDoctorJson.target_preflight.evidence_scope, /last verify snapshot/);
  assert.match(summarizedDoctorJson.target_preflight.detail, /Response body omitted from doctor report/);
  assert.doesNotMatch(summarizedDoctorJson.target_preflight.detail, /large-template/);
  assert.ok(summarizedDoctorJson.target_preflight.detail.length < 180);
  assert.match(summarizedDoctorJson.target_preflight.rerun_command, /^node /);
  assert.match(summarizedDoctorJson.target_preflight.rerun_command, /verify \./);
  assert.doesNotMatch(summarizedDoctorJson.target_preflight.rerun_command, /Latest target preflight pass/);
  assert.equal(summarizedDoctorJson.target_preflight.live_probe.requested, false);
  assert.equal(summarizedDoctorJson.target_preflight.live_probe.status, "not_requested");
  assert.ok(summarizedDoctorJson.next_actions.some((item) => item.includes("Latest target preflight pass is a verification_report snapshot from 2026-07-02T00:00:00.000Z")));
  assert.ok(summarizedDoctorJson.next_actions.some((item) => item.includes("rerun verify")));
  assert.match(runExpectFailure(["doctor", missingGenerated, "--gate"]), /MVP gate failed/);
  const missingReadinessOutput = run(["readiness", missingGenerated]);
  assert.match(missingReadinessOutput, /Context request: /);
  const missingHandoffStatus = fs.readFileSync(path.join(missingGenerated, "handoff_status.md"), "utf8");
  assert.match(missingHandoffStatus, /Context request file:/);
  assert.match(missingHandoffStatus, /## Context Request/);
  assert.match(missingHandoffStatus, /## Manual Evidence Helper/);
  assert.match(missingHandoffStatus, /Ready to import \| no/);
  assert.match(missingHandoffStatus, /Missing values to request: `APP_ID`/);
  assert.match(missingHandoffStatus, /secure channel only/);
  assert.match(missingHandoffStatus, /configure .*--strict --dry-run/);
  assert.ok(fs.existsSync(path.join(missingGenerated, "level2_manual_evidence.template.json")));
  const missingGeneratedGitignore = fs.readFileSync(path.join(missingGenerated, ".gitignore"), "utf8");
  assert.match(missingGeneratedGitignore, /level2_manual_evidence\.local\.json/);
  const manualEvidenceDir = path.join(missingGenerated, "evidence");
  fs.mkdirSync(manualEvidenceDir, { recursive: true });
  fs.writeFileSync(path.join(manualEvidenceDir, "result-card.png"), "fake image", "utf8");
  const manualEvidenceFile = path.join(missingGenerated, "level2_manual_evidence.local.json");
  fs.writeFileSync(manualEvidenceFile, "{ invalid manual evidence json", "utf8");
  const invalidManualStatusOutput = run(["status", missingGenerated]);
  assert.match(invalidManualStatusOutput, /Manual evidence parse error:/);
  assert.match(invalidManualStatusOutput, /Fix invalid level2_manual_evidence\.local\.json/);
  const invalidManualStatusJson = JSON.parse(run(["status", missingGenerated, "--json"]));
  assert.equal(invalidManualStatusJson.manual_evidence.localPresent, true);
  assert.match(invalidManualStatusJson.manual_evidence.parseError, /JSON/);
  assert.ok(invalidManualStatusJson.next_actions[0].includes("Fix invalid level2_manual_evidence.local.json"));
  const invalidManualDoctorOutput = run(["doctor", missingGenerated]);
  assert.match(invalidManualDoctorOutput, /Manual evidence parse error:/);
  assert.match(invalidManualDoctorOutput, /Manual evidence local file is invalid:/);
  const invalidManualDoctorJson = JSON.parse(run(["doctor", missingGenerated, "--json"]));
  assert.match(invalidManualDoctorJson.manual_evidence.parse_error, /JSON/);
  assert.ok(invalidManualDoctorJson.blockers.some((item) => item.includes("Manual evidence local file is invalid")));
  run(["readiness", missingGenerated]);
  const invalidManualHandoffStatus = fs.readFileSync(path.join(missingGenerated, "handoff_status.md"), "utf8");
  assert.match(invalidManualHandoffStatus, /Parse status \| invalid:/);
  assert.match(invalidManualHandoffStatus, /Fix invalid level2_manual_evidence\.local\.json/);
  const placeholderEvidencePackage = path.join(temp, "unfilled-evidence-package");
  fs.cpSync(missingGenerated, placeholderEvidencePackage, { recursive: true });
  const placeholderManualEvidenceFile = path.join(placeholderEvidencePackage, "level2_manual_evidence.local.json");
  const placeholderManualValues = {
    operator: "todo",
    test_chat: "<TEST_CHAT>",
    start_message_id: "<START_MESSAGE_ID>",
    result_message_id: "{{RESULT_MESSAGE_ID}}",
    generated_image_url: "${GENERATED_IMAGE_URL}",
    batch_id: "replace-me",
    batch_status_message_id: "placeholder",
    batch_download_url: "<BATCH_DOWNLOAD_URL>",
    trace_id: "<TRACE_ID>",
  };
  fs.writeFileSync(
    placeholderManualEvidenceFile,
    JSON.stringify({
      schema_version: "0.1",
      values: placeholderManualValues,
    }, null, 2) + "\n",
    "utf8",
  );
  const placeholderStatusJson = JSON.parse(run(["status", placeholderEvidencePackage, "--json"]));
  assert.equal(placeholderStatusJson.manual_evidence.localPresent, true);
  assert.equal(placeholderStatusJson.manual_evidence.parseError, "");
  assert.equal(placeholderStatusJson.manual_evidence.readyToImport, false);
  assert.deepEqual(placeholderStatusJson.manual_evidence.filledFields, []);
  assert.ok(placeholderStatusJson.manual_evidence.missingFields.includes("result_message_id"));
  assert.ok(placeholderStatusJson.completion_decision.missingManualEvidence.includes("Result card message ID or screenshot"));
  const placeholderEvidenceOutput = run(["evidence", placeholderEvidencePackage, "--manual-evidence", placeholderManualEvidenceFile, "--update-record"]);
  assert.match(placeholderEvidenceOutput, /Level 2 record updated:/);
  const placeholderRecordAfterImport = fs.readFileSync(path.join(placeholderEvidencePackage, "level2_verification_record.md"), "utf8");
  for (const placeholderValue of Object.values(placeholderManualValues)) {
    assert.doesNotMatch(placeholderRecordAfterImport, new RegExp(escapeRegExp(placeholderValue)));
  }
  let placeholderRecord = fs.readFileSync(path.join(placeholderEvidencePackage, "level2_verification_record.md"), "utf8");
  placeholderRecord = placeholderRecord
    .replace(/- Start card message ID:[^\r\n]*/g, "- Start card message ID: <START_MESSAGE_ID>")
    .replace(/- Result card message ID or screenshot:[^\r\n]*/g, "- Result card message ID or screenshot: {{RESULT_MESSAGE_ID}}")
    .replace(/- Generated image URL or image key:[^\r\n]*/g, "- Generated image URL or image key: ${GENERATED_IMAGE_URL}")
    .replace(/- Batch ID:[^\r\n]*/g, "- Batch ID: replace-me")
    .replace(/- Batch status card message ID or screenshot:[^\r\n]*/g, "- Batch status card message ID or screenshot: placeholder")
    .replace(/- Batch download URL or screenshot:[^\r\n]*/g, "- Batch download URL or screenshot: <BATCH_DOWNLOAD_URL>")
    .replace(/- Trace ID:[^\r\n]*/g, "- Trace ID: <TRACE_ID>");
  fs.writeFileSync(path.join(placeholderEvidencePackage, "level2_verification_record.md"), placeholderRecord, "utf8");
  const placeholderRecordStatus = JSON.parse(run(["status", placeholderEvidencePackage, "--json"]));
  assert.equal(placeholderRecordStatus.completion_decision.manualEvidencePresent, false);
  assert.ok(placeholderRecordStatus.completion_decision.missingManualEvidence.includes("Start card message ID"));
  assert.ok(placeholderRecordStatus.completion_decision.missingManualEvidence.includes("Batch ID"));
  const placeholderDoctorJson = JSON.parse(run(["doctor", placeholderEvidencePackage, "--json"]));
  assert.ok(placeholderDoctorJson.blockers.some((item) => item.includes("Manual Feishu evidence is missing")));
  fs.writeFileSync(
    manualEvidenceFile,
    JSON.stringify({
      schema_version: "0.1",
      values: {
        date: "2026-07-02",
        operator: "JSON FDE",
        feishu_app_name: "JSON Image Bot",
        test_chat: "JSON Test Chat",
        start_message_id: "om_json_start",
        result_message_id: "om_json_result",
        result_screenshot: "evidence/result-card.png",
        generated_image_url: "https://example.com/json-result.png",
        generated_image_key: "img_json_result",
        trace_id: "trace_json_result",
        notes: "json manual evidence observed",
      },
    }, null, 2) + "\n",
    "utf8",
  );
  const manualBeforeImportStatus = JSON.parse(run(["status", missingGenerated, "--json"]));
  assert.equal(manualBeforeImportStatus.manual_evidence.localPresent, true);
  assert.equal(manualBeforeImportStatus.manual_evidence.readyToImport, true);
  assert.ok(manualBeforeImportStatus.manual_evidence.pendingImportFields.includes("result_message_id"));
  assert.deepEqual(manualBeforeImportStatus.manual_evidence.importedFields, []);
  assert.doesNotMatch(JSON.stringify(manualBeforeImportStatus.manual_evidence), /om_json_result/);
  const manualJsonOutput = run(["evidence", missingGenerated, "--manual-evidence", manualEvidenceFile, "--update-record"]);
  assert.match(manualJsonOutput, /Level 2 record updated:/);
  assert.match(manualJsonOutput, /Result card message ID or screenshot/);
  const manualJsonDraft = fs.readFileSync(path.join(missingGenerated, "level2_evidence_draft.md"), "utf8");
  assert.match(manualJsonDraft, /Manual Record Inputs/);
  assert.match(manualJsonDraft, /provided \(redacted in shared draft\)/);
  assert.match(manualJsonDraft, /manual evidence file \(redacted path\)/);
  assert.doesNotMatch(manualJsonDraft, /om_json_result/);
  assert.doesNotMatch(manualJsonDraft, /JSON Test Chat/);
  assert.doesNotMatch(manualJsonDraft, /trace_json_result/);
  assert.doesNotMatch(manualJsonDraft, /result-card\.png/);
  assert.doesNotMatch(manualJsonDraft, /manual evidence file .*level2_manual_evidence\.local\.json/);
  const manualJsonRecord = fs.readFileSync(path.join(missingGenerated, "level2_verification_record.md"), "utf8");
  assert.match(manualJsonRecord, /Date: 2026-07-02/);
  assert.match(manualJsonRecord, /Operator: JSON FDE/);
  assert.match(manualJsonRecord, /Feishu app name: JSON Image Bot/);
  assert.match(manualJsonRecord, /Test chat: JSON Test Chat/);
  assert.match(manualJsonRecord, /Start card message ID: om_json_start/);
  assert.ok(manualJsonRecord.includes(`Result card message ID or screenshot: messageId=om_json_result; screenshot=${path.join(manualEvidenceDir, "result-card.png")}`));
  assert.match(manualJsonRecord, /Generated image URL or image key: imageUrl=https:\/\/example\.com\/json-result\.png; imageKey=img_json_result/);
  assert.match(manualJsonRecord, /Trace ID: trace_json_result/);
  assert.match(manualJsonRecord, /Notes: json manual evidence observed/);
  const manualStatusJson = JSON.parse(run(["status", missingGenerated, "--json"]));
  assert.equal(manualStatusJson.manual_evidence.localPresent, true);
  assert.equal(manualStatusJson.manual_evidence.readyToImport, false);
  assert.ok(manualStatusJson.manual_evidence.filledFields.includes("result_message_id"));
  assert.ok(manualStatusJson.manual_evidence.importedFields.includes("result_message_id"));
  assert.equal(manualStatusJson.manual_evidence.pendingImportFields.length, 0);
  assert.ok(manualStatusJson.manual_evidence.importCommand.includes("--manual-evidence level2_manual_evidence.local.json --update-record"));
  assert.doesNotMatch(JSON.stringify(manualStatusJson.manual_evidence), /om_json_result/);
  run(["readiness", missingGenerated]);
  const manualHandoffStatus = fs.readFileSync(path.join(missingGenerated, "handoff_status.md"), "utf8");
  assert.match(manualHandoffStatus, /Ready to import \| no/);
  assert.match(manualHandoffStatus, /Imported fields \| .*`result_message_id`/);
  assert.match(manualHandoffStatus, /Pending import fields \| none/);
  assert.match(manualHandoffStatus, /`result_message_id`/);
  assert.doesNotMatch(manualHandoffStatus, /om_json_result/);
  context.feishu_app.app_id = "cli_test_app";
  context.feishu_app.app_secret = "test_secret";
  context.feishu_app.verification_token = "test_verification";
  context.feishu_app.test_chat_id = "oc_test_chat";
  context.feishu_app.public_callback_base_url = "https://example.com/lark";
  context.runtime_config.card_action_mode = "async";
  context.runtime_config.upload_image_to_lark = false;
  context.runtime_config.target_timeout_seconds = 240;
  context.runtime_config.host = "127.0.0.1";
  context.runtime_config.port = 4988;
  context.runtime_config.feishu_openapi_base_url = "https://open.feishu.example.com/";
  context.runtime_config.debug_access_token = "cli_debug_token";
  context.runtime_config.allowed_operator_open_ids = ["ou_allowed_one", "ou_allowed_two"];
  context.runtime_config.allow_debug_without_feishu = false;
  fs.writeFileSync(contextFile, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  run(["generate", workspace, "--out", generated]);
  const generatedContext = JSON.parse(fs.readFileSync(path.join(generated, "feishu_context.template.json"), "utf8"));
  assert.equal(generatedContext.handoff_request.generated_package_hint, generated);
  assert.equal(generatedContext.feishu_app.app_id, "cli_test_app");
  assert.equal(generatedContext.feishu_app.public_callback_base_url, "https://example.com/lark");
  assert.equal(generatedContext.feishu_app.app_secret, "");
  assert.equal(generatedContext.feishu_app.verification_token, "");
  assert.equal(generatedContext.runtime_config.card_action_mode, "async");
  assert.equal(generatedContext.runtime_config.upload_image_to_lark, false);
  assert.equal(generatedContext.runtime_config.target_timeout_seconds, 240);
  assert.equal(generatedContext.runtime_config.host, "127.0.0.1");
  assert.equal(generatedContext.runtime_config.port, 4988);
  assert.equal(generatedContext.runtime_config.debug_access_token, "");
  assert.deepEqual(generatedContext.runtime_config.allowed_operator_open_ids, ["ou_allowed_one", "ou_allowed_two"]);
  const generatedLocalContext = JSON.parse(fs.readFileSync(path.join(generated, "feishu_context.local.json"), "utf8"));
  assert.equal(generatedLocalContext.feishu_app.app_secret, "test_secret");
  assert.equal(generatedLocalContext.feishu_app.verification_token, "test_verification");
  assert.equal(generatedLocalContext.runtime_config.debug_access_token, "cli_debug_token");
  assert.deepEqual(generatedLocalContext.runtime_config.allowed_operator_open_ids, ["ou_allowed_one", "ou_allowed_two"]);
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(generated))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes("init-local") && command.includes("--context") && command.includes("--reply"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(generated) && command.includes("--dry-run"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("dist\\index.js status ."))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("dist\\index.js init-local . --context --reply"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("dist\\index.js configure . --strict --dry-run"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("dist\\index.js doctor . --gate"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("dist\\index.js doctor . --probe-target --gate"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("dist\\index.js verify ."))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes("handoff ."))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "moved_package_root" && set.commands.some((command) => command.includes("node $env:LARK_DEPLOYER_CLI status ."))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "moved_package_root" && set.commands.some((command) => command.includes("node $env:LARK_DEPLOYER_CLI init-local . --context --reply"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "moved_package_root" && set.commands.some((command) => command.includes("node $env:LARK_DEPLOYER_CLI configure . --strict --dry-run"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "moved_package_root" && set.commands.some((command) => command.includes("node $env:LARK_DEPLOYER_CLI doctor . --gate"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "moved_package_root" && set.commands.some((command) => command.includes("node $env:LARK_DEPLOYER_CLI doctor . --probe-target --gate"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "moved_package_root" && set.commands.some((command) => command.includes("node $env:LARK_DEPLOYER_CLI verify ."))));
  const generatedGitignore = fs.readFileSync(path.join(generated, ".gitignore"), "utf8");
  assert.match(generatedGitignore, /bot-runtime\/\.env/);
  assert.match(generatedGitignore, /feishu_context\.local\.json/);
  assert.match(generatedGitignore, /level2_manual_evidence\.local\.json/);
  assert.match(generatedGitignore, /verification_report\.json/);
  assert.match(generatedGitignore, /configure_report\.json/);
  const manualEvidenceTemplate = JSON.parse(fs.readFileSync(path.join(generated, "level2_manual_evidence.template.json"), "utf8"));
  assert.equal(manualEvidenceTemplate.schema_version, "0.1");
  assert.equal(manualEvidenceTemplate.values.result_message_id, "");
  assert.equal(manualEvidenceTemplate.values.batch_status_message_id, "");
  assert.equal(manualEvidenceTemplate.values.batch_download_screenshot, "");
  assert.ok(manualEvidenceTemplate.instructions.some((item) => item.includes("node $env:LARK_DEPLOYER_CLI evidence .")));
  const startHere = fs.readFileSync(path.join(generated, "START_HERE.md"), "utf8");
  assert.match(startHere, /# Start Here/);
  assert.match(startHere, /LARK_DEPLOYER_CLI/);
  assert.match(startHere, /doctor_report\.md/);
  assert.match(startHere, /feishu_context\.request\.md/);
  assert.match(startHere, /configure \. --strict --dry-run/);
  assert.match(startHere, /configure \. --strict/);
  assert.match(startHere, /Batch ID/);
  assert.match(startHere, /Batch status card message ID or screenshot/);
  assert.match(startHere, /Batch download URL or screenshot/);
  assert.doesNotMatch(startHere, /test_secret/);
  assert.doesNotMatch(startHere, /cli_debug_token/);
  const runtimeGitignore = fs.readFileSync(path.join(generated, "bot-runtime", ".gitignore"), "utf8");
  assert.match(runtimeGitignore, /^\.env$/m);
  assert.match(runtimeGitignore, /^node_modules\/$/m);
  assert.match(runtimeGitignore, /^audit\.log$/m);
  const generatedContextMarkdown = fs.readFileSync(path.join(generated, "feishu_context.template.md"), "utf8");
  assert.ok(generatedContextMarkdown.includes(`Generated package path hint: \`${generated}\``));
  assert.match(generatedContextMarkdown, /Moved Package Root/);
  assert.match(generatedContextMarkdown, /LARK_DEPLOYER_CLI/);
  assert.match(generatedContextMarkdown, /status \./);
  const generatedContextRequest = fs.readFileSync(path.join(generated, "feishu_context.request.md"), "utf8");
  assert.ok(generatedContextRequest.includes(`Generated package hint: \`${generated}\``));
  assert.match(generatedContextRequest, /can_configure_card_callback: yes\/no/);
  assert.match(generatedContextRequest, /UPLOAD_IMAGE_TO_LARK/);
  assert.match(generatedContextRequest, /placeholder strings/);
  assert.doesNotMatch(generatedContextRequest, /test_secret/);
  assert.doesNotMatch(generatedContextRequest, /cli_debug_token/);
  assert.ok(fs.existsSync(path.join(generated, "feishu_context.reply.template.json")));
  assert.ok(fs.existsSync(path.join(generated, "feishu_context.reply.template.md")));
  const generatedContextReply = JSON.parse(fs.readFileSync(path.join(generated, "feishu_context.reply.template.json"), "utf8"));
  assert.equal(generatedContextReply.generated_package_hint, generated);
  assert.equal(generatedContextReply.public_values.target_base_url, "http://127.0.0.1:1");
  assert.ok(generatedContextReply.next_local_steps.some((item) => item.includes("configure --strict --dry-run")));
  assert.doesNotMatch(JSON.stringify(generatedContextReply), /test_secret/);

  const preserveGenerated = path.join(temp, "generated-preserve");
  run(["generate", workspace, "--out", preserveGenerated]);
  const preserveRecordPath = path.join(preserveGenerated, "level2_verification_record.md");
  const preserveRecordSource = fs.readFileSync(preserveRecordPath, "utf8");
  fs.writeFileSync(
    preserveRecordPath,
    preserveRecordSource
      .replace("- [ ] Level 2 verified.", "- [x] Level 2 verified.")
      .replace("- Start card message ID:", "- Start card message ID: om_preserved_start"),
    "utf8",
  );
  const preserveGenerateOutput = run(["generate", workspace, "--out", preserveGenerated]);
  assert.match(preserveGenerateOutput, /Preserved existing Level 2 evidence record/);
  const preservedRecord = fs.readFileSync(preserveRecordPath, "utf8");
  assert.match(preservedRecord, /- \[x\] Level 2 verified\./);
  assert.match(preservedRecord, /om_preserved_start/);
  const preserveTemplatePath = path.join(preserveGenerated, "level2_verification_record.template.md");
  assert.ok(fs.existsSync(preserveTemplatePath));
  const preserveTemplate = fs.readFileSync(preserveTemplatePath, "utf8");
  assert.match(preserveTemplate, /- \[ \] Level 2 verified\./);
  assert.doesNotMatch(preserveTemplate, /om_preserved_start/);
  run(["handoff", preserveGenerated]);
  const preserveHandoffManifest = JSON.parse(fs.readFileSync(path.join(preserveGenerated, "handoff_manifest.json"), "utf8"));
  assert.ok(preserveHandoffManifest.optional_evidence_files.some((item) => (
    item.path === "level2_verification_record.template.md"
    && item.present === true
  )));

  const artifactPreserveGenerated = path.join(temp, "generated-preserve-artifact");
  run(["generate", workspace, "--out", artifactPreserveGenerated]);
  const artifactRecordPath = path.join(artifactPreserveGenerated, "level2_verification_record.md");
  const artifactRecordSource = fs.readFileSync(artifactRecordPath, "utf8");
  const artifactVerificationReport = path.join(artifactPreserveGenerated, "verification_report.md");
  fs.writeFileSync(
    artifactRecordPath,
    artifactRecordSource
      .replace("- Bot runtime URL:", "- Bot runtime URL: http://127.0.0.1:3978")
      .replace("- `verification_report.md` path:", `- \`verification_report.md\` path: ${artifactVerificationReport}`),
    "utf8",
  );
  const artifactPreserveOutput = run(["generate", workspace, "--out", artifactPreserveGenerated]);
  assert.match(artifactPreserveOutput, /Preserved existing Level 2 evidence record/);
  const artifactPreservedRecord = fs.readFileSync(artifactRecordPath, "utf8");
  assert.match(artifactPreservedRecord, /Bot runtime URL: http:\/\/127\.0\.0\.1:3978/);
  assert.ok(artifactPreservedRecord.includes(`- \`verification_report.md\` path: ${artifactVerificationReport}`));

  const localContextFile = path.join(generated, "feishu_context.local.json");
  const localDefaultEnv = path.join(temp, "local-default.env");
  const localContext = JSON.parse(JSON.stringify(generatedContext));
  localContext.feishu_app.app_id = "local_default_app";
  fs.writeFileSync(localContextFile, `${JSON.stringify(localContext, null, 2)}\n`, "utf8");
  const localConfigureOutput = run(["configure", generated, "--out-env", localDefaultEnv]);
  assert.match(localConfigureOutput, new RegExp(`Context file used: ${escapeRegExp(localContextFile)}`));
  assert.match(localConfigureOutput, /Configure report written to/);
  const localDefaultEnvSource = fs.readFileSync(localDefaultEnv, "utf8");
  assert.match(localDefaultEnvSource, /APP_ID=local_default_app/);
  assert.match(localDefaultEnvSource, /^DEBUG_ACCESS_TOKEN=$/m);
  const autoDebugContextFile = path.join(temp, "auto-debug-context.json");
  const autoDebugEnvFile = path.join(temp, "auto-debug.env");
  const autoDebugContext = JSON.parse(JSON.stringify(generatedContext));
  autoDebugContext.runtime_config.allow_debug_without_feishu = true;
  autoDebugContext.runtime_config.debug_access_token = "";
  fs.writeFileSync(autoDebugContextFile, `${JSON.stringify(autoDebugContext, null, 2)}\n`, "utf8");
  const autoDebugOutput = run(["configure", generated, "--context", autoDebugContextFile, "--out-env", autoDebugEnvFile]);
  const autoDebugEnv = fs.readFileSync(autoDebugEnvFile, "utf8");
  const autoDebugToken = autoDebugEnv.match(/^DEBUG_ACCESS_TOKEN=([a-f0-9]{64})$/m)?.[1] || "";
  assert.ok(autoDebugToken);
  assert.match(autoDebugOutput, /Generated DEBUG_ACCESS_TOKEN/);
  assert.doesNotMatch(autoDebugOutput, new RegExp(autoDebugToken));
  fs.writeFileSync(localContextFile, `${JSON.stringify(generatedLocalContext, null, 2)}\n`, "utf8");
  const dryRunEnvFile = path.join(temp, "dry-run.env");
  const dryRunReportFile = path.join(temp, "dry-run-configure-report.json");
  const dryRunOutput = run([
    "configure",
    generated,
    "--out-env",
    dryRunEnvFile,
    "--report",
    dryRunReportFile,
    "--strict",
    "--dry-run",
  ]);
  assert.match(dryRunOutput, /Dry run: runtime env not written/);
  assert.equal(fs.existsSync(dryRunEnvFile), false);
  const dryRunReport = JSON.parse(fs.readFileSync(dryRunReportFile, "utf8"));
  assert.equal(dryRunReport.dry_run, true);
  assert.equal(dryRunReport.strict, true);
  assert.equal(dryRunReport.env_file, dryRunEnvFile);
  assert.deepEqual(dryRunReport.missing_required_values, []);
  assert.doesNotMatch(JSON.stringify(dryRunReport), /test_secret/);
  assert.doesNotMatch(JSON.stringify(dryRunReport), /cli_debug_token/);
  const dryRunReportMarkdown = fs.readFileSync(dryRunReportFile.replace(/\.json$/i, ".md"), "utf8");
  assert.match(dryRunReportMarkdown, /Dry run: yes/);
  assert.match(dryRunReportMarkdown, /Env file would be written:/);
  const configureReplyGenerated = path.join(temp, "generated-configure-reply");
  fs.cpSync(generated, configureReplyGenerated, { recursive: true });
  const configureReplyLocal = path.join(configureReplyGenerated, "feishu_context.reply.local.json");
  fs.writeFileSync(
    configureReplyLocal,
    JSON.stringify({
      schema_version: "0.1",
      purpose: "local configure owner reply",
      answers: {
        can_provide_existing_app_context: true,
        can_grant_permissions: false,
        can_configure_card_callback: true,
        card_callback_url_configured: true,
        can_add_bot_to_test_chat: true,
        can_keep_target_reachable: true,
      },
      public_values: {
        feishu_app_name: "Internal Configure Bot",
        test_chat_id: "oc_configure_reply_chat",
        public_callback_base_url: "https://configure-reply.example.com",
        target_base_url: "http://127.0.0.1:1",
      },
      secure_secret_channel: "",
      permission_confirmations: [
        { item: "im:message:send_as_bot", status: "confirmed", owner: "Permission Admin", note: "ok" },
        { item: "card.action.trigger", status: "blocked", owner: "App Owner", note: "callback not approved" },
      ],
      blocked_by: ["callback approver unavailable"],
      next_local_steps: [],
      secret_red_lines: [],
    }, null, 2) + "\n",
    "utf8",
  );
  const configureReplyEnvFile = path.join(temp, "configure-reply.env");
  const configureReplyReportFile = path.join(temp, "configure-reply-report.json");
  const configureReplyOutput = runExpectFailure([
    "configure",
    configureReplyGenerated,
    "--out-env",
    configureReplyEnvFile,
    "--report",
    configureReplyReportFile,
    "--strict",
    "--dry-run",
  ]);
  assert.match(configureReplyOutput, /Configure strict mode failed: context reply issues/);
  assert.match(configureReplyOutput, /owner reply reports blockers/);
  assert.match(configureReplyOutput, /secure_secret_channel/);
  assert.equal(fs.existsSync(configureReplyEnvFile), false);
  const configureReplyReport = JSON.parse(fs.readFileSync(configureReplyReportFile, "utf8"));
  assert.deepEqual(configureReplyReport.missing_required_values, []);
  assert.ok(configureReplyReport.strict_context_reply_issues.some((item) => item.includes("owner reply reports blockers")));
  assert.ok(configureReplyReport.strict_context_reply_issues.some((item) => item.includes("secure_secret_channel")));
  assert.equal(configureReplyReport.context_reply.local_json_present, true);
  assert.equal(configureReplyReport.context_reply.permission_status_counts.blocked, 1);
  assert.equal(configureReplyReport.context_reply.blocked_count, 1);
  assert.ok(configureReplyReport.context_reply.negative_answers.includes("can_grant_permissions"));
  assert.ok(configureReplyReport.context_reply.public_value_fields.includes("public_callback_base_url"));
  assert.doesNotMatch(JSON.stringify(configureReplyReport), /Internal Configure Bot/);
  assert.doesNotMatch(JSON.stringify(configureReplyReport), /configure-reply\.example/);
  assert.doesNotMatch(JSON.stringify(configureReplyReport), /callback approver unavailable/);
  const configureReplyReportMarkdown = fs.readFileSync(configureReplyReportFile.replace(/\.json$/i, ".md"), "utf8");
  assert.match(configureReplyReportMarkdown, /## Context Reply Intake/);
  assert.doesNotMatch(configureReplyReportMarkdown, /oc_configure_reply_chat/);
  const configurePermissionUnknownGenerated = path.join(temp, "generated-configure-permission-unknown");
  fs.cpSync(generated, configurePermissionUnknownGenerated, { recursive: true });
  const configurePermissionUnknownTemplate = JSON.parse(fs.readFileSync(path.join(configurePermissionUnknownGenerated, "feishu_context.reply.template.json"), "utf8"));
  fs.writeFileSync(
    path.join(configurePermissionUnknownGenerated, "feishu_context.reply.local.json"),
    JSON.stringify({
      schema_version: "0.1",
      purpose: "local configure owner reply with unconfirmed permissions",
      answers: {
        can_provide_existing_app_context: true,
        can_grant_permissions: true,
        can_configure_card_callback: true,
        card_callback_url_configured: true,
        can_add_bot_to_test_chat: true,
        can_keep_target_reachable: true,
      },
      public_values: {
        test_chat_id: "oc_configure_permission_unknown",
        public_callback_base_url: "https://configure-permission-unknown.example.com",
        target_base_url: "http://127.0.0.1:1",
      },
      secure_secret_channel: "vault",
      permission_confirmations: configurePermissionUnknownTemplate.permission_confirmations.slice(0, 1).map((item) => ({
        ...item,
        status: "unknown",
      })),
      blocked_by: [],
    }, null, 2) + "\n",
    "utf8",
  );
  const configurePermissionUnknownEnvFile = path.join(temp, "configure-permission-unknown.env");
  const configurePermissionUnknownReportFile = path.join(temp, "configure-permission-unknown-report.json");
  const configurePermissionUnknownOutput = runExpectFailure([
    "configure",
    configurePermissionUnknownGenerated,
    "--out-env",
    configurePermissionUnknownEnvFile,
    "--report",
    configurePermissionUnknownReportFile,
    "--strict",
    "--dry-run",
  ]);
  assert.match(configurePermissionUnknownOutput, /Configure strict mode failed: context reply issues/);
  assert.match(configurePermissionUnknownOutput, /unconfirmed permissions/);
  assert.equal(fs.existsSync(configurePermissionUnknownEnvFile), false);
  const configurePermissionUnknownReport = JSON.parse(fs.readFileSync(configurePermissionUnknownReportFile, "utf8"));
  assert.ok(configurePermissionUnknownReport.strict_context_reply_issues.some((item) => item.includes("unconfirmed permissions")));
  assert.equal(configurePermissionUnknownReport.context_reply.permission_status_counts.unknown, 1);
  assert.ok(configurePermissionUnknownReport.context_reply.missing_permission_confirmations.length > 0);
  assert.doesNotMatch(JSON.stringify(configurePermissionUnknownReport), /configure-permission-unknown\.example/);
  const configureReplyFallbackGenerated = path.join(temp, "generated-configure-reply-fallback");
  fs.cpSync(missingGenerated, configureReplyFallbackGenerated, { recursive: true });
  const configureReplyFallbackContextFile = path.join(configureReplyFallbackGenerated, "feishu_context.local.json");
  const configureReplyFallbackContext = JSON.parse(fs.readFileSync(path.join(configureReplyFallbackGenerated, "feishu_context.template.json"), "utf8"));
  const configureReplyFallbackTemplate = JSON.parse(fs.readFileSync(path.join(configureReplyFallbackGenerated, "feishu_context.reply.template.json"), "utf8"));
  configureReplyFallbackContext.feishu_app.app_id = "reply_fallback_app";
  configureReplyFallbackContext.feishu_app.app_secret = "reply_fallback_secret";
  configureReplyFallbackContext.feishu_app.verification_token = "reply_fallback_verification";
  configureReplyFallbackContext.feishu_app.test_chat_id = "";
  configureReplyFallbackContext.feishu_app.public_callback_base_url = "";
  configureReplyFallbackContext.target_service.base_url = "";
  configureReplyFallbackContext.runtime_config.debug_access_token = "";
  fs.writeFileSync(configureReplyFallbackContextFile, `${JSON.stringify(configureReplyFallbackContext, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(configureReplyFallbackGenerated, "feishu_context.reply.local.json"),
    JSON.stringify({
      schema_version: "0.1",
      purpose: "local configure owner reply fallback",
      answers: {
        can_provide_existing_app_context: true,
        can_grant_permissions: true,
        can_configure_card_callback: true,
        card_callback_url_configured: true,
        can_add_bot_to_test_chat: true,
        can_keep_target_reachable: true,
      },
      public_values: {
        test_chat_id: "oc_reply_fallback_chat",
        public_callback_base_url: "https://reply-fallback.example.com",
        target_base_url: "http://127.0.0.1:1",
      },
      secure_secret_channel: "vault item",
      permission_confirmations: configureReplyFallbackTemplate.permission_confirmations.map((item) => ({
        ...item,
        status: "confirmed",
      })),
      blocked_by: [],
    }, null, 2) + "\n",
    "utf8",
  );
  const configureReplyFallbackEnvFile = path.join(temp, "configure-reply-fallback.env");
  const configureReplyFallbackReportFile = path.join(temp, "configure-reply-fallback-report.json");
  const configureReplyFallbackOutput = run([
    "configure",
    configureReplyFallbackGenerated,
    "--out-env",
    configureReplyFallbackEnvFile,
    "--report",
    configureReplyFallbackReportFile,
    "--strict",
    "--dry-run",
  ]);
  assert.match(configureReplyFallbackOutput, /All required MVP context values were written/);
  assert.equal(fs.existsSync(configureReplyFallbackEnvFile), false);
  const configureReplyFallbackReport = JSON.parse(fs.readFileSync(configureReplyFallbackReportFile, "utf8"));
  assert.deepEqual(configureReplyFallbackReport.missing_required_values, []);
  assert.ok(configureReplyFallbackReport.rows.some((item) => item.key === "TEST_CHAT_ID" && item.source === "context_reply"));
  assert.ok(configureReplyFallbackReport.rows.some((item) => item.key === "PUBLIC_CALLBACK_BASE_URL" && item.source === "context_reply"));
  assert.ok(configureReplyFallbackReport.rows.some((item) => item.key === "IMAGE_AGENT_BASE_URL" && item.source === "context_reply"));
  assert.equal(configureReplyFallbackReport.context_reply.missing_permission_confirmations.length, 0);
  assert.equal(configureReplyFallbackReport.context_reply.permission_status_counts.unknown, 0);
  assert.ok(configureReplyFallbackReport.context_reply.used_public_value_fields.includes("test_chat_id"));
  assert.ok(configureReplyFallbackReport.context_reply.used_public_value_fields.includes("public_callback_base_url"));
  assert.ok(configureReplyFallbackReport.context_reply.used_public_value_fields.includes("target_base_url"));
  assert.doesNotMatch(JSON.stringify(configureReplyFallbackReport), /oc_reply_fallback_chat/);
  assert.doesNotMatch(JSON.stringify(configureReplyFallbackReport), /reply-fallback\.example/);
  const configureReplyFallbackMarkdown = fs.readFileSync(configureReplyFallbackReportFile.replace(/\.json$/i, ".md"), "utf8");
  assert.match(configureReplyFallbackMarkdown, /Public value fields used for configure/);
  assert.doesNotMatch(configureReplyFallbackMarkdown, /oc_reply_fallback_chat/);
  assert.doesNotMatch(configureReplyFallbackMarkdown, /reply-fallback\.example/);
  const missingDryRunEnvFile = path.join(temp, "missing-dry-run.env");
  assert.match(
    runExpectFailure(["configure", missingGenerated, "--out-env", missingDryRunEnvFile, "--strict", "--dry-run"]),
    /Configure strict mode failed: missing required values/,
  );
  assert.equal(fs.existsSync(missingDryRunEnvFile), false);
  const placeholderGenerated = path.join(temp, "generated-placeholder-context");
  fs.cpSync(missingGenerated, placeholderGenerated, { recursive: true });
  const placeholderContextFile = path.join(placeholderGenerated, "feishu_context.local.json");
  const placeholderContext = JSON.parse(fs.readFileSync(path.join(placeholderGenerated, "feishu_context.template.json"), "utf8"));
  placeholderContext.feishu_app.app_id = "<APP_ID>";
  placeholderContext.feishu_app.app_secret = "<APP_SECRET>";
  placeholderContext.feishu_app.verification_token = "{{VERIFICATION_TOKEN}}";
  placeholderContext.feishu_app.test_chat_id = "${TEST_CHAT_ID}";
  placeholderContext.feishu_app.public_callback_base_url = "<PUBLIC_CALLBACK_BASE_URL>";
  placeholderContext.target_service.base_url = "<IMAGE_AGENT_BASE_URL>";
  placeholderContext.runtime_config.debug_access_token = "<DEBUG_ACCESS_TOKEN>";
  placeholderContext.runtime_config.allowed_operator_open_ids = ["<OPEN_ID>"];
  fs.writeFileSync(placeholderContextFile, `${JSON.stringify(placeholderContext, null, 2)}\n`, "utf8");
  const placeholderStatus = JSON.parse(run(["status", placeholderGenerated, "--json"]));
  assert.ok(placeholderStatus.missing_required_values.includes("APP_ID"));
  assert.ok(placeholderStatus.missing_required_values.includes("APP_SECRET"));
  assert.ok(placeholderStatus.missing_required_values.includes("VERIFICATION_TOKEN"));
  assert.ok(placeholderStatus.missing_required_values.includes("TEST_CHAT_ID"));
  assert.ok(placeholderStatus.missing_required_values.includes("PUBLIC_CALLBACK_BASE_URL"));
  assert.equal(placeholderStatus.manual_evidence.localPresent, true);
  const placeholderDryRunEnvFile = path.join(temp, "placeholder-dry-run.env");
  const placeholderDryRunReportFile = path.join(temp, "placeholder-configure-report.json");
  const placeholderConfigureOutput = runExpectFailure([
    "configure",
    placeholderGenerated,
    "--out-env",
    placeholderDryRunEnvFile,
    "--report",
    placeholderDryRunReportFile,
    "--strict",
    "--dry-run",
  ]);
  assert.match(placeholderConfigureOutput, /Configure strict mode failed: missing required values/);
  assert.doesNotMatch(placeholderConfigureOutput, /absolute http\(s\) URL/);
  assert.equal(fs.existsSync(placeholderDryRunEnvFile), false);
  const placeholderConfigureReport = JSON.parse(fs.readFileSync(placeholderDryRunReportFile, "utf8"));
  assert.ok(placeholderConfigureReport.missing_required_values.includes("APP_ID"));
  assert.ok(placeholderConfigureReport.missing_required_values.includes("IMAGE_AGENT_BASE_URL"));
  assert.ok(placeholderConfigureReport.rows.some((item) => item.key === "APP_ID" && item.status === "missing"));
  assert.ok(placeholderConfigureReport.rows.some((item) => item.key === "PUBLIC_CALLBACK_BASE_URL" && item.status === "missing"));
  assert.ok(placeholderConfigureReport.rows.some((item) => item.key === "DEBUG_ACCESS_TOKEN" && item.status === "optional"));
  const placeholderEnvFile = path.join(temp, "placeholder.env");
  fs.writeFileSync(
    placeholderEnvFile,
    [
      "APP_ID=<APP_ID>",
      "APP_SECRET={{APP_SECRET}}",
      "VERIFICATION_TOKEN=${VERIFICATION_TOKEN}",
      "TEST_CHAT_ID=replace-me",
      "PUBLIC_CALLBACK_BASE_URL=<PUBLIC_CALLBACK_BASE_URL>",
      "IMAGE_AGENT_BASE_URL=<IMAGE_AGENT_BASE_URL>",
      "DEBUG_ACCESS_TOKEN=<DEBUG_ACCESS_TOKEN>",
      "ALLOWED_OPERATOR_OPEN_IDS=<OPEN_ID>",
    ].join("\n") + "\n",
    "utf8",
  );
  run(["verify", placeholderGenerated, "--env", placeholderEnvFile]);
  const placeholderVerificationReport = JSON.parse(fs.readFileSync(path.join(placeholderGenerated, "verification_report.json"), "utf8"));
  assert.equal(placeholderVerificationReport.checks.find((item) => item.name === "env:APP_ID").status, "warn");
  assert.equal(placeholderVerificationReport.checks.find((item) => item.name === "env:APP_SECRET").status, "warn");
  assert.equal(placeholderVerificationReport.checks.find((item) => item.name === "env:VERIFICATION_TOKEN").status, "warn");
  assert.equal(placeholderVerificationReport.checks.find((item) => item.name === "env:TEST_CHAT_ID").status, "warn");
  assert.equal(placeholderVerificationReport.checks.find((item) => item.name === "env:PUBLIC_CALLBACK_BASE_URL").status, "warn");
  assert.equal(placeholderVerificationReport.checks.some((item) => item.name === "env:PUBLIC_CALLBACK_BASE_URL:public-url"), false);
  assert.equal(placeholderVerificationReport.context.targetBaseUrl, "http://127.0.0.1:1");
  run(["configure", generated]);
  const configureReport = JSON.parse(fs.readFileSync(path.join(generated, "configure_report.json"), "utf8"));
  assert.equal(configureReport.schema_version, "0.1");
  assert.equal(configureReport.package_path, generated);
  assert.equal(configureReport.dry_run, false);
  assert.equal(configureReport.missing_required_values.length, 0);
  assert.ok(configureReport.rows.some((item) => item.key === "APP_SECRET" && item.status === "provided" && item.secret === true));
  assert.ok(configureReport.rows.some((item) => item.key === "CARD_ACTION_MODE" && item.status === "provided"));
  assert.doesNotMatch(JSON.stringify(configureReport), /test_secret/);
  assert.doesNotMatch(JSON.stringify(configureReport), /cli_debug_token/);
  const configureReportMarkdown = fs.readFileSync(path.join(generated, "configure_report.md"), "utf8");
  assert.match(configureReportMarkdown, /Configure Report/);
  assert.match(configureReportMarkdown, /APP_SECRET/);
  assert.doesNotMatch(configureReportMarkdown, /test_secret/);
  const strictMissingOutput = runExpectFailure(["configure", missingGenerated, "--strict"]);
  assert.match(strictMissingOutput, /Configure strict mode failed: missing required values/);
  const invalidContextFile = path.join(temp, "invalid-context.json");
  const invalidEnvFile = path.join(temp, "invalid.env");
  const invalidContext = JSON.parse(JSON.stringify(generatedContext));
  invalidContext.runtime_config.card_action_mode = "asnyc";
  fs.writeFileSync(invalidContextFile, `${JSON.stringify(invalidContext, null, 2)}\n`, "utf8");
  assert.match(
    runExpectFailure(["configure", generated, "--context", invalidContextFile, "--out-env", invalidEnvFile]),
    /runtime_config\.card_action_mode must be "sync" or "async"/,
  );
  invalidContext.runtime_config.card_action_mode = "sync";
  invalidContext.runtime_config.port = 70000;
  fs.writeFileSync(invalidContextFile, `${JSON.stringify(invalidContext, null, 2)}\n`, "utf8");
  assert.match(
    runExpectFailure(["configure", generated, "--context", invalidContextFile, "--out-env", invalidEnvFile]),
    /runtime_config\.port must be an integer between 1 and 65535/,
  );
  invalidContext.runtime_config.port = 3978;
  invalidContext.runtime_config.upload_image_to_lark = "maybe";
  fs.writeFileSync(invalidContextFile, `${JSON.stringify(invalidContext, null, 2)}\n`, "utf8");
  assert.match(
    runExpectFailure(["configure", generated, "--context", invalidContextFile, "--out-env", invalidEnvFile]),
    /runtime_config\.upload_image_to_lark must be a boolean/,
  );
  invalidContext.runtime_config.upload_image_to_lark = true;
  invalidContext.runtime_config.target_timeout_seconds = 0;
  fs.writeFileSync(invalidContextFile, `${JSON.stringify(invalidContext, null, 2)}\n`, "utf8");
  assert.match(
    runExpectFailure(["configure", generated, "--context", invalidContextFile, "--out-env", invalidEnvFile]),
    /runtime_config\.target_timeout_seconds must be an integer between 1 and 3600 seconds/,
  );
  invalidContext.runtime_config.target_timeout_seconds = 240;
  invalidContext.feishu_app.public_callback_base_url = "not-a-url";
  fs.writeFileSync(invalidContextFile, `${JSON.stringify(invalidContext, null, 2)}\n`, "utf8");
  assert.match(
    runExpectFailure(["configure", generated, "--context", invalidContextFile, "--out-env", invalidEnvFile]),
    /feishu_app\.public_callback_base_url must be an absolute http\(s\) URL/,
  );
  run(["verify", generated]);
  const targetPreflightDoctorJson = JSON.parse(run(["doctor", generated, "--json"]));
  assert.equal(targetPreflightDoctorJson.target_preflight.status, "warn");
  assert.equal(targetPreflightDoctorJson.target_preflight.target_base_url, "http://127.0.0.1:1");
  assert.equal(targetPreflightDoctorJson.target_preflight.check_url, "http://127.0.0.1:1/api/meta");
  assert.equal(targetPreflightDoctorJson.target_preflight.evidence_source, "verification_report.json");
  assert.match(targetPreflightDoctorJson.target_preflight.evidence_scope, /doctor does not probe the network/);
  assert.equal(targetPreflightDoctorJson.target_preflight.managed_by_lark_deployer, false);
  assert.equal(targetPreflightDoctorJson.target_preflight.blocking, true);
  assert.ok(targetPreflightDoctorJson.target_preflight.start_hints.some((item) => item.includes("python -m uvicorn main:app")));
  assert.match(targetPreflightDoctorJson.target_preflight.rerun_command, /^node /);
  assert.match(targetPreflightDoctorJson.target_preflight.rerun_command, /verify \./);
  assert.doesNotMatch(targetPreflightDoctorJson.target_preflight.rerun_command, /Start or expose/);
  assert.equal(targetPreflightDoctorJson.target_preflight.live_probe.requested, false);
  assert.ok(targetPreflightDoctorJson.blockers.some((item) => item.includes("Target service preflight is not passing")));
  assert.ok(targetPreflightDoctorJson.next_actions.some((item) => item.includes("Start or expose the externally managed target service")));
  assert.ok(targetPreflightDoctorJson.next_actions.some((item) => item.includes("GET http://127.0.0.1:1/api/meta")));
  assert.ok(targetPreflightDoctorJson.next_actions.some((item) => item.includes("python -m uvicorn main:app")));
  assert.ok(targetPreflightDoctorJson.next_actions.some((item) => item.includes("verify .")));
  const liveTargetProbeDoctorJson = JSON.parse(run(["doctor", generated, "--json", "--probe-target"]));
  assert.equal(liveTargetProbeDoctorJson.target_preflight.live_probe.requested, true);
  assert.equal(liveTargetProbeDoctorJson.target_preflight.live_probe.status, "fail");
  assert.equal(liveTargetProbeDoctorJson.target_preflight.live_probe.check_url, "http://127.0.0.1:1/api/meta");
  assert.equal(liveTargetProbeDoctorJson.target_preflight.live_probe.blocking, true);
  assert.ok(liveTargetProbeDoctorJson.blockers.some((item) => item.includes("Live target probe is not passing")));
  assert.doesNotMatch(JSON.stringify(targetPreflightDoctorJson), /sk-test-secret-should-not-leak/);
  const statusOutput = run(["status", generated]);
  assert.match(statusOutput, /MVP status: runtime_preflight_needed/);
  assert.match(statusOutput, /Handoff ready: no/);
  assert.match(statusOutput, /Missing required values: none/);
  assert.match(statusOutput, /Next action:/);
  assert.doesNotMatch(statusOutput, /test_secret/);
  assert.doesNotMatch(statusOutput, /cli_debug_token/);
  const statusJson = JSON.parse(run(["status", generated, "--json"]));
  assert.equal(statusJson.state, "runtime_preflight_needed");
  assert.equal(statusJson.handoff_ready, false);
  assert.deepEqual(statusJson.missing_required_values, []);
  assert.equal(statusJson.latest_verification.status, "warn");
  assert.ok(statusJson.latest_verification.generated_at);
  assert.match(statusJson.latest_verification.evidence_scope, /status does not probe the network/);
  assert.ok(statusJson.next_actions.some((item) => item.includes("Start or expose the externally managed target service")));
  assert.ok(statusJson.next_actions.some((item) => item.includes("python -m uvicorn main:app")));
  assert.ok(statusJson.next_actions.some((item) => item.includes("verify .")));
  assert.ok(statusJson.security_warnings.some((item) => /agent\.py:2 \(openai_api_key_literal\)/.test(item)));
  assert.doesNotMatch(JSON.stringify(statusJson), /test_secret/);
  assert.doesNotMatch(JSON.stringify(statusJson), /cli_debug_token/);
  assert.doesNotMatch(JSON.stringify(statusJson), /sk-test-secret-should-not-leak/);
  const readinessOutput = run(["readiness", generated]);
  assert.match(readinessOutput, /Readiness status: runtime_preflight_needed/);
  assert.match(readinessOutput, /Missing required values: none/);
  const handoffStatus = fs.readFileSync(path.join(generated, "handoff_status.md"), "utf8");
  assert.match(handoffStatus, /# Handoff Status/);
  assert.match(handoffStatus, /Start or expose the externally managed target service/);
  assert.match(handoffStatus, /python -m uvicorn main:app/);
  assert.match(handoffStatus, /verify \./);
  assert.match(handoffStatus, /APP_SECRET/);
  assert.match(handoffStatus, /runtime_preflight_needed/);
  assert.match(handoffStatus, /DEBUG_ACCESS_TOKEN/);
  assert.match(handoffStatus, /ALLOWED_OPERATOR_OPEN_IDS/);
  assert.match(handoffStatus, /IMAGE_AGENT_TIMEOUT_MS/);
  assert.match(handoffStatus, /agent\.py:2 \(openai_api_key_literal\)/);
  assert.doesNotMatch(handoffStatus, /ou_allowed_one/);
  assert.match(handoffStatus, /verification_report\.json/);
  assert.match(handoffStatus, /node .*verify \. --runtime-url http:\/\/127\.0\.0\.1:3978 --simulate/);
  assert.doesNotMatch(handoffStatus, /test_secret/);
  assert.doesNotMatch(handoffStatus, /cli_debug_token/);
  assert.doesNotMatch(handoffStatus, /sk-test-secret-should-not-leak/);
  const evidenceOutput = run(["evidence", generated]);
  assert.match(evidenceOutput, /Evidence draft written/);
  const evidenceDraft = fs.readFileSync(path.join(generated, "level2_evidence_draft.md"), "utf8");
  assert.match(evidenceDraft, /# Level 2 Evidence Draft/);
  assert.match(evidenceDraft, /Secret Presence/);
  assert.match(evidenceDraft, /Suggested Record Updates/);
  assert.match(evidenceDraft, /Manual Completion Still Required/);
  assert.match(evidenceDraft, /verification_report\.json/);
  assert.doesNotMatch(evidenceDraft, /test_secret/);
  assert.doesNotMatch(evidenceDraft, /cli_debug_token/);
  const auditPath = path.join(generated, "bot-runtime", "audit.log");
  fs.writeFileSync(
    auditPath,
    [
      JSON.stringify({
        ts: "2026-07-01T00:00:00.000Z",
        trace_id: "trace-start-123",
        event: "start_card_sent",
        detail: { messageId: "om_start_123", responseCode: 0 },
      }),
      JSON.stringify({
        ts: "2026-07-01T00:00:01.000Z",
        trace_id: "trace-generation-started-456",
        event: "generation_started",
        detail: {
          preset: {
            template_id: "launch-banner",
            size: "1200x628",
            message: "Do not leak this launch secret message",
            fields: {
              headline: "Do not leak this launch headline",
              body_copy: "Do not leak this launch body copy",
            },
          },
          uploadToLark: true,
          operator_open_id: "ou_should_not_be_in_evidence_draft",
          open_chat_id: "oc_should_not_be_in_evidence_draft",
        },
      }),
      JSON.stringify({
        ts: "2026-07-01T00:00:02.000Z",
        trace_id: "trace-result-456",
        event: "generation_succeeded",
        detail: { imageUrl: "https://example.com/result.png", imageKey: "img_v2_123" },
      }),
    ].join("\n") + "\n",
    "utf8",
  );
  const evidenceUpdateOutput = run(["evidence", generated, "--update-record"]);
  assert.match(evidenceUpdateOutput, /Level 2 record updated:/);
  assert.match(evidenceUpdateOutput, /Start card message ID/);
  const updatedEvidenceDraft = fs.readFileSync(path.join(generated, "level2_evidence_draft.md"), "utf8");
  assert.match(updatedEvidenceDraft, /field_keys/);
  assert.match(updatedEvidenceDraft, /message_length/);
  assert.doesNotMatch(updatedEvidenceDraft, /Do not leak this launch/);
  assert.doesNotMatch(updatedEvidenceDraft, /ou_should_not_be_in_evidence_draft/);
  assert.doesNotMatch(updatedEvidenceDraft, /oc_should_not_be_in_evidence_draft/);
  const updatedLevel2Record = fs.readFileSync(path.join(generated, "level2_verification_record.md"), "utf8");
  assert.match(updatedLevel2Record, new RegExp(`Generated package path: ${escapeRegExp(generated)}`));
  assert.match(updatedLevel2Record, /Start card message ID: om_start_123/);
  assert.match(updatedLevel2Record, /Generated image URL or image key: imageUrl=https:\/\/example\.com\/result\.png; imageKey=img_v2_123/);
  assert.match(updatedLevel2Record, /Trace ID: trace-result-456/);
  assert.ok(updatedLevel2Record.includes(`bot-runtime/audit.log\` path: ${auditPath}`));
  assert.doesNotMatch(updatedLevel2Record, /test_secret/);
  assert.doesNotMatch(updatedLevel2Record, /cli_debug_token/);
  const resultScreenshotPath = path.join(temp, "result-card-screenshot.png");
  fs.writeFileSync(resultScreenshotPath, "fake screenshot placeholder", "utf8");
  const manualEvidenceOutput = run([
    "evidence",
    generated,
    "--update-record",
    "--level2-date",
    "2026-07-01",
    "--operator",
    "FDE Tester",
    "--feishu-app-name",
    "Image Agent Test Bot",
    "--test-chat",
    "Image Agent Test Chat",
    "--result-message-id",
    "om_result_456",
    "--result-screenshot",
    resultScreenshotPath,
    "--generated-image-key",
    "img_manual_should_not_replace_existing",
    "--trace-id",
    "trace_manual_should_not_replace_existing",
    "--notes",
    "manual result card observed",
  ]);
  assert.match(manualEvidenceOutput, /Level 2 record updated:/);
  assert.match(manualEvidenceOutput, /Operator/);
  assert.match(manualEvidenceOutput, /Result card message ID or screenshot/);
  assert.match(manualEvidenceOutput, /Level 2 record preserved existing fields: .*Generated image URL or image key/);
  assert.match(manualEvidenceOutput, /Level 2 record preserved existing fields: .*Trace ID/);
  const manualEvidenceDraft = fs.readFileSync(path.join(generated, "level2_evidence_draft.md"), "utf8");
  assert.match(manualEvidenceDraft, /Manual Record Inputs/);
  assert.match(manualEvidenceDraft, /provided \(redacted in shared draft\)/);
  assert.doesNotMatch(manualEvidenceDraft, /om_result_456/);
  assert.ok(!manualEvidenceDraft.includes(resultScreenshotPath));
  assert.doesNotMatch(manualEvidenceDraft, /FDE Tester/);
  const manualLevel2Record = fs.readFileSync(path.join(generated, "level2_verification_record.md"), "utf8");
  assert.match(manualLevel2Record, /Date: 2026-07-01/);
  assert.match(manualLevel2Record, /Operator: FDE Tester/);
  assert.match(manualLevel2Record, /Feishu app name: Image Agent Test Bot/);
  assert.match(manualLevel2Record, /Test chat: Image Agent Test Chat/);
  assert.ok(manualLevel2Record.includes(`Result card message ID or screenshot: messageId=om_result_456; screenshot=${resultScreenshotPath}`));
  assert.match(manualLevel2Record, /Notes: manual result card observed/);
  assert.match(manualLevel2Record, /Generated image URL or image key: imageUrl=https:\/\/example\.com\/result\.png; imageKey=img_v2_123/);
  assert.match(manualLevel2Record, /Trace ID: trace-result-456/);
  const doctorReportPath = path.join(generated, "doctor_report.json");
  const doctorReportOutput = run(["doctor", generated, "--out", doctorReportPath]);
  assert.match(doctorReportOutput, /Doctor report written/);
  const doctorReport = fs.readFileSync(path.join(generated, "doctor_report.md"), "utf8");
  assert.match(doctorReport, /MVP Doctor Report/);
  assert.match(doctorReport, /## Target Preflight/);
  assert.match(doctorReport, /http:\/\/127\.0\.0\.1:1\/api\/meta/);
  assert.match(doctorReport, /Managed by Lark-deployer \| no/);
  assert.match(doctorReport, /runtime_preflight_needed|level2_preflight_needed|manual_click_evidence_needed/);
  assert.doesNotMatch(doctorReport, /test_secret/);
  assert.doesNotMatch(doctorReport, /cli_debug_token/);
  const oldStyleLevel2Record = fs.readFileSync(path.join(generated, "level2_verification_record.md"), "utf8")
    .replace(/## CLI Command Style[\s\S]*?\n(?=## Preflight Evidence)/, "")
    .replace(
      /- \[ \] `verify \. --runtime-url <bot_runtime_url> --simulate` records card-action, v2 card-action, iterate, batch, batch-refresh, and invalid-input failure-card PASS checks using the command style above\./g,
      "- [ ] `verify . --runtime-url <bot_runtime_url> --simulate` records card-action, v2 card-action, iterate, and invalid-input failure-card PASS checks using the command style above.",
    )
    .replace(
      /- \[ \] `verify \. --runtime-url <bot_runtime_url> --level2` succeeds using the command style above\./g,
      "- [ ] `node ..\\..\\dist\\index.js verify . --runtime-url <bot_runtime_url> --level2` succeeds.",
    );
  fs.writeFileSync(path.join(generated, "level2_verification_record.md"), oldStyleLevel2Record, "utf8");
  fs.writeFileSync(
    path.join(generated, "level2_evidence_draft.md"),
    [
      "# Level 2 Evidence Draft",
      "",
      `- Package: ${generated}`,
      "",
      "## Suggested Record Updates",
      "",
      "| Field | Suggested value | Source |",
      "| --- | --- | --- |",
      "| Result card message ID or screenshot | messageId=om_legacy_result; screenshot=C:\\secret\\legacy-result.png | manual evidence file C:\\secret\\level2_manual_evidence.local.json |",
      "| Operator | Legacy Operator | manual CLI options |",
      "",
      "## Manual Record Inputs",
      "",
      "| Field | Supplied value | Source |",
      "| --- | --- | --- |",
      "| Batch ID | batch_legacy_123 | manual evidence file C:\\secret\\level2_manual_evidence.local.json + manual CLI options |",
      "",
    ].join("\n"),
    "utf8",
  );
  const handoffOutput = run(["handoff", generated]);
  assert.match(handoffOutput, /Handoff manifest written/);
  assert.match(
    runExpectFailure(["handoff", generated, "--check"]),
    /excluded paths are present/,
  );
  const handoffManifest = JSON.parse(fs.readFileSync(path.join(generated, "handoff_manifest.json"), "utf8"));
  assert.ok(handoffManifest.recommended_files.some((item) => item.path === "README.md" && item.present === true));
  assert.ok(handoffManifest.recommended_files.some((item) => item.path === "START_HERE.md" && item.present === true));
  assert.ok(handoffManifest.recommended_files.some((item) => item.path === "bot-runtime/src/index.ts" && item.present === true));
  assert.ok(handoffManifest.recommended_files.some((item) => item.path === "level2_manual_evidence.template.json" && item.present === true));
  assert.ok(handoffManifest.recommended_files.some((item) => item.path === "feishu_context.reply.template.json" && item.present === true));
  assert.ok(handoffManifest.optional_evidence_files.some((item) => item.path === "doctor_report.md" && item.present === true));
  assert.ok(handoffManifest.excluded_paths.some((item) => item.path === "bot-runtime/.env" && item.present === true));
  const handoffMarkdown = fs.readFileSync(path.join(generated, "handoff_manifest.md"), "utf8");
  assert.match(handoffMarkdown, /Excluded Paths/);
  assert.match(handoffMarkdown, /bot-runtime\/\.env/);
  assert.match(handoffMarkdown, /node_modules/);
  assert.doesNotMatch(handoffMarkdown, /test_secret/);
  assert.doesNotMatch(handoffMarkdown, /cli_debug_token/);
  const handoffCopy = path.join(temp, "handoff", "nested", "handoff-copy");
  const handoffCopyOutput = run(["handoff", generated, "--copy-to", handoffCopy]);
  assert.match(handoffCopyOutput, /Sanitized handoff copy written/);
  assert.match(handoffCopyOutput, /Refreshed context, verification, evidence, handoff, doctor, and Level 2 path references/);
  assert.ok(fs.existsSync(path.join(handoffCopy, "README.md")));
  assert.ok(fs.existsSync(path.join(handoffCopy, "START_HERE.md")));
  assert.ok(fs.existsSync(path.join(handoffCopy, "handoff_manifest.md")));
  assert.ok(fs.existsSync(path.join(handoffCopy, "handoff_status.md")));
  assert.ok(fs.existsSync(path.join(handoffCopy, "doctor_report.md")));
  assert.ok(fs.existsSync(path.join(handoffCopy, "doctor_report.json")));
  assert.ok(fs.existsSync(path.join(handoffCopy, "feishu_context.request.md")));
  assert.ok(fs.existsSync(path.join(handoffCopy, "feishu_context.reply.template.json")));
  assert.ok(fs.existsSync(path.join(handoffCopy, "feishu_context.reply.template.md")));
  assert.ok(fs.existsSync(path.join(handoffCopy, "level2_manual_evidence.template.json")));
  assert.ok(fs.existsSync(path.join(handoffCopy, "bot-runtime", "src", "index.ts")));
  assert.ok(fs.existsSync(path.join(handoffCopy, "manifest", "service_manifest.json")));
  assert.equal(fs.existsSync(path.join(handoffCopy, "bot-runtime", ".env")), false);
  assert.equal(fs.existsSync(path.join(handoffCopy, "bot-runtime", "audit.log")), false);
  assert.equal(fs.existsSync(path.join(handoffCopy, "feishu_context.local.json")), false);
  assert.equal(fs.existsSync(path.join(handoffCopy, "feishu_context.reply.local.json")), false);
  assert.equal(fs.existsSync(path.join(handoffCopy, "feishu_context.reply.local.md")), false);
  assert.equal(fs.existsSync(path.join(handoffCopy, "bot-runtime", "node_modules")), false);
  assert.equal(fs.existsSync(path.join(handoffCopy, "bot-runtime", "dist")), false);
  const copiedDoctorJson = JSON.parse(fs.readFileSync(path.join(handoffCopy, "doctor_report.json"), "utf8"));
  assert.equal(copiedDoctorJson.package_path, handoffCopy);
  assert.equal(copiedDoctorJson.target_preflight.check_url, "http://127.0.0.1:1/api/meta");
  assert.match(copiedDoctorJson.target_preflight.evidence_scope, /last verify snapshot/);
  assert.match(copiedDoctorJson.target_preflight.rerun_command, /^node \$env:LARK_DEPLOYER_CLI verify \./);
  assert.doesNotMatch(copiedDoctorJson.target_preflight.rerun_command, /Latest target preflight pass|rerun verify/);
  assert.equal(copiedDoctorJson.target_preflight.live_probe.requested, false);
  const copiedDoctorMarkdown = fs.readFileSync(path.join(handoffCopy, "doctor_report.md"), "utf8");
  assert.ok(copiedDoctorMarkdown.includes(`Package: ${handoffCopy}`));
  assert.match(copiedDoctorMarkdown, /## Target Preflight/);
  assert.match(copiedDoctorMarkdown, /Live probe requested/);
  assert.match(copiedDoctorMarkdown, /Evidence scope/);
  assert.doesNotMatch(copiedDoctorMarkdown, new RegExp(escapeRegExp(generated)));
  assert.match(copiedDoctorMarkdown, /LARK_DEPLOYER_CLI/);
  const copiedHandoffStatus = fs.readFileSync(path.join(handoffCopy, "handoff_status.md"), "utf8");
  assert.ok(copiedHandoffStatus.includes(`Package: ${handoffCopy}`));
  assert.doesNotMatch(copiedHandoffStatus, new RegExp(escapeRegExp(generated)));
  assert.match(copiedHandoffStatus, /node \$env:LARK_DEPLOYER_CLI configure \./);
  assert.match(copiedHandoffStatus, /node \$env:LARK_DEPLOYER_CLI evidence \. --runtime-url http:\/\/127\.0\.0\.1:3978 --manual-evidence level2_manual_evidence\.local\.json --update-record/);
  const copiedLevel2Record = fs.readFileSync(path.join(handoffCopy, "level2_verification_record.md"), "utf8");
  assert.ok(copiedLevel2Record.includes(`Generated package path: ${handoffCopy}`));
  assert.ok(copiedLevel2Record.includes(`- \`verification_report.md\` path: ${path.join(handoffCopy, "verification_report.md")}`));
  assert.match(copiedLevel2Record, /batch, batch-refresh/);
  assert.match(copiedLevel2Record, /om_start_123/);
  assert.match(copiedLevel2Record, /manual result card observed/);
  assert.doesNotMatch(copiedLevel2Record, new RegExp(`Generated package path: ${escapeRegExp(generated)}`));
  assert.match(copiedLevel2Record, /LARK_DEPLOYER_CLI/);
  const copiedReadme = fs.readFileSync(path.join(handoffCopy, "README.md"), "utf8");
  assert.match(copiedReadme, /For the rest of this README, use the portable `LARK_DEPLOYER_CLI` command style/);
  assert.match(copiedReadme, /node \$env:LARK_DEPLOYER_CLI verify \. --runtime-url http:\/\/127\.0\.0\.1:3978 --level2/);
  assert.match(copiedReadme, /node \$env:LARK_DEPLOYER_CLI evidence \. --runtime-url http:\/\/127\.0\.0\.1:3978 --manual-evidence level2_manual_evidence\.local\.json --update-record/);
  assert.doesNotMatch(copiedReadme, /node \.\.\\\.\.\\dist\\index\.js verify \. --runtime-url http:\/\/127\.0\.0\.1:3978 --level2/);
  assert.doesNotMatch(copiedReadme, /node \.\.\\\.\.\\dist\\index\.js evidence \. --runtime-url http:\/\/127\.0\.0\.1:3978 --update-record/);
  const copiedContextJson = JSON.parse(fs.readFileSync(path.join(handoffCopy, "feishu_context.template.json"), "utf8"));
  assert.equal(copiedContextJson.handoff_request.generated_package_hint, handoffCopy);
  assert.ok(copiedContextJson.handoff_request.command_sets.some((set) => (
    set.name === "project_root"
    && set.commands.some((command) => command.includes("init-local") && command.includes("--context") && command.includes("--reply"))
  )));
  assert.ok(copiedContextJson.handoff_request.command_sets.some((set) => (
    set.name === "generated_package_root"
    && set.commands.some((command) => command.includes("node $env:LARK_DEPLOYER_CLI init-local . --context --reply"))
  )));
  assert.ok(copiedContextJson.handoff_request.command_sets.some((set) => (
    set.name === "generated_package_root"
    && set.commands.some((command) => command.includes("node $env:LARK_DEPLOYER_CLI configure . --strict"))
  )));
  assert.ok(copiedContextJson.handoff_request.command_sets.some((set) => (
    set.name === "generated_package_root"
    && set.commands.some((command) => command.includes("node $env:LARK_DEPLOYER_CLI configure . --strict --dry-run"))
  )));
  assert.ok(copiedContextJson.handoff_request.command_sets.some((set) => (
    set.name === "generated_package_root"
    && set.commands.some((command) => command.includes("node $env:LARK_DEPLOYER_CLI verify . --runtime-url http://127.0.0.1:3978 --level2"))
  )));
  const copiedContextRequest = fs.readFileSync(path.join(handoffCopy, "feishu_context.request.md"), "utf8");
  assert.ok(copiedContextRequest.includes(`Generated package hint: \`${handoffCopy}\``));
  assert.doesNotMatch(copiedContextRequest, new RegExp(escapeRegExp(generated)));
  const copiedContextReplyJson = JSON.parse(fs.readFileSync(path.join(handoffCopy, "feishu_context.reply.template.json"), "utf8"));
  assert.equal(copiedContextReplyJson.generated_package_hint, handoffCopy);
  assert.doesNotMatch(JSON.stringify(copiedContextReplyJson), new RegExp(escapeRegExp(generated)));
  const copiedContextMarkdown = fs.readFileSync(path.join(handoffCopy, "feishu_context.template.md"), "utf8");
  assert.ok(copiedContextMarkdown.includes(`Generated package path hint: \`${handoffCopy}\``));
  assert.doesNotMatch(copiedContextMarkdown, new RegExp(escapeRegExp(generated)));
  assert.match(copiedContextMarkdown, /node \$env:LARK_DEPLOYER_CLI verify \. --runtime-url http:\/\/127\.0\.0\.1:3978 --level2/);
  const copiedVerificationJson = JSON.parse(fs.readFileSync(path.join(handoffCopy, "verification_report.json"), "utf8"));
  assert.equal(copiedVerificationJson.context.packagePath, handoffCopy);
  assert.equal(copiedVerificationJson.level2_evidence_record_path, path.join(handoffCopy, "level2_verification_record.md"));
  assert.doesNotMatch(JSON.stringify(copiedVerificationJson), new RegExp(escapeRegExp(generated)));
  const copiedVerificationMarkdown = fs.readFileSync(path.join(handoffCopy, "verification_report.md"), "utf8");
  assert.ok(copiedVerificationMarkdown.includes(`Package: ${handoffCopy}`));
  assert.doesNotMatch(copiedVerificationMarkdown, new RegExp(escapeRegExp(generated)));
  const copiedEvidenceDraft = fs.readFileSync(path.join(handoffCopy, "level2_evidence_draft.md"), "utf8");
  assert.ok(copiedEvidenceDraft.includes(`Package: ${handoffCopy}`));
  assert.doesNotMatch(copiedEvidenceDraft, new RegExp(escapeRegExp(generated)));
  assert.match(copiedEvidenceDraft, /provided \(redacted in shared draft\)/);
  assert.match(copiedEvidenceDraft, /manual evidence file \(redacted path\)/);
  assert.doesNotMatch(copiedEvidenceDraft, /om_legacy_result/);
  assert.doesNotMatch(copiedEvidenceDraft, /legacy-result\.png/);
  assert.doesNotMatch(copiedEvidenceDraft, /Legacy Operator/);
  assert.doesNotMatch(copiedEvidenceDraft, /batch_legacy_123/);
  assert.doesNotMatch(copiedEvidenceDraft, /level2_manual_evidence\.local\.json/);
  const copiedHandoffManifest = JSON.parse(fs.readFileSync(path.join(handoffCopy, "handoff_manifest.json"), "utf8"));
  assert.equal(copiedHandoffManifest.package_path, handoffCopy);
  assert.ok(copiedHandoffManifest.next_steps.some((item) => item.includes("stale package path references")));
  assert.ok(copiedHandoffManifest.next_steps.some((item) => item.includes("unredacted manual evidence rows")));
  assert.doesNotMatch(fs.readFileSync(path.join(handoffCopy, "feishu_context.template.json"), "utf8"), /test_secret/);
  assert.doesNotMatch(fs.readFileSync(path.join(handoffCopy, "feishu_context.template.json"), "utf8"), /cli_debug_token/);
  assert.doesNotMatch(fs.readFileSync(path.join(handoffCopy, "feishu_context.request.md"), "utf8"), /test_secret/);
  assert.doesNotMatch(fs.readFileSync(path.join(handoffCopy, "feishu_context.request.md"), "utf8"), /cli_debug_token/);
  const copiedStartHere = fs.readFileSync(path.join(handoffCopy, "START_HERE.md"), "utf8");
  assert.match(copiedStartHere, /LARK_DEPLOYER_CLI/);
  assert.match(copiedStartHere, /Batch status card message ID or screenshot/);
  const copiedDeploymentChecklist = fs.readFileSync(path.join(handoffCopy, "deployment_checklist.md"), "utf8");
  assert.match(copiedDeploymentChecklist, /LARK_DEPLOYER_CLI/);
  assert.match(copiedDeploymentChecklist, /configure --strict --dry-run/);
  assert.match(copiedDeploymentChecklist, /configure --strict/);
  assert.match(copiedDeploymentChecklist, /node \$env:LARK_DEPLOYER_CLI doctor \. --out doctor_report\.json --probe-target --gate/);
  assert.match(copiedDeploymentChecklist, /<PUBLIC_CALLBACK_BASE_URL>\/webhook\/card/);
  assert.doesNotMatch(copiedDeploymentChecklist, /Configure card action callback URL to the generated bot runtime/);
  assert.doesNotMatch(copiedDeploymentChecklist, /test_secret/);
  assert.doesNotMatch(copiedDeploymentChecklist, /cli_debug_token/);
  const handoffCheckOutput = run(["handoff", handoffCopy, "--check"]);
  assert.match(handoffCheckOutput, /Handoff check passed/);
  const handoffCopyWithoutInitLocal = path.join(temp, "handoff-copy-without-init-local");
  fs.cpSync(handoffCopy, handoffCopyWithoutInitLocal, { recursive: true });
  removeTextPattern(handoffCopyWithoutInitLocal, /^.*\binit-local\b.*$\r?\n?/gim);
  assert.match(
    runExpectFailure(["handoff", handoffCopyWithoutInitLocal, "--check"]),
    /missing init-local guidance: package \(init_local_context_reply_missing\)/,
  );
  const handoffCopyWithoutPermissionSummary = path.join(temp, "handoff-copy-without-permission-summary");
  fs.cpSync(handoffCopy, handoffCopyWithoutPermissionSummary, { recursive: true });
  removeTextPattern(handoffCopyWithoutPermissionSummary, /Permission confirmations/gi);
  assert.match(
    runExpectFailure(["handoff", handoffCopyWithoutPermissionSummary, "--check"]),
    /missing permission confirmation guidance: package \(permission_confirmation_summary_missing\)/,
  );
  const handoffCopyWithoutDryRun = path.join(temp, "handoff-copy-without-dry-run");
  fs.cpSync(handoffCopy, handoffCopyWithoutDryRun, { recursive: true });
  removeDryRunGuidance(handoffCopyWithoutDryRun);
  assert.match(
    runExpectFailure(["handoff", handoffCopyWithoutDryRun, "--check"]),
    /missing configure dry-run guidance: package \(configure_dry_run_missing\)/,
  );
  const handoffCopyWithoutProbeTargetGate = path.join(temp, "handoff-copy-without-probe-target-gate");
  fs.cpSync(handoffCopy, handoffCopyWithoutProbeTargetGate, { recursive: true });
  removeTextPattern(handoffCopyWithoutProbeTargetGate, /\s+--probe-target/g);
  assert.match(
    runExpectFailure(["handoff", handoffCopyWithoutProbeTargetGate, "--check"]),
    /missing doctor live target gate guidance: package \(doctor_probe_target_gate_missing\)/,
  );
  const handoffCopyWithStalePath = path.join(temp, "handoff-copy-stale-path");
  fs.cpSync(handoffCopy, handoffCopyWithStalePath, { recursive: true });
  const staleContextPath = path.join(handoffCopyWithStalePath, "feishu_context.template.json");
  const staleContext = JSON.parse(fs.readFileSync(staleContextPath, "utf8"));
  staleContext.handoff_request.generated_package_hint = generated;
  fs.writeFileSync(staleContextPath, `${JSON.stringify(staleContext, null, 2)}\n`, "utf8");
  assert.match(
    runExpectFailure(["handoff", handoffCopyWithStalePath, "--check"]),
    /stale package path references found: .*feishu_context\.template\.json \(generated_package_hint_stale:/,
  );
  const handoffCopyWithNonStrictConfigure = path.join(temp, "handoff-copy-non-strict-configure");
  fs.cpSync(handoffCopy, handoffCopyWithNonStrictConfigure, { recursive: true });
  fs.writeFileSync(
    path.join(handoffCopyWithNonStrictConfigure, "START_HERE.md"),
    [
      "# Start Here",
      "",
      "```powershell",
      "node $env:LARK_DEPLOYER_CLI configure .",
      "```",
      "",
    ].join("\n"),
    "utf8",
  );
  assert.match(
    runExpectFailure(["handoff", handoffCopyWithNonStrictConfigure, "--check"]),
    /non-strict configure commands found: START_HERE\.md \(configure_without_strict\)/,
  );
  const handoffCopyWithLegacyDraft = path.join(temp, "handoff-copy-legacy-draft");
  fs.cpSync(handoffCopy, handoffCopyWithLegacyDraft, { recursive: true });
  fs.writeFileSync(
    path.join(handoffCopyWithLegacyDraft, "level2_evidence_draft.md"),
    [
      "# Level 2 Evidence Draft",
      "",
      "## Manual Record Inputs",
      "",
      "| Field | Supplied value | Source |",
      "| --- | --- | --- |",
      "| Result card message ID or screenshot | messageId=om_should_not_ship; screenshot=C:\\secret\\result-card.png | manual evidence file C:\\secret\\level2_manual_evidence.local.json |",
      "",
    ].join("\n"),
    "utf8",
  );
  assert.match(
    runExpectFailure(["handoff", handoffCopyWithLegacyDraft, "--check"]),
    /unredacted shared evidence rows found: level2_evidence_draft\.md \(manual_evidence_value_not_redacted\)/,
  );
  const handoffCopyWithLocalEvidence = path.join(temp, "handoff-copy-local-evidence");
  fs.cpSync(handoffCopy, handoffCopyWithLocalEvidence, { recursive: true });
  fs.writeFileSync(path.join(handoffCopyWithLocalEvidence, "level2_manual_evidence.local.json"), "{\"values\":{\"result_message_id\":\"om_should_not_ship\"}}\n", "utf8");
  assert.match(
    runExpectFailure(["handoff", handoffCopyWithLocalEvidence, "--check"]),
    /excluded paths are present: level2_manual_evidence\.local\.json/,
  );
  const handoffCopyWithLocalReply = path.join(temp, "handoff-copy-local-reply");
  fs.cpSync(handoffCopy, handoffCopyWithLocalReply, { recursive: true });
  fs.writeFileSync(path.join(handoffCopyWithLocalReply, "feishu_context.reply.local.json"), "{\"blocked_by\":[\"internal owner unavailable\"]}\n", "utf8");
  assert.match(
    runExpectFailure(["handoff", handoffCopyWithLocalReply, "--check"]),
    /excluded paths are present: feishu_context\.reply\.local\.json/,
  );
  const handoffCopyWithConfigureReport = path.join(temp, "handoff-copy-configure-report");
  fs.cpSync(handoffCopy, handoffCopyWithConfigureReport, { recursive: true });
  fs.writeFileSync(path.join(handoffCopyWithConfigureReport, "configure_report.json"), "{\"env_file\":\"C:\\\\secret\\\\bot-runtime\\\\.env\"}\n", "utf8");
  assert.match(
    runExpectFailure(["handoff", handoffCopyWithConfigureReport, "--check"]),
    /excluded paths are present: configure_report\.json/,
  );
  const handoffCopyWithGenericSecret = path.join(temp, "handoff-copy-generic-secret");
  fs.cpSync(handoffCopy, handoffCopyWithGenericSecret, { recursive: true });
  fs.writeFileSync(path.join(handoffCopyWithGenericSecret, "operator-note.md"), "Temporary key: sk-generic-secret-should-fail-123456\n", "utf8");
  assert.match(
    runExpectFailure(["handoff", handoffCopyWithGenericSecret, "--check"]),
    /potential secret literals found: operator-note\.md \(openai_api_key_literal\)/,
  );
  fs.writeFileSync(path.join(generated, "level2_evidence_draft.md"), `Leaked value: test_secret\n`, "utf8");
  assert.match(
    runExpectFailure(["handoff", generated, "--copy-to", path.join(temp, "handoff-copy-leak")]),
    /Refusing sanitized handoff copy because copied files contain local secret values/,
  );
  assert.match(
    runExpectFailure(["handoff", generated, "--copy-to", handoffCopy]),
    /target already exists and is not empty/,
  );
  assert.match(
    runExpectFailure(["verify", generated, "--strict"]),
    /target:\/api\/meta/,
  );

  assert.ok(fs.existsSync(path.join(workspace, "manifest", "service_manifest.json")));
  assert.ok(fs.existsSync(path.join(workspace, "permission_review.md")));
  assert.ok(fs.existsSync(path.join(workspace, "feishu_context.template.json")));
  assert.ok(fs.existsSync(path.join(workspace, "feishu_context.template.md")));
  assert.ok(fs.existsSync(path.join(workspace, "feishu_context.request.md")));
  assert.ok(fs.existsSync(path.join(workspace, "feishu_context.reply.template.json")));
  assert.ok(fs.existsSync(path.join(workspace, "feishu_context.reply.template.md")));
  const contextMarkdown = fs.readFileSync(path.join(workspace, "feishu_context.template.md"), "utf8");
  assert.match(contextMarkdown, /Copy\/Paste Request/);
  assert.match(contextMarkdown, /APP_ID/);
  assert.match(contextMarkdown, /CARD_ACTION_MODE/);
  assert.match(contextMarkdown, /Project Root/);
  assert.match(contextMarkdown, /Generated Package Root/);
  assert.match(contextMarkdown, /Moved Package Root/);
  assert.match(contextMarkdown, /node \.\.\\\.\.\\dist\\index\.js verify \./);
  assert.match(contextMarkdown, /LARK_DEPLOYER_CLI/);
  assert.match(contextMarkdown, /status \./);
  assert.match(contextMarkdown, /--level2/);
  assert.ok(fs.existsSync(path.join(generated, "bot-runtime", "src", "index.ts")));
  assert.ok(fs.existsSync(path.join(generated, "bot-runtime", ".env")));
  assert.ok(fs.existsSync(path.join(generated, "manifest", "required_permissions.json")));
  assert.ok(fs.existsSync(path.join(generated, "level2_verification_record.md")));
  assert.ok(fs.existsSync(path.join(generated, "handoff_status.md")));
  assert.ok(fs.existsSync(path.join(generated, "handoff_manifest.md")));
  assert.ok(fs.existsSync(path.join(generated, "level2_evidence_draft.md")));
  assert.ok(fs.existsSync(path.join(generated, "verification_report.json")));
  assert.ok(fs.existsSync(path.join(generated, "verification_report.md")));
  const verificationReportJson = JSON.parse(fs.readFileSync(path.join(generated, "verification_report.json"), "utf8"));
  assert.equal(verificationReportJson.level2_evidence_record_path, path.join(generated, "level2_verification_record.md"));
  const verificationReport = fs.readFileSync(path.join(generated, "verification_report.md"), "utf8");
  assert.ok(verificationReport.includes(`Level 2 evidence record: ${path.join(generated, "level2_verification_record.md")}`));
  const capabilityMap = JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "capability_map.json"), "utf8"));
  assert.deepEqual(capabilityMap.capabilities[0].input_schema.properties.template_id.enum, ["launch-banner", "square-social"]);
  assert.ok(capabilityMap.capabilities.some((capability) => capability.id === "image.iterate"));
  assert.equal(capabilityMap.capabilities.find((capability) => capability.id === "image.iterate").source.path, "/api/iterate");
  assert.ok(capabilityMap.capabilities.some((capability) => capability.id === "image.batch"));
  assert.equal(capabilityMap.capabilities.find((capability) => capability.id === "image.batch").source.path, "/api/batch");
  const capabilityFields = capabilityMap.capabilities[0].input_schema.properties.fields;
  assert.equal(capabilityFields.template_fields[0].key, "headline");
  assert.equal(capabilityFields.template_fields[0].label, "主题");
  assert.equal(capabilityFields.template_fields[0].placeholder, "请输入主题");
  assert.ok(capabilityFields.template_fields.some((field) => field.key === "cta" && field.required_by_templates.includes("square-social")));
  assert.equal(capabilityFields.template_fields_by_template["square-social"][1].key, "cta");
  assert.deepEqual(capabilityFields.allowed_sizes_by_template["launch-banner"], ["1200x628", "1024x1024"]);
  assert.equal(capabilityFields.default_size_by_template["square-social"], "1024x1024");
  const metaSnapshot = JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "image_agent_meta.snapshot.json"), "utf8"));
  assert.equal(metaSnapshot.reference_types[0].id, "style");
  const cardsTs = fs.readFileSync(path.join(generated, "bot-runtime", "src", "cards.ts"), "utf8");
  assert.match(cardsTs, /主题/);
  assert.match(cardsTs, /请输入主题/);
  assert.match(cardsTs, /"template_id": "launch-banner"/);
  assert.match(cardsTs, /"id": "square-social"/);
  assert.match(cardsTs, /"size": "1200x628"/);
  assert.match(cardsTs, /"headline": "MVP headline"/);
  assert.match(cardsTs, /export const templateSpecs/);
  assert.match(cardsTs, /tag: "form"/);
  assert.match(cardsTs, /name: field\.name/);
  assert.match(cardsTs, /name: "param_template_id"/);
  assert.match(cardsTs, /"name": "field_headline"/);
  assert.match(cardsTs, /"name": "field_cta"/);
  assert.match(cardsTs, /name: "param_size"/);
  assert.match(cardsTs, /name: "param_message"/);
  assert.match(cardsTs, /name: "image_batch_form"/);
  assert.match(cardsTs, /name: "param_batch_items_json"/);
  assert.match(cardsTs, /action: "image.batch.submit"/);
  assert.match(cardsTs, /action: "image.batch.refresh"/);
  const generatedReadme = fs.readFileSync(path.join(generated, "README.md"), "utf8");
  assert.match(generatedReadme, /LARK_DEPLOYER_CLI/);
  assert.match(generatedReadme, /copied outside the Lark-deployer repository/);
  assert.match(generatedReadme, /feishu_context\.request\.md/);
  assert.match(generatedReadme, /owner-facing request/);
  assert.match(generatedReadme, /node \$env:LARK_DEPLOYER_CLI status \./);
  assert.match(generatedReadme, /placeholder-shaped values/);
  assert.match(generatedReadme, /node \$env:LARK_DEPLOYER_CLI handoff \. --copy-to/);
  assert.match(generatedReadme, /unredacted manual evidence rows/);
  assert.match(generatedReadme, /node \$env:LARK_DEPLOYER_CLI evidence \. --runtime-url http:\/\/127\.0\.0\.1:3978 --update-record/);
  const env = fs.readFileSync(path.join(generated, "bot-runtime", ".env"), "utf8");
  assert.match(env, /APP_ID=cli_test_app/);
  assert.match(env, /PUBLIC_CALLBACK_BASE_URL=https:\/\/example\.com\/lark/);
  assert.match(env, /HOST=127\.0\.0\.1/);
  assert.match(env, /PORT=4988/);
  assert.match(env, /UPLOAD_IMAGE_TO_LARK=0/);
  assert.match(env, /IMAGE_AGENT_TIMEOUT_MS=240000/);
  assert.match(env, /CARD_ACTION_MODE=async/);
  assert.match(env, /FEISHU_OPENAPI_BASE_URL=https:\/\/open\.feishu\.example\.com/);
  assert.match(env, /DEBUG_ACCESS_TOKEN=cli_debug_token/);
  assert.match(env, /ALLOWED_OPERATOR_OPEN_IDS=ou_allowed_one,ou_allowed_two/);
  assert.match(env, /ALLOW_DEBUG_WITHOUT_FEISHU=0/);
  const blankContextFile = path.join(temp, "blank-context.json");
  const blankContext = JSON.parse(JSON.stringify(generatedContext));
  blankContext.feishu_app.app_id = "";
  blankContext.feishu_app.app_secret = "";
  blankContext.feishu_app.verification_token = "";
  blankContext.feishu_app.test_chat_id = "";
  blankContext.feishu_app.public_callback_base_url = "";
  blankContext.target_service.base_url = "";
  blankContext.runtime_config.feishu_openapi_base_url = "";
  blankContext.runtime_config.debug_access_token = "";
  blankContext.runtime_config.target_timeout_seconds = 120;
  blankContext.runtime_config.allowed_operator_open_ids = [];
  fs.writeFileSync(blankContextFile, `${JSON.stringify(blankContext, null, 2)}\n`, "utf8");
  run(["configure", generated, "--context", blankContextFile]);
  const preservedEnv = fs.readFileSync(path.join(generated, "bot-runtime", ".env"), "utf8");
  assert.match(preservedEnv, /APP_ID=cli_test_app/);
  assert.match(preservedEnv, /APP_SECRET=test_secret/);
  assert.match(preservedEnv, /VERIFICATION_TOKEN=test_verification/);
  assert.match(preservedEnv, /TEST_CHAT_ID=oc_test_chat/);
  assert.match(preservedEnv, /PUBLIC_CALLBACK_BASE_URL=https:\/\/example\.com\/lark/);
  assert.match(preservedEnv, /IMAGE_AGENT_BASE_URL=http:\/\/127\.0\.0\.1:1/);
  assert.match(preservedEnv, /IMAGE_AGENT_TIMEOUT_MS=120000/);
  assert.match(preservedEnv, /FEISHU_OPENAPI_BASE_URL=https:\/\/open\.feishu\.example\.com/);
  assert.match(preservedEnv, /DEBUG_ACCESS_TOKEN=cli_debug_token/);
  assert.match(preservedEnv, /ALLOWED_OPERATOR_OPEN_IDS=ou_allowed_one,ou_allowed_two/);
  const level2Record = fs.readFileSync(path.join(generated, "level2_verification_record.md"), "utf8");
  assert.match(level2Record, /Target service: image-agent-web/);
  assert.match(level2Record, /im:message:send_as_bot/);
  assert.match(level2Record, /card\.action\.trigger/);
  assert.match(level2Record, /Invalid card input returns a red failure card/);
});

function run(args) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeDryRunGuidance(rootDir) {
  removeTextPattern(rootDir, /\s+--dry-run/g);
}

function removeTextPattern(rootDir, pattern) {
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (!entry.isFile() || !/\.(json|md|txt|ts|js|mjs|cjs|yml|yaml|toml|gitignore)$/i.test(entry.name)) {
        continue;
      }
      fs.writeFileSync(absolute, fs.readFileSync(absolute, "utf8").replace(pattern, ""), "utf8");
    }
  }
}

function runExpectFailure(args) {
  try {
    run(args);
  } catch (error) {
    if (error && typeof error === "object") {
      const output = [];
      if ("stdout" in error && error.stdout) output.push(String(error.stdout));
      if ("stderr" in error && error.stderr) output.push(String(error.stderr));
      if ("message" in error && error.message) output.push(String(error.message));
      return output.join("\n");
    }
    return String(error);
  }
  assert.fail(`Expected command to fail: ${args.join(" ")}`);
}
