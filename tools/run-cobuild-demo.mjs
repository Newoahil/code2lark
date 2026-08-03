import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const fixturesDir = path.join(rootDir, "tests", "fixtures");
const promptPath = path.join(fixturesDir, "cobuild-demo-prompt.md");
const schemaPath = path.join(fixturesDir, "cobuild-demo-response.schema.json");

const FORBIDDEN_TERMS = [
  "app_secret",
  "access_token",
  "refresh_token",
  "tenant_key",
  "open_id",
  "chat_id",
  "message_id",
  "raw callback",
];

const ALLOWED_GENERIC_PLACEHOLDERS = new Set([
  "operator_open_id",
  "chat_id",
  "message_id",
  "tenant_key",
  "app_secret",
  "access_token",
  "refresh_token",
  "open_id",
  "raw_callback",
]);

const RESPONSE_SHAPE = {
  root: [
    "mode",
    "business_capability",
    "ownership_split",
    "minimal_contract",
    "delivery_target",
    "card_confirmation",
    "card_design_dependency",
    "safety_boundary",
    "lark_qa_gates",
    "verification_and_handoff",
    "external_agent_validation",
  ],
  business_capability: ["name", "fictional", "risk"],
  ownership_split: ["business_owner", "code2lark", "boundary"],
  minimal_contract: ["status", "dry_run", "execute", "cancel", "audit", "terminal_state_handling"],
  contract_operation: ["available", "side_effects", "description", "preview_ttl_seconds", "requires_host_local_confirm", "idempotency_key"],
  delivery_target: ["path", "module_type", "level2_ready", "local_simulator_only", "required_env", "feishu_backend_config"],
  card_confirmation: ["required", "pattern", "host_local", "target_prepare_endpoint_required", "target_confirm_endpoint_required"],
  card_design_dependency: ["owner", "code2lark_supplies", "designer_chooses"],
  safety_boundary: ["no_target_writes", "no_secrets", "external_calls_allowed", "production_sendable_feishu_json", "operator_allowlist_required"],
  lark_qa_gates: ["direct_execute_bypass", "duplicate_confirmation", "unauthorized_operator", "stale_or_forged_preview", "terminal_state_replay"],
  qa_gate: ["required", "expected_result", "evidence"],
  verification_and_handoff: ["verification", "handoff", "cleanup", "live_feishu_level_2"],
  external_agent_validation: ["method", "external_services_called", "files_modified", "codex_install_or_configure"],
};

const ARG_HELP = new Set(["-h", "--help"]);

function parseArgs(argv) {
  const args = {
    staticOnly: false,
    verifyResponsePath: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--static-only") {
      args.staticOnly = true;
      continue;
    }

    if (arg === "--verify-response") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("Expected path after --verify-response");
      }
      args.verifyResponsePath = value;
      i += 1;
      continue;
    }

    if (ARG_HELP.has(arg)) {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printUsage() {
  const usage = [
    "Usage:",
    "  node tools/run-cobuild-demo.mjs [--static-only] [--verify-response <path>] [--help]",
    "",
    "Options:",
    "  --static-only             Run deterministic local validation only.",
    "  --verify-response <path>   Validate a provided JSON response against the demo schema contract.",
    "",
    "Default behavior runs static validation and attempts optional Codex black-box validation",
    "when Codex is installed and authenticated. It never installs or configures Codex.",
  ].join("\n");
  console.log(usage);
}

function runCommand(command, args = [], inputText = null, options = {}) {
  try {
    const isWindowsCommandShim = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
    const executable = isWindowsCommandShim ? (process.env.ComSpec || "cmd.exe") : command;
    const executableArgs = isWindowsCommandShim ? ["/d", "/s", "/c", command, ...args] : args;
    const result = childProcess.spawnSync(executable, executableArgs, {
      encoding: "utf8",
      input: inputText,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
      ...options,
    });

    const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    return {
      ok: result.status === 0,
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      output: combinedOutput,
    };
  } catch (error) {
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: String(error.message || error),
      output: String(error.message || error),
      error,
    };
  }
};

function isReadableFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function copyFileIntoWorkspace(source, workspaceRoot, relativePath) {
  const destination = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function prepareCodexWorkspace(tempDir) {
  const workspaceRoot = path.join(tempDir, "workspace");
  const files = [
    "SKILL.md",
    path.join("references", "cobuild-workflow.md"),
    path.join("references", "cobuild-playbook.md"),
    path.join("references", "confirmation-policy.md"),
    path.join("references", "safety-and-secrets.md"),
    path.join("references", "feishu-card-json-2-runtime-spec.md"),
    path.join("references", "feishu-runtime-gates.md"),
    path.join("references", "evidence-handoff.md"),
    path.join("embedded-skills", "lark-card-designer", "SKILL.md"),
    path.join("embedded-skills", "lark-card-designer", "references", "json-2.0-compatibility-rules.md"),
  ];

  for (const relativePath of files) {
    copyFileIntoWorkspace(path.join(rootDir, relativePath), workspaceRoot, relativePath);
  }

  copyFileIntoWorkspace(promptPath, workspaceRoot, path.join("tests", "fixtures", "cobuild-demo-prompt.md"));
  copyFileIntoWorkspace(schemaPath, workspaceRoot, path.join("tests", "fixtures", "cobuild-demo-response.schema.json"));

  return workspaceRoot;
}

function collectValidationProblems(response) {
  const problems = [];
  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const textIncludes = (value, patterns) => typeof value === "string" && patterns.some((pattern) => pattern.test(value));
  const rejectUnknownKeys = (value, allowed, location) => {
    if (!isObject(value)) {
      return;
    }

    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) {
        problems.push(`${location} has unexpected field: ${key}`);
      }
    }
  };

  rejectUnknownKeys(response, RESPONSE_SHAPE.root, "root");

  for (const field of RESPONSE_SHAPE.root) {
    if (!Object.hasOwn(response, field)) {
      problems.push(`Missing top-level field: ${field}`);
    }
  }

  if (response.mode !== "cobuild") {
    problems.push(`Expected mode to be "cobuild", got ${JSON.stringify(response.mode)}`);
  }

  if (!isObject(response.business_capability)) {
    problems.push("business_capability must be an object");
  } else {
    rejectUnknownKeys(response.business_capability, RESPONSE_SHAPE.business_capability, "business_capability");
    if (typeof response.business_capability.name !== "string" || !response.business_capability.name.trim()) {
      problems.push("business_capability.name must be a non-empty string");
    }

    if (response.business_capability.fictional !== true) {
      problems.push("business_capability.fictional must be true");
    }

    if (!(["state_changing", "long_running"].includes(response.business_capability.risk))) {
      problems.push("business_capability.risk must be state_changing or long_running");
    }
  }

  if (!isObject(response.ownership_split)) {
    problems.push("ownership_split must be an object");
  } else {
    rejectUnknownKeys(response.ownership_split, RESPONSE_SHAPE.ownership_split, "ownership_split");
    if (!Array.isArray(response.ownership_split.business_owner) || !response.ownership_split.business_owner.length) {
      problems.push("ownership_split.business_owner must be a non-empty array");
    } else if (!response.ownership_split.business_owner.every((line) => typeof line === "string" && line.trim())) {
      problems.push("ownership_split.business_owner must contain only non-empty strings");
    }

    if (!Array.isArray(response.ownership_split.code2lark) || !response.ownership_split.code2lark.length) {
      problems.push("ownership_split.code2lark must be a non-empty array");
    } else if (!response.ownership_split.code2lark.every((line) => typeof line === "string" && line.trim())) {
      problems.push("ownership_split.code2lark must contain only non-empty strings");
    }

    if (typeof response.ownership_split.boundary !== "string" || !response.ownership_split.boundary.trim()) {
      problems.push("ownership_split.boundary must be a non-empty string");
    }
  }

  if (!isObject(response.minimal_contract)) {
    problems.push("minimal_contract must be an object");
  } else {
    rejectUnknownKeys(response.minimal_contract, RESPONSE_SHAPE.minimal_contract, "minimal_contract");
    const ops = ["status", "dry_run", "execute", "cancel"];
    for (const op of ops) {
      const section = response.minimal_contract[op];
      if (!isObject(section)) {
        problems.push(`minimal_contract.${op} must be an object`);
        continue;
      }
      rejectUnknownKeys(section, RESPONSE_SHAPE.contract_operation, `minimal_contract.${op}`);

      if (typeof section.available !== "boolean") {
        problems.push(`minimal_contract.${op}.available must be a boolean`);
      }

      if (typeof section.side_effects !== "boolean") {
        problems.push(`minimal_contract.${op}.side_effects must be a boolean`);
      }

      if (typeof section.description !== "string" || !section.description.trim()) {
        problems.push(`minimal_contract.${op}.description must be a non-empty string`);
      }

      if (Object.hasOwn(section, "preview_ttl_seconds") && (!Number.isInteger(section.preview_ttl_seconds) || section.preview_ttl_seconds < 1)) {
        problems.push(`minimal_contract.${op}.preview_ttl_seconds must be a positive integer when present`);
      }

      if (Object.hasOwn(section, "requires_host_local_confirm") && typeof section.requires_host_local_confirm !== "boolean") {
        problems.push(`minimal_contract.${op}.requires_host_local_confirm must be a boolean when present`);
      }

      if (Object.hasOwn(section, "idempotency_key") && (typeof section.idempotency_key !== "string" || !section.idempotency_key.trim())) {
        problems.push(`minimal_contract.${op}.idempotency_key must be a non-empty string when present`);
      }
    }

    const dryRun = response.minimal_contract.dry_run;
    const execute = response.minimal_contract.execute;
    if (isObject(execute) && execute.available === true && isObject(dryRun) && dryRun.available !== true) {
      problems.push("minimal_contract.execute cannot be available for this state-changing demo when minimal_contract.dry_run is unavailable");
    }

    if (isObject(execute) && execute.available === true && execute.requires_host_local_confirm !== true) {
      problems.push("minimal_contract.execute.requires_host_local_confirm must be true when execute is available");
    }

    if (isObject(execute) && execute.available === true && !textIncludes(execute.idempotency_key, [/confirmation/i, /idempotenc/i])) {
      problems.push("minimal_contract.execute.idempotency_key must name a confirmation or idempotency key");
    }

    if (isObject(dryRun) && dryRun.available === true && (!Number.isInteger(dryRun.preview_ttl_seconds) || dryRun.preview_ttl_seconds < 1)) {
      problems.push("minimal_contract.dry_run.preview_ttl_seconds must be a positive integer when dry_run is available");
    }

    if (typeof response.minimal_contract.terminal_state_handling !== "string" || !textIncludes(response.minimal_contract.terminal_state_handling, [/already[_\s-]?processed/i, /terminal/i])) {
      problems.push("minimal_contract.terminal_state_handling must describe already_processed or terminal-state behavior");
    }

    const audits = response.minimal_contract.audit;
    if (!Array.isArray(audits) || audits.length === 0 || !audits.every((line) => typeof line === "string" && line.trim())) {
      problems.push("minimal_contract.audit must be a non-empty array of strings");
    } else if (!audits.some((line) => /confirmation|idempotenc/i.test(line))) {
      problems.push("minimal_contract.audit must include a confirmation ID or idempotency key");
    }
  }

  if (!isObject(response.card_confirmation)) {
    problems.push("card_confirmation must be an object");
  } else {
    rejectUnknownKeys(response.card_confirmation, RESPONSE_SHAPE.card_confirmation, "card_confirmation");
    if (response.card_confirmation.required !== true) {
      problems.push("card_confirmation.required must be true");
    }

    if (response.card_confirmation.pattern !== "prepare/confirm") {
      problems.push("card_confirmation.pattern must be prepare/confirm");
    }

    if (response.card_confirmation.host_local !== true) {
      problems.push("card_confirmation.host_local must be true");
    }

    if (response.card_confirmation.target_prepare_endpoint_required !== false) {
      problems.push("card_confirmation.target_prepare_endpoint_required must be false");
    }

    if (response.card_confirmation.target_confirm_endpoint_required !== false) {
      problems.push("card_confirmation.target_confirm_endpoint_required must be false");
    }
  }

  if (!isObject(response.delivery_target)) {
    problems.push("delivery_target must be an object");
  } else {
    rejectUnknownKeys(response.delivery_target, RESPONSE_SHAPE.delivery_target, "delivery_target");
    if (response.delivery_target.path !== "integrations/lark") {
      problems.push("delivery_target.path must be integrations/lark");
    }

    if (response.delivery_target.module_type !== "embedded-long-connection") {
      problems.push("delivery_target.module_type must be embedded-long-connection");
    }

    if (response.delivery_target.level2_ready !== true) {
      problems.push("delivery_target.level2_ready must be true");
    }

    if (response.delivery_target.local_simulator_only !== false) {
      problems.push("delivery_target.local_simulator_only must be false");
    }

    const requiredEnv = response.delivery_target.required_env;
    if (!Array.isArray(requiredEnv) || !requiredEnv.every((line) => typeof line === "string" && line.trim())) {
      problems.push("delivery_target.required_env must be a non-empty array of strings");
    } else {
      for (const requiredName of ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "ALLOWED_OPERATOR_OPEN_IDS"]) {
        if (!requiredEnv.includes(requiredName)) {
          problems.push(`delivery_target.required_env must include ${requiredName}`);
        }
      }
    }

    const backendConfig = response.delivery_target.feishu_backend_config;
    if (!Array.isArray(backendConfig) || !backendConfig.length || !backendConfig.every((line) => typeof line === "string" && line.trim())) {
      problems.push("delivery_target.feishu_backend_config must be a non-empty array of strings");
    } else {
      const configText = backendConfig.join("\n").toLowerCase();
      const configRequirements = [
        { label: "bot capability", pattern: /bot|机器人/ },
        { label: "long connection", pattern: /long connection|长连接/ },
        { label: "card.action.trigger", pattern: /card\.action\.trigger/ },
        { label: "permissions", pattern: /permission|权限/ },
        { label: "test chat", pattern: /test chat|测试群|chat/ },
      ];
      for (const { label, pattern } of configRequirements) {
        if (!pattern.test(configText)) {
          problems.push(`delivery_target.feishu_backend_config must mention ${label}`);
        }
      }
    }
  }

  if (!isObject(response.card_design_dependency)) {
    problems.push("card_design_dependency must be an object");
  } else {
    rejectUnknownKeys(response.card_design_dependency, RESPONSE_SHAPE.card_design_dependency, "card_design_dependency");
    if (!["lark-card-designer", "card designer"].includes(response.card_design_dependency.owner)) {
      problems.push("card_design_dependency.owner must be lark-card-designer or card designer");
    }

    if (!Array.isArray(response.card_design_dependency.code2lark_supplies) || response.card_design_dependency.code2lark_supplies.length === 0) {
      problems.push("card_design_dependency.code2lark_supplies must be a non-empty array");
    } else if (!response.card_design_dependency.code2lark_supplies.every((line) => typeof line === "string" && line.trim())) {
      problems.push("card_design_dependency.code2lark_supplies must contain only non-empty strings");
    }

    if (!Array.isArray(response.card_design_dependency.designer_chooses) || response.card_design_dependency.designer_chooses.length === 0) {
      problems.push("card_design_dependency.designer_chooses must be a non-empty array");
    } else if (!response.card_design_dependency.designer_chooses.every((line) => typeof line === "string" && line.trim())) {
      problems.push("card_design_dependency.designer_chooses must contain only non-empty strings");
    }
  }

  if (!isObject(response.safety_boundary)) {
    problems.push("safety_boundary must be an object");
  } else {
    rejectUnknownKeys(response.safety_boundary, RESPONSE_SHAPE.safety_boundary, "safety_boundary");
    if (response.safety_boundary.no_target_writes !== true) {
      problems.push("safety_boundary.no_target_writes must be true");
    }

    if (response.safety_boundary.no_secrets !== true) {
      problems.push("safety_boundary.no_secrets must be true");
    }

    if (response.safety_boundary.external_calls_allowed !== false) {
      problems.push("safety_boundary.external_calls_allowed must be false");
    }

    if (response.safety_boundary.production_sendable_feishu_json !== false) {
      problems.push("safety_boundary.production_sendable_feishu_json must be false");
    }

    if (response.safety_boundary.operator_allowlist_required !== true) {
      problems.push("safety_boundary.operator_allowlist_required must be true");
    }
  }

  if (!isObject(response.lark_qa_gates)) {
    problems.push("lark_qa_gates must be an object");
  } else {
    rejectUnknownKeys(response.lark_qa_gates, RESPONSE_SHAPE.lark_qa_gates, "lark_qa_gates");
    const expectedGateText = {
      direct_execute_bypass: [/direct/i, /bypass/i, /client-controlled|client supplied|client-supplied|request field|confirm:\s*true/i, /not authorization|not sufficient|not proof/i, /server-held|host-local|non-forgeable|provenance/i, /reject|fail|disabled|protected/i, /before target|no target|without target/i],
      duplicate_confirmation: [/duplicate/i, /idempotenc/i, /no second|without a second|one target|not call target twice|do not call target twice/i],
      unauthorized_operator: [/unauthori[sz]ed|unlisted|disallowed|outside/i, /allowlist/i, /reject|fail/i, /before target|no target|no side effect|without target/i],
      stale_or_forged_preview: [/stale|expired|ttl|fresh/i, /forged|source|timestamp|preview/i, /reject|fail|requires a fresh dry-run/i],
      terminal_state_replay: [/terminal|already[_\s-]?processed|completed/i, /without re-?execut|not re-?execut|no re-?execut/i],
    };

    for (const [gateName, patterns] of Object.entries(expectedGateText)) {
      const gate = response.lark_qa_gates[gateName];
      if (!isObject(gate)) {
        problems.push(`lark_qa_gates.${gateName} must be an object`);
        continue;
      }

      rejectUnknownKeys(gate, RESPONSE_SHAPE.qa_gate, `lark_qa_gates.${gateName}`);
      if (gate.required !== true) {
        problems.push(`lark_qa_gates.${gateName}.required must be true`);
      }

      if (typeof gate.expected_result !== "string" || !gate.expected_result.trim()) {
        problems.push(`lark_qa_gates.${gateName}.expected_result must be a non-empty string`);
      } else if (!patterns.every((pattern) => pattern.test(gate.expected_result))) {
        problems.push(`lark_qa_gates.${gateName}.expected_result must describe the required Lark QA boundary`);
      }

      if (!Array.isArray(gate.evidence) || gate.evidence.length === 0 || !gate.evidence.every((line) => typeof line === "string" && line.trim())) {
        problems.push(`lark_qa_gates.${gateName}.evidence must be a non-empty array of strings`);
      }
    }
  }

  if (!isObject(response.verification_and_handoff)) {
    problems.push("verification_and_handoff must be an object");
  } else {
    rejectUnknownKeys(response.verification_and_handoff, RESPONSE_SHAPE.verification_and_handoff, "verification_and_handoff");
    if (!Array.isArray(response.verification_and_handoff.verification) || response.verification_and_handoff.verification.length === 0) {
      problems.push("verification_and_handoff.verification must be a non-empty array");
    } else if (!response.verification_and_handoff.verification.every((line) => typeof line === "string" && line.trim())) {
      problems.push("verification_and_handoff.verification must contain only non-empty strings");
    }

    if (!Array.isArray(response.verification_and_handoff.handoff) || response.verification_and_handoff.handoff.length === 0) {
      problems.push("verification_and_handoff.handoff must be a non-empty array");
    } else if (!response.verification_and_handoff.handoff.every((line) => typeof line === "string" && line.trim())) {
      problems.push("verification_and_handoff.handoff must contain only non-empty strings");
    }

    const cleanup = response.verification_and_handoff.cleanup;
    if (!Array.isArray(cleanup) || cleanup.length === 0) {
      problems.push("verification_and_handoff.cleanup must be a non-empty array");
    } else if (!cleanup.every((line) => typeof line === "string" && line.trim())) {
      problems.push("verification_and_handoff.cleanup must contain only non-empty strings");
    } else {
      const cleanupText = cleanup.join("\n").toLowerCase();
      const cleanupRequirements = [
        { label: ".codex", pattern: /\.codex/ },
        { label: "runtime logs", pattern: /log/ },
        { label: "local evidence", pattern: /evidence/ },
        { label: "raw callbacks", pattern: /raw callback/ },
        { label: "real .env files", pattern: /\.env/ },
        { label: "temporary agent workspaces", pattern: /temporary|temp/ },
        { label: "temporary agent workspaces", pattern: /workspace/ },
      ];
      for (const { label, pattern } of cleanupRequirements) {
        if (!pattern.test(cleanupText)) {
          problems.push(`verification_and_handoff.cleanup must mention ${label} hygiene`);
        }
      }
    }

    if (response.verification_and_handoff.live_feishu_level_2 !== "not_claimed") {
      problems.push("verification_and_handoff.live_feishu_level_2 must be not_claimed");
    }
  }

  if (!isObject(response.external_agent_validation)) {
    problems.push("external_agent_validation must be an object");
  } else {
    rejectUnknownKeys(response.external_agent_validation, RESPONSE_SHAPE.external_agent_validation, "external_agent_validation");
    if (typeof response.external_agent_validation.method !== "string" || !response.external_agent_validation.method.trim()) {
      problems.push("external_agent_validation.method must be a non-empty string");
    }

    if (response.external_agent_validation.external_services_called !== false) {
      problems.push("external_agent_validation.external_services_called must be false");
    }

    if (response.external_agent_validation.files_modified !== false) {
      problems.push("external_agent_validation.files_modified must be false");
    }

    if (response.external_agent_validation.codex_install_or_configure !== false) {
      problems.push("external_agent_validation.codex_install_or_configure must be false");
    }
  }

  for (const line of collectForbiddenContent(response)) {
    problems.push(line);
  }

  return problems;
}

