import fs from "node:fs";
import path from "node:path";
import { hasOption } from "../args.js";
import { ensureDir } from "../fs-utils.js";

interface LocalTemplateFile {
  flag: string;
  source: string;
  target: string;
  description: string;
}

interface LocalInitResult {
  target: string;
  status: "created" | "skipped";
  description: string;
}

export async function initLocalCommand(args: string[], options: Record<string, string | boolean>): Promise<void> {
  const packageArg = args[0];
  if (!packageArg) {
    throw new Error("Usage: lark-deployer init-local <generated-package> [--context] [--reply] [--manual-evidence] [--all] [--force]");
  }

  const packagePath = path.resolve(packageArg);
  const specs = buildLocalTemplateFiles(packagePath);
  const selected = selectLocalTemplateFiles(specs, options);
  const force = hasOption(options, "force");
  const results = selected.map((spec) => copyLocalTemplateFile(spec, force));

  console.log(`Local file initialization for ${packagePath}`);
  for (const result of results) {
    console.log(`${result.status === "created" ? "Created" : "Skipped existing"}: ${result.target} (${result.description})`);
  }
  if (results.some((result) => result.status === "skipped")) {
    console.log("Use --force to overwrite existing local files.");
  }
  console.log("Local files are ignored by generated package .gitignore and should not be included in sanitized handoff copies.");
}

function buildLocalTemplateFiles(packagePath: string): LocalTemplateFile[] {
  return [
    {
      flag: "context",
      source: path.join(packagePath, "feishu_context.template.json"),
      target: path.join(packagePath, "feishu_context.local.json"),
      description: "local Feishu context and secret intake",
    },
    {
      flag: "reply",
      source: path.join(packagePath, "feishu_context.reply.template.json"),
      target: path.join(packagePath, "feishu_context.reply.local.json"),
      description: "local non-secret owner reply intake",
    },
    {
      flag: "reply",
      source: path.join(packagePath, "feishu_context.reply.template.md"),
      target: path.join(packagePath, "feishu_context.reply.local.md"),
      description: "local human-readable owner reply notes",
    },
    {
      flag: "manual-evidence",
      source: path.join(packagePath, "level2_manual_evidence.template.json"),
      target: path.join(packagePath, "level2_manual_evidence.local.json"),
      description: "local manual Feishu Level 2 evidence intake",
    },
  ];
}

function selectLocalTemplateFiles(
  specs: LocalTemplateFile[],
  options: Record<string, string | boolean>,
): LocalTemplateFile[] {
  const all = hasOption(options, "all");
  const selectedFlags = [
    hasOption(options, "context") ? "context" : "",
    hasOption(options, "reply") ? "reply" : "",
    hasOption(options, "manual-evidence") || hasOption(options, "manualEvidence") ? "manual-evidence" : "",
  ].filter(Boolean);

  if (!all && selectedFlags.length === 0) {
    throw new Error("Choose at least one local file group: --context, --reply, --manual-evidence, or --all.");
  }

  const flags = new Set(all ? specs.map((spec) => spec.flag) : selectedFlags);
  return specs.filter((spec) => flags.has(spec.flag));
}

function copyLocalTemplateFile(spec: LocalTemplateFile, force: boolean): LocalInitResult {
  if (!fs.existsSync(spec.source)) {
    throw new Error(`Template file does not exist: ${spec.source}`);
  }
  if (fs.existsSync(spec.target) && !force) {
    return {
      target: spec.target,
      status: "skipped",
      description: spec.description,
    };
  }
  ensureDir(path.dirname(spec.target));
  fs.copyFileSync(spec.source, spec.target);
  return {
    target: spec.target,
    status: "created",
    description: spec.description,
  };
}
