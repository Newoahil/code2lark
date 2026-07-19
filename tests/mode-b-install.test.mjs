import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "dist", "index.js");

test("calendar Mode B offline generation is isolated and emits the approved Lark closure", { timeout: 120_000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-mode-b-generate-"));
  const target = path.join(temp, "calendar-stock-updater");
  const workspace = path.join(temp, "analysis");
  const generated = path.join(temp, "generated", "calendar-stock-updater-lark");
  writeCalendarTarget(target);
  const before = snapshotTree(target);

  const analyzeOutput = await runCli(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace]);
  assert.match(analyzeOutput, /calendar_stock_updater|calendar-stock-updater/i);
  const generateOutput = await runCli(["generate", workspace, "--out", generated, "--mode", "embedded-adapter", "--host-mode", "embedded-long-connection"]);
  assert.match(generateOutput, /generated|calendar|lark/i);

  assert.deepEqual(snapshotTree(target), before, "offline analyze/generate must not write into the target project");
  assert.ok(fs.existsSync(path.join(generated, "integrations", "lark")), "generated package must include integrations/lark");
  assert.equal(fs.existsSync(path.join(generated, "integrations", "lark", "node_modules")), false);
  const moduleRoot = path.join(generated, "integrations", "lark");
  const moduleReadme = fs.readFileSync(path.join(moduleRoot, "README.md"), "utf8");
  const moduleApp = fs.readFileSync(path.join(moduleRoot, "app.js"), "utf8");
  const modulePackage = readJson(path.join(moduleRoot, "package.json"));
  assert.match(moduleReadme, /Generated:/);
  assert.match(moduleReadme, /Dry-run reviewed:/);
  assert.match(moduleReadme, /Locally installed and verified:/);
  assert.match(moduleReadme, /Real Feishu verification is separate/);
  assert.match(moduleApp, /setInterval\(\(\) => \{\}, 60 \* 60 \* 1000\)/, "long-connection host app must keep the Node process alive after start");
  assert.match(moduleApp, /clearInterval\(keepAlive\)/, "long-connection host app must clear keepalive during shutdown");
  assert.ok(fs.existsSync(path.join(moduleRoot, ".env.example")));
  assert.equal(modulePackage.dependencies["@larksuiteoapi/node-sdk"], "1.71.1");

  const capabilityMap = readJson(path.join(generated, "manifest", "capability_map.json"));
  assert.deepEqual(capabilityPaths(capabilityMap), ["/api/run", "/api/state", "/api/stop"]);
  assert.doesNotMatch(JSON.stringify(capabilityMap), /\/api\/(run|stop)\/prepare|\/api\/(run|stop)\/confirm/);

  const handoff = path.join(temp, "handoff");
  const handoffOutput = await runCli(["handoff", generated, "--copy-to", handoff, "--check"]);
  assert.match(handoffOutput, /Handoff check passed/);
  assert.ok(fs.existsSync(path.join(handoff, "integrations", "lark", "install-manifest.json")));
});

test("calendar Mode B install defaults to dry-run and writes nothing", { timeout: 120_000 }, async () => {
  const { generated, target, close } = await createGeneratedCalendarPackage();
  try {
    const before = snapshotTree(target);
    const output = await runCli(["install", generated, "--target", target]);
    assert.match(output, /dry[- ]run/i);
    assert.match(output, /integrations[\\/]lark/i);
    assert.deepEqual(snapshotTree(target), before, "install without --apply must not write target files");
  } finally {
    await close();
  }
});

test("calendar Mode B install --apply writes only integrations/lark and preserves target root hashes", { timeout: 120_000 }, async () => {
  const { generated, target, targetBaseUrl, close } = await createGeneratedCalendarPackage();
  try {
    const beforeRootHashes = hashRootFiles(target);
    const output = await runCli(["install", generated, "--target", target, "--target-base-url", targetBaseUrl, "--apply"]);
    assert.match(output, /appl(?:y|ied)|installed/i);
    assert.ok(fs.existsSync(path.join(target, "integrations", "lark")), "apply must install the managed Lark closure");
    assert.deepEqual(hashRootFiles(target), beforeRootHashes, "root project files must not be rewritten by apply");
    assert.deepEqual(nonIntegrationChanges(target, beforeRootHashes), []);
  } finally {
    await close();
  }
});

