import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJson, writeText } from "../fs-utils.js";
import type { ServiceManifest } from "../types.js";

interface InstallManifestFile {
  path: string;
  sha256: string;
  size: number;
}

export function writeCalendarModeBModule(packageDir: string, service: ServiceManifest): void {
  const moduleDir = path.join(packageDir, "integrations", "lark");
  const generatedDir = path.join(moduleDir, "generated");
  if (fs.existsSync(moduleDir)) fs.rmSync(moduleDir, { recursive: true, force: true });
  ensureDir(moduleDir);

  writeText(path.join(moduleDir, "app.js"), calendarModeBAppSource());
  writeText(path.join(moduleDir, "config.js"), calendarModeBConfigSource());
  writeText(path.join(moduleDir, "host.js"), calendarModeBHostSource());
  writeJson(path.join(moduleDir, "package.json"), {
    name: `${service.service.name}-lark-integration`,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      start: "node app.js",
      "verify:card": "node verify-card.mjs",
      test: "node --test *.test.mjs generated/sidecar-long-connection/local-contract-test.mjs && npm run verify:card",
    },
    dependencies: {
      "@larksuiteoapi/node-sdk": "1.71.1",
    },
  });
  writeText(path.join(moduleDir, ".gitignore"), ".env\nnode_modules/\n.code2lark-install.json\n");
  writeText(path.join(moduleDir, ".env.example"), calendarModeBEnvExample(service));
  writeText(path.join(moduleDir, "README.md"), calendarModeBReadme(service));
  writeText(path.join(moduleDir, "config.test.mjs"), calendarModeBConfigTestSource());
  writeText(path.join(moduleDir, "host.test.mjs"), calendarModeBHostTestSource());
  writeText(path.join(moduleDir, "host-local-confirmation.test.mjs"), calendarModeBConfirmationTestSource());
  writeText(path.join(moduleDir, "verify-card.mjs"), calendarModeBVerifyCardSource());

  copyDirectory(path.join(packageDir, "adapter"), path.join(generatedDir, "adapter"));
  copyDirectory(path.join(packageDir, "manifest"), path.join(generatedDir, "manifest"));
  copyDirectory(path.join(packageDir, "docs"), path.join(generatedDir, "docs"));
  copyDirectory(path.join(packageDir, "sidecar-long-connection"), path.join(generatedDir, "sidecar-long-connection"));

  writeJson(path.join(moduleDir, "install-manifest.json"), {
    schema_version: "0.1",
    package_kind: "code2lark-mode-b-module",
    target_profile: "calendar-stock-updater",
    install_root: "integrations/lark",
    target_contract: {
      health: { method: "GET", path: "/api/state" },
      allowed_endpoints: [
        { method: "GET", path: "/api/state" },
        { method: "POST", path: "/api/run" },
        { method: "POST", path: "/api/stop" },
      ],
    },
    files: listManagedFiles(moduleDir),
  });
}

