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

test("top-level docs define Code2Lark delivery modes", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const charter = fs.readFileSync(path.join(root, "docs", "development-charter.md"), "utf8");
  const status = fs.readFileSync(path.join(root, "docs", "project-status.md"), "utf8");
  const mvp = fs.readFileSync(path.join(root, "docs", "mvp-1a-image-agent-web.md"), "utf8");
  const fdeHandoff = fs.readFileSync(path.join(root, "docs", "fde-handoff.md"), "utf8");
  const modeBGuide = fs.readFileSync(path.join(root, "docs", "mode-b-embedding-guide.md"), "utf8");
  const baseline = fs.readFileSync(path.join(root, "docs", "mvp-mode-a-b-baseline.md"), "utf8");
  const matrix = fs.readFileSync(path.join(root, "docs", "capability-validation-matrix.md"), "utf8");

  assert.match(readme, /Mode A is the external host, sidecar, or gateway path\./);
  assert.match(readme, /Mode B is the target-project embedded host-module path\./);
  assert.match(readme, /Mode A.*(已验证|validated)/i);
  assert.match(readme, /Mode B.*(已验证|validated)/i);
  assert.doesNotMatch(readme, /Mode B.*pending real/i);
  assert.doesNotMatch(readme, /Mode B.*待真实验收/);
  assert.match(readme, /self-hosted-runtime is the generated host module/i);
  assert.match(charter, /Mode A.*external host/i);
  assert.match(charter, /Mode B.*embedded host module/i);
  assert.doesNotMatch(charter, /Mode B.*not considered productized until/i);
  assert.match(charter, /self-hosted-runtime.*host module/i);
  assert.match(charter, /--mode: .*embedded-adapter.*standalone-runtime.*self-hosted-runtime/);
  assert.match(charter, /bot-runtime\/\s+# 可选，参考宿主，不是核心业务层/);
  assert.doesNotMatch(charter, /standalone-runtime\/\s+# 可选，参考宿主，不是核心业务层/);
  assert.match(status, /Mode A/i);
  assert.match(status, /Mode B/i);
  assert.doesNotMatch(status, /Mode B.*not considered productized until/i);
  assert.match(mvp, /verified sample/i);
  assert.match(mvp, /Mode B.*deployment-test validation/i);
  assert.match(mvp, /Real Feishu Level 2 evidence remains operator-owned/);
  assert.doesNotMatch(mvp, /Real Feishu verification is still pending/);
  assert.match(fdeHandoff, /generated\/<target>-lark\/` is the source-of-truth handoff package/);
  assert.match(fdeHandoff, /Mode A is the external host, sidecar, or gateway path\./);
  assert.match(fdeHandoff, /Mode B is the target-project embedded host-module path\./);
  assert.match(fdeHandoff, /Mode B.*deployment-test validation/i);
  assert.match(fdeHandoff, /self-hosted-runtime is the generated host module/i);
  assert.match(modeBGuide, /Do not copy `generated\/<target>-lark\/feishu-host\/\.env`/);
  assert.match(modeBGuide, /add `feishu_host\/\.env`/);
  assert.match(baseline, /Mode A/);
  assert.match(baseline, /Mode B/);
  assert.match(baseline, /deployment-test validation/i);
  assert.match(matrix, /image-agent-web/);
  assert.match(matrix, /calendar-stock-updater/);
  assert.match(matrix, /Mode A/);
  assert.match(matrix, /Mode B/);
  assert.match(readme, /canonical MVP package.*schema 0\.2/i);
  assert.match(status, /canonical MVP package.*schema 0\.2/i);
});

test("package scripts and CI workflow expose local verification gates", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");

  assert.equal(packageJson.scripts["test:unit"], "node --test tests/unit-pure-functions.test.mjs");
  assert.equal(packageJson.scripts["test:smoke"], "node --test tests/cli-smoke.test.mjs");
  assert.equal(packageJson.scripts["test:e2e"], "node --test tests/runtime-local-e2e.test.mjs");
  assert.match(packageJson.scripts["test:coverage"], /node --experimental-test-coverage --test/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run test:unit/);
  assert.match(workflow, /npm run test:smoke/);
  assert.match(workflow, /npm run test:e2e/);
  assert.match(workflow, /npm audit --package-lock-only --audit-level=moderate/);
});

test("strict verify rejects outdated manifest schemas", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-old-schema-"));
  fs.mkdirSync(path.join(temp, "manifest"), { recursive: true });
  fs.writeFileSync(path.join(temp, "manifest", "service_manifest.json"), JSON.stringify({ schema_version: "0.1" }), "utf8");
  fs.writeFileSync(path.join(temp, "manifest", "capability_map.json"), JSON.stringify({ schema_version: "0.1", service_name: "x", capabilities: [] }), "utf8");
  fs.writeFileSync(path.join(temp, "manifest", "interaction_contract.json"), JSON.stringify({ schema_version: "0.1", channel: "lark", service_name: "x", supported_triggers: [], supported_result_modes: [], interactions: [] }), "utf8");
  fs.writeFileSync(path.join(temp, "manifest", "required_permissions.json"), JSON.stringify({
    schema_version: "0.1",
    app: { type: "custom_app", bot_required: true, availability_recommendation: "" },
    context_requirements: [],
    token_strategy: { default: "tenant_access_token", user_access_token_required: false },
    scopes: [],
    events: [],
    callbacks: [],
    manual_steps: [],
    review_flags: [],
  }), "utf8");

  const output = runExpectFailure(["verify", temp, "--strict"]);
  assert.match(output, /schema_version 0\.2/i);
  assert.match(output, /target_profile/i);
});

test("generate refuses to overwrite non-managed non-empty output directories", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-generate-guard-"));
  const target = path.join(temp, "image-agent-web");
  const workspace = path.join(temp, "out");
  const existing = path.join(temp, "existing-output");

  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "requirements.txt"), "fastapi==0.115.0\n", "utf8");
  fs.writeFileSync(
    path.join(target, "main.py"),
    [
      "from fastapi import FastAPI",
      "app = FastAPI()",
      "@app.post(\"/api/generate\")",
      "async def generate(): pass",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(path.join(target, "templates.py"), "TEMPLATES = []\nREFERENCE_TYPES = []\n", "utf8");
  fs.mkdirSync(existing, { recursive: true });
  fs.writeFileSync(path.join(existing, "README.md"), "user-owned content", "utf8");

  run(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace]);
  const output = runExpectFailure(["generate", workspace, "--out", existing]);
  assert.match(output, /non-empty|force|managed/i);
  assert.equal(fs.readFileSync(path.join(existing, "README.md"), "utf8"), "user-owned content");

  const managed = path.join(temp, "managed-output");
  run(["generate", workspace, "--out", managed]);
  const managedOutput = runExpectFailure(["generate", workspace, "--out", managed]);
  assert.match(managedOutput, /--force|existing generated package/i);
  run(["generate", workspace, "--out", managed, "--force"]);
});

test("analyze --backend internal succeeds and records internal backend metadata", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-backend-internal-"));
  try {
    const target = path.join(temp, "target");
    const workspace = path.join(temp, "out");
    writeBackendSelectionTarget(target);

    run(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--backend", "internal"]);

    const service = readServiceManifest(workspace);
    assert.equal(service.source_scan.structural_backend?.requested, "internal");
    assert.equal(service.source_scan.structural_backend?.used, "internal");
    assert.equal(service.source_scan.structural_backend?.status, "used");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("analyze --backend auto falls back to internal when codegraph executable is unavailable", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-backend-auto-missing-"));
  try {
    const target = path.join(temp, "target");
    const workspace = path.join(temp, "out");
    writeBackendSelectionTarget(target);

    runWithEnv(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--backend", "auto"], {
      PATH: path.join(temp, "empty-bin"),
      Path: path.join(temp, "empty-bin"),
    });

    const service = readServiceManifest(workspace);
    assert.equal(service.source_scan.structural_backend?.requested, "auto");
    assert.equal(service.source_scan.structural_backend?.used, "internal");
    assert.equal(service.source_scan.structural_backend?.status, "fallback");
    assert.match(service.source_scan.structural_backend?.reason || "", /codegraph.*(unavailable|not found|missing)/i);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("analyze --backend codegraph fails clearly when executable is unavailable", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-backend-codegraph-missing-"));
  try {
    const target = path.join(temp, "target");
    const workspace = path.join(temp, "out");
    writeBackendSelectionTarget(target);

    const output = runExpectFailureWithEnv(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--backend", "codegraph"], {
      PATH: path.join(temp, "empty-bin"),
      Path: path.join(temp, "empty-bin"),
    });
    assert.match(output, /codegraph/i);
    assert.match(output, /unavailable|not found|missing|install/i);
    assert.equal(fs.existsSync(path.join(workspace, "manifest", "service_manifest.json")), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("analyze --backend auto falls back when fake codegraph status is uninitialized", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-backend-status-uninit-auto-"));
  try {
    const target = path.join(temp, "target");
    const workspace = path.join(temp, "out");
    const fake = installFakeCodegraph(temp, "uninitialized");
    writeBackendSelectionTarget(target);

    runWithEnv(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--backend", "auto"], fake.env);

    const service = readServiceManifest(workspace);
    assert.equal(service.source_scan.structural_backend?.requested, "auto");
    assert.equal(service.source_scan.structural_backend?.used, "internal");
    assert.equal(service.source_scan.structural_backend?.status, "fallback");
    assert.match(service.source_scan.structural_backend?.reason || "", /not initialized|uninitialized/i);
    assert.deepEqual(readFakeCodegraphArgv(fake.logPath), [["status", target, "--json"]]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("analyze --backend codegraph fails when fake codegraph status is uninitialized", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-backend-status-uninit-explicit-"));
  try {
    const target = path.join(temp, "target");
    const workspace = path.join(temp, "out");
    const fake = installFakeCodegraph(temp, "uninitialized");
    writeBackendSelectionTarget(target);

    const output = runExpectFailureWithEnv(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--backend", "codegraph"], fake.env);
    assert.match(output, /codegraph/i);
    assert.match(output, /not initialized|uninitialized/i);
    assert.deepEqual(readFakeCodegraphArgv(fake.logPath), [["status", target, "--json"]]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("analyze --backend auto falls back when fake codegraph status has stale pendingRefs", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-backend-status-stale-pending-refs-auto-"));
  try {
    const target = path.join(temp, "target");
    const workspace = path.join(temp, "out");
    const fake = installFakeCodegraph(temp, "stale-pending-refs");
    writeBackendSelectionTarget(target);

    runWithEnv(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--backend", "auto"], fake.env);

    const service = readServiceManifest(workspace);
    assert.equal(service.source_scan.structural_backend?.requested, "auto");
    assert.equal(service.source_scan.structural_backend?.used, "internal");
    assert.equal(service.source_scan.structural_backend?.status, "fallback");
    assert.match(service.source_scan.structural_backend?.reason || "", /pendingRefs is not 0/i);
    assert.deepEqual(readFakeCodegraphArgv(fake.logPath), [["status", target, "--json"]]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("analyze --backend codegraph accepts missing journalMode metadata when status is otherwise fresh", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-backend-journal-missing-"));
  try {
    const target = path.join(temp, "target");
    const workspace = path.join(temp, "out");
    const fake = installFakeCodegraph(temp, "fresh-journal-missing");
    writeBackendSelectionTarget(target);

    runWithEnv(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--backend", "codegraph"], fake.env);

    const service = readServiceManifest(workspace);
    assert.equal(service.source_scan.structural_backend?.requested, "codegraph");
    assert.equal(service.source_scan.structural_backend?.used, "codegraph");
    assert.equal(service.source_scan.structural_backend?.status, "used");
    assert.deepEqual(readFakeCodegraphArgv(fake.logPath), [
      ["status", target, "--json"],
      ["query", "route", "--kind", "route", "--path", target, "--json"],
    ]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("analyze --backend codegraph accepts non-WAL journalMode when status is otherwise fresh", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-backend-journal-memory-"));
  try {
    const target = path.join(temp, "target");
    const workspace = path.join(temp, "out");
    const fake = installFakeCodegraph(temp, "fresh-journal-memory");
    writeBackendSelectionTarget(target);

    runWithEnv(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--backend", "codegraph"], fake.env);

    const service = readServiceManifest(workspace);
    assert.equal(service.source_scan.structural_backend?.requested, "codegraph");
    assert.equal(service.source_scan.structural_backend?.used, "codegraph");
    assert.equal(service.source_scan.structural_backend?.status, "used");
    assert.deepEqual(readFakeCodegraphArgv(fake.logPath), [
      ["status", target, "--json"],
      ["query", "route", "--kind", "route", "--path", target, "--json"],
    ]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

for (const staleCase of [
  {
    mode: "pending-changes",
    output: /pendingChanges is not empty/i,
  },
  {
    mode: "worktree-mismatch",
    output: /worktreeMismatch is true/i,
  },
  {
    mode: "incomplete-state",
    output: /index\.state is not complete/i,
  },
  {
    mode: "pending-refs",
    output: /pendingRefs is not 0/i,
  },
  {
    mode: "reindex-recommended",
    output: /reindexRecommended is true/i,
  },
]) {
  test(`analyze --backend codegraph rejects stale codegraph status: ${staleCase.mode}`, () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), `lark-deployer-backend-status-stale-${staleCase.mode}-explicit-`));
    try {
      const target = path.join(temp, "target");
      const workspace = path.join(temp, "out");
      const fake = installFakeCodegraph(temp, `stale-${staleCase.mode}`);
      writeBackendSelectionTarget(target);

      const output = runExpectFailureWithEnv(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--backend", "codegraph"], fake.env);
      assert.match(output, /codegraph/i);
      assert.match(output, staleCase.output);
      assert.deepEqual(readFakeCodegraphArgv(fake.logPath), [["status", target, "--json"]]);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
}

test("analyze --backend codegraph invokes fake route query and normalizes results", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-backend-codegraph-fresh-"));
  try {
    const target = path.join(temp, "target");
    const workspace = path.join(temp, "out");
    const fake = installFakeCodegraph(temp, "fresh");
    writeBackendSelectionTarget(target);

    runWithEnv(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--backend", "codegraph"], fake.env);

    const service = readServiceManifest(workspace);
    assert.equal(service.source_scan.structural_backend?.requested, "codegraph");
    assert.equal(service.source_scan.structural_backend?.used, "codegraph");
    assert.equal(service.source_scan.structural_backend?.status, "used");
    assert.deepEqual(readFakeCodegraphArgv(fake.logPath), [
      ["status", target, "--json"],
      ["query", "route", "--kind", "route", "--path", target, "--json"],
    ]);
    assert.deepEqual(service.source_scan.route_provenance, [
      { method: "GET", path: "/api/codegraph-health", source: "codegraph", file: "server.js", line: 8 },
      { method: "POST", path: "/api/codegraph-route", source: "codegraph", file: "server.js", line: 2 },
    ]);
    const serializedService = JSON.stringify(service);
    assert.doesNotMatch(serializedService, /score/);
    assert.doesNotMatch(serializedService, /highlights/);
    assert.ok(service.source_scan.endpoint_coverage.some((item) => item.method === "POST" && item.path === "/api/codegraph-route"));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("analyze --backend auto falls back when fake codegraph returns invalid query JSON", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-backend-invalid-json-auto-"));
  try {
    const target = path.join(temp, "target");
    const workspace = path.join(temp, "out");
    const fake = installFakeCodegraph(temp, "invalid-query-json");
    writeBackendSelectionTarget(target);

    runWithEnv(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--backend", "auto"], fake.env);

    const service = readServiceManifest(workspace);
    assert.equal(service.source_scan.structural_backend?.requested, "auto");
    assert.equal(service.source_scan.structural_backend?.used, "internal");
    assert.equal(service.source_scan.structural_backend?.status, "fallback");
    assert.match(service.source_scan.structural_backend?.reason || "", /invalid.*json|json.*parse/i);
    assert.deepEqual(readFakeCodegraphArgv(fake.logPath), [
      ["status", target, "--json"],
      ["query", "route", "--kind", "route", "--path", target, "--json"],
    ]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("analyze --backend codegraph fails when fake codegraph returns invalid query JSON", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-backend-invalid-json-explicit-"));
  try {
    const target = path.join(temp, "target");
    const workspace = path.join(temp, "out");
    const fake = installFakeCodegraph(temp, "invalid-query-json");
    writeBackendSelectionTarget(target);

    const output = runExpectFailureWithEnv(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--backend", "codegraph"], fake.env);
    assert.match(output, /codegraph/i);
    assert.match(output, /invalid.*json|json.*parse/i);
    assert.deepEqual(readFakeCodegraphArgv(fake.logPath), [
      ["status", target, "--json"],
      ["query", "route", "--kind", "route", "--path", target, "--json"],
    ]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI can analyze, plan, generate, and verify an image-agent-web-like target", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-smoke-"));
  const target = path.join(temp, "image-agent-web");
  const workspace = path.join(temp, "out");
  const generated = path.join(temp, "generated");

  const rootHelp = run(["--help"]);
  assert.match(rootHelp, /--mode embedded-adapter\|standalone-runtime\|self-hosted-runtime/);
  assert.match(rootHelp, /--host-runtime-url <url>/);
  const generateHelp = run(["generate", "--help"]);
  assert.match(generateHelp, /--mode embedded-adapter\|standalone-runtime\|self-hosted-runtime/);

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
  assert.equal(serviceManifest.schema_version, "0.2");
  assert.equal(serviceManifest.source_scan.analysis_strategy, "http_api_python_image_agent_web");
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
  assert.equal(context.handoff_request.generated_package_hint, ["generated", "image-agent-web-lark"].join(path.sep));
  assert.ok(context.handoff_request.verification_commands.some((command) => command.includes("configure ") && command.includes("--strict") && command.includes("--dry-run")));
  assert.ok(context.handoff_request.verification_commands.some((command) => command.includes("--level2")));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(" status "))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(" configure ") && command.includes("--strict"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(" configure ") && command.includes("--strict") && command.includes("--dry-run"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(" doctor "))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(" doctor ") && command.includes("--gate"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(" doctor ") && command.includes("--probe-target") && command.includes("--gate"))));
  assert.ok(context.handoff_request.command_sets.some((set) => set.name === "project_root" && set.commands.some((command) => command.includes(["generated", "image-agent-web-lark"].join(path.sep)))));
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
  const initialContextMarkdown = fs.readFileSync(path.join(workspace, "feishu_context.template.md"), "utf8");
  const contextRequest = fs.readFileSync(path.join(workspace, "feishu_context.request.md"), "utf8");
  assert.match(contextRequest, /# Feishu Context Request/);
  assert.match(initialContextMarkdown, /Mode A is the external host, sidecar, or gateway path\./);
  assert.match(initialContextMarkdown, /Mode B is the target-project embedded host-module path\./);
  assert.match(contextRequest, /Mode A is the external host, sidecar, or gateway path\./);
  assert.match(contextRequest, /Mode B is the target-project embedded host-module path\./);
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
  const longContextOut = path.join(workspace, "feishu_context.long.template.json");
  run(["context", workspace, "--out", longContextOut, "--mode", "embedded-adapter", "--host-mode", "embedded-long-connection"]);
  const longContextDirect = JSON.parse(fs.readFileSync(longContextOut, "utf8"));
  assert.equal(longContextDirect.host_receive_mode, "embedded-long-connection");
  assert.equal(longContextDirect.handoff_request.required_values.some((item) => item.key === "PUBLIC_CALLBACK_BASE_URL" && item.required_for_level_2), false);
  const longContextDirectMarkdown = fs.readFileSync(longContextOut.replace(/\.json$/i, ".md"), "utf8");
  assert.match(longContextDirectMarkdown, /card\.action\.trigger/);
  assert.doesNotMatch(longContextDirectMarkdown, /\/webhook\/card/);
  assert.doesNotMatch(longContextDirectMarkdown, /- VERIFICATION_TOKEN/);
  assert.doesNotMatch(longContextDirectMarkdown, /- PUBLIC_CALLBACK_BASE_URL/);
  const longContextDirectRequest = fs.readFileSync(longContextOut.replace(/\.template\.json$/i, ".request.md"), "utf8");
  assert.match(longContextDirectRequest, /long_connection_gateway_owner/);
  assert.doesNotMatch(longContextDirectRequest, /public_callback_base_url:/);
  assert.doesNotMatch(longContextDirectRequest, /VERIFICATION_TOKEN \/ ENCRYPT_KEY/);
  const missingGenerated = path.join(temp, "generated-missing-context");
  run(["generate", workspace, "--out", missingGenerated]);
  const generatedServiceManifest = JSON.parse(fs.readFileSync(path.join(missingGenerated, "manifest", "service_manifest.json"), "utf8"));
  const generatedCapabilityMap = JSON.parse(fs.readFileSync(path.join(missingGenerated, "manifest", "capability_map.json"), "utf8"));
  assert.equal(generatedServiceManifest.schema_version, "0.2");
  assert.equal(generatedCapabilityMap.schema_version, "0.2");
  assert.ok(generatedCapabilityMap.target_profile);
  const selfHostedGenerated = path.join(temp, "generated-self-hosted");
  run(["generate", workspace, "--out", selfHostedGenerated, "--mode", "self-hosted-runtime"]);
  const selfHostedSummary = JSON.parse(fs.readFileSync(path.join(selfHostedGenerated, "generation_summary.json"), "utf8"));
  assert.equal(selfHostedSummary.schema_version, "0.2");
  assert.equal(selfHostedSummary.integration_mode, "self-hosted-runtime");
  assert.equal(selfHostedSummary.host_receive_mode, "embedded-long-connection");
  assert.equal(selfHostedSummary.core_artifact, "feishu-host");
  assert.equal(selfHostedSummary.runtime, "python-feishu-host");
  const selfHostedStartHere = fs.readFileSync(path.join(selfHostedGenerated, "START_HERE.md"), "utf8");
  assert.match(selfHostedStartHere, /core generated artifact is `feishu-host\/`/);
  assert.match(selfHostedStartHere, /self-hosted-runtime mode/);
  assert.match(selfHostedStartHere, /python feishu-host\/local_contract_test\.py/);
  assert.match(selfHostedStartHere, /python feishu-host\/app\.py --selfcheck/);
  assert.match(selfHostedStartHere, /verify \. --mode self-hosted-runtime --strict/);
  assert.doesNotMatch(selfHostedStartHere, /generated in embedded-adapter mode/);
  assert.doesNotMatch(selfHostedStartHere, /verify \. --mode embedded-adapter/);
  assert.ok(fs.existsSync(path.join(selfHostedGenerated, "feishu-host")));
  assert.equal(fs.existsSync(path.join(selfHostedGenerated, "bot-runtime")), false);
  assert.equal(fs.existsSync(path.join(selfHostedGenerated, "sidecar-long-connection")), false);
  const selfHostedFeishuHost = path.join(selfHostedGenerated, "feishu-host");
  for (const relativePath of [
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
    "spec/start_card.json",
    "spec/field_map.json",
    "spec/endpoints.json",
    "spec/preset.json",
    "spec/template_specs.json",
    "spec/field_specs.json",
  ]) {
    assert.ok(fs.existsSync(path.join(selfHostedFeishuHost, relativePath)), `feishu-host/${relativePath} should be generated`);
  }
  const selfHostedEnvExample = fs.readFileSync(path.join(selfHostedFeishuHost, ".env.example"), "utf8");
  for (const key of [
    "FEISHU_APP_ID",
    "FEISHU_APP_SECRET",
    "FEISHU_CONNECTION_MODE=websocket",
    "IMAGE_AGENT_BASE_URL",
    "FEISHU_ALLOWED_USERS",
    "IMAGE_AGENT_TIMEOUT_MS",
    "TEST_CHAT_ID",
  ]) {
    assert.match(selfHostedEnvExample, new RegExp(`^${escapeRegExp(key)}`, "m"));
  }
  const selfHostedRequirements = fs.readFileSync(path.join(selfHostedFeishuHost, "requirements.txt"), "utf8");
  assert.match(selfHostedRequirements, /^lark-oapi/m);
  assert.match(selfHostedRequirements, /^requests$/m);
  const selfHostedConfig = fs.readFileSync(path.join(selfHostedFeishuHost, "config.py"), "utf8");
  assert.match(selfHostedConfig, /FEISHU_APP_ID/);
  assert.match(selfHostedConfig, /FEISHU_APP_SECRET/);
  assert.match(selfHostedConfig, /safe_summary/);
  assert.doesNotMatch(selfHostedConfig, /print\(/);
  const selfHostedCards = fs.readFileSync(path.join(selfHostedFeishuHost, "cards.py"), "utf8");
  assert.match(selfHostedCards, /def load_start_card/);
  assert.match(selfHostedCards, /def build_success_card/);
  assert.match(selfHostedCards, /image\.iterate\.submit/);
  assert.match(selfHostedCards, /image\.batch\.refresh/);
  const selfHostedServiceClient = fs.readFileSync(path.join(selfHostedFeishuHost, "service_client.py"), "utf8");
  assert.match(selfHostedServiceClient, /def call_generate/);
  assert.match(selfHostedServiceClient, /requests\.post\(url, data=data/);
  assert.match(selfHostedServiceClient, /requests\.post\(url, data=data, json=json_body/);
  assert.match(selfHostedServiceClient, /def call_batch_status/);
  assert.match(selfHostedServiceClient, /TargetServiceError/);
  const selfHostedValidation = fs.readFileSync(path.join(selfHostedFeishuHost, "validation.py"), "utf8");
  assert.match(selfHostedValidation, /def validate_size/);
  assert.match(selfHostedValidation, /def validate_required_fields/);
  assert.match(selfHostedValidation, /def validate_batch_items/);
  assert.match(selfHostedValidation, /def assert_allowed_operator/);
  const selfHostedHandlers = fs.readFileSync(path.join(selfHostedFeishuHost, "handlers.py"), "utf8");
  assert.match(selfHostedHandlers, /def handle_card_action/);
  assert.match(selfHostedHandlers, /normalize_card_action/);
  assert.match(selfHostedHandlers, /endpoints\.json/);
  assert.match(selfHostedHandlers, /formFieldToTemplateKey/);
  assert.match(selfHostedHandlers, /image\.batch\.refresh/);
  const selfHostedApp = fs.readFileSync(path.join(selfHostedFeishuHost, "app.py"), "utf8");
  assert.match(selfHostedApp, /import lark_oapi as lark/);
  assert.match(selfHostedApp, /CreateMessageRequest/);
  assert.match(selfHostedApp, /CreateMessageRequestBody/);
  assert.match(selfHostedApp, /def build_start_message_request/);
  assert.match(selfHostedApp, /client\.im\.v1\.message\.create\(request\)/);
  assert.match(selfHostedApp, /sent start card: message_id=/);
  assert.match(selfHostedApp, /register_p2_card_action_trigger\(callback\)/);
  assert.match(selfHostedApp, /lark\.ws\.Client/);
  assert.match(selfHostedApp, /card\.action\.trigger registered/);
  assert.match(selfHostedApp, /without start\(\)/);
  const selfHostedContract = fs.readFileSync(path.join(selfHostedFeishuHost, "local_contract_test.py"), "utf8");
  assert.match(selfHostedContract, /ThreadingHTTPServer/);
  assert.match(selfHostedContract, /\/api\/generate/);
  assert.match(selfHostedContract, /fields_json/);
  assert.match(selfHostedContract, /reference_types_json/);
  assert.match(selfHostedContract, /\/api\/iterate/);
  assert.match(selfHostedContract, /\/api\/batch\/batch-contract\/status/);
  assert.match(selfHostedContract, /field_hero_title/);
  assert.match(selfHostedContract, /build_start_message_request/);
  assert.match(selfHostedContract, /receive_id_type/);
  assert.match(selfHostedContract, /feishu_app_secret/);
  assert.match(selfHostedContract, /missing TEST_CHAT_ID/);
  assert.match(selfHostedContract, /feishu-host contract: PASS/);
  if (pythonCanRunSelfHostedContract()) {
    const contractOutput = runPython([path.join(selfHostedFeishuHost, "local_contract_test.py")], { cwd: selfHostedFeishuHost });
    assert.match(contractOutput, /feishu-host contract: PASS/);
  }
  if (pythonCanImport("lark_oapi")) {
    const sendStartCardMissingChat = runPythonExpectFailure([path.join(selfHostedFeishuHost, "app.py"), "--send-start-card"], {
      cwd: selfHostedFeishuHost,
      env: {
        ...process.env,
        FEISHU_APP_ID: "dummy_app_id",
        FEISHU_APP_SECRET: "dummy_app_secret",
        TEST_CHAT_ID: "",
        FEISHU_CONNECTION_MODE: "",
        IMAGE_AGENT_BASE_URL: "",
      },
    });
    assert.match(sendStartCardMissingChat, /TEST_CHAT_ID is required to send the start card/);
  }
  const selfHostedVerifyOutput = pythonCanImport("requests") && pythonCanImport("lark_oapi")
    ? run(["verify", selfHostedGenerated, "--mode", "self-hosted-runtime", "--strict"])
    : run(["verify", selfHostedGenerated, "--mode", "self-hosted-runtime"]);
  assert.match(selfHostedVerifyOutput, /self-hosted:summary:integration-mode/);
  assert.match(selfHostedVerifyOutput, /self-hosted:env-example/);
  assert.match(selfHostedVerifyOutput, /self-hosted:endpoints/);
  assert.match(selfHostedVerifyOutput, /self-hosted:start-card-actions/);
  assert.doesNotMatch(selfHostedVerifyOutput, /PUBLIC_CALLBACK_BASE_URL/);
  assert.doesNotMatch(selfHostedVerifyOutput, /VERIFICATION_TOKEN/);
  assert.doesNotMatch(selfHostedVerifyOutput, /\/webhook\/card/);
  const selfHostedVerifyReport = JSON.parse(fs.readFileSync(path.join(selfHostedGenerated, "verification_report.json"), "utf8"));
  assert.equal(selfHostedVerifyReport.context.mode, "self-hosted-runtime");
  assert.equal(selfHostedVerifyReport.context.hostReceiveMode, "embedded-long-connection");
  assert.ok(selfHostedVerifyReport.checks.some((item) => item.name === "self-hosted:field-map" && item.status === "pass"));
  assert.ok(selfHostedVerifyReport.checks.some((item) => item.name === "self-hosted:python:py_compile" && item.status === "pass"));
  if (pythonCanImport("requests") && pythonCanImport("lark_oapi")) {
    assert.equal(selfHostedVerifyReport.status, "pass");
    assert.ok(selfHostedVerifyReport.checks.some((item) => item.name === "self-hosted:python:local-contract" && item.status === "pass"));
    assert.ok(selfHostedVerifyReport.checks.some((item) => item.name === "self-hosted:python:selfcheck" && item.status === "pass"));
  } else {
    assert.equal(selfHostedVerifyReport.status, "warn");
    assert.ok(selfHostedVerifyReport.checks.some((item) => item.status === "warn" && /Install feishu-host\/requirements\.txt|No runnable Python/.test(item.detail)));
  }
  const selfHostedContext = JSON.parse(fs.readFileSync(path.join(selfHostedGenerated, "feishu_context.template.json"), "utf8"));
  assert.equal(selfHostedContext.integration_mode, "self-hosted-runtime");
  assert.equal(selfHostedContext.host_receive_mode, "embedded-long-connection");
  assert.ok(selfHostedContext.handoff_request.required_values.some((item) => item.key === "FEISHU_APP_ID" && item.required_for_level_2));
  assert.ok(selfHostedContext.handoff_request.required_values.some((item) => item.key === "FEISHU_APP_SECRET" && item.required_for_level_2));
  assert.ok(selfHostedContext.handoff_request.required_values.some((item) => item.key === "FEISHU_CONNECTION_MODE" && item.note.includes("websocket")));
  assert.equal(selfHostedContext.handoff_request.required_values.some((item) => item.key === "PUBLIC_CALLBACK_BASE_URL" && item.required_for_level_2), false);
  assert.equal(selfHostedContext.handoff_request.required_values.some((item) => item.key === "VERIFICATION_TOKEN" && item.required_for_level_2), false);
  const selfHostedCommands = selfHostedContext.handoff_request.command_sets.flatMap((set) => set.commands);
  assert.ok(selfHostedCommands.some((command) => command.includes("python local_contract_test.py")));
  assert.ok(selfHostedCommands.some((command) => command.includes("python app.py --selfcheck")));
  assert.ok(selfHostedCommands.some((command) => command.includes("verify . --mode self-hosted-runtime --strict")));
  const selfHostedRequest = fs.readFileSync(path.join(selfHostedGenerated, "feishu_context.request.md"), "utf8");
  assert.match(selfHostedRequest, /FEISHU_APP_ID/);
  assert.match(selfHostedRequest, /FEISHU_CONNECTION_MODE/);
  assert.match(selfHostedRequest, /card_action_trigger_subscribed/);
  assert.match(selfHostedRequest, /python feishu-host\/local_contract_test\.py/);
  assert.doesNotMatch(selfHostedRequest, /PUBLIC_CALLBACK_BASE_URL/);
  assert.doesNotMatch(selfHostedRequest, /VERIFICATION_TOKEN/);
  assert.doesNotMatch(selfHostedRequest, /\/webhook\/card/);
  const selfHostedReplyMarkdown = fs.readFileSync(path.join(selfHostedGenerated, "feishu_context.reply.template.md"), "utf8");
  assert.match(selfHostedReplyMarkdown, /FEISHU_APP_SECRET/);
  assert.match(selfHostedReplyMarkdown, /FEISHU_CONNECTION_MODE/);
  assert.doesNotMatch(selfHostedReplyMarkdown, /PUBLIC_CALLBACK_BASE_URL/);
  assert.doesNotMatch(selfHostedReplyMarkdown, /VERIFICATION_TOKEN/);
  assert.doesNotMatch(selfHostedReplyMarkdown, /\/webhook\/card/);
  const selfHostedReadinessOutput = run(["readiness", selfHostedGenerated]);
  assert.match(selfHostedReadinessOutput, /Missing required values: FEISHU_APP_ID, FEISHU_APP_SECRET/);
  assert.match(selfHostedReadinessOutput, /feishu-host/);
  assert.doesNotMatch(selfHostedReadinessOutput, /PUBLIC_CALLBACK_BASE_URL/);
  assert.doesNotMatch(selfHostedReadinessOutput, /VERIFICATION_TOKEN/);
  const selfHostedHandoffStatus = fs.readFileSync(path.join(selfHostedGenerated, "handoff_status.md"), "utf8");
  assert.match(selfHostedHandoffStatus, /Mode B embedded host-module path/);
  assert.match(selfHostedHandoffStatus, /feishu-host\/\.env/);
  assert.match(selfHostedHandoffStatus, /python feishu-host\/local_contract_test\.py/);
  assert.match(selfHostedHandoffStatus, /python feishu-host\/app\.py --selfcheck/);
  assert.doesNotMatch(selfHostedHandoffStatus, /Missing required values:.*PUBLIC_CALLBACK_BASE_URL/);
  assert.doesNotMatch(selfHostedHandoffStatus, /Missing required values:.*VERIFICATION_TOKEN/);
  const selfHostedDoctorJson = JSON.parse(run(["doctor", selfHostedGenerated, "--mode", "self-hosted-runtime", "--json"]));
  assert.equal(selfHostedDoctorJson.integration_mode, "self-hosted-runtime");
  assert.equal(selfHostedDoctorJson.host_receive_mode, "embedded-long-connection");
  assert.ok(selfHostedDoctorJson.next_actions.some((item) => item.includes("feishu-host/.env") || item.includes("feishu-host\\.env")));
  assert.equal(selfHostedDoctorJson.blockers.some((item) => item.includes("PUBLIC_CALLBACK_BASE_URL") || item.includes("/webhook/card") || item.includes("VERIFICATION_TOKEN")), false);
  assert.match(runExpectFailure(["doctor", selfHostedGenerated, "--mode", "self-hosted-runtime", "--gate"]), /MVP gate failed/);
  const selfHostedGuide = fs.readFileSync(path.join(selfHostedGenerated, "docs", "integration_guide.md"), "utf8");
  assert.match(selfHostedGuide, /Self-Hosted Runtime Integration Guide/);
  assert.match(selfHostedGuide, /card\.action\.trigger/);
  assert.match(selfHostedGuide, /\.\\\.venv\\Scripts\\python -m pip install -r requirements\.txt/);
  assert.match(selfHostedGuide, /python app\.py --send-start-card/);
  assert.match(selfHostedGuide, /spec\/start_card\.json/);
  assert.doesNotMatch(selfHostedGuide, /bot-runtime/);
  const selfHostedRootReadme = fs.readFileSync(path.join(selfHostedGenerated, "README.md"), "utf8");
  assert.match(selfHostedRootReadme, /Self-Hosted Runtime Package/);
  assert.match(selfHostedRootReadme, /python app\.py --send-start-card/);
  assert.doesNotMatch(selfHostedRootReadme, /bot-runtime/);
  const selfHostedLevel2 = fs.readFileSync(path.join(selfHostedGenerated, "level2_verification_record.md"), "utf8");
  assert.match(selfHostedLevel2, /feishu-host\/\.env/);
  assert.match(selfHostedLevel2, /FEISHU_CONNECTION_MODE=websocket/);
  assert.match(selfHostedLevel2, /card\.action\.trigger/);
  assert.match(selfHostedLevel2, /python feishu-host\/local_contract_test\.py/);
  assert.match(selfHostedLevel2, /python feishu-host\/app\.py --selfcheck/);
  assert.doesNotMatch(selfHostedLevel2, /bot-runtime\/\.env/);
  assert.doesNotMatch(selfHostedLevel2, /Bot runtime URL:/);
  assert.doesNotMatch(selfHostedLevel2, /PUBLIC_CALLBACK_BASE_URL/);
  assert.doesNotMatch(selfHostedLevel2, /VERIFICATION_TOKEN/);
  assert.doesNotMatch(selfHostedLevel2, /\/webhook\/card/);
  const selfHostedPackageGitignore = fs.readFileSync(path.join(selfHostedGenerated, ".gitignore"), "utf8");
  assert.match(selfHostedPackageGitignore, /feishu-host\/\.env/);
  const selfHostedStartCard = JSON.parse(fs.readFileSync(path.join(selfHostedFeishuHost, "spec", "start_card.json"), "utf8"));
  const selfHostedFieldMap = JSON.parse(fs.readFileSync(path.join(selfHostedFeishuHost, "spec", "field_map.json"), "utf8"));
  const selfHostedEndpoints = JSON.parse(fs.readFileSync(path.join(selfHostedFeishuHost, "spec", "endpoints.json"), "utf8"));
  const selfHostedPreset = JSON.parse(fs.readFileSync(path.join(selfHostedFeishuHost, "spec", "preset.json"), "utf8"));
  const selfHostedTemplateSpecs = JSON.parse(fs.readFileSync(path.join(selfHostedFeishuHost, "spec", "template_specs.json"), "utf8"));
  const selfHostedFieldSpecs = JSON.parse(fs.readFileSync(path.join(selfHostedFeishuHost, "spec", "field_specs.json"), "utf8"));
  assert.equal(selfHostedPreset.template_id, "launch-banner");
  assert.equal(selfHostedPreset.size, "1200x628");
  assert.ok(Array.isArray(selfHostedTemplateSpecs));
  assert.ok(selfHostedTemplateSpecs.some((item) => item.id === "launch-banner" && item.requiredFieldKeys.includes("headline")));
  assert.ok(Array.isArray(selfHostedFieldSpecs));
  assert.ok(selfHostedFieldSpecs.some((item) => item.key === "headline" && item.label === "主题"));
  assert.equal(selfHostedFieldMap.schema_version, "0.1");
  assert.equal(selfHostedFieldMap.templateKeyToFormField.headline, "field_headline");
  assert.equal(selfHostedFieldMap.formFieldToTemplateKey.field_headline, "headline");
  assert.ok(selfHostedFieldMap.fields.some((item) => item.template_key === "body_copy" && item.form_field === "field_body_copy"));
  assert.deepEqual(Object.keys(selfHostedEndpoints.actions).sort(), [
    "image.batch.refresh",
    "image.batch.submit",
    "image.generate.submit",
    "image.iterate.submit",
  ]);
  assert.equal(selfHostedEndpoints.actions["image.generate.submit"].method, "POST");
  assert.equal(selfHostedEndpoints.actions["image.generate.submit"].path, "/api/generate");
  assert.equal(selfHostedEndpoints.actions["image.iterate.submit"].body, "json");
  assert.equal(selfHostedEndpoints.actions["image.batch.submit"].path, "/api/batch");
  assert.equal(selfHostedEndpoints.actions["image.batch.refresh"].path, "/api/batch/{batch_id}/status");
  assert.equal(selfHostedEndpoints.supporting_endpoints.batch_download.path, "/api/batch/{batch_id}/download");
  assert.equal(selfHostedStartCard.schema, "2.0");
  assert.equal(selfHostedStartCard.config.update_multi, true);
  assert.equal(selfHostedStartCard.config.wide_screen_mode, true);
  assert.ok(Array.isArray(selfHostedStartCard.body.elements));
  assert.equal(Object.hasOwn(selfHostedStartCard, "elements"), false);
  assert.equal(findNamedObject(selfHostedStartCard, "image_generate_form")?.tag, "form");
  assert.equal(findNamedObject(selfHostedStartCard, "image_batch_form")?.tag, "form");
  assert.equal(findNamedObject(selfHostedStartCard, "submit_image_generate")?.form_action_type, "submit");
  assert.equal(findNamedObject(selfHostedStartCard, "submit_image_batch")?.form_action_type, "submit");
  assert.equal(findNamedObject(selfHostedStartCard, "reset_image_generate")?.form_action_type, "reset");
  assert.equal(findNamedObject(selfHostedStartCard, "reset_image_batch")?.form_action_type, "reset");
  const selfHostedActions = collectActionValues(selfHostedStartCard);
  assert.ok(selfHostedActions.includes("image.generate.submit"));
  assert.ok(selfHostedActions.includes("image.batch.submit"));
  assert.equal(selfHostedActions.includes("image.iterate.submit"), false);
  assert.equal(selfHostedActions.includes("image.batch.refresh"), false);
  const selfHostedCardsPy = fs.readFileSync(path.join(selfHostedFeishuHost, "cards.py"), "utf8");
  assert.match(selfHostedCardsPy, /"schema": "2\.0"/);
  assert.match(selfHostedCardsPy, /"body": \{"elements": elements\}/);
  assert.match(selfHostedCardsPy, /"form_action_type": "submit"/);
  assert.match(selfHostedCardsPy, /"behaviors": \[\{"type": "callback", "value": \{"action": "image\.iterate\.submit"/);
  assert.match(selfHostedCardsPy, /"behaviors": \[\{"type": "callback", "value": \{"action": "image\.batch\.refresh"/);
  assert.doesNotMatch(selfHostedCardsPy, /"tag": "action"/);
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
  assert.match(adapterCards, /export function buildStartCard/);
  assert.match(adapterCards, /name: "image_generate_form"/);
  assert.match(adapterCards, /name: "image_batch_form"/);
  assert.match(adapterCards, /name: "param_batch_items_json"/);
  assert.match(adapterCards, /action: "image\.batch\.submit"/);
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
  assert.ok(embeddedVerifyReport.checks.some((item) => item.name === "adapter:permissions-interactions" && item.status === "pass"));
  assert.ok(embeddedVerifyReport.checks.some((item) => item.name === "adapter:start-card-builder" && item.status === "pass"));
  assert.ok(embeddedVerifyReport.checks.some((item) => item.name === "adapter:typescript-compile" && item.status === "pass"));
  assert.ok(embeddedVerifyReport.checks.some((item) => item.name === "adapter:start-card-execution" && item.status === "pass"));
  assert.ok(embeddedVerifyReport.checks.some((item) => item.name === "adapter:handler-execution" && item.status === "pass"));
  assert.equal(embeddedVerifyReport.checks.some((item) => item.name.startsWith("runtime:/debug/")), false);
  const embeddedHostVerifyOutput = runExpectFailure([
    "verify",
    missingGenerated,
    "--mode",
    "embedded-adapter",
    "--host-runtime-url",
    "http://127.0.0.1:3978",
    "--runtime-url",
    "http://127.0.0.1:4999",
    "--simulate",
    "--strict",
  ]);
  assert.match(embeddedHostVerifyOutput, /embedded:host:\/health/);
  assert.match(embeddedHostVerifyOutput, /embedded:host:\/webhook\/card:challenge/);
  const embeddedHostVerifyReport = JSON.parse(fs.readFileSync(path.join(missingGenerated, "verification_report.json"), "utf8"));
  const embeddedHostVerifyMarkdown = fs.readFileSync(path.join(missingGenerated, "verification_report.md"), "utf8");
  assert.equal(embeddedHostVerifyReport.status, "fail");
  assert.equal(embeddedHostVerifyReport.context.runtimeUrl, "http://127.0.0.1:4999");
  assert.equal(embeddedHostVerifyReport.context.hostRuntimeUrl, "http://127.0.0.1:3978");
  assert.match(embeddedHostVerifyMarkdown, /Host runtime URL: http:\/\/127\.0\.0\.1:3978/);
  assert.doesNotMatch(embeddedHostVerifyMarkdown, /Runtime URL: http:\/\/127\.0\.0\.1:4999/);
  assert.equal(embeddedHostVerifyReport.context.simulate, true);
  assert.ok(embeddedHostVerifyReport.checks.some((item) => item.name === "embedded:host:/health" && item.status === "fail"));
  assert.ok(embeddedHostVerifyReport.checks.some((item) => item.name === "embedded:host:/webhook/card:challenge" && item.status === "fail"));
  assert.ok(embeddedHostVerifyReport.checks.some((item) => item.name === "embedded:host:/debug/simulate-card-action" && item.status === "warn"));
  const generatedIntegrationGuide = fs.readFileSync(path.join(missingGenerated, "docs", "integration_guide.md"), "utf8");
  assert.match(generatedIntegrationGuide, /--host-runtime-url/);
  assert.match(generatedIntegrationGuide, /buildStartCard/);
  assert.match(generatedIntegrationGuide, /param_template_id/);
  assert.match(generatedIntegrationGuide, /param_feedback/);
  assert.match(generatedIntegrationGuide, /param_batch_items_json/);
  assert.match(generatedIntegrationGuide, /image\.batch\.refresh/);
  assert.match(generatedIntegrationGuide, /failure card/);
  assert.match(generatedIntegrationGuide, /\/health/);
  assert.match(generatedIntegrationGuide, /\/webhook\/card/);
  assert.match(generatedIntegrationGuide, /\/debug\/simulate-card-action/);
  assert.doesNotMatch(generatedIntegrationGuide, /uploadImageToFeishu/);
  const embeddedOnlyGenerated = path.join(temp, "generated-embedded-only");
  run(["generate", workspace, "--out", embeddedOnlyGenerated, "--mode", "embedded-adapter"]);
  assert.ok(fs.existsSync(path.join(embeddedOnlyGenerated, "adapter", "handlers.ts")));
  assert.ok(fs.existsSync(path.join(embeddedOnlyGenerated, "docs", "integration_guide.md")));
  assert.equal(fs.existsSync(path.join(embeddedOnlyGenerated, "bot-runtime")), false);
  const embeddedOnlyCards = fs.readFileSync(path.join(embeddedOnlyGenerated, "adapter", "cards.ts"), "utf8");
  assert.match(embeddedOnlyCards, /const useJson2Card = false;/);
  assert.match(embeddedOnlyCards, /elements:\s*\[/);
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
  const embeddedOnlyContext = JSON.parse(fs.readFileSync(path.join(embeddedOnlyGenerated, "feishu_context.template.json"), "utf8"));
  const embeddedOnlyContextMarkdown = fs.readFileSync(path.join(embeddedOnlyGenerated, "feishu_context.template.md"), "utf8");
  const embeddedOnlyContextRequest = fs.readFileSync(path.join(embeddedOnlyGenerated, "feishu_context.request.md"), "utf8");
  const embeddedOnlyReplyTemplate = JSON.parse(fs.readFileSync(path.join(embeddedOnlyGenerated, "feishu_context.reply.template.json"), "utf8"));
  const embeddedOnlyReplyMarkdown = fs.readFileSync(path.join(embeddedOnlyGenerated, "feishu_context.reply.template.md"), "utf8");
  const embeddedOnlyCommands = embeddedOnlyContext.handoff_request.command_sets.flatMap((set) => set.commands);
  assert.ok(embeddedOnlyCommands.some((command) => command.includes("verify . --mode embedded-adapter --strict")));
  assert.ok(embeddedOnlyCommands.some((command) => command.includes("verify . --mode embedded-adapter --host-runtime-url http://127.0.0.1:3978 --simulate")));
  assert.ok(embeddedOnlyCommands.some((command) => command.includes("doctor . --mode embedded-adapter")));
  assert.equal(embeddedOnlyCommands.some((command) => command.includes("verify . --runtime-url")), false);
  assert.doesNotMatch(embeddedOnlyContextMarkdown, /bot-runtime\.env/);
  assert.doesNotMatch(embeddedOnlyContextMarkdown, /verify --level2/);
  assert.doesNotMatch(embeddedOnlyContextRequest, /bot-runtime\.env/);
  assert.doesNotMatch(embeddedOnlyContextRequest, /verify --level2/);
  assert.equal(embeddedOnlyReplyTemplate.next_local_steps.some((step) => step.includes("bot-runtime/.env") || step.includes("generated bot runtime") || step.includes("verify --level2")), false);
  assert.doesNotMatch(embeddedOnlyReplyMarkdown, /bot-runtime\.env|generated bot runtime|verify --level2/);
  const embeddedOnlyReadinessOutput = run(["readiness", embeddedOnlyGenerated]);
  assert.doesNotMatch(embeddedOnlyReadinessOutput, /Mode B embedded adapter path/);
  assert.doesNotMatch(embeddedOnlyReadinessOutput, /verify \. --runtime-url/);
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
  assert.match(embeddedOnlyIntegrationGuide, /buildStartCard/);
  assert.match(embeddedOnlyIntegrationGuide, /param_template_id/);
  assert.match(embeddedOnlyIntegrationGuide, /param_feedback/);
  assert.match(embeddedOnlyIntegrationGuide, /param_batch_items_json/);
  assert.match(embeddedOnlyIntegrationGuide, /image\.batch\.refresh/);
  assert.match(embeddedOnlyIntegrationGuide, /failure card/);
  assert.doesNotMatch(embeddedOnlyIntegrationGuide, /`bot-runtime\/` is a standalone reference host/);
  run(["verify", embeddedOnlyGenerated, "--mode", "embedded-adapter", "--strict"]);
  const permissionMismatchGenerated = path.join(temp, "generated-permission-mismatch");
  fs.cpSync(embeddedOnlyGenerated, permissionMismatchGenerated, { recursive: true });
  const permissionMismatchPath = path.join(permissionMismatchGenerated, "manifest", "required_permissions.json");
  const permissionMismatch = JSON.parse(fs.readFileSync(permissionMismatchPath, "utf8"));
  permissionMismatch.callbacks[0].required_by.push("missing.card");
  fs.writeFileSync(permissionMismatchPath, `${JSON.stringify(permissionMismatch, null, 2)}\n`, "utf8");
  const permissionMismatchOutput = runExpectFailure(["verify", permissionMismatchGenerated, "--mode", "embedded-adapter", "--strict"]);
  assert.match(permissionMismatchOutput, /adapter:permissions-interactions/);
  const permissionMismatchReport = JSON.parse(fs.readFileSync(path.join(permissionMismatchGenerated, "verification_report.json"), "utf8"));
  assert.ok(permissionMismatchReport.checks.some((item) => item.name === "adapter:permissions-interactions" && item.status === "fail" && item.detail.includes("missing.card")));
  const embeddedOnlyDoctorJson = JSON.parse(run(["doctor", embeddedOnlyGenerated, "--mode", "embedded-adapter", "--json"]));
  const embeddedOnlyDoctorOutput = run(["doctor", embeddedOnlyGenerated, "--mode", "embedded-adapter"]);
  assert.match(embeddedOnlyDoctorOutput, /Mode A external host \/ sidecar path/);
  assert.doesNotMatch(embeddedOnlyDoctorOutput, /Mode B embedded adapter path/);
  assert.equal(embeddedOnlyDoctorJson.integration_mode, "embedded-adapter");
  assert.equal(embeddedOnlyDoctorJson.package_validation.status, "pass");
  assert.equal(embeddedOnlyDoctorJson.gate_passed, false);
  assert.ok(embeddedOnlyDoctorJson.blockers.some((item) => item.includes("real Feishu Level 2 evidence")));
  assert.ok(embeddedOnlyDoctorJson.package_validation.checks.some((item) => item.name === "adapter:action:image.iterate.submit" && item.status === "pass"));
  assert.ok(embeddedOnlyDoctorJson.package_validation.checks.some((item) => item.name === "adapter:action:image.batch.submit" && item.status === "pass"));
  assert.ok(embeddedOnlyDoctorJson.package_validation.checks.some((item) => item.name === "adapter:action:image.batch.refresh" && item.status === "pass"));
  assert.equal(embeddedOnlyDoctorJson.blockers.some((item) => item.includes("bot-runtime/.env")), false);
  assert.match(runExpectFailure(["doctor", embeddedOnlyGenerated, "--mode", "embedded-adapter", "--gate"]), /Embedded adapter gate failed/);
  const embeddedLongGenerated = path.join(temp, "generated-embedded-long");
  run(["generate", workspace, "--out", embeddedLongGenerated, "--mode", "embedded-adapter", "--host-mode", "embedded-long-connection"]);
  const embeddedLongSummary = JSON.parse(fs.readFileSync(path.join(embeddedLongGenerated, "generation_summary.json"), "utf8"));
  assert.equal(embeddedLongSummary.schema_version, "0.2");
  assert.equal(embeddedLongSummary.host_receive_mode, "embedded-long-connection");
  const embeddedLongCards = fs.readFileSync(path.join(embeddedLongGenerated, "adapter", "cards.ts"), "utf8");
  assert.match(embeddedLongCards, /schema:\s*["']2\.0["']/);
  assert.match(embeddedLongCards, /body:\s*\{\s*elements/);
  assert.match(embeddedLongCards, /behaviors:\s*\[\{\s*type:\s*["']callback["'],\s*value:\s*\{\s*action:/);
  const embeddedLongReadme = fs.readFileSync(path.join(embeddedLongGenerated, "README.md"), "utf8");
  assert.match(embeddedLongReadme, /Host receive mode: embedded-long-connection/);
  assert.match(embeddedLongReadme, /card\.action\.trigger/);
  assert.doesNotMatch(embeddedLongReadme, /PUBLIC_CALLBACK_BASE_URL.*required/i);
  const embeddedLongContext = JSON.parse(fs.readFileSync(path.join(embeddedLongGenerated, "feishu_context.template.json"), "utf8"));
  assert.equal(embeddedLongContext.host_receive_mode, "embedded-long-connection");
  assert.equal(embeddedLongContext.handoff_request.required_values.some((item) => item.key === "PUBLIC_CALLBACK_BASE_URL" && item.required_for_level_2), false);
  const embeddedLongContextMarkdown = fs.readFileSync(path.join(embeddedLongGenerated, "feishu_context.template.md"), "utf8");
  assert.match(embeddedLongContextMarkdown, /long connection/i);
  assert.doesNotMatch(embeddedLongContextMarkdown, /\/webhook\/card/);
  assert.doesNotMatch(embeddedLongContextMarkdown, /- VERIFICATION_TOKEN/);
  assert.doesNotMatch(embeddedLongContextMarkdown, /- PUBLIC_CALLBACK_BASE_URL/);
  const embeddedLongReplyMarkdown = fs.readFileSync(path.join(embeddedLongGenerated, "feishu_context.reply.template.md"), "utf8");
  assert.match(embeddedLongReplyMarkdown, /long-connection host service's secret\/config system|long-connection host service/i);
  assert.doesNotMatch(embeddedLongReplyMarkdown, /PUBLIC_CALLBACK_BASE_URL/);
  assert.doesNotMatch(embeddedLongReplyMarkdown, /VERIFICATION_TOKEN/);
  assert.doesNotMatch(embeddedLongReplyMarkdown, /\/webhook\/card/);
  const embeddedLongLevel2Record = fs.readFileSync(path.join(embeddedLongGenerated, "level2_verification_record.md"), "utf8");
  assert.match(embeddedLongLevel2Record, /Host receive mode: embedded-long-connection/);
  assert.match(embeddedLongLevel2Record, /card\.action\.trigger/);
  assert.doesNotMatch(embeddedLongLevel2Record, /\/webhook\/card/);
  const embeddedLongIntegrationGuide = fs.readFileSync(path.join(embeddedLongGenerated, "docs", "integration_guide.md"), "utf8");
  assert.match(embeddedLongIntegrationGuide, /Host receive mode: embedded-long-connection/);
  assert.match(embeddedLongIntegrationGuide, /--host-mode embedded-long-connection/);
  assert.match(embeddedLongIntegrationGuide, /card\.action\.trigger/);
  assert.doesNotMatch(embeddedLongIntegrationGuide, /\/webhook\/card/);
  assert.ok(fs.existsSync(path.join(embeddedLongGenerated, "sidecar-long-connection", "README.md")));
  assert.ok(fs.existsSync(path.join(embeddedLongGenerated, "sidecar-long-connection", "local-contract-test.mjs")));
  const embeddedLongSidecarReadme = fs.readFileSync(path.join(embeddedLongGenerated, "sidecar-long-connection", "README.md"), "utf8");
  assert.match(embeddedLongSidecarReadme, /FEISHU_CONNECTION_MODE=websocket/);
  assert.match(embeddedLongSidecarReadme, /card\.action\.trigger/);
  assert.match(embeddedLongSidecarReadme, /IMAGE_AGENT_BASE_URL/);
  const sidecarContractOutput = runNode([path.join(embeddedLongGenerated, "sidecar-long-connection", "local-contract-test.mjs")], { cwd: embeddedLongGenerated });
  assert.match(sidecarContractOutput, /sidecar-long-connection contract: PASS/);
  const embeddedLongHostOutput = runExpectFailure([
    "verify",
    embeddedLongGenerated,
    "--mode",
    "embedded-adapter",
    "--host-mode",
    "embedded-long-connection",
    "--host-runtime-url",
    "http://127.0.0.1:3978",
    "--simulate",
    "--strict",
  ]);
  assert.match(embeddedLongHostOutput, /embedded:host:\/health/);
  assert.doesNotMatch(embeddedLongHostOutput, /embedded:host:\/webhook\/card:challenge/);
  const embeddedLongHostReport = JSON.parse(fs.readFileSync(path.join(embeddedLongGenerated, "verification_report.json"), "utf8"));
  assert.equal(embeddedLongHostReport.context.hostReceiveMode, "embedded-long-connection");
  assert.equal(embeddedLongHostReport.checks.some((item) => item.name === "embedded:host:/webhook/card:challenge"), false);
  const embeddedLongHostMarkdown = fs.readFileSync(path.join(embeddedLongGenerated, "verification_report.md"), "utf8");
  assert.doesNotMatch(embeddedLongHostMarkdown, /Provide `PUBLIC_CALLBACK_BASE_URL`/);
  assert.doesNotMatch(embeddedLongHostMarkdown, /\/webhook\/card/);
  const embeddedLongDoctorJson = JSON.parse(run(["doctor", embeddedLongGenerated, "--mode", "embedded-adapter", "--host-mode", "embedded-long-connection", "--json"]));
  assert.equal(embeddedLongDoctorJson.host_receive_mode, "embedded-long-connection");
  assert.equal(embeddedLongDoctorJson.blockers.some((item) => item.includes("/webhook/card")), false);
  const embeddedLongReadinessOutput = run(["readiness", embeddedLongGenerated]);
  assert.doesNotMatch(embeddedLongReadinessOutput, /Missing required values:.*PUBLIC_CALLBACK_BASE_URL/);
  assert.doesNotMatch(embeddedLongReadinessOutput, /Missing required values:.*VERIFICATION_TOKEN/);
  const embeddedLongHandoffStatus = fs.readFileSync(path.join(embeddedLongGenerated, "handoff_status.md"), "utf8");
  assert.match(embeddedLongHandoffStatus, /\| `PUBLIC_CALLBACK_BASE_URL` \| optional \| none \|/);
  assert.match(embeddedLongHandoffStatus, /\| `VERIFICATION_TOKEN` \| optional \| none \|/);
  const embeddedHybridGenerated = path.join(temp, "generated-embedded-hybrid");
  run(["generate", workspace, "--out", embeddedHybridGenerated, "--mode", "embedded-adapter", "--host-mode", "hybrid"]);
  const embeddedHybridCards = fs.readFileSync(path.join(embeddedHybridGenerated, "adapter", "cards.ts"), "utf8");
  assert.match(embeddedHybridCards, /schema:\s*["']2\.0["']/);
  assert.match(embeddedHybridCards, /body:\s*\{\s*elements/);
  assert.match(embeddedHybridCards, /behaviors:\s*\[\{\s*type:\s*["']callback["'],\s*value:\s*\{\s*action:/);
  const embeddedHybridContext = JSON.parse(fs.readFileSync(path.join(embeddedHybridGenerated, "feishu_context.template.json"), "utf8"));
  assert.equal(embeddedHybridContext.host_receive_mode, "hybrid");
  assert.equal(embeddedHybridContext.handoff_request.required_values.find((item) => item.key === "PUBLIC_CALLBACK_BASE_URL").required_for_level_2, true);
  assert.equal(embeddedHybridContext.handoff_request.required_values.find((item) => item.key === "VERIFICATION_TOKEN").required_for_level_2, true);
  const embeddedHybridStartHere = fs.readFileSync(path.join(embeddedHybridGenerated, "START_HERE.md"), "utf8");
  assert.match(embeddedHybridStartHere, /public callback URL/);
  assert.match(embeddedHybridStartHere, /long-connection host/);
  const embeddedHybridReadme = fs.readFileSync(path.join(embeddedHybridGenerated, "README.md"), "utf8");
  assert.match(embeddedHybridReadme, /webhook callback path/);
  assert.match(embeddedHybridReadme, /card\.action\.trigger/);
  const embeddedHybridReplyTemplate = JSON.parse(fs.readFileSync(path.join(embeddedHybridGenerated, "feishu_context.reply.template.json"), "utf8"));
  assert.ok(embeddedHybridReplyTemplate.next_local_steps.some((step) => step.includes("--host-mode hybrid")));
  const embeddedHybridLevel2Record = fs.readFileSync(path.join(embeddedHybridGenerated, "level2_verification_record.md"), "utf8");
  assert.match(embeddedHybridLevel2Record, /<PUBLIC_CALLBACK_BASE_URL>\/webhook\/card/);
  assert.match(embeddedHybridLevel2Record, /Long-connection gateway\/sidecar/);
  assert.match(embeddedHybridLevel2Record, /card\.action\.trigger/);
  const embeddedHybridGuide = fs.readFileSync(path.join(embeddedHybridGenerated, "docs", "integration_guide.md"), "utf8");
  assert.match(embeddedHybridGuide, /\/webhook\/card/);
  assert.match(embeddedHybridGuide, /card\.action\.trigger/);
  const embeddedHybridOutput = runExpectFailure([
    "verify",
    embeddedHybridGenerated,
    "--mode",
    "embedded-adapter",
    "--host-mode",
    "hybrid",
    "--host-runtime-url",
    "http://127.0.0.1:3978",
    "--simulate",
    "--strict",
  ]);
  assert.match(embeddedHybridOutput, /embedded:host:\/webhook\/card:challenge/);
  const embeddedHybridMarkdown = fs.readFileSync(path.join(embeddedHybridGenerated, "verification_report.md"), "utf8");
  assert.match(embeddedHybridMarkdown, /card\.action\.trigger/);
  const embeddedHybridDoctorJson = JSON.parse(run(["doctor", embeddedHybridGenerated, "--mode", "embedded-adapter", "--host-mode", "hybrid", "--json"]));
  assert.ok(embeddedHybridDoctorJson.blockers.some((item) => item.includes("/webhook/card") && item.includes("card.action.trigger")));
  assert.ok(embeddedHybridDoctorJson.next_actions.some((item) => item.includes("webhook") && item.includes("long-connection")));
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
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes(["dist", "index.js"].join(path.sep) + " status ."))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes(["dist", "index.js"].join(path.sep) + " init-local . --context --reply"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes(["dist", "index.js"].join(path.sep) + " configure . --strict --dry-run"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes(["dist", "index.js"].join(path.sep) + " doctor . --gate"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes(["dist", "index.js"].join(path.sep) + " doctor . --probe-target --gate"))));
  assert.ok(generatedContext.handoff_request.command_sets.some((set) => set.name === "generated_package_root" && set.commands.some((command) => command.includes(["dist", "index.js"].join(path.sep) + " verify ."))));
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
  const preserveGenerateOutput = run(["generate", workspace, "--out", preserveGenerated, "--force"]);
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
  const artifactPreserveOutput = run(["generate", workspace, "--out", artifactPreserveGenerated, "--force"]);
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
  const handoffCopyOutput = run(["handoff", generated, "--copy-to", handoffCopy, "--check"]);
  assert.match(handoffCopyOutput, /Sanitized handoff copy written/);
  assert.match(handoffCopyOutput, /Handoff check passed/);
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
  assertFileExists(path.join(handoffCopy, "adapter", "handlers.ts"));
  assertFileExists(path.join(handoffCopy, "adapter", "cards.ts"));
  assertFileExists(path.join(handoffCopy, "adapter", "service-client.ts"));
  assertFileExists(path.join(handoffCopy, "adapter", "validation.ts"));
  assertFileExists(path.join(handoffCopy, "adapter", "types.ts"));
  assertFileExists(path.join(handoffCopy, "adapter", "audit-events.ts"));
  assert.ok(fs.existsSync(path.join(handoffCopy, "bot-runtime", "src", "index.ts")));
  assert.ok(copiedHandoffManifestHasPath(handoffCopy, "bot-runtime/src/index.ts"));
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
  const selfHostedHandoffCopy = path.join(temp, "handoff-self-hosted-copy");
  const selfHostedHandoffOutput = run(["handoff", selfHostedGenerated, "--copy-to", selfHostedHandoffCopy, "--check"]);
  assert.match(selfHostedHandoffOutput, /Handoff check passed/);
  assert.ok(fs.existsSync(path.join(selfHostedHandoffCopy, "feishu-host", "app.py")));
  assert.ok(fs.existsSync(path.join(selfHostedHandoffCopy, "feishu-host", "handlers.py")));
  assert.ok(fs.existsSync(path.join(selfHostedHandoffCopy, "feishu-host", "service_client.py")));
  assert.ok(fs.existsSync(path.join(selfHostedHandoffCopy, "feishu-host", "validation.py")));
  assert.ok(fs.existsSync(path.join(selfHostedHandoffCopy, "feishu-host", "spec", "start_card.json")));
  assert.ok(copiedHandoffManifestHasPath(selfHostedHandoffCopy, "feishu-host/app.py"));
  assert.equal(copiedHandoffManifestHasPath(selfHostedHandoffCopy, "bot-runtime/src/index.ts"), false);
  assert.equal(fs.existsSync(path.join(selfHostedHandoffCopy, "feishu-host", ".env")), false);
  const embeddedLongHandoffCopy = path.join(temp, "handoff-embedded-long-copy");
  run(["handoff", embeddedLongGenerated, "--copy-to", embeddedLongHandoffCopy]);
  assert.ok(fs.existsSync(path.join(embeddedLongHandoffCopy, "sidecar-long-connection", "README.md")));
  assert.ok(fs.existsSync(path.join(embeddedLongHandoffCopy, "sidecar-long-connection", "local-contract-test.mjs")));
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
  assert.equal(capabilityMap.schema_version, "0.2");
  assert.equal(capabilityMap.target_profile, "image-agent-web");
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

test("generic HTTP API target can analyze generate and verify", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-generic-http-"));
  const target = path.join(temp, "support-desk-api");
  const workspace = path.join(temp, "out");
  const generated = path.join(temp, "generated");

  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "requirements.txt"), "fastapi==0.115.0\nuvicorn==0.30.0\n", "utf8");
  fs.writeFileSync(
    path.join(target, "README.md"),
    [
      "# Support Desk API",
      "",
      "A non-image HTTP service for querying and creating support tickets.",
      "",
      "- GET /health",
      "- GET /api/tickets/{ticket_id}",
      "- POST /api/items/{id}",
      "- POST /api/tickets",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(target, "main.py"),
    [
      "from fastapi import FastAPI",
      "app = FastAPI()",
      "@app.get(\"/health\")",
      "async def health(): pass",
      "@app.get(\"/api/tickets/{ticket_id}\")",
      "async def get_ticket(ticket_id: str): pass",
      "@app.post(\"/api/items/{id}\")",
      "async def update_item(id: str): pass",
      "@app.post(\"/api/tickets\")",
      "async def create_ticket(): pass",
    ].join("\n"),
    "utf8",
  );

  run(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--name", "support-desk-api"]);

  const serviceManifest = JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "service_manifest.json"), "utf8"));
  const capabilityMap = JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "capability_map.json"), "utf8"));
  const interactionContract = JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "interaction_contract.json"), "utf8"));
  const permissions = JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "required_permissions.json"), "utf8"));

  assert.equal(serviceManifest.schema_version, "0.2");
  assert.equal(serviceManifest.source_scan.analysis_strategy, "generic_http_api");
  assert.equal(fs.existsSync(path.join(workspace, "manifest", "image_agent_meta.snapshot.json")), false);
  assert.equal(capabilityMap.schema_version, "0.2");
  assert.equal(capabilityMap.target_profile, "generic-http-api");
  assert.equal(capabilityMap.capabilities.some((capability) => capability.id.startsWith("image.")), false);
  assert.ok(capabilityMap.capabilities.some((capability) => capability.id === "http.get.api.tickets.ticket_id" && capability.kind === "query"));
  assert.ok(capabilityMap.capabilities.some((capability) => capability.id === "http.post.api.tickets" && capability.kind === "action"));
  assert.ok(capabilityMap.capabilities.some((capability) => capability.source.method === "GET"));
  assert.ok(capabilityMap.capabilities.some((capability) => capability.artifacts.some((artifact) => artifact.type === "structured_data" && artifact.delivery === "card_json")));
  assert.equal(interactionContract.schema_version, "0.2");
  assert.ok(interactionContract.supported_triggers.includes("card_action"));
  assert.ok(interactionContract.supported_triggers.includes("http_request"));
  assert.ok(interactionContract.supported_result_modes.includes("interactive_card"));
  assert.ok(interactionContract.supported_result_modes.includes("structured_result"));
  assert.ok(interactionContract.interactions.some((interaction) => (
    interaction.capability_id === "http.post.api.tickets"
    && interaction.action_id === "http.post.api.tickets.submit"
    && interaction.input_mode === "form_action"
  )));
  assert.equal(JSON.stringify(permissions).includes("Slack"), false);
  assert.equal(JSON.stringify(permissions).includes("WeCom"), false);

  run(["generate", workspace, "--out", generated, "--mode", "embedded-adapter"]);
  const summary = JSON.parse(fs.readFileSync(path.join(generated, "generation_summary.json"), "utf8"));
  assert.equal(summary.schema_version, "0.2");
  assert.equal(summary.target_profile, "generic-http-api");
  for (const relativePath of [
    "adapter/handlers.ts",
    "adapter/service-client.ts",
    "adapter/cards.ts",
    "adapter/types.ts",
    "docs/integration_guide.md",
  ]) {
    assert.ok(fs.existsSync(path.join(generated, relativePath)), `${relativePath} should be generated`);
  }
  const generatedAdapter = [
    fs.readFileSync(path.join(generated, "adapter", "handlers.ts"), "utf8"),
    fs.readFileSync(path.join(generated, "adapter", "service-client.ts"), "utf8"),
    fs.readFileSync(path.join(generated, "adapter", "cards.ts"), "utf8"),
  ].join("\n");
  const genericStartHere = fs.readFileSync(path.join(generated, "START_HERE.md"), "utf8");
  const genericReadme = fs.readFileSync(path.join(generated, "README.md"), "utf8");
  const genericIntegrationGuide = fs.readFileSync(path.join(generated, "docs", "integration_guide.md"), "utf8");
  const genericLevel2Record = fs.readFileSync(path.join(generated, "level2_verification_record.md"), "utf8");
  const genericManualEvidence = JSON.parse(fs.readFileSync(path.join(generated, "level2_manual_evidence.template.json"), "utf8"));
  assert.match(generatedAdapter, /http\.post\.api\.tickets\.submit/);
  assert.match(generatedAdapter, /"name": "ticket_id"/);
  assert.match(generatedAdapter, /"name": "body_json"/);
  assert.doesNotMatch(generatedAdapter, /image\.generate|image\.iterate|image\.batch|image_url|session_id/);
  for (const generatedDoc of [genericReadme, genericIntegrationGuide]) {
    assert.match(generatedDoc, /Mode A is the external host, sidecar, or gateway path\./);
    assert.match(generatedDoc, /Mode B is the target-project embedded host-module path\./);
    assert.match(generatedDoc, /self-hosted-runtime produces the host module used by the verified sample and by future Mode B embedding\./);
    assert.match(generatedDoc, /handleGenericHttpCardAction/);
    assert.match(generatedDoc, /http\.post\.api\.tickets\.submit/);
    assert.match(generatedDoc, /targetBaseUrl/);
    assert.doesNotMatch(generatedDoc, /handleImageAgentCardAction|image_generate_form|image_batch_form|image\.generate|image\.iterate|image\.batch|MVP-1A image generation|image_url|session_id/);
  }
  for (const generatedDoc of [genericStartHere, genericLevel2Record]) {
    assert.match(generatedDoc, /Generic action ID|generic HTTP action|Generic HTTP Action Evidence/i);
    assert.match(generatedDoc, /target request summary|target response summary/i);
    assert.doesNotMatch(generatedDoc, /Generated image URL|Feishu image key|Batch ID|Batch download URL|image_url|session_id|image\.generate|image\.iterate|image\.batch/);
  }
  assert.equal(genericManualEvidence.target_profile, "generic-http-api");
  assert.ok(Object.prototype.hasOwnProperty.call(genericManualEvidence.values, "generic_action_id"));
  assert.ok(Object.prototype.hasOwnProperty.call(genericManualEvidence.values, "target_request_summary"));
  assert.equal(Object.prototype.hasOwnProperty.call(genericManualEvidence.values, "generated_image_url"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(genericManualEvidence.values, "batch_id"), false);
  const genericContractOutput = runNode([
    "--input-type=module",
    "--eval",
    genericAdapterContractScript(generated),
  ], { cwd: generated });
  assert.match(genericContractOutput, /generic adapter contract: PASS/);

  const verifyOutput = run(["verify", generated, "--mode", "embedded-adapter", "--strict"]);
  assert.match(verifyOutput, /adapter:action:http\.post\.api\.tickets\.submit/);
  const genericHandoffCopy = path.join(temp, "handoff-generic-embedded-copy");
  const genericHandoffOutput = run(["handoff", generated, "--copy-to", genericHandoffCopy, "--check"]);
  assert.match(genericHandoffOutput, /Sanitized handoff copy written/);
  assert.match(genericHandoffOutput, /Handoff check passed/);
  assert.ok(copiedHandoffManifestHasPath(genericHandoffCopy, "adapter/handlers.ts"));
  assert.equal(copiedHandoffManifestHasPath(genericHandoffCopy, "bot-runtime/src/index.ts"), false);
  assert.equal(copiedHandoffManifestHasPath(genericHandoffCopy, "manifest/image_agent_meta.snapshot.json"), false);
  assert.equal(fs.existsSync(path.join(genericHandoffCopy, "bot-runtime")), false);
  assert.equal(fs.existsSync(path.join(genericHandoffCopy, "manifest", "image_agent_meta.snapshot.json")), false);
  const doctorJson = JSON.parse(run(["doctor", generated, "--mode", "embedded-adapter", "--json"]));
  assert.equal(doctorJson.package_validation.status, "pass");
  assert.ok(doctorJson.package_validation.checks.some((item) => item.name === "adapter:action:http.post.api.tickets.submit" && item.status === "pass"));

  const generatedLong = path.join(temp, "generated-long");
  run(["generate", workspace, "--out", generatedLong, "--mode", "embedded-adapter", "--host-mode", "embedded-long-connection"]);
  const genericLongCards = fs.readFileSync(path.join(generatedLong, "adapter", "cards.ts"), "utf8");
  assert.match(genericLongCards, /schema:\s*["']2\.0["']/);
  assert.match(genericLongCards, /body:\s*\{\s*elements/);
  assert.match(genericLongCards, /behaviors:\s*\[\{\s*type:\s*["']callback["'],\s*value:\s*\{\s*action:/);
  const genericLongContext = JSON.parse(fs.readFileSync(path.join(generatedLong, "feishu_context.template.json"), "utf8"));
  assert.equal(genericLongContext.host_receive_mode, "embedded-long-connection");
  assert.equal(genericLongContext.handoff_request.required_values.some((item) => item.key === "PUBLIC_CALLBACK_BASE_URL" && item.required_for_level_2), false);
  const genericLongReplyMarkdown = fs.readFileSync(path.join(generatedLong, "feishu_context.reply.template.md"), "utf8");
  assert.doesNotMatch(genericLongReplyMarkdown, /PUBLIC_CALLBACK_BASE_URL|VERIFICATION_TOKEN|\/webhook\/card/);
  const genericLongReadinessOutput = run(["readiness", generatedLong]);
  assert.doesNotMatch(genericLongReadinessOutput, /Missing required values:.*PUBLIC_CALLBACK_BASE_URL/);
  assert.doesNotMatch(genericLongReadinessOutput, /Missing required values:.*VERIFICATION_TOKEN/);
  const genericLongDoctorJson = JSON.parse(run(["doctor", generatedLong, "--mode", "embedded-adapter", "--host-mode", "embedded-long-connection", "--json"]));
  assert.equal(genericLongDoctorJson.host_receive_mode, "embedded-long-connection");
  assert.equal(genericLongDoctorJson.blockers.some((item) => item.includes("/webhook/card") || item.includes("PUBLIC_CALLBACK_BASE_URL") || item.includes("VERIFICATION_TOKEN")), false);
  const genericSidecarReadme = fs.readFileSync(path.join(generatedLong, "sidecar-long-connection", "README.md"), "utf8");
  const genericSidecarTest = fs.readFileSync(path.join(generatedLong, "sidecar-long-connection", "local-contract-test.mjs"), "utf8");
  assert.match(genericSidecarReadme, /handleGenericHttpCardAction/);
  assert.match(genericSidecarReadme, /TARGET_BASE_URL/);
  assert.match(genericSidecarTest, /handleGenericHttpCardAction/);
  assert.doesNotMatch(`${genericSidecarReadme}\n${genericSidecarTest}`, /handleImageAgentCardAction|IMAGE_AGENT_BASE_URL|imageAgentBaseUrl|image\.generate|image_url|session_id|\/api\/generate/);
  const genericSidecarOutput = runNode([path.join(generatedLong, "sidecar-long-connection", "local-contract-test.mjs")], { cwd: generatedLong });
  assert.match(genericSidecarOutput, /sidecar-long-connection generic contract: PASS/);
});

test("calendar-stock-updater Node target can analyze generate and verify", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-calendar-stock-"));
  const target = path.join(temp, "calendar-stock-updater");
  const workspace = path.join(temp, "out");
  const generated = path.join(temp, "generated");
  const secondTargetPlan = fs.readFileSync(path.join(root, "docs", "second-target-validation-plan.md"), "utf8");

  assert.match(secondTargetPlan, /calendar-stock-updater/);
  assert.match(secondTargetPlan, /Mode A/);
  assert.match(secondTargetPlan, /Integration mode: embedded-adapter/);
  assert.match(secondTargetPlan, /Host receive mode: embedded-long-connection/);
  assert.doesNotMatch(secondTargetPlan, /PUBLIC_CALLBACK_BASE_URL.*required/i);
  assert.doesNotMatch(secondTargetPlan, /\/webhook\/card.*required/i);
  assert.match(secondTargetPlan, /query/i);
  assert.match(secondTargetPlan, /action/i);

  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "package.json"), JSON.stringify({ name: "calendar-stock-updater", scripts: { ui: "node server.js" } }, null, 2), "utf8");
  fs.writeFileSync(
    path.join(target, "README.md"),
    [
      "# 商品日历库存批量更新脚本",
      "",
      "Web console runs with npm run ui and exposes /api/state, /api/events, /api/run, and /api/stop.",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(target, "server.js"),
    [
      "const http = require('node:http');",
      "function createServer() {",
      "  return http.createServer(async (req, res) => {",
      "    const requestUrl = new URL(req.url, 'http://127.0.0.1:3069');",
      "    const { pathname } = requestUrl;",
      "    if (req.method === 'GET' && pathname === '/api/state') return res.end('{}');",
      "    if (req.method === 'GET' && pathname === '/api/events') return res.end('event: state\\n\\n');",
      "    if (req.method === 'POST' && pathname === '/api/run') return res.end('{\"ok\":true}');",
      "    if (req.method === 'POST' && pathname === '/api/stop') return res.end('{\"ok\":true}');",
      "    res.statusCode = 404;",
      "    res.end('{}');",
      "  });",
      "}",
      "module.exports = { createServer };",
    ].join("\n"),
    "utf8",
  );

  run(["analyze", target, "--base-url", "http://127.0.0.1:3069", "--out", workspace, "--name", "calendar-stock-updater"]);
  const serviceManifest = JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "service_manifest.json"), "utf8"));
  const capabilityMap = JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "capability_map.json"), "utf8"));
  assert.equal(serviceManifest.source_scan.analysis_strategy, "generic_http_api");
  assert.equal(capabilityMap.target_profile, "generic-http-api");
  assert.ok(capabilityMap.capabilities.some((capability) => capability.id === "http.get.api.state" && capability.kind === "query"));
  assert.ok(capabilityMap.capabilities.some((capability) => capability.id === "http.post.api.run" && capability.kind === "action"));
  assert.ok(serviceManifest.source_scan.endpoint_coverage.some((item) => (
    item.method === "POST"
    && item.path === "/api/stop"
    && item.status !== "supported"
  )));
  assert.ok(capabilityMap.capabilities.some((capability) => (
    capability.id === "http.post.api.stop"
    && capability.kind === "action"
    && capability.risk === "destructive"
  )));
  assert.equal(capabilityMap.capabilities.some((capability) => capability.id.startsWith("image.")), false);

  run(["generate", workspace, "--out", generated, "--mode", "embedded-adapter"]);
  const generatedAdapter = fs.readFileSync(path.join(generated, "adapter", "handlers.ts"), "utf8");
  const generatedAdapterCards = fs.readFileSync(path.join(generated, "adapter", "cards.ts"), "utf8");
  const generatedReadme = fs.readFileSync(path.join(generated, "README.md"), "utf8");
  const generatedStartHere = fs.readFileSync(path.join(generated, "START_HERE.md"), "utf8");
  assert.match(generatedAdapter, /http\.get\.api\.state\.submit/);
  assert.match(generatedAdapter, /http\.post\.api\.run\.submit/);
  assert.doesNotMatch(generatedAdapter, /http\.post\.api\.stop\.submit/);
  assert.doesNotMatch(generatedAdapter, /image\.generate|image_url|session_id/);
  assert.doesNotMatch(generatedAdapterCards, /image\.batch\.submit/);
  assert.doesNotMatch(generatedReadme, /image\.generate/);
  assert.match(generatedReadme, /doctor \. --mode embedded-adapter --probe-target --gate/);
  assert.match(generatedStartHere, /doctor \. --mode embedded-adapter --probe-target --gate/);
  const verifyOutput = run(["verify", generated, "--mode", "embedded-adapter", "--strict"]);
  assert.match(verifyOutput, /adapter:action:http\.get\.api\.state\.submit/);
  assert.match(verifyOutput, /adapter:action:http\.post\.api\.run\.submit/);
  assert.doesNotMatch(verifyOutput, /adapter:action:http\.post\.api\.stop\.submit/);
  assert.doesNotMatch(verifyOutput, /generate and batch|generate\/batch/);
  const readinessOutput = run(["readiness", generated]);
  assert.doesNotMatch(readinessOutput, /image\.generate|image_url|session_id/);
  const handoffOutput = run(["handoff", generated]);
  assert.match(handoffOutput, /Handoff manifest written/);
  assert.match(run(["handoff", generated, "--check"]), /Handoff check passed/);
  const handoffManifest = fs.readFileSync(path.join(generated, "handoff_manifest.md"), "utf8");
  assert.doesNotMatch(handoffManifest, /image\.generate|image_url|session_id/);
  const doctorJson = JSON.parse(run(["doctor", generated, "--mode", "embedded-adapter", "--json"]));
  assert.equal(doctorJson.package_validation.status, "pass");

  const generatedLong = path.join(temp, "generated-long");
  run(["generate", workspace, "--out", generatedLong, "--mode", "embedded-adapter", "--host-mode", "embedded-long-connection"]);
  const longSummary = JSON.parse(fs.readFileSync(path.join(generatedLong, "generation_summary.json"), "utf8"));
  assert.equal(longSummary.schema_version, "0.2");
  assert.equal(longSummary.integration_mode, "embedded-adapter");
  assert.equal(longSummary.host_receive_mode, "embedded-long-connection");
  const longPermissions = JSON.parse(fs.readFileSync(path.join(generatedLong, "manifest", "required_permissions.json"), "utf8"));
  assert.doesNotMatch(JSON.stringify(longPermissions), /Card callback verification token|verification_token/);
  assert.ok(longPermissions.callbacks.some((callback) => callback.callback === "card.action.trigger" && callback.security.includes("long_connection")));
  const longDeploymentChecklist = fs.readFileSync(path.join(generatedLong, "deployment_checklist.md"), "utf8");
  assert.match(longDeploymentChecklist, /doctor \. --mode embedded-adapter --host-mode embedded-long-connection --gate/);
  const longReadme = fs.readFileSync(path.join(generatedLong, "README.md"), "utf8");
  const longContextMarkdown = fs.readFileSync(path.join(generatedLong, "feishu_context.template.md"), "utf8");
  const longContextRequest = fs.readFileSync(path.join(generatedLong, "feishu_context.request.md"), "utf8");
  const longContextReply = fs.readFileSync(path.join(generatedLong, "feishu_context.reply.template.md"), "utf8");
  const longIntegrationGuide = fs.readFileSync(path.join(generatedLong, "docs", "integration_guide.md"), "utf8");
  const longLevel2Record = fs.readFileSync(path.join(generatedLong, "level2_verification_record.md"), "utf8");
  const longSidecarReadme = fs.readFileSync(path.join(generatedLong, "sidecar-long-connection", "README.md"), "utf8");
  const longContext = JSON.parse(fs.readFileSync(path.join(generatedLong, "feishu_context.template.json"), "utf8"));
  assert.equal(longContext.handoff_request.required_values.some((item) => item.key === "TARGET_BASE_URL" && item.required_for_level_2), true);
  assert.equal(longContext.handoff_request.required_values.some((item) => item.key === "IMAGE_AGENT_BASE_URL"), false);
  assert.match(`${longReadme}\n${longContextMarkdown}\n${longContextRequest}\n${longContextReply}\n${longIntegrationGuide}\n${longLevel2Record}\n${longSidecarReadme}`, /APP_ID/);
  assert.match(`${longReadme}\n${longContextMarkdown}\n${longContextRequest}\n${longContextReply}\n${longIntegrationGuide}\n${longLevel2Record}\n${longSidecarReadme}`, /APP_SECRET/);
  assert.match(`${longReadme}\n${longContextMarkdown}\n${longContextRequest}\n${longContextReply}\n${longIntegrationGuide}\n${longLevel2Record}\n${longSidecarReadme}`, /TEST_CHAT_ID/);
  assert.match(`${longReadme}\n${longContextMarkdown}\n${longContextRequest}\n${longContextReply}\n${longIntegrationGuide}\n${longLevel2Record}\n${longSidecarReadme}`, /TARGET_BASE_URL/);
  assert.match(longIntegrationGuide, /card\.action\.trigger/);
  assert.match(longIntegrationGuide, /handleGenericHttpCardAction\(\)/);
  assert.match(longLevel2Record, /card\.action\.trigger/);
  assert.match(longLevel2Record, /handleGenericHttpCardAction\(\)/);
  assert.doesNotMatch(`${longReadme}\n${longContextMarkdown}\n${longContextRequest}\n${longContextReply}\n${longIntegrationGuide}\n${longLevel2Record}`, /PUBLIC_CALLBACK_BASE_URL/);
  assert.doesNotMatch(`${longReadme}\n${longContextMarkdown}\n${longContextRequest}\n${longContextReply}\n${longIntegrationGuide}\n${longLevel2Record}`, /VERIFICATION_TOKEN/);
  assert.doesNotMatch(`${longReadme}\n${longContextMarkdown}\n${longContextRequest}\n${longContextReply}\n${longIntegrationGuide}\n${longLevel2Record}`, /\/webhook\/card/);
  const longCards = fs.readFileSync(path.join(generatedLong, "adapter", "cards.ts"), "utf8");
  assert.match(longCards, /schema:\s*["']2\.0["']/);
  assert.doesNotMatch(longCards, /http\.post\.api\.stop\.submit/);
  const longVerifyOutput = run(["verify", generatedLong, "--mode", "embedded-adapter", "--host-mode", "embedded-long-connection", "--strict"]);
  assert.match(longVerifyOutput, /adapter:action:http\.get\.api\.state\.submit/);
  assert.match(longVerifyOutput, /adapter:action:http\.post\.api\.run\.submit/);
  assert.doesNotMatch(longVerifyOutput, /adapter:action:http\.post\.api\.stop\.submit/);
  const longDoctorJson = JSON.parse(run(["doctor", generatedLong, "--mode", "embedded-adapter", "--host-mode", "embedded-long-connection", "--json"]));
  assert.equal(longDoctorJson.host_receive_mode, "embedded-long-connection");
  assert.equal(longDoctorJson.blockers.some((item) => item.includes("/webhook/card") || item.includes("PUBLIC_CALLBACK_BASE_URL") || item.includes("VERIFICATION_TOKEN")), false);
  const longReadinessOutput = run(["readiness", generatedLong]);
  assert.doesNotMatch(longReadinessOutput, /PUBLIC_CALLBACK_BASE_URL|VERIFICATION_TOKEN/);
  const longHandoffCopy = path.join(temp, "handoff-long");
  assert.match(run(["handoff", generatedLong, "--copy-to", longHandoffCopy, "--check"]), /Handoff check passed/);
  assert.ok(fs.existsSync(path.join(longHandoffCopy, "docs", "integration_guide.md")));
});

test("calendar-stock-updater business profile generates typed long-connection cards", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-calendar-profile-"));
  const target = path.join(temp, "calendar-target");
  const workspace = path.join(temp, "out");
  const generated = path.join(temp, "generated");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "server.js"), [
    "if (req.method === 'GET' && pathname === '/api/state') {}",
    "if (req.method === 'GET' && pathname === '/api/events') {}",
    "if (req.method === 'POST' && pathname === '/api/run') {}",
    "if (req.method === 'POST' && pathname === '/api/stop') {}",
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(target, "task-config.js"), "function resolveProductIdRange() {}\n", "utf8");
  fs.writeFileSync(path.join(target, "update-calendar-stock.js"), "// updateAllSkuRows SPECIAL_SKU_KEYWORD\n", "utf8");

  run(["analyze", target, "--base-url", "http://127.0.0.1:1", "--out", workspace, "--name", "calendar-stock-updater"]);
  run(["plan", workspace]);
  const service = JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "service_manifest.json"), "utf8"));
  const capabilities = JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "capability_map.json"), "utf8"));
  assert.equal(service.source_scan.analysis_strategy, "calendar_stock_updater");
  assert.equal(capabilities.target_profile, "calendar-stock-updater");
  assert.deepEqual(capabilities.capabilities.map((item) => item.id).sort(), ["calendar.status", "calendar.task.run", "calendar.task.stop"]);
  assert.deepEqual(capabilities.capabilities.map((item) => item.source.path).sort(), ["/api/run", "/api/state", "/api/stop"]);
  assert.ok(service.source_scan.endpoint_coverage.some((item) => item.path === "/api/events" && item.status === "supporting"));

  run(["generate", workspace, "--out", generated, "--mode", "embedded-adapter", "--host-mode", "embedded-long-connection"]);
  const cards = fs.readFileSync(path.join(generated, "adapter", "cards.ts"), "utf8");
  const handlers = fs.readFileSync(path.join(generated, "adapter", "handlers.ts"), "utf8");
  const contract = JSON.parse(fs.readFileSync(path.join(generated, "manifest", "profile_contract.json"), "utf8"));
  const startHere = fs.readFileSync(path.join(generated, "START_HERE.md"), "utf8");
  const level2Record = fs.readFileSync(path.join(generated, "level2_verification_record.md"), "utf8");
  const deploymentChecklist = fs.readFileSync(path.join(generated, "deployment_checklist.md"), "utf8");
  const cardPlan = fs.readFileSync(path.join(generated, "card_plan.md"), "utf8");
  const manualEvidence = JSON.parse(fs.readFileSync(path.join(generated, "level2_manual_evidence.template.json"), "utf8"));
  const context = JSON.parse(fs.readFileSync(path.join(generated, "feishu_context.template.json"), "utf8"));
  const contextMarkdown = fs.readFileSync(path.join(generated, "feishu_context.template.md"), "utf8");
  const contextRequest = fs.readFileSync(path.join(generated, "feishu_context.request.md"), "utf8");
  for (const adapterFile of ["cards.ts", "handlers.ts", "service-client.ts", "validation.ts", "types.ts", "audit-events.ts"]) {
    const adapterSource = fs.readFileSync(path.join(generated, "adapter", adapterFile), "utf8");
    assert.doesNotMatch(adapterSource, /@ts-nocheck|@ts-ignore|@ts-expect-error/, `calendar adapter ${adapterFile} must not suppress TypeScript checks`);
  }
  const safeCardRuntimeOutput = runNode(["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import http from "node:http";
    import path from "node:path";
    import { pathToFileURL } from "node:url";

    const generatedRoot = path.resolve(process.argv[1]);
    const cards = await import(pathToFileURL(path.join(generatedRoot, "adapter", "cards.js")).href);
    const handlers = await import(pathToFileURL(path.join(generatedRoot, "adapter", "handlers.js")).href);
    const validation = await import(pathToFileURL(path.join(generatedRoot, "adapter", "validation.js")).href);
    const longMessage = "第一行\\n第二行 " + "长消息".repeat(80);
    const operations = cards.buildOperationsCard({ task: { status: "running", currentMessage: longMessage }, logs: [] });
    const currentLine = operations.body.elements[0].content.split("\\n").find((line) => line.startsWith("**当前消息：**"));
    assert.ok(currentLine);
    assert.match(currentLine, /第一行 第二行/);
    assert.doesNotMatch(currentLine, /第一行\\n第二行/);
    assert.ok(currentLine.endsWith("…"));
    assert.ok(currentLine.length <= "**当前消息：** ".length + 120);

    const stopCard = cards.buildStopConfirmationCard({ confirmationId: "confirm-1", task: { currentMessage: longMessage } });
    const stopText = stopCard.body.elements[0].content.split("\\n").at(-1);
    assert.match(stopText, /当前消息：第一行 第二行/);
    assert.ok(stopText.endsWith("…"));

    const sensitiveOperations = cards.buildOperationsCard({
      task: { status: "running", currentMessage: "https://internal.example/task APP_SECRET=status-secret ou_status" },
      logs: [
        { timestamp: "2026-07-17T01:00:00Z", message: "正常日志" },
        { timestamp: "2026-07-17T01:00:01Z", message: "operator_open_id=ou_log chat_id=oc_log token=log-secret" },
      ],
    });
    const sensitiveText = JSON.stringify(sensitiveOperations);
    assert.match(sensitiveText, /状态消息已脱敏/);
    assert.match(sensitiveText, /日志内容已脱敏/);
    assert.doesNotMatch(sensitiveText, /internal\.example|status-secret|ou_status|ou_log|oc_log|log-secret|operator_open_id|chat_id/i);

    const sensitiveStopCard = JSON.stringify(cards.buildStopConfirmationCard({
      confirmationId: "confirm-sensitive",
      task: { currentMessage: "<html>private status</html>" },
    }));
    assert.match(sensitiveStopCard, /状态消息已脱敏/);
    assert.doesNotMatch(sensitiveStopCard, /html|private status/i);

    const bareAuthOperations = JSON.stringify(cards.buildOperationsCard({
      task: { status: "running", currentMessage: "auth=status-auth-value" },
      logs: [{ timestamp: "2026-07-17T01:00:02Z", message: "auth=log-auth-value" }],
    }));
    assert.match(bareAuthOperations, /状态消息已脱敏/);
    assert.match(bareAuthOperations, /日志内容已脱敏/);
    assert.doesNotMatch(bareAuthOperations, /status-auth-value|log-auth-value|auth=/i);
    const bareAuthStop = JSON.stringify(cards.buildStopConfirmationCard({ confirmationId: "confirm-auth", task: { currentMessage: "auth=stop-auth-value" } }));
    assert.match(bareAuthStop, /状态消息已脱敏/);
    assert.doesNotMatch(bareAuthStop, /stop-auth-value|auth=/i);
    const bareAuthFailure = JSON.stringify(cards.buildFailureCard("auth=failure-auth-value"));
    assert.match(bareAuthFailure, /操作失败，请检查目标服务与模块配置后重试/);
    assert.doesNotMatch(bareAuthFailure, /failure-auth-value|auth=/i);

    assert.throws(() => validation.calendarTaskInput({ targetDate: "2026-07-17", stock: "1", stepDelayMs: "10001" }, "run"), /普通操作停顿/);
    assert.throws(() => validation.assertAllowedOperator("ou_denied", []), /尚未配置获准操作人/);
    assert.throws(() => validation.assertAllowedOperator("ou_denied", ["ou_allowed"]), /当前操作人未获授权/);
    const missingAllowlist = await handlers.handleCardAction(
      { action: "calendar.status.refresh", operatorOpenId: "ou_denied" },
      { targetBaseUrl: "http://127.0.0.1:1", allowedOperatorOpenIds: [] },
    );
    const unauthorized = await handlers.handleCardAction(
      { action: "calendar.status.refresh", operatorOpenId: "ou_denied" },
      { targetBaseUrl: "http://127.0.0.1:1", allowedOperatorOpenIds: ["ou_allowed"] },
    );
    const authorizationCards = JSON.stringify([missingAllowlist.card, unauthorized.card]);
    assert.match(authorizationCards, /尚未配置获准操作人/);
    assert.match(authorizationCards, /当前操作人未获授权/);
    assert.doesNotMatch(authorizationCards, /No approved operators|Operator is not authorized/i);
    const rawFailure = JSON.stringify(cards.buildFailureCard("APP_SECRET=top-secret <html>private</html>"));
    assert.doesNotMatch(rawFailure, /APP_SECRET|top-secret|html|private/i);

    const rawTargetBody = "APP_SECRET=target-secret <html>gateway detail</html>";
    const server = http.createServer((_request, response) => {
      response.statusCode = 502;
      response.end(rawTargetBody);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("mock server did not expose a TCP address");
      const result = await handlers.handleCardAction(
        { action: "calendar.status.refresh", operatorOpenId: "ou_allowed" },
        { targetBaseUrl: "http://127.0.0.1:" + address.port, allowedOperatorOpenIds: ["ou_allowed"] },
      );
      const rendered = JSON.stringify(result.card);
      assert.equal(result.ok, false);
      assert.match(rendered, /HTTP 502/);
      assert.doesNotMatch(rendered, /APP_SECRET|target-secret|html|gateway detail/i);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    console.log("calendar safe card text: PASS");
  `, generated]);
  assert.match(safeCardRuntimeOutput, /calendar safe card text: PASS/);
  assert.match(cards, /calendar_task_form/);
  assert.match(cards, /calendar\.task\.run\.prepare/);
  assert.match(cards, /schema: "2\.0"/);
  assert.doesNotMatch(cards, /body_json|\/api\/events|taskMode|special-window|targeted-window/);
  const operationsCardSource = cards.slice(cards.indexOf("export function buildOperationsCard"), cards.indexOf("export function buildRunConfirmationCard"));
  const runConfirmationSource = cards.slice(cards.indexOf("export function buildRunConfirmationCard"), cards.indexOf("export function buildStopConfirmationCard"));
  const stopConfirmationSource = cards.slice(cards.indexOf("export function buildStopConfirmationCard"), cards.indexOf("export function buildFailureCard"));
  assert.match(operationsCardSource, /状态摘要/);
  assert.match(operationsCardSource, /仅显示最近 8 条/);
  assert.match(operationsCardSource, /长行会截断/);
  assert.match(cards, /timestamp|createdAt|item\.time/);
  for (const field of ["targetDate", "stock", "stepDelayMs", "datePickerDelayMs", "startProductId", "endProductId"]) {
    assert.match(runConfirmationSource, new RegExp(field));
  }
  assert.match(runConfirmationSource, /风险提示/);
  assert.match(stopConfirmationSource, /当前运行任务/);
  assert.doesNotMatch(`${operationsCardSource}\n${runConfirmationSource}\n${stopConfirmationSource}`, /⚠️|✅|❌|🚨/u);
  assert.match(handlers, /handleCardAction/);
  assert.match(handlers, /calendar\.task\.stop\.confirm/);
  assert.doesNotMatch(handlers, /\/api\/(run|stop)\/(prepare|confirm|cancel)/);
  assert.ok(fs.existsSync(path.join(generated, "integrations", "lark", "install-manifest.json")));
  assert.match(startHere, /install \. --target/);
  assert.match(level2Record, /Calendar Mode B/);
  assert.match(level2Record, /mode=dry-run/);
  for (const fieldLabel of [
    "Start card message ID",
    "Status result message ID or screenshot",
    "Dry-run result message ID or screenshot",
    "Formal-run confirmation/result message IDs or screenshots",
    "Stop confirmation/result message IDs or screenshots",
    "Sanitized host log path",
    "Trace ID",
  ]) {
    assert.match(level2Record, new RegExp(`- ${fieldLabel}:`));
  }
  for (const completionLabel of [
    "Level 2 verified.",
    "Remaining issues documented.",
    "This generated package can be handed to another FDE using `README.md`, `deployment_checklist.md`, and this file.",
  ]) {
    assert.match(level2Record, new RegExp(`- \\[ \\] ${completionLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
  assert.doesNotMatch(level2Record, /Real Feishu Level 2 verified|Generic action ID|Target request summary|Target response summary|Result card message ID or screenshot|Generated image|Batch ID|Batch status|Batch download/i);
  assert.doesNotMatch(level2Record, /image_url|Generated image|Batch ID/);
  for (const endpoint of ["GET /api/state", "POST /api/run", "POST /api/stop"]) {
    assert.match(deploymentChecklist, new RegExp(endpoint.replace("/", "\\/")));
  }
  assert.match(deploymentChecklist, /dry-run/i);
  assert.match(deploymentChecklist, /install .*--apply/is);
  assert.match(deploymentChecklist, /integrations[\\/]lark/);
  assert.match(deploymentChecklist, /module-local|模块本地/i);
  assert.match(deploymentChecklist, /npm test/);
  assert.match(deploymentChecklist, /real Feishu Level 2|真实飞书 Level 2/i);
  assert.match(cardPlan, /status|状态/i);
  assert.match(cardPlan, /dry-run|预演/i);
  assert.match(cardPlan, /prepare|confirm|cancel/i);
  assert.match(cardPlan, /recent logs|最近日志/i);
  assert.doesNotMatch(`${deploymentChecklist}\n${cardPlan}`, /\/api\/meta|generated image|image preview|image batch|\/api\/batch|Mount generated `adapter`|统一启动|unified startup/i);
  assert.equal(typeof manualEvidence.values.run_confirmation_message_id, "string");
  assert.deepEqual(Object.keys(manualEvidence.values).sort(), [
    "date",
    "dry_run_result_message_id",
    "dry_run_screenshot",
    "feishu_app_name",
    "notes",
    "operator",
    "run_confirmation_message_id",
    "run_result_message_id",
    "run_result_screenshot",
    "sanitized_host_log_path",
    "start_message_id",
    "status_result_message_id",
    "status_screenshot",
    "stop_confirmation_message_id",
    "stop_result_message_id",
    "stop_result_screenshot",
    "test_chat",
    "trace_id",
  ]);
  assert.equal("generated_image_url" in manualEvidence.values, false);
  assert.equal("batch_id" in manualEvidence.values, false);
  assert.equal("generic_action_id" in manualEvidence.values, false);
  assert.equal("target_request_summary" in manualEvidence.values, false);
  assert.equal("target_response_summary" in manualEvidence.values, false);
  assert.equal(context.target_profile, "calendar-stock-updater");
  assert.equal(Object.hasOwn(context.runtime_config, "upload_image_to_lark"), false);
  assert.deepEqual(Object.keys(context.runtime_config).sort(), ["allowed_operator_open_ids", "target_timeout_seconds", "target_wait_seconds"]);
  const existingAppQuestion = context.readiness_questions.find((item) => item.id === "existing_feishu_app")?.question || "";
  assert.match(existingAppQuestion, /FEISHU_APP_ID and FEISHU_APP_SECRET/);
  assert.ok(context.handoff_request.required_values.some((item) => item.key === "FEISHU_APP_ID"));
  assert.equal(context.handoff_request.required_values.some((item) => item.key === "APP_ID"), false);
  assert.ok(context.handoff_request.verification_commands.some((command) => command.includes(" install ")));
  assert.match(`${contextMarkdown}\n${contextRequest}`, /integrations\/lark/);
  assert.doesNotMatch(`${contextMarkdown}\n${contextRequest}`, /UPLOAD_IMAGE_TO_LARK/);
  assert.doesNotMatch(`${contextMarkdown}\n${contextRequest}`, /mount the adapter in the existing Feishu SDK host/i);
  assert.equal(contract.profile_id, "calendar-stock-updater");
  assert.match(run(["verify", generated, "--mode", "embedded-adapter", "--host-mode", "embedded-long-connection", "--strict"]), /adapter:action:calendar\.task\.run\.confirm/);
  const verificationReport = JSON.parse(fs.readFileSync(path.join(generated, "verification_report.json"), "utf8"));
  assert.equal(verificationReport.checks.some((check) => String(check.name).startsWith("target:")), false);
  const verificationMarkdown = fs.readFileSync(path.join(generated, "verification_report.md"), "utf8");
  assert.doesNotMatch(verificationMarkdown, /IMAGE_AGENT_BASE_URL|\/api\/meta|generated images?|batch paths?|bot-runtime/i);
  const readinessOutput = run(["readiness", generated]);
  assert.match(readinessOutput, /Readiness status:/);
  const handoffStatus = fs.readFileSync(path.join(generated, "handoff_status.md"), "utf8");
  assert.match(readinessOutput, /Delivery mode: .*installable Mode B.*integrations[\\/]lark/i);
  assert.match(handoffStatus, /Env file checked: .*integrations[\\/]lark[\\/].env/);
  assert.match(handoffStatus, /installable Mode B .*integrations[\\/]lark/i);
  for (const key of ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "TEST_CHAT_ID", "TARGET_BASE_URL", "ALLOWED_OPERATOR_OPEN_IDS"]) {
    assert.equal(handoffStatus.includes(`| \`${key}\` |`), true);
  }
  for (const key of ["APP_ID", "APP_SECRET", "IMAGE_AGENT_BASE_URL", "PUBLIC_CALLBACK_BASE_URL", "VERIFICATION_TOKEN"]) {
    assert.equal(handoffStatus.includes(`| \`${key}\` |`), false);
  }
  assert.match(handoffStatus, /\| `TARGET_TIMEOUT_MS` \| provided \| context \|/);
  assert.match(handoffStatus, /\| `TARGET_WAIT_MS` \| provided \| context \|/);
  for (const key of ["CARD_ACTION_MODE", "UPLOAD_IMAGE_TO_LARK", "HOST", "PORT", "DEBUG_ACCESS_TOKEN", "ALLOW_DEBUG_WITHOUT_FEISHU"]) {
    assert.equal(handoffStatus.includes(`| \`${key}\` |`), false);
  }
  assert.match(handoffStatus, /Current required module values are missing or incomplete: `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `TEST_CHAT_ID`, `ALLOWED_OPERATOR_OPEN_IDS`/);
  for (const phrase of [
    /Start or expose the calendar target service so `GET <TARGET_BASE_URL>\/api\/state` passes/i,
    /Run `node \$env:LARK_DEPLOYER_CLI install \. --target <calendar-project> --target-base-url http:\/\/127\.0\.0\.1:1` to review the zero-write install plan/i,
    /Run `node \$env:LARK_DEPLOYER_CLI install \. --target <calendar-project> --target-base-url http:\/\/127\.0\.0\.1:1 --apply` after reviewing the dry-run/i,
    /Copy `integrations\/lark\/.env\.example` to `integrations\/lark\/.env` and fill/i,
    /Run `npm install` inside `integrations\/lark`/i,
    /Run `npm test` inside `integrations\/lark`/i,
    /Run `npm start` inside `integrations\/lark`/i,
  ]) {
    assert.match(handoffStatus, phrase);
  }
  assert.match(handoffStatus, /Manually copy private worksheet values into matching fields in `level2_verification_record\.md`/);
  assert.doesNotMatch(handoffStatus, /Import command:|--manual-evidence|init-local|\bconfigure\b|mount the adapter|existing Feishu SDK host|host simulation|--host-runtime-url|automated evidence import/i);
  assert.match(handoffStatus, /Status result message ID or screenshot|status_result_message_id/);
  assert.match(handoffStatus, /Dry-run result message ID or screenshot|dry_run_result_message_id/);
  assert.match(handoffStatus, /Formal-run confirmation\/result message IDs or screenshots|run_confirmation_message_id/);
  assert.match(handoffStatus, /Stop confirmation\/result message IDs or screenshots|stop_confirmation_message_id/);
  assert.match(handoffStatus, /sanitized_host_log_path/);
  assert.doesNotMatch(handoffStatus, /\/api\/meta|Generic action ID|target_request_summary|target_response_summary|generated_image_url|batch_id|batch_status|batch_download/i);
  const doctorReportPath = path.join(generated, "doctor_report.json");
  assert.match(run(["doctor", generated, "--out", doctorReportPath, "--json"]), /Doctor report written/);
  const doctorJson = JSON.parse(fs.readFileSync(doctorReportPath, "utf8"));
  assert.equal(doctorJson.missing_required_values.includes("ALLOWED_OPERATOR_OPEN_IDS"), true);
  assert.equal(doctorJson.missing_required_values.includes("APP_ID"), false);
  assert.equal(doctorJson.missing_required_values.includes("APP_SECRET"), false);
  assert.equal(doctorJson.target_preflight.check_name, "target:/api/state");
  assert.equal(doctorJson.target_preflight.check_path, "/api/state");
  assert.equal(doctorJson.target_preflight.status, "missing");
  assert.equal(doctorJson.target_preflight.check_url, "http://127.0.0.1:1/api/state");
  assert.equal(doctorJson.target_preflight.live_probe.check_url, "http://127.0.0.1:1/api/state");
  assert.deepEqual(doctorJson.manual_evidence.missing_fields, [
    "date",
    "operator",
    "feishu_app_name",
    "test_chat",
    "start_message_id",
    "status_result_message_id",
    "status_screenshot",
    "dry_run_result_message_id",
    "dry_run_screenshot",
    "run_confirmation_message_id",
    "run_result_message_id",
    "run_result_screenshot",
    "stop_confirmation_message_id",
    "stop_result_message_id",
    "stop_result_screenshot",
    "sanitized_host_log_path",
    "trace_id",
    "notes",
  ]);
  assert.equal(doctorJson.blockers.some((item) => item.includes("verify --level2")), false);
  assert.doesNotMatch(JSON.stringify(doctorJson), /\/api\/meta|generated_image_url|batch_id|batch_status|batch_download|generic_action_id|target_request_summary|target_response_summary/i);
  const doctorMarkdown = fs.readFileSync(path.join(generated, "doctor_report.md"), "utf8");
  assert.match(doctorMarkdown, /installable Mode B .*integrations[\\/]lark/i);
  assert.doesNotMatch(doctorMarkdown, /existing host|verify --level2/i);
  const handoffCopy = path.join(temp, "handoff-copy");
  assert.match(run(["handoff", generated, "--copy-to", handoffCopy, "--check"]), /Handoff check passed/);
  const copiedContext = JSON.parse(fs.readFileSync(path.join(handoffCopy, "feishu_context.template.json"), "utf8"));
  const copiedCommands = copiedContext.handoff_request.command_sets.flatMap((set) => set.commands);
  assert.ok(copiedCommands.some((command) => /\bstatus\b/.test(command)));
  assert.ok(copiedCommands.some((command) => /\breadiness\b/.test(command)));
  assert.ok(copiedCommands.some((command) => /\bdoctor\b/.test(command) && !command.includes("--probe-target") && !command.includes("--gate")));
  assert.ok(copiedCommands.some((command) => /\bdoctor\b/.test(command) && command.includes("--probe-target") && command.includes("--gate")));
  assert.ok(copiedCommands.some((command) => /\bverify\b/.test(command) && command.includes("--mode embedded-adapter") && command.includes("--host-mode embedded-long-connection") && command.includes("--strict")));
  assert.ok(copiedCommands.some((command) => /\binstall\b/.test(command) && command.includes("--target <calendar-project>") && command.includes("--target-base-url http://127.0.0.1:1") && !command.includes("--apply")));
  assert.ok(copiedCommands.some((command) => /\binstall\b/.test(command) && command.includes("--target <calendar-project>") && command.includes("--target-base-url http://127.0.0.1:1") && command.includes("--apply")));
  assert.ok(copiedCommands.some((command) => /\bhandoff\b/.test(command)));
  assert.equal(copiedCommands.some((command) => /init-local|\bconfigure\b|--simulate|--host-runtime-url|\bevidence\b/i.test(command)), false);
  const copiedManifest = JSON.parse(fs.readFileSync(path.join(handoffCopy, "handoff_manifest.json"), "utf8"));
  assert.deepEqual(copiedManifest.warnings, []);
  const copiedExcludedPaths = copiedManifest.excluded_paths.map((item) => item.path).sort();
  assert.deepEqual(copiedExcludedPaths, [
    "feishu_context.local.json",
    "feishu_context.reply.local.json",
    "feishu_context.reply.local.md",
    "integrations/lark/.code2lark-install.json",
    "integrations/lark/.env",
    "integrations/lark/node_modules",
    "integrations/lark/npm-debug.log",
    "level2_manual_evidence.local.json",
  ].sort());
  assert.equal(copiedExcludedPaths.some((item) => /bot-runtime|feishu-host|configure_report/.test(item)), false);
  const copiedDoctorJson = JSON.parse(fs.readFileSync(path.join(handoffCopy, "doctor_report.json"), "utf8"));
  assert.equal(copiedDoctorJson.target_preflight.check_name, "target:/api/state");
  assert.equal(copiedDoctorJson.target_preflight.check_path, "/api/state");
  assert.equal(copiedDoctorJson.blockers.some((item) => item.includes("verify --level2")), false);
  const copiedHandoffStatus = fs.readFileSync(path.join(handoffCopy, "handoff_status.md"), "utf8");
  assert.doesNotMatch(copiedCommands.join("\n"), /init-local|\bconfigure\b|--simulate|--host-runtime-url|\bevidence\b/i);
  assert.doesNotMatch(`${JSON.stringify(copiedDoctorJson)}\n${copiedHandoffStatus}`, /init-local|\bconfigure\b|--simulate|--host-runtime-url|\bevidence\s+\.|--manual-evidence|`APP_ID`|`APP_SECRET`|IMAGE_AGENT_BASE_URL|PUBLIC_CALLBACK_BASE_URL|VERIFICATION_TOKEN|\/api\/meta/i);
  assert.match(runNode([path.join(generated, "sidecar-long-connection", "local-contract-test.mjs")], { cwd: generated }), /calendar contract: PASS/);
});

test("image-agent-web mapping profile is isolated from generator orchestration", () => {
  const profileSource = fs.readFileSync(path.join(root, "src", "profiles", "image-agent-web.ts"), "utf8");
  const generateSource = fs.readFileSync(path.join(root, "src", "commands", "generate.ts"), "utf8");
  assert.match(profileSource, /IMAGE_AGENT_WEB_PROFILE/);
  assert.match(profileSource, /image\.generate\.submit/);
  assert.match(profileSource, /\/api\/batch\/\{batch_id\}\/status/);
  for (const builderName of [
    "adapterServiceClientTs",
    "adapterServiceClientJs",
    "adapterCardsTs",
    "adapterCardsJs",
    "adapterHandlersTs",
    "adapterHandlersJs",
    "pythonHostCardsPy",
    "pythonHostServiceClientPy",
    "pythonHostHandlersPy",
    "pythonHostLocalContractTestPy",
    "buildPythonHostEndpointsSpec",
    "buildStartCardSpec",
    "runtimeImageAgentClientTs",
    "runtimeCardsTs",
    "runtimeIndexTs",
  ]) {
    assert.match(profileSource, new RegExp(`export function ${builderName}\\b`));
    assert.match(generateSource, new RegExp(`\\b${builderName}\\(`));
    assert.doesNotMatch(generateSource, new RegExp(`function ${builderName}\\b`));
  }
  assert.match(profileSource, /export function buildBatchStatusCard/);
  assert.match(profileSource, /export function buildSuccessCard/);
  assert.match(profileSource, /export async function handleImageAgentCardAction/);
  assert.doesNotMatch(generateSource, /function adapterServiceClientTs|function adapterCardsTs|function adapterHandlersTs|function pythonHostCardsPy|function pythonHostServiceClientPy|function pythonHostHandlersPy|function pythonHostLocalContractTestPy|function buildPythonHostEndpointsSpec|function buildStartCardSpec|function runtimeImageAgentClientTs|function runtimeCardsTs|function runtimeIndexTs/);
  assert.match(generateSource, /from "\.\.\/profiles\/image-agent-web\.js"/);
});

function run(args) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function runWithEnv(args, envOverrides) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...process.env, ...envOverrides },
    encoding: "utf8",
    stdio: "pipe",
  });
}

function runExpectFailureWithEnv(args, envOverrides) {
  try {
    runWithEnv(args, envOverrides);
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

function readServiceManifest(workspace) {
  return JSON.parse(fs.readFileSync(path.join(workspace, "manifest", "service_manifest.json"), "utf8"));
}

function writeBackendSelectionTarget(target) {
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "server.js"), [
    "const http = require('node:http');",
    "const { URL } = require('node:url');",
    "http.createServer((req, res) => {",
    "  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;",
    "  if (req.method === 'GET' && pathname === '/api/internal-health') res.end(JSON.stringify({ ok: true }));",
    "  if (req.method === 'POST' && pathname === '/api/internal-run') res.end(JSON.stringify({ ok: true }));",
    "});",
  ].join("\n"), "utf8");
}

function installFakeCodegraph(temp, mode) {
  const binDir = path.join(temp, "fake-codegraph-bin");
  const logPath = path.join(temp, "fake-codegraph-argv.jsonl");
  const status = buildFakeCodegraphStatus(mode);
  const scriptPath = path.join(binDir, "fake-codegraph.mjs");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(scriptPath, fakeCodegraphScript(), "utf8");
  fs.writeFileSync(path.join(binDir, "codegraph.cmd"), [
    "@echo off",
    "\"%FAKE_CODEGRAPH_NODE%\" \"%~dp0fake-codegraph.mjs\" %*",
  ].join("\r\n"), "utf8");
  fs.writeFileSync(path.join(binDir, "codegraph"), [
    "#!/bin/sh",
    "exec \"$FAKE_CODEGRAPH_NODE\" \"$(dirname \"$0\")/fake-codegraph.mjs\" \"$@\"",
  ].join("\n"), "utf8");
  fs.chmodSync(path.join(binDir, "codegraph"), 0o755);
  return {
    logPath,
    env: {
      FAKE_CODEGRAPH_NODE: process.execPath,
      CODEGRAPH_FAKE_LOG: logPath,
      CODEGRAPH_FAKE_MODE: mode,
      CODEGRAPH_FAKE_STATUS: JSON.stringify(status),
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
      Path: `${binDir}${path.delimiter}${process.env.Path || process.env.PATH || ""}`,
    },
  };
}

function buildFakeCodegraphStatus(mode) {
  if (mode === "fresh") {
    return {};
  }
  if (mode === "uninitialized") {
    return {
      initialized: false,
    };
  }
  if (mode === "invalid-query-json") {
    return {};
  }
  if (mode === "fresh-journal-missing") {
    return {
      index: { state: "complete", pendingRefs: 0, reindexRecommended: false },
    };
  }
  if (mode === "fresh-journal-memory") {
    return {
      journalMode: "memory",
      index: { state: "complete", pendingRefs: 0, reindexRecommended: false },
    };
  }
  if (mode === "stale-pending-changes") {
    return {
      pendingChanges: [{ path: "src/server.ts" }],
      index: { state: "complete", pendingRefs: 0, reindexRecommended: false },
    };
  }
  if (mode === "stale-worktree-mismatch") {
    return {
      worktreeMismatch: true,
      index: { state: "complete", pendingRefs: 0, reindexRecommended: false },
    };
  }
  if (mode === "stale-incomplete-state") {
    return {
      index: { state: "partial", pendingRefs: 0, reindexRecommended: false },
    };
  }
  if (mode === "stale-pending-refs") {
    return {
      index: { state: "complete", pendingRefs: 4, reindexRecommended: false },
    };
  }
  if (mode === "stale-reindex-recommended") {
    return {
      index: { state: "complete", pendingRefs: 0, reindexRecommended: true },
    };
  }
  return {};
}

function fakeCodegraphScript() {
  return `
    import fs from "node:fs";
    const argv = process.argv.slice(2);
    fs.appendFileSync(process.env.CODEGRAPH_FAKE_LOG, JSON.stringify(argv) + "\\n", "utf8");
    const status = parseStatusConfig(process.env.CODEGRAPH_FAKE_STATUS);
    if (["implement", "init", "sync"].includes(argv[0])) {
      console.error("fake codegraph must not be asked to " + argv[0]);
      process.exit(70);
    }
    if (argv[0] === "status" && argv[2] === "--json") {
      const initialized = status.initialized ?? (process.env.CODEGRAPH_FAKE_MODE !== "uninitialized");
      console.log(JSON.stringify({
        initialized,
        repo: argv[1],
        lastIndexed: status.lastIndexed ?? "2026-07-16T00:00:00.000Z",
        indexPath: argv[1] + "/.codegraph/index.sqlite",
        pendingChanges: status.pendingChanges ?? [],
        worktreeMismatch: status.worktreeMismatch ?? false,
        ...(status.journalMode ? { journalMode: status.journalMode } : {}),
        index: {
          state: status.index?.state ?? (initialized ? "complete" : "missing"),
          pendingRefs: status.index?.pendingRefs ?? 0,
          reindexRecommended: status.index?.reindexRecommended ?? false,
        },
      }));
      process.exit(0);
    }
    if (argv.join("\\u0000") === ["query", "route", "--kind", "route", "--path", argv[5], "--json"].join("\\u0000")) {
      if (process.env.CODEGRAPH_FAKE_MODE === "invalid-query-json") {
        process.stdout.write("{not-json");
        process.exit(0);
      }
      console.log(JSON.stringify([
        { node: { kind: "route", name: "POST /api/codegraph-route", filePath: argv[5] + "/server.js", startLine: 2 }, score: 0.98, highlights: ["server.js:2"] },
        { node: { kind: "route", name: "GET /api/codegraph-health", filePath: argv[5] + "/server.js", startLine: 8 }, score: 0.83, highlights: ["server.js:8"] },
      ]));
      process.exit(0);
    }
    console.error("unexpected fake codegraph argv: " + JSON.stringify(argv));
    process.exit(64);

    function parseStatusConfig(rawValue) {
      if (!rawValue) return {};
      try {
        const parsed = JSON.parse(rawValue);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (error) {
        return {};
      }
    }
  `.replace(/^ {4}/gm, "").trimStart();
}

function readFakeCodegraphArgv(logPath) {
  return fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function assertFileExists(filePath) {
  assert.ok(fs.existsSync(filePath), `Expected file to exist: ${filePath}`);
}

function copiedHandoffManifestHasPath(packagePath, relativePath) {
  const manifest = JSON.parse(fs.readFileSync(path.join(packagePath, "handoff_manifest.json"), "utf8"));
  return manifest.recommended_files.some((item) => item.path === relativePath && item.present === true);
}

function genericAdapterContractScript(generated) {
  const handlersUrl = path.join(generated, "adapter", "handlers.js").replace(/\\/g, "/");
  const cardsUrl = path.join(generated, "adapter", "cards.js").replace(/\\/g, "/");
  return `
    import http from "node:http";
    import { pathToFileURL } from "node:url";
    const handlers = await import(pathToFileURL(${JSON.stringify(handlersUrl)}).href);
    const cards = await import(pathToFileURL(${JSON.stringify(cardsUrl)}).href);
    const requests = [];
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        requests.push({ method: req.method, url: req.url, body });
        if (req.url === "/api/items/leak") {
          res.writeHead(502, { "content-type": "text/html" });
          res.end("<html>APP_SECRET=generic-target-secret stack trace</html>");
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, method: req.method, url: req.url, body: body ? JSON.parse(body) : null }));
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      const targetBaseUrl = "http://127.0.0.1:" + address.port;
      const startCardText = JSON.stringify(cards.buildStartCard());
      if (!startCardText.includes('"name":"ticket_id"')) throw new Error("generic start card missing ticket_id input");
      if (!startCardText.includes('"name":"body_json"')) throw new Error("generic start card missing body_json input");
      const getResult = await handlers.handleGenericHttpCardAction({
        action: "http.get.api.tickets.ticket_id.submit",
        formValue: { ticket_id: "TICKET-42" },
      }, { targetBaseUrl });
      if (!getResult.ok) throw new Error("GET action failed: " + JSON.stringify(getResult));
      const postResult = await handlers.handleGenericHttpCardAction({
        action: "http.post.api.tickets.submit",
        formValue: { body_json: '{"title":"Printer broken"}' },
      }, { targetBaseUrl });
      if (!postResult.ok) throw new Error("POST action failed: " + JSON.stringify(postResult));
      const failureResult = await handlers.handleGenericHttpCardAction({
        action: "http.post.api.items.id.submit",
        formValue: { id: "leak", body_json: '{"title":"Private"}' },
      }, { targetBaseUrl });
      const failureCardText = JSON.stringify(failureResult.card);
      if (failureResult.ok) throw new Error("generic non-2xx action unexpectedly succeeded");
      if (!failureCardText.includes("POST /api/items/{id} returned HTTP 502.")) throw new Error("generic failure card is missing method/path/status: " + failureCardText);
      if (/APP_SECRET|generic-target-secret|stack trace|html/i.test(failureCardText)) throw new Error("generic failure card leaked the raw target response: " + failureCardText);
      if (!requests.some((item) => item.method === "GET" && item.url === "/api/tickets/TICKET-42")) throw new Error("GET path was not rendered from form input: " + JSON.stringify(requests));
      if (!requests.some((item) => item.method === "POST" && item.url === "/api/tickets" && item.body.includes("Printer broken"))) throw new Error("POST JSON body was not sent: " + JSON.stringify(requests));
      console.log("generic adapter contract: PASS");
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  `;
}

function runNode(args, options = {}) {
  return execFileSync(process.execPath, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function runPython(args, options = {}) {
  return execFileSync("python", args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function runPythonExpectFailure(args, options = {}) {
  try {
    runPython(args, options);
  } catch (error) {
    if (error && typeof error === "object") {
      const output = [];
      if ("stdout" in error && error.stdout) output.push(String(error.stdout));
      if ("stderr" in error && error.stderr) output.push(String(error.stderr));
      if ("message" in error && error.message) output.push(error.message);
      return output.join("\n");
    }
    return String(error);
  }
  assert.fail(`Expected python command to fail: ${args.join(" ")}`);
}

function pythonCanRunSelfHostedContract() {
  if (!pythonCanImport("requests")) {
    console.warn("Skipping generated feishu-host local contract execution: default Python cannot import requests");
    return false;
  }
  return true;
}

function pythonCanImport(moduleName) {
  try {
    runPython(["-c", `import ${moduleName}`]);
    return true;
  } catch (error) {
    const detail = error && typeof error === "object" && "message" in error ? error.message : String(error);
    console.warn(`Python import check failed for ${moduleName}: ${detail}`);
    return false;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectActionValues(value) {
  if (!value || typeof value !== "object") return [];
  const direct = value.value && typeof value.value === "object" && typeof value.value.action === "string" ? [value.value.action] : [];
  const behaviorActions = Array.isArray(value.behaviors)
    ? value.behaviors.flatMap((behavior) => (
      behavior?.value && typeof behavior.value === "object" && typeof behavior.value.action === "string"
        ? [behavior.value.action]
        : []
    ))
    : [];
  const children = Array.isArray(value) ? value : Object.values(value);
  return direct.concat(behaviorActions, children.flatMap(collectActionValues));
}

function findNamedObject(value, name) {
  if (!value || typeof value !== "object") return undefined;
  if (value.name === name) return value;
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const found = findNamedObject(child, name);
    if (found) return found;
  }
  return undefined;
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
