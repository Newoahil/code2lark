import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getStringOption, hasOption } from "../args.js";
import { ensureDir, readJsonFile, writeJson } from "../fs-utils.js";
import { getJsonWithTimeout } from "../http-utils.js";
import type { CapabilityMap, ServiceManifest } from "../types.js";
import { requireHttpBaseUrl } from "../url-validation.js";

interface InstallManifestFile {
  path: string;
  sha256: string;
  size: number;
}

interface InstallManifest {
  schema_version: string;
  package_kind: string;
  target_profile: string;
  install_root: string;
  target_contract: {
    health: { method: string; path: string };
    allowed_endpoints: Array<{ method: string; path: string }>;
  };
  files: InstallManifestFile[];
}

interface AppliedInstallManifest {
  schema_version: string;
  target_profile: string;
  install_root: string;
  source_package: string;
  installed_at: string;
  files: Array<{ path: string; sha256: string }>;
}

interface SourceFile {
  relativePath: string;
  sourcePath: string;
  sha256: string;
  size: number;
}

const INSTALL_ROOT = "integrations/lark";
const APPLIED_MANIFEST = ".code2lark-install.json";
const EXPECTED_CALENDAR_ENDPOINTS = ["GET /api/state", "POST /api/run", "POST /api/stop"];

export async function installCommand(args: string[], options: Record<string, string | boolean>): Promise<void> {
  if (hasOption(options, "help") || hasOption(options, "h")) {
    console.log(installUsage());
    return;
  }
  const packageArg = args[0];
  const targetArg = getStringOption(options, "target");
  if (!packageArg || !targetArg) throw new Error(installUsage());

  const packagePath = path.resolve(packageArg);
  const targetPath = path.resolve(targetArg);
  assertSeparateTrees(packagePath, targetPath);
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
    throw new Error(`Target project directory does not exist: ${targetPath}`);
  }
  const moduleSource = path.join(packagePath, "integrations", "lark");
  const moduleTarget = path.join(targetPath, "integrations", "lark");
  assertNoSymlinkPath(packagePath, moduleSource);
  assertNoSymlinkPath(targetPath, moduleTarget);
  const apply = hasOption(options, "apply");
  const manifest = validateInstallPackage(packagePath, moduleSource);
  const service = readJsonFile<ServiceManifest>(path.join(packagePath, "manifest", "service_manifest.json"));
  const targetBaseUrl = requireHttpBaseUrl(getStringOption(options, "target-base-url", getStringOption(options, "targetBaseUrl", service.service.base_url || "")), "TARGET_BASE_URL");
  if (!targetBaseUrl) throw new Error("Install requires --target-base-url or a generated service base_url.");
  const parsedTargetUrl = new URL(targetBaseUrl);
  if (parsedTargetUrl.username || parsedTargetUrl.password) throw new Error("TARGET_BASE_URL must not contain embedded credentials.");
  const healthUrl = `${targetBaseUrl}${manifest.target_contract.health.path}`;
  const health = await getJsonWithTimeout(healthUrl, 5000);
  if (health.status !== "available" || !isCalendarState(health.data)) {
    throw new Error(`Target health probe failed for ${healthUrl}: ${health.detail}`);
  }

  const sourceFiles = buildSourceFiles(moduleSource, manifest);
  assertNoInstallConflicts(moduleTarget, sourceFiles);

  console.log(`Mode B install ${apply ? "apply" : "dry-run"}`);
  console.log(`Target health: PASS (${health.detail})`);
  console.log(`Install root: ${moduleTarget}`);
  for (const file of sourceFiles) console.log(`- ${file.relativePath}`);
  if (!apply) {
    console.log("Dry-run complete; no files written. Re-run with --apply to install.");
    return;
  }

  for (const file of sourceFiles) {
    const destination = resolveInside(moduleTarget, file.relativePath);
    assertNoSymlinkPath(targetPath, destination);
    ensureDir(path.dirname(destination));
    fs.copyFileSync(file.sourcePath, destination);
  }
  const appliedManifest: AppliedInstallManifest = {
    schema_version: "0.1",
    target_profile: manifest.target_profile,
    install_root: INSTALL_ROOT,
    source_package: packagePath,
    installed_at: new Date().toISOString(),
    files: sourceFiles.map((file) => ({ path: file.relativePath, sha256: file.sha256 })),
  };
  writeJson(path.join(moduleTarget, APPLIED_MANIFEST), appliedManifest);
  console.log(`Install applied: ${sourceFiles.length} managed files written under ${moduleTarget}.`);
}