function calendarModeBVerifyCardSource(): string {
  return `import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOperationsCard, buildRunConfirmationCard, buildStopConfirmationCard } from "./generated/adapter/cards.js";
import { createLarkHost } from "./host.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const sensitivePattern = /(?:app[_-]?secret|appSecret|authorization|bearer|cookie|\\bauth\\b|\\bsecret\\b|\\btoken\\b|password|credentials?|api[_-]?key|apiKey|access[_-]?key|accessKey|accessToken|private[_-]?key|privateKey|operator[_-]?open[_-]?id|operatorOpenId|open[_-]?chat[_-]?id|openChatId|test[_-]?chat[_-]?id|testChatId|message[_-]?id|messageId|open[_-]?message[_-]?id|openMessageId|raw[_-]?callback|rawCallback|\\b(?:ou|oc|om)_[A-Za-z0-9_-]+\\b|\\b(?:cli|msg)_[A-Za-z0-9_-]{8,}\\b|\\bsk-[A-Za-z0-9_-]{8,}\\b)/i;
const designOnlyFields = new Set(["note", "json_2_0_like", "elements", "sketch", "metadata", "design_notes"]);
const unsupportedRuntimeTags = new Map([
  ["action", "JSON 2.0 no longer supports tag action; place buttons directly in body.elements or inside column_set/column."],
  ["note", "JSON 2.0 runtime payloads must not use tag note; map design notes/footers to markdown or div."],
]);
const supportedTags = new Set(["markdown", "div", "column_set", "column", "table", "form", "input", "button", "hr", "img", "plain_text", "lark_md", "fallback_text", "standard_icon", "custom_icon"]);
const knownActions = new Set(["calendar.status.refresh", "calendar.task.dry-run", "calendar.task.run.prepare", "calendar.task.run.confirm", "calendar.task.run.cancel", "calendar.task.stop.prepare", "calendar.task.stop.confirm", "calendar.task.stop.cancel"]);

const startCard = buildOperationsCard({ defaults: { targetDate: "2026-01-01", stock: "100", stepDelayMs: "500", datePickerDelayMs: "500" }, task: { status: "idle" }, logs: ["ready"] });
const runConfirmationCard = buildRunConfirmationCard({ confirmationId: "confirmation-local", input: { targetDate: "2026-01-01", stock: "100", stepDelayMs: "500", datePickerDelayMs: "500" } });
const stopConfirmationCard = buildStopConfirmationCard({ confirmationId: "stop-local", task: { currentMessage: "running" } });
const samples = [
  { name: "start_card_send_message", kind: "send-message", payload: { msg_type: "interactive", content: JSON.stringify(startCard) } },
  { name: "run_confirmation_callback", kind: "callback-response", payload: { card: { type: "raw", data: runConfirmationCard } } },
  { name: "stop_confirmation_callback", kind: "callback-response", payload: { card: { type: "raw", data: stopConfirmationCard } } },
];

const checks = samples.flatMap((sample) => verifySample(sample));
checks.push(...await verifyHostRuntimeRouting());
const pass = checks.filter((check) => check.status === "pass").length;
const fail = checks.filter((check) => check.status === "fail").length;
const report = { schema_version: "0.1", generated_at: new Date().toISOString(), status: fail === 0 ? "pass" : "fail", summary: { pass, fail }, checks };
fs.writeFileSync(path.join(moduleDir, "card_verification_report.json"), JSON.stringify(report, null, 2) + "\\n", "utf8");
fs.writeFileSync(path.join(moduleDir, "card_verification_report.md"), renderMarkdownReport(report), "utf8");
for (const check of checks) console.log(check.status.toUpperCase() + " " + check.name + " - " + check.detail);
console.log("Card verification " + report.status.toUpperCase() + ": " + pass + " PASS / " + fail + " FAIL");
if (fail > 0) process.exitCode = 1;

function verifySample(sample) {
  if (sample.kind === "send-message") return verifySendMessage(sample.name, sample.payload);
  if (sample.kind === "callback-response") return verifyCallbackResponse(sample.name, sample.payload);
  return verifyCard(sample.name, sample.payload);
}

async function verifyHostRuntimeRouting() {
  const checks = [];
  const target = await startMockTarget();
  const subscriptions = new Map();
  const sentCards = [];
  const auditLines = [];
  const runtime = {
    subscribe(name, handler) { subscriptions.set(name, handler); },
    async connect() {},
    async disconnect() {},
    async sendInteractiveCard(chatId, card) { sentCards.push({ chatId, card }); return { messageId: "redacted" }; },
  };
  const config = {
    targetBaseUrl: target.baseUrl,
    targetTimeoutMs: 3000,
    targetWaitMs: 3000,
    testChatId: "test-chat",
    allowedOperatorOpenIds: ["operator-verified"],
  };
  const host = createLarkHost({ config, runtime, logger: { log(line) { auditLines.push(String(line)); } } });
  try {
    await host.start({ waitForTarget: true });
    checks.push(check("host:subscription:card-action-trigger", subscriptions.has("card.action.trigger"), "host must subscribe to card.action.trigger"));
    checks.push(check("host:start-card:sent", sentCards.length === 1, "host must send an initial interactive card through runtime"));
    if (sentCards[0]) checks.push(...verifySendMessage("host:start-card", { msg_type: "interactive", content: JSON.stringify(sentCards[0].card) }));
    const callback = subscriptions.get("card.action.trigger");
    checks.push(check("host:callback:handler-present", typeof callback === "function", "card.action.trigger callback handler must be registered"));
    if (typeof callback === "function") {
      const stateCallsBefore = target.stateCalls();
      const validResponse = await callback({
        header: { event_id: "event-refresh" },
        event: {
          action: { value: { action: "calendar.status.refresh" } },
          operator: { operator_id: { open_id: "operator-verified" } },
          context: { open_message_id: "message-redacted", open_chat_id: "chat-redacted" },
        },
      });
      checks.push(check("host:callback:routes-valid-action", target.stateCalls() > stateCallsBefore, "valid card.action.trigger payload must route to handler"));
      checks.push(...verifyCallbackResponse("host:callback:valid-response", validResponse));
      const runCallsBefore = target.runCalls();
      const unauthorizedResponse = await callback({
        header: { event_id: "event-unauthorized" },
        event: {
          action: { value: { action: "calendar.task.run.prepare" }, form_value: { targetDate: "2026-01-01", stock: "100", stepDelayMs: "500", datePickerDelayMs: "500" } },
          operator: { operator_id: { open_id: "operator-denied" } },
        },
      });
      checks.push(check("host:callback:unauthorized-no-target-mutation", target.runCalls() === runCallsBefore, "unauthorized action must not mutate target state"));
      checks.push(...verifyCallbackResponse("host:callback:unauthorized-response", unauthorizedResponse));
    }
    checks.push(check("host:logs:sanitized", !/operator-verified|operator-denied|test-chat|message-redacted|chat-redacted/.test(auditLines.join("\\n")), "host logs must not expose operators, chats, or message ids"));
  } catch (error) {
    checks.push(check("host:runtime-routing", false, error instanceof Error ? error.message : String(error)));
  } finally {
    await host.stop();
    await target.close();
  }
  return checks;
}

function verifySendMessage(name, payload) {
  const checks = [];
  const record = asRecord(payload);
  checks.push(check(name + ":send:object", Boolean(record), "send-message payload must be an object"));
  if (!record) return checks;
  checks.push(check(name + ":send:msg_type", record.msg_type === "interactive", "msg_type must be interactive"));
  checks.push(check(name + ":send:no-card-wrapper", !hasKey(record, "card"), "message send payload must not wrap content as card"));
  checks.push(check(name + ":send:content-string", typeof record.content === "string", "content must be a JSON string"));
  const card = typeof record.content === "string" ? parseJson(record.content) : undefined;
  checks.push(check(name + ":send:content-json", card !== undefined, "content must parse as JSON card data"));
  if (card !== undefined) checks.push(...verifyCard(name + ":send:content", card));
  checks.push(...verifySanitized(name + ":send", payload));
  return checks;
}

function verifyCallbackResponse(name, payload) {
  const checks = [];
  const record = asRecord(payload);
  checks.push(check(name + ":callback:object", Boolean(record), "callback response must be an object"));
  if (!record) return checks;
  const wrapper = asRecord(record.card);
  checks.push(check(name + ":callback:raw-wrapper", Boolean(wrapper) && wrapper.type === "raw", "card response must use card.type raw"));
  checks.push(check(name + ":callback:data-present", Boolean(wrapper) && hasKey(wrapper, "data"), "card response must include card.data"));
  if (wrapper && hasKey(wrapper, "data")) checks.push(...verifyCard(name + ":callback:data", wrapper.data));
  checks.push(...verifySanitized(name + ":callback", payload));
  return checks;
}

function verifyCard(name, payload) {
  const checks = [];
  const card = asRecord(payload);
  checks.push(check(name + ":card:object", Boolean(card), "card must be an object"));
  if (!card) return checks;
  checks.push(check(name + ":card:schema", card.schema === "2.0", "card.schema must be 2.0"));
  const header = asRecord(card.header);
  checks.push(check(name + ":card:header-title", Boolean(header && hasKey(header, "title")), "card.header.title must exist"));
  const body = asRecord(card.body);
  checks.push(check(name + ":card:body-elements", Boolean(body && Array.isArray(body.elements)), "card.body.elements must exist"));
  const designFieldChecks = verifyNoDesignFields(name, card, "$", true);
  checks.push(...designFieldChecks.length ? designFieldChecks : [check(name + ":design-fields", true, "production payload has no design-only fields")]);
  checks.push(...verifyRuntimeTags(name, card));
  checks.push(...verifyButtonBehaviors(name, card));
  checks.push(...verifySanitized(name + ":card", card));
  return checks;
}

function verifyRuntimeTags(name, card) {
  const taggedNodes = collectTaggedNodes(card);
  const failures = [];
  for (const node of taggedNodes) {
    const unsupportedDetail = unsupportedRuntimeTags.get(node.tag);
    if (unsupportedDetail) failures.push(check(name + ":tag:" + node.location + ":unsupported-runtime-tag", false, unsupportedDetail));
    else if (!supportedTags.has(node.tag)) failures.push(check(name + ":tag:" + node.location + ":supported", false, "unsupported Card JSON 2.0 runtime tag: " + node.tag));
  }
  return failures.length ? failures : [check(name + ":tags:supported-subset", true, "card uses the local Card JSON 2.0 runtime supported tag subset")];
}

function verifyButtonBehaviors(name, card) {
  const buttons = collectButtons(card);
  if (!buttons.length) return [check(name + ":buttons:present", true, "no callback buttons found; card can still be informational")];
  return buttons.flatMap((button, index) => {
    const behaviors = Array.isArray(button.behaviors) ? button.behaviors : [];
    const callbackActions = behaviors.flatMap((behavior) => {
      const behaviorRecord = asRecord(behavior);
      const value = behaviorRecord ? asRecord(behaviorRecord.value) : undefined;
      return behaviorRecord && behaviorRecord.type === "callback" && value && typeof value.action === "string" && value.action.trim()
        ? [value.action.trim()]
        : [];
    });
    const hasCallbackAction = callbackActions.length > 0;
    const unknownActions = callbackActions.filter((action) => !knownActions.has(action));
    return [
      check(name + ":button:" + index + ":callback-behavior", hasCallbackAction, "button must use behaviors callback with value.action"),
      check(name + ":button:" + index + ":no-legacy-value-only", !(hasKey(button, "value") && !hasCallbackAction), "button must not rely on legacy top-level value alone"),
      check(name + ":button:" + index + ":known-action", unknownActions.length === 0, unknownActions.length ? "button action must map to a known handler: " + unknownActions.join(", ") : "button action maps to a known handler"),
    ];
  });
}

function verifyNoDesignFields(name, value, location, root) {
  const record = asRecord(value);
  if (!record) return [];
  const checks = [];
  for (const [key, child] of Object.entries(record)) {
    const designOnly = designOnlyFields.has(key) && (root || key !== "elements");
    if (designOnly) checks.push(check(name + ":design-field:" + location + "." + key, false, "production payload must not include design-only field " + location + "." + key));
    if (Array.isArray(child)) child.forEach((item, index) => checks.push(...verifyNoDesignFields(name, item, location + "." + key + "[" + index + "]", false)));
    else if (asRecord(child)) checks.push(...verifyNoDesignFields(name, child, location + "." + key, false));
  }
  return checks;
}

function verifySanitized(name, value) {
  return [check(name + ":sanitized", !sensitivePattern.test(JSON.stringify(value)), "payload/report sample must not contain secrets, IDs, tokens, or raw callbacks")];
}

function collectButtons(value) {
  if (Array.isArray(value)) return value.flatMap((item) => collectButtons(item));
  const record = asRecord(value);
  if (!record) return [];
  const current = record.tag === "button" ? [record] : [];
  return current.concat(Object.values(record).flatMap((child) => collectButtons(child)));
}

function collectTaggedNodes(value, location = "$") {
  if (Array.isArray(value)) return value.flatMap((item, index) => collectTaggedNodes(item, location + "[" + index + "]"));
  const record = asRecord(value);
  if (!record) return [];
  const current = typeof record.tag === "string" ? [{ tag: record.tag, location }] : [];
  return current.concat(Object.entries(record).flatMap(([key, child]) => collectTaggedNodes(child, location + "." + key)));
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function hasKey(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    if (error instanceof Error && error.message) return undefined;
    return undefined;
  }
}

function check(name, passed, detail) {
  return { name, status: passed ? "pass" : "fail", detail };
}

function renderMarkdownReport(report) {
  return [
    "# Card Verification Report",
    "",
    "Status: " + report.status.toUpperCase(),
    "Summary: " + report.summary.pass + " PASS / " + report.summary.fail + " FAIL",
    "",
    "| Check | Status | Detail |",
    "|---|---|---|",
    ...report.checks.map((item) => "| " + escapeMarkdown(item.name) + " | " + item.status.toUpperCase() + " | " + escapeMarkdown(item.detail) + " |"),
    "",
  ].join("\\n");
}

function escapeMarkdown(value) {
  return String(value).replace(/\\|/g, "\\\\|");
}

async function startMockTarget() {
  let stateCalls = 0;
  let runCalls = 0;
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/api/state") {
      stateCalls += 1;
      return json(res, 200, { defaults: { targetDate: "2026-01-01", stock: "100", stepDelayMs: "500", datePickerDelayMs: "500" }, task: { status: "idle" }, logs: ["ready"] });
    }
    if (req.method === "POST" && req.url === "/api/run") {
      runCalls += 1;
      return read(req, (body) => json(res, 202, { ok: true, task: { status: "running" }, received: body }));
    }
    if (req.method === "POST" && req.url === "/api/stop") return read(req, () => json(res, 202, { ok: true, task: { status: "stopped" } }));
    json(res, 404, { error: "not found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    baseUrl: "http://127.0.0.1:" + server.address().port,
    stateCalls: () => stateCalls,
    runCalls: () => runCalls,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function read(req, done) {
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", () => done(raw ? JSON.parse(raw) : {}));
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
`;
}

