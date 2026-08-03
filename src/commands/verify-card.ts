import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getStringOption, hasOption } from "../args.js";
import { writeJson, writeText } from "../fs-utils.js";

type CheckStatus = "pass" | "fail";
type PayloadKind = "card" | "send-message" | "callback-response";

interface CardCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

interface NamedPayload {
  name: string;
  kind: PayloadKind;
  payload: unknown;
}

interface PayloadBundle {
  payloads: NamedPayload[];
  knownActions: Set<string> | undefined;
}

interface CardVerificationOptions {
  knownActions?: Iterable<string>;
}

export interface CardVerificationReport {
  schema_version: "0.1";
  generated_at: string;
  status: CheckStatus;
  summary: { pass: number; fail: number };
  checks: CardCheck[];
}

interface TaggedNode {
  tag: string;
  record: Record<string, unknown>;
  location: string;
  parentKey: string | undefined;
  ancestors: string[];
}

const designOnlyFields = new Set(["note", "json_2_0_like", "elements", "sketch", "metadata", "design_notes"]);
const unsupportedRuntimeTags = new Map([
  ["action", "JSON 2.0 no longer supports tag action; place buttons directly in body.elements or inside column_set/column."],
  ["note", "JSON 2.0 runtime payloads must not use tag note; map design notes/footers to markdown or div."],
]);
const supportedComponentTags = new Set(["markdown", "div", "column_set", "column", "table", "form", "input", "button", "hr", "img"]);
const supportedAtomTags = new Set(["plain_text", "lark_md", "fallback_text", "standard_icon", "custom_icon"]);
const supportedTags = new Set([...supportedComponentTags, ...supportedAtomTags]);
const textAtomTags = new Set(["plain_text", "lark_md"]);
const iconAtomTags = new Set(["standard_icon", "custom_icon"]);
const formInteractiveTags = new Set(["input", "button"]);
const supportedBehaviorTypes = new Set(["callback", "open_url"]);
const elementIdPattern = /^[A-Za-z][A-Za-z0-9_]{0,19}$/;
const maxTagBearingComponents = 200;
const sensitivePattern = /(?:app[_-]?secret|appSecret|authorization|bearer|cookie|\bauth\b|\bsecret\b|\btoken\b|password|credentials?|api[_-]?key|apiKey|access[_-]?key|accessKey|accessToken|private[_-]?key|privateKey|operator[_-]?open[_-]?id|operatorOpenId|open[_-]?chat[_-]?id|openChatId|test[_-]?chat[_-]?id|testChatId|message[_-]?id|messageId|open[_-]?message[_-]?id|openMessageId|raw[_-]?callback|rawCallback|\b(?:ou|oc|om)_[A-Za-z0-9_-]+\b|\b(?:cli|msg)_[A-Za-z0-9_-]{8,}\b|\bsk-[A-Za-z0-9_-]{8,}\b)/i;
const moduleVerifierTimeoutMs = 60_000;
const maxPayloadBytes = 1024 * 1024;

export async function verifyCardCommand(args: string[], options: Record<string, string | boolean>): Promise<void> {
  if (hasOption(options, "help") || hasOption(options, "h")) {
    console.log(verifyCardUsage());
    return;
  }
  const inputArg = args[0];
  if (!inputArg) throw new Error(verifyCardUsage());

  const inputPath = path.resolve(inputArg);
  if (!fs.existsSync(inputPath)) throw new Error(`Card verification input not found: ${inputPath}`);
  if (fs.statSync(inputPath).isDirectory()) {
    const moduleVerifier = findModuleVerifier(inputPath);
    if (moduleVerifier) {
      if (!hasOption(options, "run-local-verifier")) {
        throw new Error("Directory contains verify-card.mjs. Re-run with --run-local-verifier to execute the generated local verifier, or pass a JSON sample file for static validation.");
      }
      runModuleVerifier(moduleVerifier);
      return;
    }
  }
  const reportDir = path.resolve(getStringOption(options, "report-dir", fs.statSync(inputPath).isDirectory() ? inputPath : path.dirname(inputPath)));
  const bundle = loadPayloadBundle(inputPath);
  const report = verifyCardPayloads(bundle.payloads, { knownActions: bundle.knownActions });
  writeJson(path.join(reportDir, "card_verification_report.json"), report);
  writeText(path.join(reportDir, "card_verification_report.md"), renderMarkdownReport(report));
  printReport(report);
  if (report.status === "fail") process.exitCode = 1;
}