function isAllowedPlaceholderString(value) {
  const trimmed = value.trim().toLowerCase();

  if (ALLOWED_GENERIC_PLACEHOLDERS.has(trimmed)) {
    return true;
  }

  if (/^<[^>]+>$/.test(value)) {
    return true;
  }

  if (/^\{[^}]+\}$/.test(value) || /^\$\{[^}]+\}$/.test(value) || /^\{\{[^}]+\}\}$/.test(value)) {
    return true;
  }

  return false;
}

function isLikelySensitiveValue(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const lowered = trimmed.toLowerCase();

  if (/\b(sk-[a-z0-9_-]{12,}|xox[baprs]-[a-z0-9-]{10,}|bearer\s+[a-z0-9._-]{16,})\b/i.test(trimmed)) {
    return true;
  }

  if (/\b(ou|oc|cu|cn|chat|im|msg)_[A-Za-z0-9_-]{6,}\b/i.test(trimmed)) {
    return true;
  }

  if (/\b[A-Fa-f0-9]{32,}\b/.test(trimmed)) {
    return true;
  }

  if (/\b[A-Za-z0-9_-]{32,}\b/.test(trimmed) && /[A-Za-z]/.test(trimmed) && /[0-9]/.test(trimmed)) {
    return true;
  }

  if (isAllowedPlaceholderString(trimmed)) {
    return false;
  }

  return false;
}

