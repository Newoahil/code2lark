import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

const fileOrAbort = (relativePath) => {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    assert.fail(`Expected file to exist: ${relativePath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
};

const assertContains = (text, pattern, message) => {
  assert.match(text, pattern, message);
};

const runNode = (args, options = {}) => childProcess.spawnSync(process.execPath, args, {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, ...options.env },
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 120000,
});

const writeFakeCodex = (tempDir) => {
  if (process.platform === "win32") {
    const commandPath = path.join(tempDir, "fake-codex.cmd");
    fs.writeFileSync(commandPath, [
      "@echo off",
      "if \"%1\"==\"--version\" (echo codex-cli fake & exit /b 0)",
      "if \"%1\"==\"login\" (echo Logged in using an API key - redacted & exit /b 0)",
      "echo {\"leaked\":\"sk-testTokenValue1234567890\"} 1>&2",
      "exit /b 2",
      "",
    ].join("\r\n"));
    return commandPath;
  }

  const commandPath = path.join(tempDir, "fake-codex.sh");
  fs.writeFileSync(commandPath, [
    "#!/usr/bin/env sh",
    "if [ \"$1\" = \"--version\" ]; then echo 'codex-cli fake'; exit 0; fi",
    "if [ \"$1\" = \"login\" ]; then echo 'Logged in using an API key - redacted'; exit 0; fi",
    "echo '{\"leaked\":\"sk-testTokenValue1234567890\"}' 1>&2",
    "exit 2",
    "",
  ].join("\n"));
  fs.chmodSync(commandPath, 0o700);
  return commandPath;
};

const validDemoResponse = () => ({
  mode: "cobuild",
  business_capability: {
    name: "Moonlit Pantry Inventory Reorder Approval Job",
    fictional: true,
    risk: "state_changing",
  },
  ownership_split: {
    business_owner: ["Owns fictional pantry rules and target job behavior."],
    code2lark: ["Owns Lark action contract, safety boundary, audit, and evidence."],
    boundary: "Code2Lark does not own business behavior or target writes.",
  },
  minimal_contract: {
    status: { available: true, side_effects: false, description: "Read fictional job state." },
    dry_run: { available: true, side_effects: false, description: "Preview fictional reorder effects with target-sourced timestamp freshness.", preview_ttl_seconds: 300 },
    execute: { available: true, side_effects: true, description: "Create a fictional reorder plan after host-local confirmation.", requires_host_local_confirm: true, idempotency_key: "confirmation_id" },
    cancel: { available: true, side_effects: true, description: "Cancel a fictional running reorder job if supported." },
    terminal_state_handling: "Return already_processed or the existing terminal result without re-executing.",
    audit: ["operator placeholder", "action id placeholder", "confirmation id placeholder", "trace id placeholder", "result summary"],
  },
  delivery_target: {
    path: "integrations/lark",
    module_type: "embedded-long-connection",
    level2_ready: true,
    local_simulator_only: false,
    required_env: ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "ALLOWED_OPERATOR_OPEN_IDS"],
    feishu_backend_config: ["Enable bot capability", "Enable long connection", "Subscribe card.action.trigger", "Grant required permissions", "Add bot to a test chat"],
  },
  card_confirmation: {
    required: true,
    pattern: "prepare/confirm",
    host_local: true,
    target_prepare_endpoint_required: false,
    target_confirm_endpoint_required: false,
  },
  card_design_dependency: {
    owner: "lark-card-designer",
    code2lark_supplies: ["action semantics", "risk", "inputs", "audit metadata"],
    designer_chooses: ["information architecture", "component choices", "visual status rules"],
  },
  safety_boundary: {
    no_target_writes: true,
    no_secrets: true,
    external_calls_allowed: false,
    production_sendable_feishu_json: false,
    operator_allowlist_required: true,
  },
  lark_qa_gates: {
    direct_execute_bypass: {
      required: true,
      expected_result: "Direct execute bypass without host-local Lark confirmation is rejected before target execution; confirm:true alone is not sufficient provenance.",
      evidence: ["Simulate execute without confirmation_id and expect failure card."],
    },
    duplicate_confirmation: {
      required: true,
      expected_result: "Duplicate confirmation uses idempotency and returns already_processed without a second target execute.",
      evidence: ["Submit the same confirmation_id twice and assert one target execution."],
    },
    unauthorized_operator: {
      required: true,
      expected_result: "Unauthorized operator outside the allowlist is rejected before target execution.",
      evidence: ["Simulate a forged confirm payload from a disallowed operator."],
    },
    stale_or_forged_preview: {
      required: true,
      expected_result: "Stale or forged preview with invalid timestamp/source/TTL is rejected and requires a fresh dry-run.",
      evidence: ["Replay expired and client-constructed preview payloads."],
    },
    terminal_state_replay: {
      required: true,
      expected_result: "Completed terminal operations return already_processed without re-executing even after preview expiry.",
      evidence: ["Replay a completed confirmation after TTL expiry."],
    },
  },
  verification_and_handoff: {
    verification: ["Static contract validation", "Local response validation"],
    handoff: ["Runbook", "schema", "sanitized evidence plan"],
    cleanup: ["Exclude .codex/, runtime logs, local evidence, raw callbacks, real .env files, and temporary agent workspaces from commits."],
    live_feishu_level_2: "not_claimed",
  },
  external_agent_validation: {
    method: "static fixture validation",
    external_services_called: false,
    files_modified: false,
    codex_install_or_configure: false,
  },
});

test("SKILL.md routes Co-Build to cobuild-workflow and cobuild-playbook", () => {
  const skill = fileOrAbort("SKILL.md");

  assertContains(skill, /If the user is building a new capability and wants Lark access as part of the work, read `references\/cobuild-workflow\.md` and then `references\/cobuild-playbook\.md`\./i,
    "SKILL.md must explicitly route Co-Build through cobuild-workflow.md and cobuild-playbook.md");
  assertContains(skill, /If the target project already exists and the user wants Lark access added, read `references\/retrofit-workflow\.md`\./i);
  assertContains(skill, /Before asking, generating, installing, or enabling actions, read `references\/confirmation-policy\.md` and `references\/safety-and-secrets\.md`\./i);
});

test("Co-Build references must preserve status, dry-run/dry_run, execute, cancel/stop contract terms", () => {
  const workflow = fileOrAbort("references/cobuild-workflow.md");
  const playbook = fileOrAbort("references/cobuild-playbook.md");

  assertContains(workflow, /Prefer explicit `status`, `dry-run`, `execute`, and `cancel\/stop` contracts/i);
  assertContains(playbook, /status[\s\S]*dry-?run[\s\S]*execute[\s\S]*cancel[\s\S]*audit/i);
  assertContains(playbook, /Minimal contract template/i);
  assertContains(playbook, /\bdry-run\b|\bdry_run\b/);
  assertContains(playbook, /["'`]dry_run["'`]|\bdry[-_]?run\b/);
  assertContains(playbook, /\bstatus\b/);
  assertContains(playbook, /`execute`/);
  assertContains(playbook, /`cancel`\s*\/\s*`stop`/);
});