test("calendar Mode B install --apply blocks on unreachable target before writes", { timeout: 120_000 }, async () => {
  const { generated, target, close } = await createGeneratedCalendarPackage();
  try {
    const before = snapshotTree(target);
    const output = await runCliExpectFailure(["install", generated, "--target", target, "--target-base-url", "http://127.0.0.1:1", "--apply"]);
    assert.match(output, /unreachable|health|\/api\/state|target/i);
    assert.deepEqual(snapshotTree(target), before, "unreachable health gate must block before any target writes");
  } finally {
    await close();
  }
});

test("calendar Mode B install rejects generated module paths that contain links before target writes", { timeout: 120_000 }, async (t) => {
  const { generated, target, targetBaseUrl, close } = await createGeneratedCalendarPackage();
  try {
    const moduleGeneratedRoot = path.join(generated, "integrations", "lark", "generated");
    const linkPath = path.join(moduleGeneratedRoot, "adapter");
    const realPath = path.join(moduleGeneratedRoot, "adapter-real");
    fs.renameSync(linkPath, realPath);
    if (!createDirectoryLinkOrSkip(t, realPath, linkPath)) return;

    const before = snapshotTree(target);
    const output = await runCliExpectFailure(["install", generated, "--target", target, "--target-base-url", targetBaseUrl, "--apply"]);
    assert.match(output, /symbolic links|link/i);
    assert.deepEqual(snapshotTree(target), before, "generated package links must be rejected before target writes");
  } finally {
    await close();
  }
});

test("calendar Mode B install rejects target integrations/lark links in dry-run and apply before writes", { timeout: 120_000 }, async (t) => {
  const { generated, target, targetBaseUrl, close } = await createGeneratedCalendarPackage();
  try {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-mode-b-outside-"));
    fs.writeFileSync(path.join(outside, "OUTSIDE_SENTINEL.txt"), "outside sentinel\n", "utf8");
    fs.mkdirSync(path.join(target, "integrations"), { recursive: true });
    const targetLink = path.join(target, "integrations", "lark");
    if (!createDirectoryLinkOrSkip(t, outside, targetLink)) return;

    const beforeTarget = snapshotTree(target);
    const beforeRootHashes = hashRootFiles(target);
    const beforeOutside = snapshotTree(outside);
    const dryRunOutput = await runCliExpectFailure(["install", generated, "--target", target, "--target-base-url", targetBaseUrl]);
    assert.match(dryRunOutput, /symbolic links|link/i);
    assert.deepEqual(snapshotTree(target), beforeTarget, "dry-run link rejection must not write target files");
    assert.deepEqual(hashRootFiles(target), beforeRootHashes, "dry-run link rejection must not rewrite target root files");
    assert.equal(fs.lstatSync(targetLink).isSymbolicLink(), true, "dry-run link rejection must leave integrations/lark as a link");
    assert.deepEqual(snapshotTree(outside), beforeOutside, "dry-run link rejection must not touch linked outside directory");

    const applyOutput = await runCliExpectFailure(["install", generated, "--target", target, "--target-base-url", targetBaseUrl, "--apply"]);
    assert.match(applyOutput, /symbolic links|link/i);
    assert.deepEqual(snapshotTree(target), beforeTarget, "apply link rejection must not write target files");
    assert.deepEqual(hashRootFiles(target), beforeRootHashes, "apply link rejection must not rewrite target root files");
    assert.equal(fs.lstatSync(targetLink).isSymbolicLink(), true, "apply link rejection must leave integrations/lark as a link");
    assert.deepEqual(snapshotTree(outside), beforeOutside, "apply link rejection must not touch linked outside directory");
  } finally {
    await close();
  }
});

test("calendar Mode B install detects managed-file checksum conflicts and preserves local edits", { timeout: 120_000 }, async () => {
  const { generated, target, targetBaseUrl, close } = await createGeneratedCalendarPackage();
  try {
    await runCli(["install", generated, "--target", target, "--target-base-url", targetBaseUrl, "--apply"]);
    const managedFile = findInstalledLarkFile(target);
    const localEdit = `${fs.readFileSync(managedFile, "utf8")}\n// local operator edit must survive\n`;
    fs.writeFileSync(managedFile, localEdit, "utf8");

    const output = await runCliExpectFailure(["install", generated, "--target", target, "--target-base-url", targetBaseUrl, "--apply"]);
    assert.match(output, /checksum|conflict|modified|managed/i);
    assert.equal(fs.readFileSync(managedFile, "utf8"), localEdit);
  } finally {
    await close();
  }
});