export function verifyCardPayloads(payloads: NamedPayload[], options: CardVerificationOptions = {}): CardVerificationReport {
  const knownActions = options.knownActions ? new Set(options.knownActions) : undefined;
  const checks = payloads.flatMap((payload) => verifyNamedPayload(payload, knownActions));
  const pass = checks.filter((check) => check.status === "pass").length;
  const fail = checks.filter((check) => check.status === "fail").length;
  return {
    schema_version: "0.1",
    generated_at: new Date().toISOString(),
    status: fail === 0 ? "pass" : "fail",
    summary: { pass, fail },
    checks,
  };
}

function verifyNamedPayload(named: NamedPayload, knownActions: Set<string> | undefined): CardCheck[] {
  if (named.kind === "send-message") return verifySendMessagePayload(named.name, named.payload, knownActions);
  if (named.kind === "callback-response") return verifyCallbackResponsePayload(named.name, named.payload, knownActions);
  return verifyCard(named.name, named.payload, knownActions);
}

function verifySendMessagePayload(name: string, payload: unknown, knownActions: Set<string> | undefined): CardCheck[] {
  const checks: CardCheck[] = [];
  const record = asRecord(payload);
  checks.push(check(`${name}:send:object`, Boolean(record), "send-message payload must be an object"));
  if (!record) return checks;
  checks.push(check(`${name}:send:msg_type`, record.msg_type === "interactive", "msg_type must be interactive"));
  checks.push(check(`${name}:send:no-card-wrapper`, !hasRecordKey(record, "card"), "message send payload must not wrap content as card"));
  checks.push(check(`${name}:send:content-string`, typeof record.content === "string", "content must be a JSON string"));
  const contentCard = typeof record.content === "string" ? parseJson(record.content) : undefined;
  checks.push(check(`${name}:send:content-json`, contentCard !== undefined, "content must parse as JSON card data"));
  if (contentCard !== undefined) checks.push(...verifyCard(`${name}:send:content`, contentCard, knownActions));
  checks.push(...verifySanitized(`${name}:send`, payload));
  return checks;
}

function verifyCallbackResponsePayload(name: string, payload: unknown, knownActions: Set<string> | undefined): CardCheck[] {
  const checks: CardCheck[] = [];
  const record = asRecord(payload);
  checks.push(check(`${name}:callback:object`, Boolean(record), "callback response must be an object"));
  if (!record) return checks;
  if (!hasRecordKey(record, "card")) {
    checks.push(check(`${name}:callback:card-or-toast`, hasRecordKey(record, "toast"), "callback response must include card or toast"));
    checks.push(...verifySanitized(`${name}:callback`, payload));
    return checks;
  }
  const cardWrapper = asRecord(record.card);
  checks.push(check(`${name}:callback:raw-wrapper`, cardWrapper !== undefined && cardWrapper.type === "raw", "card response must use card.type raw"));
  checks.push(check(`${name}:callback:data-present`, cardWrapper !== undefined && hasRecordKey(cardWrapper, "data"), "card response must include card.data"));
  if (cardWrapper && hasRecordKey(cardWrapper, "data")) checks.push(...verifyCard(`${name}:callback:data`, cardWrapper.data, knownActions));
  checks.push(...verifySanitized(`${name}:callback`, payload));
  return checks;
}

function verifyCard(name: string, payload: unknown, knownActions: Set<string> | undefined): CardCheck[] {
  const checks: CardCheck[] = [];
  const card = asRecord(payload);
  checks.push(check(`${name}:card:object`, Boolean(card), "card must be an object"));
  if (!card) return checks;
  checks.push(check(`${name}:card:schema`, card.schema === "2.0", "card.schema must be 2.0"));
  checks.push(...verifyCardGlobalConfig(name, card));
  const header = asRecord(card.header);
  checks.push(check(`${name}:card:header-title`, Boolean(header && hasRecordKey(header, "title")), "card.header.title must exist"));
  const body = asRecord(card.body);
  checks.push(check(`${name}:card:body-elements`, Boolean(body && Array.isArray(body.elements)), "card.body.elements must exist"));
  const taggedNodes = collectTaggedNodes(card);
  checks.push(...verifySupportedTags(name, taggedNodes));
  checks.push(...verifyElementIds(name, taggedNodes));
  checks.push(...verifyFormRules(name, taggedNodes));
  const designFieldChecks = verifyNoDesignOnlyFields(name, card, "$", true);
  checks.push(...designFieldChecks.length ? designFieldChecks : [check(`${name}:design-fields`, true, "production payload has no design-only fields")]);
  checks.push(...verifyButtonBehaviors(name, taggedNodes, knownActions));
  checks.push(...verifySanitized(`${name}:card`, card));
  return checks;
}

