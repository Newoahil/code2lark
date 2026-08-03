import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { analyzeCommand } from "../dist/commands/analyze.js";
import { verifyCardPayloads } from "../dist/commands/verify-card.js";
import { readEnvFileIfExists } from "../dist/env-utils.js";
import { hostModeUsesLongConnection, hostModeUsesWebhook, normalizeHostReceiveMode } from "../dist/host-mode.js";
import { configuredValue, isPlaceholderValue } from "../dist/placeholder-utils.js";
import { assessPublicCallbackBaseUrl, normalizeUrlBase, requireHttpBaseUrl } from "../dist/url-validation.js";

test("URL validation rejects non-public Level 2 callback hosts", () => {
  assert.equal(normalizeUrlBase(" https://example.com/// "), "https://example.com");
  assert.equal(requireHttpBaseUrl("https://example.com/callback/", "PUBLIC_CALLBACK_BASE_URL"), "https://example.com/callback");

  assert.deepEqual(
    assessPublicCallbackBaseUrl("http://127.0.0.1:3978", { level2: true, allowLocalCallback: false }),
    {
      normalizedBaseUrl: "http://127.0.0.1:3978",
      status: "fail",
      detail: "PUBLIC_CALLBACK_BASE_URL points to local host 127.0.0.1. Feishu cannot reach it directly; use a public HTTPS tunnel/domain, or --allow-local-callback only for local mock verification.",
      canProbe: false,
    },
  );

  const linkLocal = assessPublicCallbackBaseUrl("https://[fe80::1]", { level2: true, allowLocalCallback: false });
  assert.equal(linkLocal.status, "fail");
  assert.match(linkLocal.detail, /private host \[fe80::1\]/);
  assert.equal(linkLocal.canProbe, false);

  for (const value of ["https://[fe81::1]", "https://[fe90::1]", "https://[febf::1]"]) {
    const assessment = assessPublicCallbackBaseUrl(value, { level2: true, allowLocalCallback: false });
    assert.equal(assessment.status, "fail", `${value} must be rejected as IPv6 link-local`);
    assert.equal(assessment.canProbe, false);
  }

  assert.equal(
    assessPublicCallbackBaseUrl("https://[fec0::1]", { level2: true, allowLocalCallback: false }).status,
    "pass",
  );
  assert.equal(
    assessPublicCallbackBaseUrl("https://fe80-example.com", { level2: true, allowLocalCallback: false }).status,
    "pass",
  );
  assert.equal(
    assessPublicCallbackBaseUrl("https://fc-example.com", { level2: true, allowLocalCallback: false }).status,
    "pass",
  );
});

test("env parser preserves quoted values and ignores comments", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-env-unit-"));
  const envPath = path.join(temp, ".env");
  fs.writeFileSync(
    envPath,
    [
      "# comment",
      "APP_ID= cli_a123 ",
      "APP_SECRET=\"secret with spaces\"",
      "SINGLE='literal value'",
      "EMPTY=",
      "NO_EQUALS",
    ].join("\n"),
    "utf8",
  );

  assert.deepEqual(readEnvFileIfExists(envPath), {
    APP_ID: "cli_a123",
    APP_SECRET: "secret with spaces",
    SINGLE: "literal value",
    EMPTY: "",
  });
  assert.deepEqual(readEnvFileIfExists(path.join(temp, "missing.env")), {});
});

test("placeholder utilities distinguish filled values from template placeholders", () => {
  assert.equal(isPlaceholderValue("<APP_ID>"), true);
  assert.equal(isPlaceholderValue("{{APP_SECRET}}"), true);
  assert.equal(isPlaceholderValue("replace-me"), true);
  assert.equal(isPlaceholderValue("cli_real_app_id"), false);

  assert.equal(configuredValue(" <APP_ID> "), "");
  assert.equal(configuredValue(" cli_real_app_id "), "cli_real_app_id");
  assert.equal(configuredValue(123), "");
});

test("embedded adapter defaults to long-connection host receive mode", () => {
  const hostReceiveMode = normalizeHostReceiveMode("", "embedded-adapter");

  assert.equal(hostReceiveMode, "embedded-long-connection");
  assert.equal(hostModeUsesWebhook(hostReceiveMode), false);
  assert.equal(hostModeUsesLongConnection(hostReceiveMode), true);
});

test("analyze emits card-action permissions required by the MVP contract", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lark-deployer-permissions-unit-"));
  const target = path.join(temp, "image-agent-web");
  const outDir = path.join(temp, "out");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "requirements.txt"), "fastapi\nPillow\nopenai\n", "utf8");
  fs.writeFileSync(
    path.join(target, "main.py"),
    [
      "from fastapi import FastAPI",
      "app = FastAPI()",
      "@app.post(\"/api/generate\")",
      "async def generate(): pass",
      "@app.post(\"/api/iterate\")",
      "async def iterate(): pass",
      "@app.post(\"/api/batch\")",
      "async def batch(): pass",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(target, "templates.py"),
    [
      "TEMPLATES = [",
      "  {\"id\": \"product-image\", \"allowed_sizes\": [\"1024x1024\"], \"fields\": []}",
      "]",
    ].join("\n"),
    "utf8",
  );

  await analyzeCommand([target], { "base-url": "http://127.0.0.1:1", out: outDir });

  const permissions = JSON.parse(fs.readFileSync(path.join(outDir, "manifest", "required_permissions.json"), "utf8"));
  assert.deepEqual(
    permissions.scopes.map((item) => item.scope),
    ["im:message:send_as_bot", "im:message:update", "im:resource:upload"],
  );
  assert.deepEqual(permissions.events, []);
  assert.ok(permissions.callbacks.some((item) => item.callback === "card.action.trigger"));
  assert.ok(permissions.manual_steps.some((item) => item.includes("<PUBLIC_CALLBACK_BASE_URL>/webhook/card")));
});