function collectForbiddenContent(value, at = "root") {
  const findings = [];

  const checkText = (text, location) => {
    const lowered = text.toLowerCase();
    for (const term of FORBIDDEN_TERMS) {
      if (lowered.includes(term) && isLikelySensitiveValue(text)) {
        findings.push(`${location} contains sensitive value near forbidden term ${term}`);
      }
    }

    if (isLikelySensitiveValue(text)) {
      findings.push(`${location} contains a real-id-like or token-like value`);
    }
  };

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      findings.push(...collectForbiddenContent(item, `${at}[${index}]`));
    });
    return findings;
  }

  if (typeof value === "object" && value !== null) {
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_TERMS.includes(key.toLowerCase()) && !isAllowedPlaceholderString(String(nested))) {
        findings.push(`${at}.${key} uses a forbidden sensitive field name`);
      }
      findings.push(...collectForbiddenContent(nested, `${at}.${key}`));
    }
    return findings;
  }

  if (typeof value === "string") {
    checkText(value, at);
  }

  return findings;
}

function validateCobuildResponse(response) {
  const problems = collectValidationProblems(response);
  return {
    ok: problems.length === 0,
    problems,
  };
}

function resolveExecutable(command) {
  if (process.env.CODE2LARK_CODEX_BIN && command === "codex") {
    return process.env.CODE2LARK_CODEX_BIN;
  }

  if (process.platform !== "win32") {
    return command;
  }

  const lookup = childProcess.spawnSync("where.exe", [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10000,
  });

  if (lookup.status !== 0) {
    return command;
  }

  const candidates = lookup.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return candidates.find((candidate) => candidate.toLowerCase().endsWith(".cmd")) ?? candidates[0] ?? command;
}

