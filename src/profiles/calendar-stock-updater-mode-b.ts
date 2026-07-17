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
      test: "node --test *.test.mjs generated/sidecar-long-connection/local-contract-test.mjs",
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
  async function stop(signal) {
    if (stopping) return;
    stopping = true;
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