function copyDirectory(source: string, target: string): void {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, target, { recursive: true, force: true });
}

function listManagedFiles(moduleDir: string): InstallManifestFile[] {
  return listFiles(moduleDir)
    .filter((filePath) => !["install-manifest.json", ".code2lark-install.json", ".env"].includes(path.basename(filePath)))
    .filter((filePath) => !filePath.split(path.sep).includes("node_modules"))
    .map((filePath) => {
      const contents = fs.readFileSync(filePath);
      return {
        path: path.relative(moduleDir, filePath).split(path.sep).join("/"),
        sha256: crypto.createHash("sha256").update(contents).digest("hex"),
        size: contents.length,
      };
    });
}

function listFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    return entry.isFile() ? [entryPath] : [];
  }).sort();
}

function calendarModeBEnvExample(service: ServiceManifest): string {
  return `# Feishu/Lark long-connection credentials
FEISHU_APP_ID=
FEISHU_APP_SECRET=
TEST_CHAT_ID=
ALLOWED_OPERATOR_OPEN_IDS=

# Existing calendar service; this module does not start or modify it
TARGET_BASE_URL=${service.service.base_url || "http://127.0.0.1:3069"}
TARGET_TIMEOUT_MS=30000
TARGET_WAIT_MS=30000
`;
}