test("calendar Mode B strict verify rejects target prepare endpoints in capability_map", { timeout: 120_000 }, async () => {
  const { generated, close } = await createGeneratedCalendarPackage();
  try {
    const capabilityMapPath = path.join(generated, "manifest", "capability_map.json");
    const capabilityMap = readJson(capabilityMapPath);
    capabilityMap.capabilities.push({
      id: "calendar.task.run.prepare",
      name: "Invalid target prepare endpoint",
      kind: "action",
      risk: "write",
      source: { type: "http", method: "POST", path: "/api/run/prepare", content_type: "application/json" },
      input_schema: { type: "object", properties: {} },
      output_schema: { type: "object", additionalProperties: true },
      artifacts: [],
      timeout_seconds: 30,
    });
    fs.writeFileSync(capabilityMapPath, `${JSON.stringify(capabilityMap, null, 2)}\n`, "utf8");

    const output = await runCliExpectFailure(["verify", generated, "--mode", "embedded-adapter", "--strict"]);
    assert.match(output, /\/api\/run\/prepare|strict|capability/i);
  } finally {
    await close();
  }
});

test("calendar Mode B install rejects a self-consistent module that diverges from package source of truth", { timeout: 120_000 }, async () => {
  const { generated, target, targetBaseUrl, close } = await createGeneratedCalendarPackage();
  try {
    const moduleRoot = path.join(generated, "integrations", "lark");
    const relativePath = "generated/adapter/handlers.js";
    const moduleFile = path.join(moduleRoot, ...relativePath.split("/"));
    fs.appendFileSync(moduleFile, "\n// tampered module copy\n", "utf8");
    const installManifestPath = path.join(moduleRoot, "install-manifest.json");
    const installManifest = readJson(installManifestPath);
    const entry = installManifest.files.find((file) => file.path === relativePath);
    assert.ok(entry);
    entry.sha256 = sha256(moduleFile);
    entry.size = fs.statSync(moduleFile).size;
    fs.writeFileSync(installManifestPath, `${JSON.stringify(installManifest, null, 2)}\n`, "utf8");

    const output = await runCliExpectFailure(["install", generated, "--target", target, "--target-base-url", targetBaseUrl]);
    assert.match(output, /source of truth|differs from package/i);
    assert.equal(fs.existsSync(path.join(target, "integrations", "lark")), false);
  } finally {
    await close();
  }
});

test("generated calendar host-local confirmation test guards prepare, confirm idempotency, and stop semantics", { timeout: 120_000 }, async (t) => {
  const { generated, close } = await createGeneratedCalendarPackage();
  const mockTarget = await startMockCalendarTarget();
  t.after(async () => {
    await mockTarget.close();
  });
  try {
    const localTestPath = path.join(generated, "integrations", "lark", "host-local-confirmation.test.mjs");
    assert.ok(fs.existsSync(localTestPath), "generated integrations/lark host-local confirmation test must exist");
    const output = await runNode(["--test", localTestPath], {
      CALENDAR_TARGET_BASE_URL: mockTarget.baseUrl,
      CALENDAR_ALLOWED_OPERATOR_OPEN_IDS: "ou_mode_b_operator",
    });
    assert.match(output, /pass|ok|confirm/i);

    assert.equal(mockTarget.runCalls.length, 1, "prepare and duplicate confirm must not create extra /api/run calls");
    assert.equal(mockTarget.runCalls[0]?.mode, "run");
    assert.equal(mockTarget.stopCalls.length, 1, "stop confirmation must call /api/stop once after confirm");
    assert.equal(mockTarget.prepareCalls, 0, "host-local prepare must not call invented target prepare endpoints");
    assert.equal(mockTarget.confirmCalls, 0, "host-local confirm must not call invented target confirm endpoints");
  } finally {
    await close();
  }
});