test("prepare/confirm remains host-local and target /prepare or /confirm endpoints are not required by default", () => {
  const workflow = fileOrAbort("references/cobuild-workflow.md");
  const playbook = fileOrAbort("references/cobuild-playbook.md");

  assertContains(workflow, /host-local Lark card action pattern/i);
  assertContains(workflow, /(?:\*\*|`)?prepare\/confirm(?:\*\*|`)?/i);
  assertContains(playbook, /Terminology matters:/i);
  assertContains(playbook, /(?:\*\*|`)?prepare\/confirm(?:\*\*|`)?\s+is the host-local Lark card action pattern/i);
  assertContains(playbook, /Do not require the target project to implement `\/prepare` or `\/confirm` endpoints unless the business owner explicitly wants that API shape\./i);
});

test("Retrofit and Co-Build default to integrations/lark embedded long-connection delivery", () => {
  const skill = fileOrAbort("SKILL.md");
  const retrofit = fileOrAbort("references/retrofit-workflow.md");
  const workflow = fileOrAbort("references/cobuild-workflow.md");
  const playbook = fileOrAbort("references/cobuild-playbook.md");
  const evidence = fileOrAbort("references/evidence-handoff.md");

  for (const text of [skill, retrofit, workflow, playbook, evidence]) {
    assertContains(text, /integrations\/lark/i);
    assertContains(text, /embedded[- ]long[- ]connection/i);
  }

  assertContains(skill, /FEISHU_APP_ID/i);
  assertContains(skill, /FEISHU_APP_SECRET/i);
  assertContains(retrofit, /APP_ID[\s\S]*APP_SECRET|FEISHU_APP_ID[\s\S]*FEISHU_APP_SECRET/i);
  assertContains(workflow, /card\.action\.trigger/i);
  assertContains(playbook, /Level 2 ready/i);
  assertContains(evidence, /only remaining user inputs/i);
});