function calendarModeBReadme(service: ServiceManifest): string {
  return `# ${service.service.name} Lark Integration

This directory is a self-contained Code2Lark Mode B module. It communicates with the unchanged calendar service over HTTP and can be removed as one directory.

## Boundary

- Target calls: GET /api/state, POST /api/run, and POST /api/stop only.
- Feishu ingress: SDK long connection with card.action.trigger.
- Run and stop confirmation state lives in this host, not in target endpoints.
- No target root package, startup, Docker, business, or Web UI changes are required.

## Configure And Start

\`\`\`powershell
Copy-Item .env.example .env
# Fill FEISHU_APP_ID, FEISHU_APP_SECRET, TEST_CHAT_ID, ALLOWED_OPERATOR_OPEN_IDS, TARGET_BASE_URL
npm install
npm test
npm start
\`\`\`

The start card hydrates form defaults from GET /api/state. The default form mirrors the target Web console: target date, stock, two delay values, and optional product ID range. Advanced environment-only SKU/date modes remain review candidates.

## Completion States

1. Generated: this module exists in the Code2Lark candidate package.
2. Dry-run reviewed: lark-deployer install validated the live target, file hashes, and planned writes without modifying the target.
3. Locally installed and verified: install --apply wrote only integrations/lark and local tests passed.

Real Feishu verification is separate. It requires a real app, long-connection subscription, test chat, card send, human clicks, and sanitized evidence.

## Local Checks

\`\`\`powershell
npm test
node generated/sidecar-long-connection/local-contract-test.mjs
\`\`\`

## Manual Cleanup

Stop the module and remove the complete integrations/lark directory. A compliant install does not require any target root cleanup.
`;
}