function installUsage(): string {
  return "Usage: lark-deployer install <generated-package> --target <target-project> [--target-base-url <url>] [--apply]";
}

function validateInstallPackage(packagePath: string, moduleSource: string): InstallManifest {
  const summaryPath = path.join(packagePath, "generation_summary.json");
  assertNoSymlinkPath(packagePath, summaryPath);
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Not a managed Code2Lark generated package: ${packagePath}`);
  }
  const summary = readJsonFile<Record<string, unknown>>(summaryPath);
  if (summary.target_profile !== "calendar-stock-updater") {
    throw new Error(`Mode B install currently requires target_profile=calendar-stock-updater; found ${String(summary.target_profile || "missing")}.`);
  }
  const manifestPath = path.join(moduleSource, "install-manifest.json");
  assertNoSymlinkPath(moduleSource, manifestPath);
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing Mode B install manifest: ${manifestPath}`);
  const manifest = readJsonFile<InstallManifest>(manifestPath);
  if (manifest.schema_version !== "0.1"
    || manifest.package_kind !== "code2lark-mode-b-module"
    || manifest.target_profile !== "calendar-stock-updater"
    || manifest.install_root !== INSTALL_ROOT) {
    throw new Error("Invalid calendar Mode B install manifest identity.");
  }
  if (!isRecord(manifest.target_contract)
    || !isRecord(manifest.target_contract.health)
    || !Array.isArray(manifest.target_contract.allowed_endpoints)) {
    throw new Error("Mode B install manifest has an invalid target contract.");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error("Mode B install manifest has no managed files.");
  const seen = new Set<string>();
  for (const file of manifest.files) {
    if (!isRecord(file) || typeof file.path !== "string" || typeof file.sha256 !== "string" || typeof file.size !== "number") {
      throw new Error("Mode B install manifest contains an invalid managed file entry.");
    }
    const relativePath = normalizeManagedPath(file.path);
    if (seen.has(relativePath)) throw new Error(`Duplicate managed path in install manifest: ${relativePath}`);
    seen.add(relativePath);
    const sourcePath = resolveInside(moduleSource, relativePath);
    assertNoSymlinkPath(moduleSource, sourcePath);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) throw new Error(`Missing managed source file: ${relativePath}`);
    const contents = fs.readFileSync(sourcePath);
    const actualHash = sha256(contents);
    if (actualHash !== file.sha256 || contents.length !== file.size) throw new Error(`Managed source checksum mismatch: ${relativePath}`);
  }
  assertExpectedEndpoints("install manifest", manifest.target_contract.allowed_endpoints);
  if (endpointKey(manifest.target_contract.health.method, manifest.target_contract.health.path) !== "GET /api/state") {
    throw new Error("Mode B install health contract must be GET /api/state.");
  }
  validateManifestEndpointClosure(packagePath);
  validateModuleMirrorsPackage(packagePath, moduleSource);
  validateGeneratedTargetCalls(moduleSource);
  return manifest;
}

function validateManifestEndpointClosure(packagePath: string): void {
  const servicePath = path.join(packagePath, "manifest", "service_manifest.json");
  const capabilitiesPath = path.join(packagePath, "manifest", "capability_map.json");
  assertNoSymlinkPath(packagePath, servicePath);
  assertNoSymlinkPath(packagePath, capabilitiesPath);
  const service = readJsonFile<ServiceManifest>(servicePath);
  const capabilities = readJsonFile<CapabilityMap>(capabilitiesPath);
  if (!service.source_scan || !Array.isArray(service.source_scan.endpoints) || !Array.isArray(capabilities.capabilities)) {
    throw new Error("Generated service/capability manifests are incomplete for install validation.");
  }
  assertExpectedEndpoints("capability map", capabilities.capabilities.map((capability) => capability.source));
  const discovered = new Set(service.source_scan.endpoints.map((endpoint) => endpointKey(endpoint.method, endpoint.path)));
  const missing = capabilities.capabilities
    .filter((capability) => !discovered.has(endpointKey(capability.source.method, capability.source.path)))
    .map((capability) => `${capability.source.method} ${capability.source.path}`);
  if (missing.length) throw new Error(`Capability endpoints were not discovered in target source: ${missing.join(", ")}.`);
}