test("generated calendar adapter rejects unauthorized refresh before reading target state", { timeout: 120_000 }, async (t) => {
  const { generated, close } = await createGeneratedCalendarPackage();
  const mockTarget = await startMockCalendarTarget();
  t.after(async () => {
    await mockTarget.close();
  });
  try {
    const driverPath = path.join(generated, "unauthorized-refresh-check.mjs");
    fs.writeFileSync(driverPath, [
      "import assert from 'node:assert/strict';",
      "import { handleCardAction } from './integrations/lark/generated/adapter/handlers.js';",
      "const result = await handleCardAction(",
      "  { action: 'calendar.status.refresh', operatorOpenId: 'ou_unapproved' },",
      "  { targetBaseUrl: process.env.CALENDAR_TARGET_BASE_URL, timeoutMs: 3000, allowedOperatorOpenIds: ['ou_approved'] },",
      ");",
      "assert.equal(result.ok, false);",
      "assert.match(JSON.stringify(result.card), /not authorized|not allowed|未授权|未获授权/i);",
      "console.log('unauthorized refresh blocked');",
      "",
    ].join("\n"), "utf8");

    const stateCallsBefore = mockTarget.stateCalls;
    const output = await runNode([driverPath], { CALENDAR_TARGET_BASE_URL: mockTarget.baseUrl });
    assert.match(output, /unauthorized refresh blocked/);
    assert.equal(mockTarget.stateCalls, stateCallsBefore, "unauthorized refresh must not call GET /api/state");
  } finally {
    await close();
  }
});

async function createGeneratedCalendarPackage() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-mode-b-package-"));
  const target = path.join(temp, "calendar-stock-updater");
  const workspace = path.join(temp, "analysis");
  const generated = path.join(temp, "generated", "calendar-stock-updater-lark");
  const mockTarget = await startMockCalendarTarget();
  writeCalendarTarget(target);
  await runCli(["analyze", target, "--base-url", mockTarget.baseUrl, "--out", workspace]);
  await runCli(["generate", workspace, "--out", generated, "--mode", "embedded-adapter", "--host-mode", "embedded-long-connection"]);
  return {
    generated,
    target,
    targetBaseUrl: mockTarget.baseUrl,
    close: mockTarget.close,
  };
}

function writeCalendarTarget(target) {
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "MODE_B_ROOT_SENTINEL.txt"), "calendar target root sentinel\n", "utf8");
  fs.writeFileSync(path.join(target, "package.json"), `${JSON.stringify({ type: "module", scripts: { start: "node server.js" } }, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(target, "update-calendar-stock.js"),
    [
      "export const CALENDAR_STOCK_UPDATER_MARKER = true;",
      "export async function updateAllSkuRows() {",
      "  return { updated: 0 };",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(target, "task-config.js"),
    [
      "export function resolveProductIdRange(input = {}) {",
      "  return { startId: Number(input.startId || 1000), endId: Number(input.endId || 1001) };",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(target, "server.js"),
    [
      "import http from 'node:http';",
      "const server = http.createServer((req, res) => {",
      "  const url = new URL(req.url || '/', 'http://127.0.0.1');",
      "  if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, { ok: true, running: false, task: null, logs: [] });",
      "  if (req.method === 'GET' && url.pathname === '/api/events') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('event: ready\\ndata: {}\\n\\n'); return; }",
      "  if (req.method === 'POST' && url.pathname === '/api/run') return readJson(req, (body) => json(res, 200, { ok: true, task: { taskId: 'task-fixture', status: body.mode || 'dry-run' } }));",
      "  if (req.method === 'POST' && url.pathname === '/api/stop') return readJson(req, () => json(res, 200, { ok: true, stopped: true }));",
      "  json(res, 404, { error: 'not found' });",
      "});",
      "function readJson(req, done) { let raw = ''; req.on('data', (chunk) => { raw += chunk; }); req.on('end', () => done(raw ? JSON.parse(raw) : {})); }",
      "function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }",
      "server.listen(process.env.PORT || 0, '127.0.0.1');",
      "",
    ].join("\n"),
    "utf8",
  );
}

function startMockCalendarTarget() {
  const runCalls = [];
  const stopCalls = [];
  let stateCalls = 0;
  let eventsCalls = 0;
  let prepareCalls = 0;
  let confirmCalls = 0;
  let running = false;
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && requestUrl.pathname === "/api/state") {
      stateCalls += 1;
      writeJson(res, 200, {
        defaults: {
          stock: "100",
          stepDelayMs: "500",
          datePickerDelayMs: "500",
          targetDate: "2026-10-01",
          startDate: "2026-07-16",
          endDate: "2026-10-01",
          startProductId: "",
          endProductId: "",
        },
        task: {
          status: running ? "running" : "idle",
          pid: running ? 1234 : null,
          mode: "run",
          stock: "100",
          startDate: "2026-07-16",
          targetDate: "2026-10-01",
          currentMessage: running ? "running" : "ready",
          stopRequested: false,
        },
        logs: [{ message: "ready" }],
      });
      return;
    }
    if (req.method === "GET" && requestUrl.pathname === "/api/events") {
      eventsCalls += 1;
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end("event: ready\ndata: {}\n\n");
      return;
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/run") {
      readRequestJson(req).then((body) => {
        runCalls.push(body);
        running = true;
        writeJson(res, 200, { ok: true, task: { taskId: `task-${runCalls.length}`, status: body.mode || "run" } });
      });
      return;
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/stop") {
      readRequestJson(req).then((body) => {
        stopCalls.push(body);
        running = false;
        writeJson(res, 200, { ok: true, stopped: true });
      });
      return;
    }
    if (requestUrl.pathname.includes("/prepare")) prepareCalls += 1;
    if (requestUrl.pathname.includes("/confirm")) confirmCalls += 1;
    writeJson(res, 404, { error: "not found" });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Mock calendar target did not bind to a TCP port."));
        return;
      }
      resolve({
        get baseUrl() {
          return `http://127.0.0.1:${address.port}`;
        },
        runCalls,
        stopCalls,
        get stateCalls() {
          return stateCalls;
        },
        get eventsCalls() {
          return eventsCalls;
        },
        get prepareCalls() {
          return prepareCalls;
        },
        get confirmCalls() {
          return confirmCalls;
        },
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => (error ? closeReject(error) : closeResolve()));
        }),
      });
    });
  });
}