function verifyCardGlobalConfig(name: string, card: Record<string, unknown>): CardCheck[] {
  const configPresent = hasRecordKey(card, "config");
  const config = asRecord(card.config);
  const checks = [
    check(`${name}:card:no-root-elements`, !hasRecordKey(card, "elements"), "JSON 2.0 card must use body.elements, not root elements"),
    ...(configPresent ? [check(`${name}:card:config-object`, Boolean(config), "card.config must be an object when present")] : []),
  ];
  if (!config || !hasRecordKey(config, "update_multi")) {
    checks.push(check(`${name}:card:update_multi`, true, "config.update_multi is absent or true for JSON 2.0 shared cards"));
  } else {
    checks.push(check(`${name}:card:update_multi`, config.update_multi === true, "JSON 2.0 supports only shared cards; config.update_multi must be absent or true"));
  }
  return checks;
}

function verifySupportedTags(name: string, taggedNodes: TaggedNode[]): CardCheck[] {
  const checks: CardCheck[] = [
    check(`${name}:tags:max-200`, taggedNodes.length <= maxTagBearingComponents, `card has ${taggedNodes.length} tag-bearing components/elements; JSON 2.0 supports at most ${maxTagBearingComponents}`),
  ];
  const failures: CardCheck[] = [];
  for (const node of taggedNodes) {
    if (!node.tag) {
      failures.push(check(`${name}:tag:${node.location}:string`, false, "tag must be a string"));
      continue;
    }
    const unsupportedDetail = unsupportedRuntimeTags.get(node.tag);
    if (unsupportedDetail) {
      failures.push(check(`${name}:tag:${node.location}:unsupported-runtime-tag`, false, unsupportedDetail));
    } else if (!supportedTags.has(node.tag)) {
      failures.push(check(`${name}:tag:${node.location}:supported`, false, `unsupported Card JSON 2.0 MVP tag: ${node.tag}`));
    }
    if (textAtomTags.has(node.tag) && !isTextAtomContext(node)) {
      failures.push(check(`${name}:tag:${node.location}:text-atom-context`, false, `${node.tag} must be nested as a text object, not used as a standalone body/form component`));
    }
    if (node.tag === "fallback_text" && node.parentKey !== "fallback") {
      failures.push(check(`${name}:tag:${node.location}:fallback-context`, false, "fallback_text must be nested under a component fallback field"));
    }
    if (iconAtomTags.has(node.tag) && node.parentKey !== "icon") {
      failures.push(check(`${name}:tag:${node.location}:icon-context`, false, `${node.tag} must be nested under an icon field`));
    }
  }
  checks.push(...failures.length ? failures : [check(`${name}:tags:supported-subset`, true, "card uses the local Card JSON 2.0 MVP supported tag subset")]);
  return checks;
}

function verifyElementIds(name: string, taggedNodes: TaggedNode[]): CardCheck[] {
  const seen = new Map<string, string>();
  const failures: CardCheck[] = [];
  for (const node of taggedNodes) {
    if (!hasRecordKey(node.record, "element_id")) continue;
    const elementId = node.record.element_id;
    if (typeof elementId !== "string" || !elementIdPattern.test(elementId)) {
      failures.push(check(`${name}:element_id:${node.location}:format`, false, "element_id must start with a letter, contain only letters/numbers/underscore, and be at most 20 characters"));
      continue;
    }
    const firstLocation = seen.get(elementId);
    if (firstLocation) {
      failures.push(check(`${name}:element_id:${node.location}:unique`, false, `element_id must be unique; ${elementId} already used at ${firstLocation}`));
    } else {
      seen.set(elementId, node.location);
    }
  }
  return failures.length ? failures : [check(`${name}:element_id:valid`, true, "element_id values are absent or valid and unique")];
}