function calendarModeBAppSource(): string {
  return `import { loadLarkConfig } from "./config.js";
import { createLarkHost } from "./host.js";

async function main() {
  const config = loadLarkConfig();
  const host = createLarkHost({ config });
  let stopping = false;
  const keepAlive = setInterval(() => {}, 60 * 60 * 1000);
  async function stop(signal) {
    if (stopping) return;
    stopping = true;
    clearInterval(keepAlive);
    console.log("lark long connection stopping: " + signal);
    await host.stop();
    process.exit(0);
  }
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
  await host.start({ waitForTarget: true });
}

main().catch((error) => {
  console.error("lark long connection failed: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
`;
}

function calendarModeBConfigSource(): string {
  return `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const requiredKeys = ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "TEST_CHAT_ID", "TARGET_BASE_URL", "ALLOWED_OPERATOR_OPEN_IDS"];

export function parseAllowedOperatorOpenIds(value = "") {
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

export function loadLarkConfig(options = {}) {
  const env = options.env ? { ...options.env } : { ...readDotEnv(path.join(options.moduleDir || moduleDir, ".env")), ...process.env };
  const missing = requiredKeys.filter((key) => !String(env[key] || "").trim());
  if (missing.length) throw new Error("Missing required Lark config: " + missing.join(", "));
  const allowedOperatorOpenIds = parseAllowedOperatorOpenIds(env.ALLOWED_OPERATOR_OPEN_IDS);
  if (!allowedOperatorOpenIds.length) throw new Error("ALLOWED_OPERATOR_OPEN_IDS must include at least one approved operator.");
  return {
    appId: String(env.FEISHU_APP_ID).trim(),
    appSecret: String(env.FEISHU_APP_SECRET).trim(),
    testChatId: String(env.TEST_CHAT_ID).trim(),
    targetBaseUrl: normalizeBaseUrl(env.TARGET_BASE_URL),
    targetTimeoutMs: parsePositiveInteger(env.TARGET_TIMEOUT_MS, 30000, "TARGET_TIMEOUT_MS"),
    targetWaitMs: parsePositiveInteger(env.TARGET_WAIT_MS, 30000, "TARGET_WAIT_MS"),
    allowedOperatorOpenIds,
  };
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim().replace(/\\/+$/, "");
  try {
    const parsed = new URL(text);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) throw new Error("invalid protocol");
    if (parsed.username || parsed.password) throw new Error("embedded credentials");
    return parsed.toString().replace(/\\/+$/, "");
  } catch {
    throw new Error("TARGET_BASE_URL must be an absolute http(s) URL without embedded credentials.");
  }
}

function parsePositiveInteger(value, fallback, name) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (!/^\\d+$/.test(text) || Number(text) <= 0) throw new Error(name + " must be a positive integer.");
  return Number(text);
}

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\\r?\\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key) env[key] = value;
  }
  return env;
}
`;
}