function validateFixtures() {
  const problems = [];

  if (!isReadableFile(promptPath)) {
    problems.push(`Missing fixture prompt: ${promptPath}`);
  }

  if (!isReadableFile(schemaPath)) {
    problems.push(`Missing fixture schema: ${schemaPath}`);
  }

  if (problems.length) {
    return { ok: false, problems };
  }

  let schema;
  let prompt;

  try {
    schema = readJsonFile(schemaPath);
  } catch (error) {
    problems.push(`Invalid schema JSON: ${error.message}`);
  }

  try {
    prompt = fs.readFileSync(promptPath, "utf8");
  } catch (error) {
    problems.push(`Invalid prompt text: ${error.message}`);
  }

  if (schema && schema.mode !== "cobuild") {
    problems.push(`Expected schema mode to be cobuild, got ${JSON.stringify(schema.mode)}`);
  }

  const promptChecks = [
    /mode:\s*-\s*cobuild/i,
    /ownership\s*_?\s*split/i,
    /minimal\s*_?\s*contract/i,
    /card\s*_?\s*designer|lark-card-designer/i,
    /no\s+target\s+writes/i,
    /no\s+secrets/i,
    /prepare\/confirm/i,
    /target_prepare_endpoint_required/i,
    /target_confirm_endpoint_required/i,
    /direct execute/i,
    /duplicate confirmation/i,
    /operator allowlist/i,
    /stale|forged preview/i,
    /terminal|already_processed/i,
    /\.codex/i,
    /integrations\/lark/i,
    /embedded[- ]long[- ]connection/i,
    /FEISHU_APP_ID/i,
    /FEISHU_APP_SECRET/i,
    /card\.action\.trigger/i,
  ];

  if (prompt && !promptChecks.every((pattern) => pattern.test(prompt))) {
    problems.push("Prompt text no longer contains expected static contract cues");
  }

  return {
    ok: problems.length === 0,
    problems,
    prompt,
    schema,
  };
}