function verifyFormRules(name: string, taggedNodes: TaggedNode[]): CardCheck[] {
  const failures: CardCheck[] = [];
  for (const node of taggedNodes) {
    const insideForm = node.ancestors.includes("form");
    if (node.tag === "form") {
      const directBodyChild = node.parentKey === "elements" && /^\$\.body\.elements\[\d+\]$/.test(node.location) && node.ancestors.length === 0;
      if (!directBodyChild) failures.push(check(`${name}:form:${node.location}:root-only`, false, "JSON 2.0 form containers must be direct body.elements children"));
      if (insideForm) failures.push(check(`${name}:form:${node.location}:no-nested-form`, false, "JSON 2.0 form containers must not contain another form"));
      if (!isNonemptyString(node.record.name)) failures.push(check(`${name}:form:${node.location}:name`, false, "form container must include a nonempty name"));
      if (!Array.isArray(node.record.elements)) failures.push(check(`${name}:form:${node.location}:elements`, false, "form container must include elements array"));
      if (Array.isArray(node.record.elements) && !formHasSubmitButton(node, taggedNodes)) failures.push(check(`${name}:form:${node.location}:submit-button`, false, "form container must include at least one submit button"));
    }
    if (insideForm && node.tag === "table") {
      failures.push(check(`${name}:form:${node.location}:no-table`, false, "JSON 2.0 form containers must not contain table components"));
    }
    if (insideForm && formInteractiveTags.has(node.tag)) {
      if (!isNonemptyString(node.record.name)) failures.push(check(`${name}:form:${node.location}:interactive-name`, false, "interactive components inside a form must include a nonempty name"));
    }
    if (node.tag === "button") {
      const formActionType = typeof node.record.form_action_type === "string" ? node.record.form_action_type : "";
      if (insideForm && !["submit", "reset"].includes(formActionType)) {
        failures.push(check(`${name}:form:${node.location}:button-form-action-type`, false, "buttons inside a form must use form_action_type submit or reset"));
      }
      if (!insideForm && hasRecordKey(node.record, "form_action_type")) {
        failures.push(check(`${name}:form:${node.location}:button-form-action-scope`, false, "form_action_type is only valid for buttons inside a form"));
      }
    }
  }
  return failures.length ? failures : [check(`${name}:forms:valid`, true, "form containers follow the local JSON 2.0 form rules")];
}

