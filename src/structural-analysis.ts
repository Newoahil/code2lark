import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type StructuralBackendMode = "auto" | "internal" | "codegraph";
export type StructuralBackendUsed = "internal" | "codegraph";
export type StructuralBackendStatus = "used" | "fallback";
export type StructuralRouteSource = "internal" | "codegraph";

export interface StructuralBackendMetadata {
  requested: StructuralBackendMode;
  used: StructuralBackendUsed;
  status: StructuralBackendStatus;
  reason?: string;
  checked_at: string;
  indexed_at?: string;
  index_path?: string;
}

export interface StructuralRouteFact {
  method: string;
  path: string;
  source: StructuralRouteSource;
  file?: string;
  line?: number;
}

export interface StructuralFacts {
  backend: StructuralBackendMetadata;
  routes: StructuralRouteFact[];
}

export type StructuralCollectionResult = StructuralFacts;

export type InternalRouteInput = {
  method: string;
  path: string;
  file?: string;
  line?: number;
};

export type CollectInternalEndpoints = () => InternalRouteInput[] | Promise<InternalRouteInput[]>;

type ExternalFailure = {
  reason: string;
};

type CodegraphStatus = {
  initialized?: boolean;
  lastIndexed?: string;
  indexPath?: string;
  pendingChanges?: PendingChangesStatus;
  worktreeMismatch?: boolean;
  journalMode?: string;
  index?: {
    state?: string;
    pendingRefs?: number;
    reindexRecommended?: boolean;
  };
};

type PendingChangesStatus = "fresh" | "stale";

const ROUTE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const EXEC_TIMEOUT_MS = 15_000;

export function parseStructuralBackendMode(value: unknown): StructuralBackendMode {
  if (value === undefined || value === null || value === "") return "auto";
  if (typeof value !== "string") throw new Error("Invalid structural backend mode. Use auto, internal, or codegraph.");
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto" || normalized === "internal" || normalized === "codegraph") return normalized;
  throw new Error(`Invalid structural backend mode: ${value}. Use auto, internal, or codegraph.`);
}

export async function collectStructuralFacts(
  targetPath: string,
  requestedMode: StructuralBackendMode,
  collectInternalEndpoints: CollectInternalEndpoints,
): Promise<StructuralCollectionResult> {
  const checkedAt = new Date().toISOString();
  if (requestedMode === "internal") {
    return collectInternalFacts(requestedMode, checkedAt, collectInternalEndpoints);
  }

  const external = await tryCollectCodegraphFacts(targetPath, requestedMode, checkedAt);
  if ("routes" in external) return external;
  if (requestedMode === "codegraph") throw codegraphError(external.reason);

  const fallback = await collectInternalFacts(requestedMode, checkedAt, collectInternalEndpoints);
  return {
    backend: {
      ...fallback.backend,
      status: "fallback",
      reason: external.reason,
    },
    routes: fallback.routes,
  };
}

async function collectInternalFacts(
  requested: StructuralBackendMode,
  checkedAt: string,
  collectInternalEndpoints: CollectInternalEndpoints,
): Promise<StructuralCollectionResult> {
  const inputs = await collectInternalEndpoints();
  return {
    backend: {
      requested,
      used: "internal",
      status: "used",
      checked_at: checkedAt,
    },
    routes: dedupeRoutes(inputs.map((route) => normalizeRoute(route, "internal", undefined)).filter((route): route is StructuralRouteFact => route !== undefined)),
  };
}

async function tryCollectCodegraphFacts(targetPath: string, requested: StructuralBackendMode, checkedAt: string): Promise<StructuralCollectionResult | ExternalFailure> {
  const nodeFailure = validateSupportedNodeMajor();
  if (nodeFailure) return { reason: nodeFailure };

  const executable = resolveExecutableFromPath("codegraph");
  if (!executable) return { reason: "codegraph executable is unavailable on PATH; install and maintain codegraph separately, or use --backend internal." };

  const statusOutput = await runCodegraph(executable, ["status", targetPath, "--json"]);
  if (!statusOutput.ok) return { reason: statusOutput.reason };

  const statusValue = parseJsonBoundary(statusOutput.stdout, "codegraph status");
  if (!statusValue.ok) return { reason: statusValue.reason };

  const status = normalizeStatus(statusValue.value);
  const statusFailure = validateFreshStatus(status);
  if (statusFailure) return { reason: statusFailure };

  const queryOutput = await runCodegraph(executable, ["query", "route", "--kind", "route", "--path", targetPath, "--json"]);
  if (!queryOutput.ok) return { reason: queryOutput.reason };

  const queryValue = parseJsonBoundary(queryOutput.stdout, "codegraph route query");
  if (!queryValue.ok) return { reason: queryValue.reason };

  const routes = normalizeCodegraphRoutes(queryValue.value, targetPath);
  if (!routes.length) return { reason: "codegraph route query returned no usable routes." };

  return {
    backend: {
      requested,
      used: "codegraph",
      status: "used",
      checked_at: checkedAt,
      indexed_at: status.lastIndexed,
      index_path: status.indexPath,
    },
    routes,
  };
}