function validateGeneratedTargetCalls(moduleSource: string): void {
  const forbidden = /\/api\/(?:run|stop)\/(?:prepare|confirm|cancel)(?:["'`/]|$)/;
  for (const filePath of listFiles(moduleSource)) {
    if (fs.lstatSync(filePath).isSymbolicLink()) throw new Error(`Symbolic links are not allowed in generated modules: ${path.relative(moduleSource, filePath)}.`);
    if (!/\.(?:js|ts|mjs|md|json)$/i.test(filePath)) continue;
    const source = fs.readFileSync(filePath, "utf8");
    if (forbidden.test(source)) throw new Error(`Generated module contains an undiscovered target endpoint: ${path.relative(moduleSource, filePath)}.`);
  }
}

function validateModuleMirrorsPackage(packagePath: string, moduleSource: string): void {
  for (const directory of ["adapter", "manifest", "docs", "sidecar-long-connection"]) {
    const packageDirectory = path.join(packagePath, directory);
    const moduleDirectory = path.join(moduleSource, "generated", directory);
    const packageFiles = listFiles(packageDirectory).map((filePath) => path.relative(packageDirectory, filePath).split(path.sep).join("/"));
    const moduleFiles = listFiles(moduleDirectory).map((filePath) => path.relative(moduleDirectory, filePath).split(path.sep).join("/"));
    if (packageFiles.length !== moduleFiles.length || packageFiles.some((file, index) => file !== moduleFiles[index])) {
      throw new Error(`Generated module ${directory} files do not match the package source of truth.`);
    }
    for (const relativePath of packageFiles) {
      const packageFile = resolveInside(packageDirectory, relativePath);
      const moduleFile = resolveInside(moduleDirectory, relativePath);
      assertNoSymlinkPath(packageDirectory, packageFile);
      assertNoSymlinkPath(moduleDirectory, moduleFile);
      if (sha256(fs.readFileSync(packageFile)) !== sha256(fs.readFileSync(moduleFile))) {
        throw new Error(`Generated module file differs from package source of truth: ${directory}/${relativePath}.`);
      }
    }
  }
}

function buildSourceFiles(moduleSource: string, manifest: InstallManifest): SourceFile[] {
  const files = manifest.files.map((file) => ({
    relativePath: normalizeManagedPath(file.path),
    sourcePath: resolveInside(moduleSource, file.path),
    sha256: file.sha256,
    size: file.size,
  }));
  const manifestPath = path.join(moduleSource, "install-manifest.json");
  const contents = fs.readFileSync(manifestPath);
  files.push({ relativePath: "install-manifest.json", sourcePath: manifestPath, sha256: sha256(contents), size: contents.length });
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function assertNoInstallConflicts(moduleTarget: string, sourceFiles: SourceFile[]): void {
  if (!fs.existsSync(moduleTarget)) return;
  const appliedPath = path.join(moduleTarget, APPLIED_MANIFEST);
  let previous: AppliedInstallManifest | undefined;
  if (fs.existsSync(appliedPath)) {
    try {
      previous = readJsonFile<AppliedInstallManifest>(appliedPath);
    } catch (error) {
      throw new Error(`Managed install metadata conflict at ${appliedPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (previous.schema_version !== "0.1" || previous.install_root !== INSTALL_ROOT || !Array.isArray(previous.files)) {
      throw new Error(`Managed install metadata conflict at ${appliedPath}: unsupported or incomplete schema.`);
    }
  }
  const previousHashes = new Map((previous?.files || []).map((file) => {
    if (!isRecord(file) || typeof file.path !== "string" || typeof file.sha256 !== "string") {
      throw new Error(`Managed install metadata conflict at ${appliedPath}: invalid file entry.`);
    }
    return [normalizeManagedPath(file.path), file.sha256];
  }));
  const allowedLocalFiles = new Set([".env", "package-lock.json", "npm-debug.log"]);
  const unmanaged = listFiles(moduleTarget)
    .map((filePath) => path.relative(moduleTarget, filePath).split(path.sep).join("/"))
    .filter((relativePath) => relativePath !== APPLIED_MANIFEST)
    .filter((relativePath) => !relativePath.startsWith("node_modules/"))
    .filter((relativePath) => !allowedLocalFiles.has(relativePath))
    .filter((relativePath) => !previousHashes.has(relativePath));
  if (unmanaged.length) throw new Error(`Unmanaged file conflict under ${INSTALL_ROOT}: ${unmanaged.join(", ")}.`);
  for (const file of sourceFiles) {
    const destination = resolveInside(moduleTarget, file.relativePath);
    assertNoSymlinkPath(moduleTarget, destination);
    if (!fs.existsSync(destination)) continue;
    const previousHash = previousHashes.get(file.relativePath);
    if (!previousHash) throw new Error(`Unmanaged file conflict under ${INSTALL_ROOT}: ${file.relativePath}.`);
    const currentHash = sha256(fs.readFileSync(destination));
    if (currentHash !== previousHash) throw new Error(`Managed file conflict under ${INSTALL_ROOT}: ${file.relativePath} was modified after installation.`);
  }
}

function assertExpectedEndpoints(label: string, endpoints: Array<{ method: string; path: string }>): void {
  if (!Array.isArray(endpoints) || endpoints.some((endpoint) => !isRecord(endpoint) || typeof endpoint.method !== "string" || typeof endpoint.path !== "string")) {
    throw new Error(`${label} has invalid endpoint entries.`);
  }
  const actual = endpoints.map((endpoint) => endpointKey(endpoint.method, endpoint.path)).sort();
  if (actual.length !== EXPECTED_CALENDAR_ENDPOINTS.length
    || actual.some((value, index) => value !== EXPECTED_CALENDAR_ENDPOINTS[index])) {
    throw new Error(`${label} endpoints must be exactly ${EXPECTED_CALENDAR_ENDPOINTS.join(", ")}; found ${actual.join(", ") || "none"}.`);
  }
}

function normalizeManagedPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) throw new Error(`Unsafe managed path: ${value}`);
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error(`Unsafe managed path: ${value}`);
  if (segments.includes("node_modules") || normalized === ".env" || normalized === APPLIED_MANIFEST) throw new Error(`Excluded managed path: ${value}`);
  return normalized;
}

function resolveInside(root: string, relativePath: string): string {
  const normalized = normalizeManagedPath(relativePath);
  const resolved = path.resolve(root, ...normalized.split("/"));
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Managed path escapes install root: ${relativePath}`);
  return resolved;
}

function assertNoSymlinkPath(root: string, candidate: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Path escapes trusted root: ${candidate}`);
  let current = resolvedRoot;
  if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symbolic links are not allowed in install paths: ${current}`);
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symbolic links are not allowed in install paths: ${current}`);
  }
}

function assertSeparateTrees(packagePath: string, targetPath: string): void {
  if (packagePath === targetPath || isInside(packagePath, targetPath) || isInside(targetPath, packagePath)) {
    throw new Error("Generated package and target project must be separate directory trees.");
  }
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function endpointKey(method: string, endpointPath: string): string {
  return `${String(method).toUpperCase()} ${endpointPath}`;
}

function sha256(contents: Buffer): string {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function listFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    if (entry.isSymbolicLink()) return [entryPath];
    return entry.isFile() ? [entryPath] : [];
  }).sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isCalendarState(value: unknown): boolean {
  return isRecord(value) && isRecord(value.defaults) && isRecord(value.task) && Array.isArray(value.logs);
}