test("safety contract forbids secrets and approval-less writes", () => {
  const safety = fileOrAbort("references/safety-and-secrets.md");
  const workflow = fileOrAbort("references/cobuild-workflow.md");
  const playbook = fileOrAbort("references/cobuild-playbook.md");

  assertContains(safety, /Never print, commit, or include real values for:/i);
  assertContains(safety, /Feishu\/Lark app secrets/i);
  assertContains(safety, /open IDs/i);
  assertContains(safety, /chat IDs/i);
  assertContains(safety, /message IDs from real tenants/i);
  assertContains(safety, /raw callback logs/i);
  assertContains(safety, /target-project install should default to an isolated directory such as:/i);
  assertContains(safety, /Do not modify root package scripts, Docker files, deployment files, or business code unless the user explicitly approves that scope\./i);
  assertContains(playbook, /If the business surface is missing, Code2Lark may propose a contract\. It must not modify business code, root scripts, deployment files, databases, or production behavior unless the user explicitly approves that scope\./i);
  assertContains(workflow, /Record this split before proposing target writes or generated files\./i);
  assertContains(playbook, /Do not let Code2Lark become the business feature owner\./i);
});

test("Lark QA boundaries require bypass, idempotency, authorization, preview freshness, and terminal-state checks", () => {
  const confirmation = fileOrAbort("references/confirmation-policy.md");
  const safety = fileOrAbort("references/safety-and-secrets.md");
  const playbook = fileOrAbort("references/cobuild-playbook.md");
  const evidence = fileOrAbort("references/evidence-handoff.md");

  assertContains(confirmation, /Reject direct execute requests/i);
  assertContains(confirmation, /Client-controlled confirmation signals are not authorization/i);
  assertContains(confirmation, /`confirm: true` flag/i);
  assertContains(confirmation, /Confirmation provenance must be server-held, host-local, or otherwise non-forgeably bound/i);
  assertContains(confirmation, /confirmation ID or idempotency key/i);
  assertContains(confirmation, /freshness TTL/i);
  assertContains(confirmation, /already_processed/i);
  assertContains(safety, /operator allowlist/i);
  assertContains(safety, /forged `confirm: true` payload or direct execute request/i);
  assertContains(playbook, /reject direct execute bypass and duplicate confirmations/i);
  assertContains(playbook, /Client-controlled confirmation signals are not authorization/i);
  assertContains(playbook, /Confirmation provenance must be server-held, host-local, or otherwise non-forgeably bound/i);
  assertContains(playbook, /Terminal-state checks run before expiry checks/i);
  assertContains(playbook, /Lark action boundary/i);
  assertContains(playbook, /Idempotency/i);
  assertContains(evidence, /direct execute bypass rejection/i);
  assertContains(evidence, /stale, forged, or expired preview/i);
});