test("card runtime verifier accepts JSON 2.0 send and callback shapes", () => {
  const card = {
    schema: "2.0",
    header: { title: { tag: "plain_text", content: "Runtime Card" } },
    body: {
      elements: [
        {
          tag: "column_set",
          columns: [{
            tag: "column",
            elements: [{
              tag: "button",
              text: { tag: "plain_text", content: "Run" },
              behaviors: [{ type: "callback", value: { action: "runtime.run" } }],
            }],
          }],
        },
      ],
    },
  };

  const report = verifyCardPayloads([
    { name: "send", kind: "send-message", payload: { msg_type: "interactive", content: JSON.stringify(card) } },
    { name: "callback", kind: "callback-response", payload: { card: { type: "raw", data: card } } },
  ], { knownActions: ["runtime.run"] });

  assert.equal(report.status, "pass");
  assert.equal(report.summary.fail, 0);
  assert.ok(report.checks.some((check) => check.name.includes("button:0:callback-behavior") && check.status === "pass"));
  assert.ok(report.checks.some((check) => check.name.includes("button:0:known-action") && check.status === "pass"));
});

test("card runtime verifier rejects JSON 2.0 unsupported legacy component tags", () => {
  const legacyCard = {
    schema: "2.0",
    header: { title: { tag: "plain_text", content: "Legacy Runtime Card" } },
    body: {
      elements: [
        {
          tag: "action",
          actions: [{
            tag: "button",
            text: { tag: "plain_text", content: "Run" },
            behaviors: [{ type: "callback", value: { action: "runtime.run" } }],
          }],
        },
        { tag: "note", elements: [{ tag: "plain_text", content: "source" }] },
      ],
    },
  };

  const report = verifyCardPayloads([
    { name: "legacy_card", kind: "card", payload: legacyCard },
  ], { knownActions: ["runtime.run"] });

  assert.equal(report.status, "fail");
  assert.ok(report.checks.some((check) => check.name.includes("unsupported-runtime-tag") && check.detail.includes("tag action") && check.status === "fail"));
  assert.ok(report.checks.some((check) => check.name.includes("unsupported-runtime-tag") && check.detail.includes("tag note") && check.status === "fail"));
});

test("card runtime verifier rejects design-only, legacy callback, wrapper, and sensitive payloads", () => {
  const badCard = {
    schema: "2.0",
    note: "design handoff only",
    header: { title: { tag: "plain_text", content: "Bad Card" } },
    body: {
      elements: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "Run" },
          value: { action: "legacy.only" },
        },
        {
          tag: "button",
          text: { tag: "plain_text", content: "Unknown" },
          behaviors: [{ type: "callback", value: { action: "runtime.unknown" } }],
        },
      ],
    },
  };

  const report = verifyCardPayloads([
    { name: "bad_send", kind: "send-message", payload: { msg_type: "interactive", card: badCard, content: JSON.stringify(badCard) } },
    { name: "bad_callback", kind: "callback-response", payload: { card: badCard } },
    { name: "sensitive", kind: "card", payload: { ...badCard, body: { elements: [{ tag: "markdown", content: "app_secret=redacted" }] } } },
  ], { knownActions: ["runtime.run"] });

  assert.equal(report.status, "fail");
  assert.ok(report.checks.some((check) => check.name.includes("no-card-wrapper") && check.status === "fail"));
  assert.ok(report.checks.some((check) => check.name.includes("raw-wrapper") && check.status === "fail"));
  assert.ok(report.checks.some((check) => check.name.includes("design-field:$.note") && check.status === "fail"));
  assert.ok(report.checks.some((check) => check.name.includes("callback-behavior") && check.status === "fail"));
  assert.ok(report.checks.some((check) => check.name.includes("known-action") && check.status === "fail"));
  assert.ok(report.checks.some((check) => check.name.includes("sanitized") && check.status === "fail"));
});

test("card runtime verifier requires action catalog and catches JSON-style sensitive keys", () => {
  const card = {
    schema: "2.0",
    header: { title: { tag: "plain_text", content: "Needs Catalog" } },
    body: {
      elements: [{
        tag: "button",
        text: { tag: "plain_text", content: "Run" },
        behaviors: [{ type: "callback", value: { action: "runtime.unknown" } }],
      }],
    },
  };

  const report = verifyCardPayloads([
    { name: "missing_catalog", kind: "card", payload: card },
    { name: "camel_secret", kind: "card", payload: { ...card, body: { elements: [{ tag: "markdown", content: JSON.stringify({ accessToken: "redacted" }) }] } } },
  ]);

  assert.equal(report.status, "fail");
  assert.ok(report.checks.some((check) => check.name.includes("known-action-catalog") && check.status === "fail"));
  assert.ok(report.checks.some((check) => check.name.includes("sanitized") && check.status === "fail"));
});