function verifyButtonBehaviors(name: string, taggedNodes: TaggedNode[], knownActions: Set<string> | undefined): CardCheck[] {
  const buttons = taggedNodes.filter((node) => node.tag === "button");
  if (!buttons.length) return [check(`${name}:buttons:present`, true, "no buttons found; card can still be informational")];
  return buttons.flatMap((button, index) => {
    const insideForm = button.ancestors.includes("form");
    const formActionType = typeof button.record.form_action_type === "string" ? button.record.form_action_type : "";
    const resetFormButton = insideForm && formActionType === "reset";
    const behaviors = Array.isArray(button.record.behaviors) ? button.record.behaviors : [];
    const behaviorChecks: CardCheck[] = [];
    const callbackActions: string[] = [];
    let hasOpenUrlBehavior = false;
    behaviors.forEach((behavior, behaviorIndex) => {
      const behaviorRecord = asRecord(behavior);
      behaviorChecks.push(check(`${name}:button:${index}:behavior:${behaviorIndex}:object`, Boolean(behaviorRecord), "button.behaviors entries must be objects"));
      if (!behaviorRecord) return;
      const behaviorType = typeof behaviorRecord.type === "string" ? behaviorRecord.type : "";
      behaviorChecks.push(check(`${name}:button:${index}:behavior:${behaviorIndex}:type`, supportedBehaviorTypes.has(behaviorType), "button.behaviors[].type must be callback or open_url"));
      if (behaviorType === "open_url") hasOpenUrlBehavior = true;
      if (behaviorType === "callback") {
        const value = asRecord(behaviorRecord.value);
        const action = value && typeof value.action === "string" ? value.action.trim() : "";
        behaviorChecks.push(check(`${name}:button:${index}:behavior:${behaviorIndex}:callback-value`, Boolean(value), "callback behavior value must be an object"));
        behaviorChecks.push(check(`${name}:button:${index}:behavior:${behaviorIndex}:callback-action`, Boolean(action), "callback behavior value.action must be a nonempty string"));
        if (action) callbackActions.push(action);
      }
    });
    const hasCallbackAction = callbackActions.length > 0;
    const callbackRequired = !resetFormButton && (!hasOpenUrlBehavior || formActionType === "submit");
    const unknownActions = knownActions ? callbackActions.filter((action) => !knownActions.has(action)) : [];
    return [
      check(`${name}:button:${index}:behaviors-array`, resetFormButton || behaviors.length > 0, resetFormButton ? "form reset button may omit behaviors" : "button must use behaviors in JSON 2.0"),
      check(`${name}:button:${index}:callback-behavior`, !callbackRequired || hasCallbackAction, callbackRequired ? "button must use behaviors callback with value.action" : "button does not require a callback action"),
      check(`${name}:button:${index}:no-action_type`, !hasRecordKey(button.record, "action_type"), "JSON 2.0 buttons must not use legacy action_type"),
      check(`${name}:button:${index}:no-legacy-value-only`, !hasRecordKey(button.record, "value"), "JSON 2.0 buttons must not use legacy top-level value; use behaviors[].value"),
      ...behaviorChecks,
      ...(hasCallbackAction && !knownActions ? [check(`${name}:button:${index}:known-action-catalog`, false, "known action catalog is required to prove button action maps to a handler")] : []),
      ...(hasCallbackAction && knownActions ? [check(`${name}:button:${index}:known-action`, unknownActions.length === 0, unknownActions.length ? `button action must map to a known handler: ${unknownActions.join(", ")}` : "button action maps to a known handler")] : []),
    ];
  });
}

function verifyNoDesignOnlyFields(name: string, value: unknown, location: string, root: boolean): CardCheck[] {
  const record = asRecord(value);
  if (!record) return [];
  const checks: CardCheck[] = [];
  for (const [key, child] of Object.entries(record)) {
    const designOnly = designOnlyFields.has(key) && (root || key !== "elements");
    if (designOnly) checks.push(check(`${name}:design-field:${location}.${key}`, false, `production payload must not include design-only field ${location}.${key}`));
    if (Array.isArray(child)) {
      child.forEach((item, index) => checks.push(...verifyNoDesignOnlyFields(name, item, `${location}.${key}[${index}]`, false)));
    } else if (asRecord(child)) {
      checks.push(...verifyNoDesignOnlyFields(name, child, `${location}.${key}`, false));
    }
  }
  return checks;
}

function verifySanitized(name: string, value: unknown): CardCheck[] {
  return [check(`${name}:sanitized`, !sensitivePattern.test(JSON.stringify(value)), "payload/report sample must not contain secrets, IDs, tokens, or raw callbacks")];
}

function collectTaggedNodes(value: unknown, location = "$", parentKey: string | undefined = undefined, ancestors: string[] = []): TaggedNode[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => collectTaggedNodes(item, `${location}[${index}]`, parentKey, ancestors));
  const record = asRecord(value);
  if (!record) return [];
  const rawTag = record.tag;
  const tag = typeof rawTag === "string" ? rawTag : rawTag === undefined ? "" : String(rawTag);
  const currentAncestors = tag ? [...ancestors, tag] : ancestors;
  const current = hasRecordKey(record, "tag") ? [{ tag, record, location, parentKey, ancestors }] : [];
  const children = Object.entries(record).flatMap(([key, child]) => collectTaggedNodes(child, `${location}.${key}`, key, currentAncestors));
  return [...current, ...children];
}

function isTextAtomContext(node: TaggedNode): boolean {
  return node.parentKey !== undefined && ["title", "subtitle", "text", "label", "placeholder", "hover_tips", "disabled_tips"].includes(node.parentKey);
}

function isNonemptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function formHasSubmitButton(form: TaggedNode, taggedNodes: TaggedNode[]): boolean {
  const prefix = `${form.location}.elements`;
  return taggedNodes.some((node) => node.location.startsWith(prefix) && node.tag === "button" && node.record.form_action_type === "submit");
}