function calendarModeBHostSource(): string {
  return `import { buildOperationsCard } from "./generated/adapter/cards.js";
import { handleCardAction } from "./generated/adapter/handlers.js";
import { callCalendar } from "./generated/adapter/service-client.js";

export function normalizeCardActionEvent(payload = {}) {
  const event = payload.event || payload;
  const header = payload.header || event.header || {};
  const actionPayload = event.action || {};
  const actionValue = toObject(actionPayload.value);
  const operator = event.operator || {};
  const operatorId = operator.operator_id || operator.operatorId || {};
  const context = event.context || {};
  return {
    eventId: stringOrUndefined(header.event_id || header.eventId || event.event_id),
    action: String(actionValue.action || actionValue.action_id || actionPayload.action_id || ""),
    value: actionValue,
    formValue: toObject(actionPayload.form_value || actionPayload.formValue || actionValue.formValue),
    operatorOpenId: stringOrUndefined(operatorId.open_id || operator.open_id || operator.openId),
    openMessageId: stringOrUndefined(context.open_message_id || context.openMessageId || event.open_message_id),
    openChatId: stringOrUndefined(context.open_chat_id || context.openChatId || event.open_chat_id),
  };
}

export function createLarkHost({ config, runtime = null, sdk = null, logger = console } = {}) {
  if (!config) throw new Error("config is required");
  let activeRuntime = runtime;
  const handled = new Map();

  async function handleCardActionEvent(payload) {
    const context = normalizeCardActionEvent(payload);
    const key = context.eventId || [context.openMessageId, context.operatorOpenId, context.action, JSON.stringify(context.value), JSON.stringify(context.formValue)].join(":");
    if (handled.has(key)) return handled.get(key);
    const pending = handleCardAction(context, {
      targetBaseUrl: config.targetBaseUrl,
      timeoutMs: config.targetTimeoutMs,
      allowedOperatorOpenIds: config.allowedOperatorOpenIds,
    });
    handled.set(key, pending);
    const result = await pending;
    handled.set(key, Promise.resolve(result));
    setTimeout(() => handled.delete(key), 10 * 60 * 1000).unref?.();
    for (const event of result.auditEvents || []) logger.log?.("[lark audit] " + JSON.stringify(redactAuditEvent(event)));
    return result;
  }

  async function start(options = {}) {
    logger.log?.("lark long connection starting");
    const initialState = options.waitForTarget
      ? await waitForTarget(config, logger)
      : await callCalendar(config.targetBaseUrl, "GET", "/api/state", null, config.targetTimeoutMs);
    if (!activeRuntime) activeRuntime = await createFeishuRuntime(config, sdk);
    activeRuntime.subscribe("card.action.trigger", async (event) => {
      const result = await handleCardActionEvent(event);
      return { card: { type: "raw", data: result.card } };
    });
    await activeRuntime.connect();
    if (config.testChatId) await activeRuntime.sendInteractiveCard(config.testChatId, buildOperationsCard(initialState));
    logger.log?.("lark long connection online");
  }

  async function stop() {
    if (activeRuntime) await activeRuntime.disconnect();
  }

  return { handleCardActionEvent, start, stop };
}

export async function waitForTarget(config, logger = console) {
  const deadline = Date.now() + config.targetWaitMs;
  let lastError = null;
  while (Date.now() <= deadline) {
    try {
      const state = await callCalendar(config.targetBaseUrl, "GET", "/api/state", null, Math.min(config.targetTimeoutMs, 2000));
      logger.log?.("calendar service ready");
      return state;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Target calendar service is not reachable at " + config.targetBaseUrl + "/api/state: " + (lastError instanceof Error ? lastError.message : "timeout"));
}

export async function createFeishuRuntime(config, injectedSdk = null) {
  const lark = injectedSdk || await import("@larksuiteoapi/node-sdk");
  const client = new lark.Client({ appId: config.appId, appSecret: config.appSecret });
  const handlers = new Map();
  const wsClient = new lark.WSClient({ appId: config.appId, appSecret: config.appSecret });
  return {
    subscribe(eventName, handler) { handlers.set(eventName, handler); },
    async connect() {
      const cardHandler = handlers.get("card.action.trigger");
      const dispatcher = new lark.EventDispatcher({}).register({ "card.action.trigger": cardHandler });
      await wsClient.start({ eventDispatcher: dispatcher });
    },
    async disconnect() {
      const close = wsClient.shutdown || wsClient.stop || wsClient.close;
      if (typeof close === "function") await close.call(wsClient);
    },
    async sendInteractiveCard(chatId, card) {
      const response = await client.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: { receive_id: chatId, msg_type: "interactive", content: JSON.stringify(card) },
      });
      return { messageId: response?.data?.message_id || response?.data?.messageId || "" };
    },
  };
}

function toObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function stringOrUndefined(value) { return value == null ? undefined : String(value); }
function redactAuditEvent(event) {
  const detail = event && event.detail && typeof event.detail === "object" ? event.detail : {};
  return {
    event: event.event,
    detail: {
      action: String(detail.action || ""),
      message: detail.message ? String(detail.message).slice(0, 180) : undefined,
      operator_present: Boolean(detail.operator_open_id),
      chat_present: Boolean(detail.chat_id),
    },
  };
}
`;
}