function extractJsonCandidate(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, reason: "Empty text" };
  }

  if (trimmed.startsWith("{")) {
    return { ok: true, text: trimmed };
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return { ok: true, text: trimmed.slice(start, end + 1) };
  }

  const fencedMatch = trimmed.match(/```json([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const block = fencedMatch[1].trim();
    if (block.startsWith("{")) {
      return { ok: true, text: block };
    }
  }

  return { ok: false, reason: "No JSON object found" };
}

function parseResponseFromText(outputText) {
  const candidate = extractJsonCandidate(outputText);
  if (!candidate.ok) {
    throw new Error(`Unable to parse JSON from Codex output: ${candidate.reason}`);
  }

  const parsed = JSON.parse(candidate.text);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Codex output JSON is not an object");
  }

  return parsed;
}

function runCodexBlackBox(promptText, schemaText, tempDir) {
  const codexCommand = resolveExecutable("codex");
  const availability = runCommand(codexCommand, ["--version"]);
  if (!availability.ok) {
    return {
      status: "skipped",
      reason: "Codex command unavailable",
    };
  }

  const authCheck = runCommand(codexCommand, ["login", "status"]);
  const authText = `${authCheck.stdout}${authCheck.stderr}`.toLowerCase();
  const isAuthenticated = authCheck.ok && /logged\s+in|authenticated|api\s+key/.test(authText) && !/not\s+logged|please\s+login|no\s+login|no\s+session|unauthorized/.test(authText);

  if (!isAuthenticated) {
    return {
      status: "skipped",
      reason: "Codex login not detected",
      available: true,
      authChecked: true,
      authOutput: authText.trim(),
    };
  }

  const fullPrompt = [
    "Use the following prompt and schema as a black-box design task.",
    "Return JSON only that matches the provided schema.",
    "Do not install, configure, login, or mutate any services.",
    "Keep responses deterministic and safe. Never include real IDs, tokens, secrets, or secrets-like values.",
    "",
    "--- prompt ---",
    promptText,
    "\n--- schema ---",
    schemaText,
    "\n--- end ---",
  ].join("\n");

  const workspaceRoot = prepareCodexWorkspace(tempDir);
  const outputFile = path.join(tempDir, "codex-demo-response.json");
  const tempSchemaPath = path.join(workspaceRoot, "tests", "fixtures", "cobuild-demo-response.schema.json");

  const commandAttempts = [
    [
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--json",
      "--output-schema",
      tempSchemaPath,
      "--output-last-message",
      outputFile,
      "-C",
      workspaceRoot,
    ],
    [
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--sandbox",
      "read-only",
      "--json",
      "--output-schema",
      tempSchemaPath,
      "--output-last-message",
      outputFile,
      "-C",
      workspaceRoot,
    ],
    [
      "exec",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--json",
      "--output-last-message",
      outputFile,
      "-C",
      workspaceRoot,
    ],
  ];

  for (const args of commandAttempts) {
    const run = runCommand(codexCommand, args, fullPrompt);
    if (!run.ok) {
      const combined = `${run.stderr} ${run.stdout}`.toLowerCase();
      if (combined.includes("unknown option") || combined.includes("unrecognized option")) {
        continue;
      }

      if (combined.includes("401 unauthorized") || combined.includes("unauthorized") || combined.includes("please login") || combined.includes("not logged")) {
        return {
          status: "skipped",
          available: true,
          authChecked: true,
          reason: "Codex authentication was unavailable or rejected",
        };
      }

      return {
        status: "failed",
        available: true,
        authChecked: true,
        exitCode: run.exitCode,
        reason: "Codex exec failed before producing a validated response",
      };
    }

    if (!fs.existsSync(outputFile)) {
      continue;
    }

    const outputText = fs.readFileSync(outputFile, "utf8");
    if (!outputText.trim()) {
      return {
        status: "failed",
        available: true,
        authChecked: true,
        reason: "Codex output file was empty",
      };
    }

    return {
      status: "passed",
      available: true,
      authChecked: true,
      outputFile,
      exitCode: run.exitCode,
      command: [codexCommand, ...args],
      responseText: outputText,
    };
  }

  return {
    status: "skipped",
    available: true,
    authChecked: true,
    reason: "No compatible codex flag combination succeeded",
  };
}

function runStaticAndOptionalVerify(args, fixtureData) {
  const report = {
    verification_level: args.staticOnly ? "static-only" : "static-with-codex",
    runner: "run-cobuild-demo",
    static_validation: {
      status: fixtureData.ok ? "pass" : "fail",
      issues: fixtureData.problems,
      prompt: promptPath,
      schema: schemaPath,
    },
  };

  if (args.verifyResponsePath) {
    if (!isReadableFile(args.verifyResponsePath)) {
      report.response_validation = {
        status: "fail",
        issues: [`Verify file not found: ${args.verifyResponsePath}`],
      };
      return { report, exitCode: 1 };
    }

    let response;
    try {
      response = readJsonFile(args.verifyResponsePath);
    } catch (error) {
      report.response_validation = {
        status: "fail",
        issues: [`Invalid JSON in ${args.verifyResponsePath}: ${error.message}`],
      };
      return { report, exitCode: 1 };
    }

    const responseValidation = validateCobuildResponse(response);
    if (!fixtureData.ok) {
      report.response_validation = {
        status: "fail",
        issues: [...report.static_validation.issues, ...responseValidation.problems],
      };
      return { report, exitCode: 1 };
    }

    report.response_validation = {
      status: responseValidation.ok ? "pass" : "fail",
      issues: responseValidation.problems,
    };
    if (!responseValidation.ok) {
      return {
        report,
        exitCode: 1,
      };
    }

    return {
      report,
      exitCode: 0,
      response,
    };
  }

  return { report, exitCode: fixtureData.ok ? 0 : 1 };
}

function main() {
  let args;
  let preserveTemp = false;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cobuild-demo-"));

  try {
    try {
      args = parseArgs(process.argv.slice(2));
    } catch (error) {
      console.error(error.message);
      printUsage();
      process.exitCode = 1;
      return;
    }

    if (args.help) {
      printUsage();
      process.exitCode = 0;
      return;
    }

    const fixtureData = validateFixtures();
    const { report, exitCode: baseExitCode, response } = runStaticAndOptionalVerify(args, fixtureData);

    if (fixtureData.ok && !args.staticOnly && !args.verifyResponsePath && baseExitCode === 0) {
      const codex = runCodexBlackBox(fixtureData.prompt, JSON.stringify(fixtureData.schema, null, 2), tempDir);

      if (codex.status === "passed") {
        preserveTemp = true;
        let parsedResponse;
        try {
          parsedResponse = parseResponseFromText(codex.responseText);
        } catch (error) {
          report.external_agent_status = "failed";
          report.external_agent_error = {
            reason: error.message,
          };
          console.error("Failed to parse Codex JSON response.", error.message);
          console.log(JSON.stringify(report, null, 2));
          process.exitCode = 1;
          return;
        }

        const responseValidation = validateCobuildResponse(parsedResponse);
        report.external_agent_status = "passed";
        report.verification_level = "static+codex";
        report.codex = {
          availability: "available",
          auth: "authenticated",
          temp_dir: tempDir,
          output_file: codex.outputFile,
          exit_code: codex.exitCode,
          command: codex.command.join(" "),
        };
        report.codex_response_validation = {
          status: responseValidation.ok ? "pass" : "fail",
          issues: responseValidation.problems,
        };

        if (!responseValidation.ok) {
          console.error("Codex response failed validation.");
          console.log(JSON.stringify(report, null, 2));
          process.exitCode = 1;
          return;
        }

        report.response = parsedResponse;
      } else if (codex.status === "skipped") {
        report.external_agent_status = "skipped";
        report.verification_level = "static-only";
        report.codex = {
          availability: codex.available ? "available" : "unavailable",
          auth: codex.authChecked ? "unauthenticated" : "unknown",
          reason: codex.reason,
        };
      } else {
        preserveTemp = true;
        report.external_agent_status = "failed";
        report.external_agent_error = {
          reason: codex.reason,
          temp_dir: tempDir,
          output: codex.responseText || undefined,
          exit_code: codex.exitCode,
        };
        console.error("Codex validation failed:", codex.reason);
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = 1;
        return;
      }
    } else {
      report.external_agent_status = "skipped";
      report.codex = {
        availability: "not-run",
        reason: args.verifyResponsePath ? "verify-response mode" : "static-only mode",
      };
    }

    if (response) {
      report.response = response;
    }

    if (!report.external_agent_status) {
      report.external_agent_status = "not-run";
    }

    if (fixtureData.ok && report.external_agent_status === "skipped" && !args.staticOnly && !args.verifyResponsePath && report.codex?.auth === "unauthenticated") {
      report.external_agent_reason = "Codex unauthenticated";
    }

    console.log(JSON.stringify(report, null, 2));
    if (baseExitCode === 0 && (report.external_agent_status === "skipped" || report.external_agent_status === "passed")) {
      process.exitCode = 0;
    } else {
      process.exitCode = 1;
    }
  } finally {
    if (!preserveTemp) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup under OS temp only
      }
    }
  }
}

main();
