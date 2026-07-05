#!/usr/bin/env node
import { parseArgs } from "./args.js";
import { analyzeCommand } from "./commands/analyze.js";
import { configureCommand } from "./commands/configure.js";
import { contextCommand } from "./commands/context.js";
import { doctorCommand } from "./commands/doctor.js";
import { evidenceCommand } from "./commands/evidence.js";
import { generateCommand } from "./commands/generate.js";
import { handoffCommand } from "./commands/handoff.js";
import { initLocalCommand } from "./commands/init-local.js";
import { planCommand } from "./commands/plan.js";
import { readinessCommand } from "./commands/readiness.js";
import { statusCommand } from "./commands/status.js";
import { verifyCommand } from "./commands/verify.js";

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const parsed = parseArgs(rest);

  switch (command) {
    case "analyze":
      await analyzeCommand(parsed.positionals, parsed.options);
      return;
    case "plan":
      await planCommand(parsed.positionals);
      return;
    case "generate":
      await generateCommand(parsed.positionals, parsed.options);
      return;
    case "context":
      await contextCommand(parsed.positionals, parsed.options);
      return;
    case "doctor":
      await doctorCommand(parsed.positionals, parsed.options);
      return;
    case "configure":
      await configureCommand(parsed.positionals, parsed.options);
      return;
    case "readiness":
      await readinessCommand(parsed.positionals, parsed.options);
      return;
    case "status":
      await statusCommand(parsed.positionals, parsed.options);
      return;
    case "evidence":
      await evidenceCommand(parsed.positionals, parsed.options);
      return;
    case "handoff":
      await handoffCommand(parsed.positionals, parsed.options);
      return;
    case "init-local":
      await initLocalCommand(parsed.positionals, parsed.options);
      return;
    case "verify":
      await verifyCommand(parsed.positionals, parsed.options);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function printHelp(): void {
  console.log(`Lark-deployer MVP CLI

Usage:
  lark-deployer analyze <target-path> --base-url <url> [--out <dir>] [--name <name>]
  lark-deployer plan <analysis-workspace>
  lark-deployer generate <analysis-workspace> [--out <generated-dir>] [--mode embedded-adapter|standalone-runtime|self-hosted-runtime] [--host-mode embedded-webhook|embedded-long-connection|hybrid|standalone-runtime]
  lark-deployer context <analysis-workspace-or-generated-package> [--out <file>] [--mode embedded-adapter|standalone-runtime|self-hosted-runtime] [--host-mode embedded-webhook|embedded-long-connection|hybrid|standalone-runtime]
  lark-deployer configure <generated-package> [--context <file>] [--out-env <file>] [--report <file>] [--strict] [--dry-run]
  lark-deployer status <generated-package> [--env <file>] [--json]
  lark-deployer readiness <generated-package> [--env <file>] [--out <file>]
  lark-deployer doctor <generated-package> [--env <file>] [--mode embedded-adapter|standalone-runtime|self-hosted-runtime] [--host-mode embedded-webhook|embedded-long-connection|hybrid|standalone-runtime] [--json] [--out <json-file>] [--gate]
  lark-deployer evidence <generated-package> [--env <file>] [--report <file>] [--audit <file>] [--runtime-url <url>] [--out <file>] [--update-record] [--manual-evidence <file>] [--start-message-id <id>] [--result-message-id <id>] [--result-screenshot <path-or-url>] [--generated-image-url <url>] [--generated-image-key <key>] [--batch-id <id>] [--batch-status-message-id <id>] [--batch-status-screenshot <path-or-url>] [--batch-download-url <url>] [--batch-download-screenshot <path-or-url>] [--trace-id <id>]
  lark-deployer handoff <generated-package> [--out <file>] [--copy-to <dir>] [--check]
  lark-deployer init-local <generated-package> [--context] [--reply] [--manual-evidence] [--all] [--force]
  lark-deployer verify <generated-package> [--env <file>] [--mode embedded-adapter|standalone-runtime|self-hosted-runtime] [--host-mode embedded-webhook|embedded-long-connection|hybrid|standalone-runtime] [--runtime-url <url>] [--host-runtime-url <url>] [--simulate] [--send-start-card] [--level2] [--strict] [--allow-local-callback]

MVP target:
  image-agent-web /api/generate, /api/iterate, and /api/batch progress integration.

Boundary:
  Lark-deployer builds the integration package and verifies availability.
  It does not start, stop, or manage the target service lifecycle.

  Integration modes:
  embedded-adapter validates adapter/ for an existing Feishu SDK service.
  --host-mode embedded-webhook validates /health and /webhook/card; embedded-long-connection validates host health plus host-owned card.action.trigger evidence.
  standalone-runtime keeps bot-runtime as a reference host.
  self-hosted-runtime generates a Python feishu-host using lark-oapi long connection.

Level 2:
  --level2 implies --simulate, --send-start-card, and --strict.
  It still requires a real Feishu app, callback setup, and a test chat.
  --allow-local-callback is only for local mock callback verification.
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