function calendarModeBConfigTestSource(): string {
  return `import assert from "node:assert/strict";
import test from "node:test";
import { loadLarkConfig, parseAllowedOperatorOpenIds } from "./config.js";

test("module-local config requires credentials, target, chat, and operator allowlist", () => {
  assert.throws(() => loadLarkConfig({ env: { TARGET_BASE_URL: "http://127.0.0.1:3069" } }), /FEISHU_APP_ID/);
});

test("module-local config normalizes values", () => {
  const config = loadLarkConfig({ env: {
    FEISHU_APP_ID: "cli_test",
    FEISHU_APP_SECRET: "secret_test",
    TEST_CHAT_ID: "oc_test",
    TARGET_BASE_URL: "http://127.0.0.1:3069/",
    ALLOWED_OPERATOR_OPEN_IDS: "ou_a, ou_b",
  } });
  assert.equal(config.targetBaseUrl, "http://127.0.0.1:3069");
  assert.deepEqual(config.allowedOperatorOpenIds, ["ou_a", "ou_b"]);
  assert.deepEqual(parseAllowedOperatorOpenIds(" ou_a, ,ou_b "), ["ou_a", "ou_b"]);
});

test("module-local config rejects target URLs with embedded credentials", () => {
  assert.throws(() => loadLarkConfig({ env: {
    FEISHU_APP_ID: "cli_test",
    FEISHU_APP_SECRET: "secret_test",
    TEST_CHAT_ID: "oc_test",
    TARGET_BASE_URL: "http://user:password@127.0.0.1:3069",
    ALLOWED_OPERATOR_OPEN_IDS: "ou_a",
  } }), /without embedded credentials/);
});

test("module-local config rejects an effectively empty operator allowlist", () => {
  assert.throws(() => loadLarkConfig({ env: {
    FEISHU_APP_ID: "cli_test",
    FEISHU_APP_SECRET: "secret_test",
    TEST_CHAT_ID: "oc_test",
    TARGET_BASE_URL: "http://127.0.0.1:3069",
    ALLOWED_OPERATOR_OPEN_IDS: " , , ",
  } }), /at least one approved operator/);
});
`;
}

function calendarModeBHostTestSource(): string {
  return `import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createLarkHost, normalizeCardActionEvent } from "./host.js";

test("normalizeCardActionEvent preserves event, action, form, operator, and context", () => {
  assert.deepEqual(normalizeCardActionEvent({
    header: { event_id: "evt_1" },
    event: {
      action: { value: { action: "calendar.status.refresh" }, form_value: { stock: "100" } },
      operator: { operator_id: { open_id: "ou_operator" } },
      context: { open_message_id: "om_1", open_chat_id: "oc_1" },
    },
  }), {
    eventId: "evt_1",
    action: "calendar.status.refresh",
    value: { action: "calendar.status.refresh" },
    formValue: { stock: "100" },
    operatorOpenId: "ou_operator",
    openMessageId: "om_1",
    openChatId: "oc_1",
  });
});

test("host hydrates the start card and returns a raw callback envelope", async (t) => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ defaults: { targetDate: "2026-10-01", stock: "100" }, task: { status: "idle" }, logs: [] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = "http://127.0.0.1:" + server.address().port;
  const calls = [];
  let callback;
  const runtime = {
    subscribe(name, handler) { calls.push(["subscribe", name]); callback = handler; },
    async connect() { calls.push(["connect"]); },
    async disconnect() { calls.push(["disconnect"]); },
    async sendInteractiveCard(chatId, card) { calls.push(["send", chatId, JSON.stringify(card).includes("2026-10-01")]); },
  };
  const config = { targetBaseUrl: baseUrl, targetTimeoutMs: 2000, targetWaitMs: 2000, testChatId: "oc_test", allowedOperatorOpenIds: ["ou_operator"] };
  const auditLines = [];
  const host = createLarkHost({ config, runtime, logger: { log(line) { auditLines.push(String(line)); } } });
  await host.start({ waitForTarget: true });
  const response = await callback({ header: { event_id: "evt_refresh" }, event: { action: { value: { action: "calendar.status.refresh" } }, operator: { operator_id: { open_id: "ou_operator" } } } });
  assert.equal(response.card.type, "raw");
  assert.deepEqual(calls.slice(0, 3), [["subscribe", "card.action.trigger"], ["connect"], ["send", "oc_test", true]]);
  assert.doesNotMatch(auditLines.join("\\n"), /ou_operator|oc_test/);
  await host.stop();
});
`;
}