test("generated demo hygiene excludes local skill, logs, evidence, callbacks, env, and temp workspaces", () => {
  const playbook = fileOrAbort("references/cobuild-playbook.md");
  const evidence = fileOrAbort("references/evidence-handoff.md");

  for (const expected of [/\.codex\//i, /runtime logs/i, /raw callbacks/i, /local evidence/i, /real `?\.env`? files/i, /temporary .*workspaces/i]) {
    assertContains(playbook, expected);
    assertContains(evidence, expected);
  }
});

test("demo contract assets are expected to be present", () => {
  assert.ok(fs.existsSync(path.join(root, "tests/fixtures/cobuild-demo-prompt.md")), "tests/fixtures/cobuild-demo-prompt.md should exist");
  assert.ok(fs.existsSync(path.join(root, "tests/fixtures/cobuild-demo-response.schema.json")), "tests/fixtures/cobuild-demo-response.schema.json should exist");
  assert.ok(fs.existsSync(path.join(root, "tools/run-cobuild-demo.mjs")), "tools/run-cobuild-demo.mjs should exist");
  assert.ok(fs.existsSync(path.join(root, "docs/cobuild-demo-validation.md")), "docs/cobuild-demo-validation.md should exist");
});

test("future cobuild demo prompt and schema should encode static contract terms", () => {
  const prompt = fileOrAbort("tests/fixtures/cobuild-demo-prompt.md");
  const schemaText = fileOrAbort("tests/fixtures/cobuild-demo-response.schema.json");
  const schema = JSON.parse(schemaText);
  const schemaTextLower = schemaText.toLowerCase();

  assertContains(prompt.toLowerCase(), /mode:\s*[-*]\s*cobuild/i);
  assertContains(prompt.toLowerCase(), /ownership\s*_?\s*split/i);
  assertContains(prompt.toLowerCase(), /minimal\s*_?\s*contract/i);
  assertContains(prompt.toLowerCase(), /card\s*_?\s*designer|lark-card-designer/i);
  assertContains(prompt.toLowerCase(), /verification\s*_?\s*handoff/i);
  assertContains(prompt.toLowerCase(), /no\s+target\s+writes/i);
  assertContains(prompt.toLowerCase(), /no\s+secrets/i);
  assertContains(prompt.toLowerCase(), /direct execute/i);
  assertContains(prompt.toLowerCase(), /client-controlled confirmation signals are not authorization/i);
  assertContains(prompt.toLowerCase(), /confirm: true/i);
  assertContains(prompt.toLowerCase(), /plain http dry-run/i);
  assertContains(prompt.toLowerCase(), /duplicate confirmations?/i);
  assertContains(prompt.toLowerCase(), /operator allowlist/i);
  assertContains(prompt.toLowerCase(), /stale or forged previews?/i);
  assertContains(prompt.toLowerCase(), /already_processed|terminal-state/i);
  assertContains(prompt.toLowerCase(), /\.codex/i);
  assertContains(prompt.toLowerCase(), /integrations\/lark/i);
  assertContains(prompt.toLowerCase(), /embedded[- ]long[- ]connection/i);
  assertContains(prompt, /FEISHU_APP_ID/);
  assertContains(prompt, /FEISHU_APP_SECRET/);
  assertContains(prompt, /card\.action\.trigger/);

  assert.equal(schema.mode, "cobuild");
  assert.ok(schemaTextLower.includes('"ownership_split"'));
  assert.ok(schemaTextLower.includes('"minimal_contract"'));
  assert.ok(schemaTextLower.includes("designer") || schemaTextLower.includes("lark-card-designer"));
  assert.ok(schemaTextLower.includes("verification") && schemaTextLower.includes("handoff"));
  assert.ok(schemaTextLower.includes("no_target_writes") || schemaTextLower.includes("target_writes") || schemaTextLower.includes("target writes") || schemaTextLower.includes("targetWrites"));
  assert.ok(schemaTextLower.includes("no secret") || schemaTextLower.includes("no_secrets") || schemaTextLower.includes("secrets forbidden") || schemaTextLower.includes("forbid secret"));
  assert.ok(schemaTextLower.includes("status") && (schemaTextLower.includes("dry_run") || schemaTextLower.includes("dry-run")) && schemaTextLower.includes("execute") && schemaTextLower.includes("cancel"));
  assert.ok(schemaTextLower.includes("lark_qa_gates"));
  assert.ok(schemaTextLower.includes("direct_execute_bypass"));
  assert.ok(schemaTextLower.includes("duplicate_confirmation"));
  assert.ok(schemaTextLower.includes("unauthorized_operator"));
  assert.ok(schemaTextLower.includes("stale_or_forged_preview"));
  assert.ok(schemaTextLower.includes("terminal_state_replay"));
  assert.ok(schemaTextLower.includes("operator_allowlist_required"));
  assert.ok(schemaTextLower.includes("delivery_target"));
  assert.ok(schemaTextLower.includes("embedded-long-connection"));
  assert.ok(schemaTextLower.includes("feishu_app_id"));
  assert.ok(schemaTextLower.includes("feishu_app_secret"));
  assert.ok(schemaTextLower.includes("card.action.trigger"));
  assert.ok(schemaTextLower.includes("cleanup"));
});

test("cobuild demo runner static-only mode emits a passing static report", () => {
  const result = runNode(["tools/run-cobuild-demo.mjs", "--static-only"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verification_level, "static-only");
  assert.equal(report.static_validation.status, "pass");
  assert.equal(report.external_agent_status, "skipped");
});

test("cobuild demo runner validates good and extra-field responses", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cobuild-demo-test-"));

  try {
    const validPath = path.join(tempDir, "valid.json");
    fs.writeFileSync(validPath, JSON.stringify(validDemoResponse(), null, 2));

    const valid = runNode(["tools/run-cobuild-demo.mjs", "--verify-response", validPath]);
    assert.equal(valid.status, 0, valid.stderr || valid.stdout);
    const validReport = JSON.parse(valid.stdout);
    assert.equal(validReport.response_validation.status, "pass");

    const invalidPath = path.join(tempDir, "invalid-extra.json");
    fs.writeFileSync(invalidPath, JSON.stringify({ ...validDemoResponse(), unexpected_field: true }, null, 2));

    const invalid = runNode(["tools/run-cobuild-demo.mjs", "--verify-response", invalidPath]);
    assert.notEqual(invalid.status, 0, "extra fields must fail response validation");
    const invalidReport = JSON.parse(invalid.stdout);
    assert.equal(invalidReport.response_validation.status, "fail");
    assert.ok(invalidReport.response_validation.issues.some((issue) => issue.includes("unexpected_field")));
    assert.equal(Object.hasOwn(invalidReport, "response"), false, "failed response validation must not echo the payload");

    const sensitivePath = path.join(tempDir, "invalid-sensitive.json");
    const sensitive = validDemoResponse();
    sensitive.minimal_contract.audit = ["<sk-testTokenValue1234567890>"];
    fs.writeFileSync(sensitivePath, JSON.stringify(sensitive, null, 2));

    const sensitiveRun = runNode(["tools/run-cobuild-demo.mjs", "--verify-response", sensitivePath]);
    assert.notEqual(sensitiveRun.status, 0, "token-like placeholder values must fail response validation");
    const sensitiveReport = JSON.parse(sensitiveRun.stdout);
    assert.equal(sensitiveReport.response_validation.status, "fail");
    assert.equal(Object.hasOwn(sensitiveReport, "response"), false, "sensitive failed payload must not be echoed");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("cobuild demo runner rejects missing Lark QA boundary evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cobuild-demo-qa-test-"));

  try {
    const bypassPath = path.join(tempDir, "invalid-direct-bypass.json");
    const bypass = validDemoResponse();
    bypass.minimal_contract.dry_run.available = false;
    fs.writeFileSync(bypassPath, JSON.stringify(bypass, null, 2));

    const bypassRun = runNode(["tools/run-cobuild-demo.mjs", "--verify-response", bypassPath]);
    assert.notEqual(bypassRun.status, 0, "execute without dry_run must fail response validation");
    const bypassReport = JSON.parse(bypassRun.stdout);
    assert.equal(bypassReport.response_validation.status, "fail");
    assert.ok(bypassReport.response_validation.issues.some((issue) => issue.includes("dry_run")));

    const weakBypassPath = path.join(tempDir, "invalid-weak-direct-bypass.json");
    const weakBypass = validDemoResponse();
    weakBypass.lark_qa_gates.direct_execute_bypass.expected_result = "Direct execute bypass is rejected after prepare.";
    fs.writeFileSync(weakBypassPath, JSON.stringify(weakBypass, null, 2));

    const weakBypassRun = runNode(["tools/run-cobuild-demo.mjs", "--verify-response", weakBypassPath]);
    assert.notEqual(weakBypassRun.status, 0, "direct execute wording without non-forgeable confirmation semantics must fail response validation");
    const weakBypassReport = JSON.parse(weakBypassRun.stdout);
    assert.equal(weakBypassReport.response_validation.status, "fail");
    assert.ok(weakBypassReport.response_validation.issues.some((issue) => issue.includes("direct_execute_bypass")));

    const qaPath = path.join(tempDir, "invalid-qa-gates.json");
    const qa = validDemoResponse();
    qa.lark_qa_gates.duplicate_confirmation.expected_result = "Retry works.";
    fs.writeFileSync(qaPath, JSON.stringify(qa, null, 2));

    const qaRun = runNode(["tools/run-cobuild-demo.mjs", "--verify-response", qaPath]);
    assert.notEqual(qaRun.status, 0, "weak duplicate confirmation evidence must fail response validation");
    const qaReport = JSON.parse(qaRun.stdout);
    assert.equal(qaReport.response_validation.status, "fail");
    assert.ok(qaReport.response_validation.issues.some((issue) => issue.includes("duplicate_confirmation")));

    const authPath = path.join(tempDir, "invalid-authorization.json");
    const auth = validDemoResponse();
    auth.lark_qa_gates.unauthorized_operator.expected_result = "Operator validation is considered.";
    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));

    const authRun = runNode(["tools/run-cobuild-demo.mjs", "--verify-response", authPath]);
    assert.notEqual(authRun.status, 0, "weak unauthorized-operator wording must fail response validation");
    const authReport = JSON.parse(authRun.stdout);
    assert.equal(authReport.response_validation.status, "fail");
    assert.ok(authReport.response_validation.issues.some((issue) => issue.includes("unauthorized_operator")));

    const simulatorOnlyPath = path.join(tempDir, "invalid-simulator-only-delivery.json");
    const simulatorOnly = validDemoResponse();
    simulatorOnly.delivery_target.local_simulator_only = true;
    simulatorOnly.delivery_target.level2_ready = false;
    fs.writeFileSync(simulatorOnlyPath, JSON.stringify(simulatorOnly, null, 2));

    const simulatorOnlyRun = runNode(["tools/run-cobuild-demo.mjs", "--verify-response", simulatorOnlyPath]);
    assert.notEqual(simulatorOnlyRun.status, 0, "simulator-only delivery must fail response validation");
    const simulatorOnlyReport = JSON.parse(simulatorOnlyRun.stdout);
    assert.equal(simulatorOnlyReport.response_validation.status, "fail");
    assert.ok(simulatorOnlyReport.response_validation.issues.some((issue) => issue.includes("delivery_target")));

    const hygienePath = path.join(tempDir, "invalid-hygiene.json");
    const hygiene = validDemoResponse();
    hygiene.verification_and_handoff.cleanup = ["Remove generated files."];
    fs.writeFileSync(hygienePath, JSON.stringify(hygiene, null, 2));

    const hygieneRun = runNode(["tools/run-cobuild-demo.mjs", "--verify-response", hygienePath]);
    assert.notEqual(hygieneRun.status, 0, "missing cleanup hygiene terms must fail response validation");
    const hygieneReport = JSON.parse(hygieneRun.stdout);
    assert.equal(hygieneReport.response_validation.status, "fail");
    assert.ok(hygieneReport.response_validation.issues.some((issue) => issue.includes("cleanup")));

    const rawCallbackPath = path.join(tempDir, "invalid-raw-callback-hygiene.json");
    const rawCallback = validDemoResponse();
    rawCallback.verification_and_handoff.cleanup = ["Exclude .codex/, runtime logs, local evidence, real .env files, and temporary agent workspaces from commits."];
    fs.writeFileSync(rawCallbackPath, JSON.stringify(rawCallback, null, 2));

    const rawCallbackRun = runNode(["tools/run-cobuild-demo.mjs", "--verify-response", rawCallbackPath]);
    assert.notEqual(rawCallbackRun.status, 0, "cleanup without raw callbacks must fail response validation");
    const rawCallbackReport = JSON.parse(rawCallbackRun.stdout);
    assert.equal(rawCallbackReport.response_validation.status, "fail");
    assert.ok(rawCallbackReport.response_validation.issues.some((issue) => issue.includes("raw callbacks")));

    const workspacePath = path.join(tempDir, "invalid-workspace-hygiene.json");
    const workspace = validDemoResponse();
    workspace.verification_and_handoff.cleanup = ["Exclude .codex/, runtime logs, local evidence, raw callbacks, and real .env files from commits."];
    fs.writeFileSync(workspacePath, JSON.stringify(workspace, null, 2));

    const workspaceRun = runNode(["tools/run-cobuild-demo.mjs", "--verify-response", workspacePath]);
    assert.notEqual(workspaceRun.status, 0, "cleanup without temporary workspaces must fail response validation");
    const workspaceReport = JSON.parse(workspaceRun.stdout);
    assert.equal(workspaceReport.response_validation.status, "fail");
    assert.ok(workspaceReport.response_validation.issues.some((issue) => issue.includes("temporary agent workspaces")));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("cobuild demo runner does not echo raw Codex failure output", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cobuild-demo-fake-codex-"));

  try {
    const fakeCodex = writeFakeCodex(tempDir);
    const result = runNode(["tools/run-cobuild-demo.mjs"], {
      env: { CODE2LARK_CODEX_BIN: fakeCodex },
    });

    assert.notEqual(result.status, 0, "non-auth Codex exec failures should fail without raw output");
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    assert.doesNotMatch(combinedOutput, /sk-testTokenValue1234567890/);
    assert.doesNotMatch(combinedOutput, /\{"leaked"/);

    const report = JSON.parse(result.stdout);
    assert.equal(report.external_agent_status, "failed");
    assert.equal(report.external_agent_error.reason, "Codex exec failed before producing a validated response");
    assert.equal(Object.hasOwn(report.external_agent_error, "output"), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