function runCli(args, options = {}) {
  return runNode([cli, ...args], options.env || {}, options);
}

async function runCliExpectFailure(args, options = {}) {
  try {
    const output = await runCli(args, options);
    assert.fail(`Expected CLI command to fail: ${args.join(" ")}\n${output}`);
  } catch (error) {
    if (error && typeof error === "object" && "output" in error) return error.output;
    throw error;
  }
}

function runNode(args, env = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, ...env };
    delete childEnv.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, args, {
      cwd: options.cwd || root,
      env: childEnv,
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
    child.on("close", (code) => {
      const output = stdout + stderr;
      if (code === 0) {
        resolve(output);
        return;
      }
      const error = new Error(`Command failed (${code}): ${process.execPath} ${args.join(" ")}\n${output}`);
      error.code = code;
      error.output = output;
      reject(error);
    });
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function capabilityPaths(capabilityMap) {
  return [...new Set((capabilityMap.capabilities || []).map((capability) => capability.source?.path).filter(Boolean))].sort();
}

function snapshotTree(directory) {
  return Object.fromEntries(listFiles(directory).map((filePath) => [path.relative(directory, filePath).replaceAll(path.sep, "/"), sha256(filePath)]));
}

function hashRootFiles(directory) {
  return Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => [entry.name, sha256(path.join(directory, entry.name))]));
}

function nonIntegrationChanges(directory, beforeRootHashes) {
  return Object.entries(hashRootFiles(directory))
    .filter(([name, hash]) => beforeRootHashes[name] !== hash)
    .map(([name]) => name);
}

function createDirectoryLinkOrSkip(t, targetPath, linkPath) {
  try {
    fs.symlinkSync(targetPath, linkPath, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch (error) {
    if (isSkippableLinkCreationError(error)) {
      t.skip(`Directory link creation is unavailable: ${error.code || "unknown"} ${error.message}`);
      return false;
    }
    throw error;
  }
}

function isSkippableLinkCreationError(error) {
  return error && typeof error === "object" && ["EPERM", "EACCES", "ENOTSUP", "ENOSYS", "EINVAL"].includes(error.code);
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    if (entry.isFile()) return [entryPath];
    return [];
  }).sort();
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function findInstalledLarkFile(target) {
  const installedRoot = path.join(target, "integrations", "lark");
  const file = listFiles(installedRoot).find((item) => path.basename(item) !== ".code2lark-install.json" && /\.(?:js|mjs|ts|json|md)$/i.test(item));
  assert.ok(file, "installed integrations/lark must contain a managed text file");
  return file;
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("error", reject);
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function writeJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