function loadPayloadBundle(inputPath: string): PayloadBundle {
  const filePath = fs.statSync(inputPath).isDirectory() ? path.join(inputPath, "card_verification_samples.json") : inputPath;
  if (!fs.existsSync(filePath)) throw new Error(`Card verification input not found: ${filePath}`);
  const stats = fs.statSync(filePath);
  if (stats.size > maxPayloadBytes) throw new Error(`Card verification input is too large: ${filePath}`);
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  const record = asRecord(parsed);
  if (record && Array.isArray(record.payloads)) {
    const knownActions = Array.isArray(record.known_actions)
      ? new Set(record.known_actions.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))
      : undefined;
    return { payloads: record.payloads.map((item, index) => normalizeNamedPayload(item, index)), knownActions };
  }
  return { payloads: [normalizeNamedPayload(parsed, 0)], knownActions: undefined };
}

function findModuleVerifier(inputPath: string): string | undefined {
  const candidates = [
    path.join(inputPath, "verify-card.mjs"),
    path.join(inputPath, "integrations", "lark", "verify-card.mjs"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

function runModuleVerifier(verifierPath: string): void {
  const result = spawnSync(process.execPath, [verifierPath], {
    cwd: path.dirname(verifierPath),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: moduleVerifierTimeoutMs,
  });
  if (result.stdout) process.stdout.write(sanitizeOutput(result.stdout));
  if (result.stderr) process.stderr.write(sanitizeOutput(result.stderr));
  if (result.error) throw result.error;
  if (typeof result.status === "number" && result.status !== 0) process.exitCode = result.status;
}

function sanitizeOutput(output: string): string {
  return output.split(/(\r?\n)/).map((part) => sensitivePattern.test(part) ? "[redacted sensitive verifier output]" : part).join("");
}

function normalizeNamedPayload(value: unknown, index: number): NamedPayload {
  const record = asRecord(value);
  if (record && typeof record.name === "string" && typeof record.kind === "string" && hasRecordKey(record, "payload")) {
    return { name: record.name, kind: normalizePayloadKind(record.kind, record.payload), payload: record.payload };
  }
  return { name: `payload_${index + 1}`, kind: inferPayloadKind(value), payload: value };
}

function inferPayloadKind(value: unknown): PayloadKind {
  const record = asRecord(value);
  if (record && record.msg_type === "interactive" && typeof record.content === "string") return "send-message";
  if (record && hasRecordKey(record, "card")) return "callback-response";
  return "card";
}

function normalizePayloadKind(value: string, payload: unknown): PayloadKind {
  if (value === "card" || value === "send-message" || value === "callback-response") return value;
  return inferPayloadKind(payload);
}

function parseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.length > 0) return undefined;
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function hasRecordKey(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function check(name: string, passed: boolean, detail: string): CardCheck {
  return { name, status: passed ? "pass" : "fail", detail };
}

function printReport(report: CardVerificationReport): void {
  for (const item of report.checks) console.log(`${item.status.toUpperCase()} ${item.name} - ${item.detail}`);
  console.log(`Card verification ${report.status.toUpperCase()}: ${report.summary.pass} PASS / ${report.summary.fail} FAIL`);
}

function renderMarkdownReport(report: CardVerificationReport): string {
  const lines = [
    "# Card Verification Report",
    "",
    `Status: ${report.status.toUpperCase()}`,
    `Summary: ${report.summary.pass} PASS / ${report.summary.fail} FAIL`,
    "",
    "| Check | Status | Detail |",
    "|---|---|---|",
    ...report.checks.map((checkItem) => `| ${escapeMarkdown(checkItem.name)} | ${checkItem.status.toUpperCase()} | ${escapeMarkdown(checkItem.detail)} |`),
    "",
  ];
  return lines.join("\n");
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function verifyCardUsage(): string {
  return "Usage: lark-deployer verify:card <card-json-file-or-directory> [--report-dir <dir>] [--run-local-verifier]\n\nInput can be a raw JSON 2.0 card, a send-message payload, a callback response, or card_verification_samples.json with { known_actions, payloads: [{ name, kind, payload }] }. Directory-local verify-card.mjs execution requires --run-local-verifier.";
}