function calendarModeBConfirmationTestSource(): string {
  return `import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { handleCardAction } from "./generated/adapter/handlers.js";

test("host-local confirmation gates run and stop target calls", async (t) => {
  const externalBaseUrl = process.env.CALENDAR_TARGET_BASE_URL || "";
  const local = externalBaseUrl ? null : await startLocalTarget(t);
  const targetBaseUrl = externalBaseUrl || local.baseUrl;
  const operatorOpenId = "ou_mode_b_operator";
  const deps = { targetBaseUrl, timeoutMs: 3000, allowedOperatorOpenIds: [operatorOpenId] };
  const formValue = { targetDate: "2026-10-01", stock: "100", stepDelayMs: "500", datePickerDelayMs: "500", startProductId: "", endProductId: "" };

  const invalid = await handleCardAction({ action: "calendar.task.run.prepare", formValue: { ...formValue, targetDate: "bad-date" }, operatorOpenId }, deps);
  assert.equal(invalid.ok, false);
  const prepared = await handleCardAction({ action: "calendar.task.run.prepare", formValue, operatorOpenId }, deps);
  assert.equal(prepared.ok, true);
  const runConfirmationId = prepared.result.confirmationId;
  assert.ok(runConfirmationId);

  const wrongOperator = await handleCardAction({ action: "calendar.task.run.confirm", value: { confirmationId: runConfirmationId }, operatorOpenId: "ou_other" }, { ...deps, allowedOperatorOpenIds: [operatorOpenId, "ou_other"] });
  assert.equal(wrongOperator.ok, false);
  const confirmed = await handleCardAction({ action: "calendar.task.run.confirm", value: { confirmationId: runConfirmationId }, operatorOpenId }, deps);
  assert.equal(confirmed.ok, true);
  const duplicate = await handleCardAction({ action: "calendar.task.run.confirm", value: { confirmationId: runConfirmationId }, operatorOpenId }, deps);
  assert.equal(duplicate.ok, false);

  const stopPrepared = await handleCardAction({ action: "calendar.task.stop.prepare", operatorOpenId }, deps);
  assert.equal(stopPrepared.ok, true);
  const stopConfirmationId = stopPrepared.result.confirmationId;
  const stopped = await handleCardAction({ action: "calendar.task.stop.confirm", value: { confirmationId: stopConfirmationId }, operatorOpenId }, deps);
  assert.equal(stopped.ok, true);
  const duplicateStop = await handleCardAction({ action: "calendar.task.stop.confirm", value: { confirmationId: stopConfirmationId }, operatorOpenId }, deps);
  assert.equal(duplicateStop.ok, false);
});

async function startLocalTarget(t) {
  let running = false;
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/api/state") return json(res, 200, state());
    if (req.method === "POST" && req.url === "/api/run") return read(req, (body) => { running = true; json(res, 202, { ok: true, task: state().task, received: body }); });
    if (req.method === "POST" && req.url === "/api/stop") return read(req, () => { running = false; json(res, 202, { ok: true, task: state().task }); });
    json(res, 404, { error: "not found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  function state() {
    return { defaults: { targetDate: "2026-10-01", stock: "100", stepDelayMs: "500", datePickerDelayMs: "500" }, task: { status: running ? "running" : "idle", pid: running ? 1234 : null, currentMessage: running ? "running" : "ready" }, logs: [] };
  }
  return { baseUrl: "http://127.0.0.1:" + server.address().port };
}

function read(req, done) { let raw = ""; req.on("data", (chunk) => { raw += chunk; }); req.on("end", () => done(raw ? JSON.parse(raw) : {})); }
function json(res, status, body) { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); }
`;
}