function validateSupportedNodeMajor(): string {
  const match = /^v?(\d+)\./.exec(process.version);
  const major = match ? Number(match[1]) : 0;
  if (major >= 20 && major <= 24) return "";
  return `codegraph backend supports Node major versions 20 through 24; current Node is ${process.version}.`;
}

function resolveExecutableFromPath(commandName: string): string {
  const pathValue = process.env.PATH || process.env.Path || "";
  const extensions = process.platform === "win32" ? windowsExecutableExtensions() : [""];
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${commandName}${extension}`);
      if (isRunnableFile(candidate)) return candidate;
    }
  }
  return "";
}

function windowsExecutableExtensions(): string[] {
  const pathext = process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD";
  const configured = pathext.split(";").map((item) => item.trim().toLowerCase()).filter(Boolean);
  const extensions = [...configured];
  for (const extension of [".cmd", ".bat", ".exe"]) {
    if (!extensions.includes(extension)) extensions.push(extension);
  }
  extensions.push("");
  return extensions;
}

function isRunnableFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch (error) {
    if (error instanceof Error) return false;
    return false;
  }
}

async function runCodegraph(executable: string, args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; reason: string }> {
  try {
    const result = await execFileAsync(executableCommand(executable), executableArgs(executable, args), {
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
      timeout: EXEC_TIMEOUT_MS,
      windowsHide: true,
    });
    return { ok: true, stdout: result.stdout };
  } catch (error) {
    return { ok: false, reason: `codegraph command failed: ${summarizeExecError(error)}` };
  }
}

function executableCommand(executable: string): string {
  return shouldRunViaCmd(executable) ? process.env.ComSpec || "cmd.exe" : executable;
}

function executableArgs(executable: string, args: string[]): string[] {
  if (!shouldRunViaCmd(executable)) return args;
  return ["/d", "/s", "/c", executable, ...args];
}

function shouldRunViaCmd(executable: string): boolean {
  if (process.platform !== "win32") return false;
  const extension = path.extname(executable).toLowerCase();
  return extension === ".cmd" || extension === ".bat";
}

function summarizeExecError(error: unknown): string {
  const parts: string[] = [];
  if (isRecord(error)) {
    const stderr = stringFromUnknown(error.stderr).trim();
    const stdout = stringFromUnknown(error.stdout).trim();
    if (stderr) parts.push(stderr);
    if (stdout) parts.push(stdout);
  }
  if (error instanceof Error && error.message) parts.push(error.message);
  return parts.map(oneLine).filter(Boolean).join("; ") || "nonzero exit or timeout";
}

function parseJsonBoundary(source: string, label: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  try {
    return { ok: true, value: JSON.parse(source) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown parse failure";
    return { ok: false, reason: `${label} returned invalid JSON: ${detail}` };
  }
}

function normalizeStatus(value: unknown): CodegraphStatus {
  if (!isRecord(value)) return {};
  const index = isRecord(value.index) ? value.index : undefined;
  return {
    initialized: typeof value.initialized === "boolean" ? value.initialized : undefined,
    lastIndexed: typeof value.lastIndexed === "string" ? value.lastIndexed : undefined,
    indexPath: typeof value.indexPath === "string" ? value.indexPath : undefined,
    pendingChanges: normalizePendingChanges(value.pendingChanges),
    worktreeMismatch: typeof value.worktreeMismatch === "boolean" ? value.worktreeMismatch : undefined,
    journalMode: typeof value.journalMode === "string" ? value.journalMode : undefined,
    index: index ? {
      state: typeof index.state === "string" ? index.state : undefined,
      pendingRefs: typeof index.pendingRefs === "number" ? index.pendingRefs : undefined,
      reindexRecommended: typeof index.reindexRecommended === "boolean" ? index.reindexRecommended : undefined,
    } : undefined,
  };
}

function validateFreshStatus(status: CodegraphStatus): string {
  if (status.initialized !== true) return "codegraph index is not initialized; run and maintain codegraph indexing outside lark-deployer, or use --backend internal.";
  if (!status.lastIndexed) return "codegraph index has no lastIndexed timestamp.";
  if (status.pendingChanges === undefined) return "codegraph status did not report pendingChanges.";
  if (status.pendingChanges === "stale") return "codegraph index is stale: pendingChanges is not empty.";
  if (status.worktreeMismatch === true) return "codegraph index is stale: worktreeMismatch is true.";
  if (status.index?.state !== "complete") return "codegraph index is incomplete: index.state is not complete.";
  if (status.index.pendingRefs !== 0) return "codegraph index is incomplete: pendingRefs is not 0.";
  if (status.index.reindexRecommended === true) return "codegraph index is stale: reindexRecommended is true.";
  return "";
}

function normalizePendingChanges(value: unknown): PendingChangesStatus | undefined {
  if (Array.isArray(value)) return value.length === 0 ? "fresh" : "stale";
  if (isRecord(value)) return hasStaleNestedValue(value) ? "stale" : "fresh";
  return undefined;
}

function hasStaleNestedValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 0;
  if (isRecord(value)) return Object.values(value).some(hasStaleNestedValue);
  return false;
}

function normalizeCodegraphRoutes(value: unknown, targetPath: string): StructuralRouteFact[] {
  if (!Array.isArray(value)) return [];
  const routes = value
    .map((entry) => normalizeCodegraphRouteEntry(entry, targetPath))
    .filter((route): route is StructuralRouteFact => route !== undefined);
  return dedupeRoutes(routes);
}

function normalizeCodegraphRouteEntry(entry: unknown, targetPath: string): StructuralRouteFact | undefined {
  if (!isRecord(entry) || !isRecord(entry.node)) return undefined;
  return normalizeRoute(extractRouteInput(entry.node), "codegraph", targetPath);
}

function extractRouteInput(node: Record<string, unknown>): InternalRouteInput | undefined {
  const explicitMethod = typeof node.method === "string" ? node.method : "";
  const explicitPath = typeof node.path === "string" ? node.path : "";
  const named = routeFromName(stringFromUnknown(node.name)) || routeFromName(stringFromUnknown(node.qualifiedName));
  const method = ROUTE_METHODS.has(explicitMethod.trim().toUpperCase()) ? explicitMethod : named?.method || "";
  const routePath = isValidRoutePath(explicitPath.trim()) ? explicitPath : named?.path || "";
  return {
    method,
    path: routePath,
    file: stringFromUnknown(node.file) || stringFromUnknown(node.filePath) || stringFromUnknown(node.pathFile),
    line: numberFromUnknown(node.line) || numberFromUnknown(node.startLine),
  };
}

function routeFromName(value: string): { method: string; path: string } | undefined {
  const match = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[A-Za-z0-9_./{}:*-]+)/i.exec(value);
  if (!match) return undefined;
  return { method: match[1], path: match[2] };
}

function normalizeRoute(input: InternalRouteInput | undefined, source: StructuralRouteSource, targetPath: string | undefined): StructuralRouteFact | undefined {
  if (!input) return undefined;
  const method = input.method.trim().toUpperCase();
  const routePath = input.path.trim();
  if (!ROUTE_METHODS.has(method) || !isValidRoutePath(routePath)) return undefined;

  const route: StructuralRouteFact = { method, path: routePath, source };
  const file = normalizeRouteFile(input.file, targetPath);
  const line = normalizePositiveLine(input.line);
  if (file) route.file = file;
  if (line !== undefined) route.line = line;
  return route;
}

function isValidRoutePath(value: string): boolean {
  return /^\/[A-Za-z0-9_./{}:*-]*$/.test(value) && !value.includes("//");
}

function normalizeRouteFile(file: string | undefined, targetPath: string | undefined): string {
  if (!file) return "";
  if (!targetPath) return file;
  const absoluteTarget = path.resolve(targetPath);
  const absoluteFile = path.resolve(file);
  const relative = path.relative(absoluteTarget, absoluteFile);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative.split(path.sep).join("/");
  return "";
}

function normalizePositiveLine(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function dedupeRoutes(routes: StructuralRouteFact[]): StructuralRouteFact[] {
  const sorted = [...routes].sort(compareRoutes);
  const seen = new Set<string>();
  const deduped: StructuralRouteFact[] = [];
  for (const route of sorted) {
    const key = `${route.method} ${route.path} ${route.source} ${route.file || ""} ${route.line || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(route);
  }
  return deduped;
}

function compareRoutes(left: StructuralRouteFact, right: StructuralRouteFact): number {
  return `${left.method} ${left.path} ${left.file || ""} ${left.line || 0} ${left.source}`.localeCompare(
    `${right.method} ${right.path} ${right.file || ""} ${right.line || 0} ${right.source}`,
  );
}

function codegraphError(reason: string): Error {
  return new Error(`codegraph structural backend unavailable: ${reason} lark-deployer will not install, initialize, sync, or reindex codegraph automatically.`);
}

function stringFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return "";
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
