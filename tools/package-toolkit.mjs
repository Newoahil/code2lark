import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const outDir = path.join(rootDir, "dist");
const packageName = `code2lark-toolkit-v${packageJson.version}`;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "code2lark-toolkit-"));
const stageRoot = path.join(tempRoot, packageName);
const zipPath = path.join(outDir, `${packageName}.zip`);

const requiredPaths = [
  "SKILL.md",
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  path.join("src", "index.ts"),
  path.join("dist", "index.js"),
  path.join("references", "retrofit-workflow.md"),
  path.join("references", "cobuild-workflow.md"),
  path.join("references", "cobuild-playbook.md"),
  path.join("references", "feishu-card-json-2-runtime-spec.md"),
  path.join("references", "feishu-runtime-gates.md"),
  path.join("embedded-skills", "lark-card-designer", "SKILL.md"),
  path.join("embedded-skills", "lark-card-designer", "references", "json-2.0-compatibility-rules.md"),
  path.join("tools", "run-cobuild-demo.mjs"),
  path.join("tests", "fixtures", "cobuild-demo-prompt.md"),
  path.join("tests", "fixtures", "cobuild-demo-response.schema.json"),
];

const copyEntries = [
  "SKILL.md",
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "src",
  "dist",
  "references",
  "embedded-skills",
  "tools",
  "tests",
  "docs",
];

const excludedDirectoryNames = new Set([
  ".git",
  ".omo",
  ".claude",
  ".worktrees",
  "node_modules",
  "out",
  "generated",
  "handoff",
]);

const excludedFileNames = new Set([".env"]);

function shouldCopy(source) {
  const name = path.basename(source);
  if (excludedDirectoryNames.has(name) || excludedFileNames.has(name)) {
    return false;
  }
  if (name.endsWith(".log")) {
    return false;
  }
  return true;
}

function copyEntry(relativePath) {
  const source = path.join(rootDir, relativePath);
  if (!fs.existsSync(source)) {
    throw new Error(`Cannot package missing entry: ${relativePath}`);
  }
  fs.cpSync(source, path.join(stageRoot, relativePath), {
    recursive: true,
    filter: shouldCopy,
  });
}

function assertRequiredFiles() {
  const missing = requiredPaths.filter((relativePath) => !fs.existsSync(path.join(stageRoot, relativePath)));
  if (missing.length > 0) {
    throw new Error(`Toolkit package is missing required files:\n${missing.join("\n")}`);
  }
}

function writeManifest() {
  const manifest = [
    "# Code2Lark Toolkit Package",
    "",
    `Version: ${packageJson.version}`,
    "",
    "This zip contains both delivery layers:",
    "",
    "- Skill layer: `SKILL.md`, `references/`, and `embedded-skills/lark-card-designer/` for external agents.",
    "- CLI/runtime layer: `dist/`, `src/`, `package.json`, and tests for deterministic Retrofit and Co-Build tooling.",
    "",
    "Supported modes:",
    "",
    "- Retrofit: add Feishu/Lark entrypoints to an existing project.",
    "- Co-Build: design a new business capability together with its Feishu/Lark entrypoint.",
    "",
    "Quick checks after unzip:",
    "",
    "```powershell",
    "node tools/run-cobuild-demo.mjs --static-only",
    "node dist/index.js --help",
    "```",
    "",
    "Start with `docs/code2lark-toolkit-zip-delivery-guide.md`.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(stageRoot, "PACKAGE-MANIFEST.md"), manifest, "utf8");
}

function runPowerShell(command) {
  const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`PowerShell command failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
}

try {
  if (!fs.existsSync(path.join(rootDir, "dist", "index.js"))) {
    throw new Error("dist/index.js is missing. Run `npm run build` before packaging.");
  }

  fs.rmSync(stageRoot, { recursive: true, force: true });
  fs.mkdirSync(stageRoot, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const entry of copyEntries) {
    copyEntry(entry);
  }

  writeManifest();
  assertRequiredFiles();

  fs.rmSync(zipPath, { force: true });
  const command = `Compress-Archive -Path ${JSON.stringify(stageRoot)} -DestinationPath ${JSON.stringify(zipPath)} -Force`;
  runPowerShell(command);

  const stats = fs.statSync(zipPath);
  console.log(JSON.stringify({ package: zipPath, bytes: stats.size, root: packageName }, null, 2));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
