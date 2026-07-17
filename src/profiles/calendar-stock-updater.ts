import type { CapabilityMap, InteractionContract, RequiredPermissions } from "../types.js";

export const CALENDAR_STOCK_UPDATER_PROFILE = {
  id: "calendar-stock-updater",
  actions: {
    refresh: "calendar.status.refresh",
    dryRun: "calendar.task.dry-run",
    runPrepare: "calendar.task.run.prepare",
    runConfirm: "calendar.task.run.confirm",
    runCancel: "calendar.task.run.cancel",
    stopPrepare: "calendar.task.stop.prepare",
    stopConfirm: "calendar.task.stop.confirm",
    stopCancel: "calendar.task.stop.cancel",
  },
} as const;

export interface CalendarProfileArtifacts {
  capabilityMap: CapabilityMap;
  interactionContract: InteractionContract;
  requiredPermissions: RequiredPermissions;
}

export function isCalendarStockUpdaterTarget(
  _targetPath: string,
  source: { server: string; taskConfig: string; automation: string },
): boolean {
  return source.server.includes("/api/state")
    && source.server.includes("/api/run")
    && source.server.includes("/api/stop")
    && source.taskConfig.includes("resolveProductIdRange")
    && (source.automation.includes("updateAllSkuRows") || source.automation.includes("SPECIAL_SKU_KEYWORD"));
}

export function buildCalendarProfileArtifacts(serviceName: string): CalendarProfileArtifacts {
  const capabilityMap: CapabilityMap = {
    schema_version: "0.2",
    service_name: serviceName,
    target_profile: "calendar-stock-updater",
    capabilities: [
      calendarCapability("calendar.status", "Read calendar task status", "query", "read_only", "GET", "/api/state", {}),
      calendarCapability("calendar.task.run", "Start a calendar inventory task", "long_task", "write", "POST", "/api/run", calendarTaskInputSchema()),
      calendarCapability("calendar.task.stop", "Stop the active calendar inventory task", "action", "destructive", "POST", "/api/stop", {
        type: "object",
        additionalProperties: false,
      }),
    ],
  };

  const actions = CALENDAR_STOCK_UPDATER_PROFILE.actions;
  const interactions: InteractionContract["interactions"] = [
    interaction("calendar.status.card", "calendar.status", actions.refresh, "button_action"),
    interaction("calendar.task.dry-run.card", "calendar.task.run", actions.dryRun, "form_action"),
    interaction("calendar.task.run.prepare.card", "calendar.task.run", actions.runPrepare, "form_action"),
    interaction("calendar.task.run.confirm.card", "calendar.task.run", actions.runConfirm, "button_action"),
    interaction("calendar.task.run.cancel.card", "calendar.status", actions.runCancel, "button_action"),
    interaction("calendar.task.stop.prepare.card", "calendar.task.stop", actions.stopPrepare, "button_action"),
    interaction("calendar.task.stop.confirm.card", "calendar.task.stop", actions.stopConfirm, "button_action"),
    interaction("calendar.task.stop.cancel.card", "calendar.status", actions.stopCancel, "button_action"),
  ];

  const interactionContract: InteractionContract = {
    schema_version: "0.2",
    channel: "lark",
    service_name: serviceName,
    supported_triggers: ["card_action", "manual_review"],
    supported_result_modes: ["interactive_card", "structured_result", "state_update"],
    interactions,
  };

  const requiredPermissions: RequiredPermissions = {
    schema_version: "0.2",
    app: {
      type: "custom_app",
      bot_required: true,
      availability_recommendation: "Restrict calendar inventory operations to an approved operator allowlist.",
    },
    context_requirements: [
      "Existing Feishu/Lark custom app with long connection enabled.",
      "FEISHU_APP_ID and FEISHU_APP_SECRET stored in the isolated Lark module environment.",
      "A Feishu SDK host subscribed to card.action.trigger.",
      "A reachable calendar-stock-updater TARGET_BASE_URL.",
      "An approved ALLOWED_OPERATOR_OPEN_IDS allowlist for task execution and stopping.",
    ],
    token_strategy: { default: "tenant_access_token", user_access_token_required: false },
    scopes: [{
      scope: "im:message:send_as_bot",
      identity: "tenant",
      required_by: interactions.map((item) => item.id),
      reason: "Send calendar task forms, confirmations, status, and failure cards.",
      risk: "low",
    }],
    events: [],
    callbacks: [{
      callback: "card.action.trigger",
      required_by: interactions.map((item) => item.id),
      reason: "Receive calendar task card actions through the Feishu SDK long connection.",
      security: ["long_connection", "operator_allowlist", "host_local_confirmation", "idempotency"],
    }],
    manual_steps: [
      "Enable bot capability and im:message:send_as_bot.",
      "Enable Feishu long connection and subscribe only to card.action.trigger.",
      "Configure integrations/lark/.env from integrations/lark/.env.example.",
      "Restrict ALLOWED_OPERATOR_OPEN_IDS before task execution or stopping.",
    ],
    review_flags: [
      "Formal inventory updates and task stopping use single-use host-local confirmations before the original target endpoints are called.",
      "GET /api/events is browser-only SSE infrastructure and is intentionally excluded from Feishu actions.",
      "Advanced SPECIAL_* and targeted SKU environment modes remain review candidates and are not exposed by the default card.",
    ],
  };

  return { capabilityMap, interactionContract, requiredPermissions };
}

function calendarCapability(
  id: string,
  name: string,
  kind: "query" | "action" | "long_task",
  risk: "read_only" | "write" | "destructive",
  method: "GET" | "POST",
  endpointPath: string,
  inputSchema: Record<string, unknown>,
): CapabilityMap["capabilities"][number] {
  return {
    id,
    name,
    kind,
    risk,
    source: { type: "http", method, path: endpointPath, content_type: "application/json" },
    input_schema: inputSchema,
    output_schema: { type: "object", additionalProperties: true },
    artifacts: [{ name: "task_state", type: "structured_data", source_field: "$", delivery: "card_json" }],
    timeout_seconds: 30,
  };
}

function interaction(
  id: string,
  capabilityId: string,
  actionId: string,
  inputMode: "form_action" | "button_action",
): InteractionContract["interactions"][number] {
  return {
    id,
    capability_id: capabilityId,
    action_id: actionId,
    trigger: "card_action",
    input_mode: inputMode,
    result_mode: "interactive_card",
    states: ["idle", "confirming", "running", "succeeded", "failed", "stopped"],
    audit_fields: ["operator_open_id", "chat_id", "message_id", "trace_id", "capability_id"],
    error_handling: [
      "Invalid business input -> return a failure card and do not call the target.",
      "Unauthorized mutating operator -> return a failure card and do not call the target.",
      "Expired, reused, or mismatched host-local confirmation -> return a failure card and do not start or stop a task.",
    ],
  };
}

export function calendarAdapterCardsSource(options: { typed?: boolean } = {}): string {
  if (options.typed) {
    return `import type { CalendarCard, CalendarCardElement, CalendarRecord, CalendarTaskState } from "./types.js";

const actions = ${JSON.stringify(CALENDAR_STOCK_UPDATER_PROFILE.actions, null, 2)} as const;

export function buildStartCard(state: CalendarTaskState = {}): CalendarCard {
  return buildOperationsCard(state);
}

export function buildOperationsCard(state: CalendarTaskState = {}): CalendarCard {
  const defaults = readRecord(state.defaults);
  const task = readRecord(state.task);
  const logs = Array.isArray(state.logs) ? state.logs.slice(-8) : [];
  const status = String(task.status || "idle");
  const running = status === "running";
  const summary = [
    "**状态摘要**",
    "**当前状态：** " + statusLabel(status),
    "**当前消息：** " + safeOperationalText(task.currentMessage, "等待开始", "状态消息已脱敏", 120),
    "**日期范围：** " + [task.startDate || defaults.startDate, task.targetDate || defaults.endDate || defaults.targetDate].filter(Boolean).join(" → "),
    "**库存：** " + String(task.stock || defaults.stock || "-"),
    "**商品范围：** " + [task.startProductId || defaults.startProductId || "从第一页开始", task.endProductId || defaults.endProductId || "不限"].join(" → "),
    "**启动时间：** " + String(task.startedAt || "-"),
  ].join("\\n");
  const elements: CalendarCardElement[] = [{ tag: "markdown", content: summary }];
  if (!running) {
    elements.push({ tag: "markdown", content: "**任务参数**\\n填写后可普通预演，或申请正式执行。" });
    elements.push(taskForm({ ...defaults, ...task }));
  }
  elements.push(actionButton("刷新状态", "calendar_status_refresh", actions.refresh, "default"));
  if (running && !task.stopRequested) elements.push(actionButton("申请停止任务", "calendar_stop_prepare", actions.stopPrepare, "danger"));
  if (running && task.stopRequested) elements.push({ tag: "markdown", content: "**停止状态**\\n已请求停止，等待当前任务退出后刷新状态。" });
  if (logs.length) elements.push({ tag: "markdown", content: "**最近日志（仅显示最近 8 条，长行会截断）**\\n" + logs.map((item) => "- " + safeLog(item)).join("\\n") });
  return card(statusTemplate(status), "日历库存运行控制台", elements);
}

export function buildRunConfirmationCard(result: CalendarRecord = {}): CalendarCard {
  const confirmationId = String(result.confirmationId || "");
  const input = readRecord(result.input);
  const summary = [
    "目标日期：" + String(input.targetDate || "-"),
    "库存：" + String(input.stock || "-"),
    "普通操作停顿（ms）：" + String(input.stepDelayMs || "-"),
    "日期组件停顿（ms）：" + String(input.datePickerDelayMs || "-"),
    "开始商品 ID：" + String(input.startProductId || "从第一页开始"),
    "结束商品 ID：" + String(input.endProductId || "不限"),
  ].join("\\n");
  return card("orange", "确认正式库存更新", [
    { tag: "markdown", content: "**风险提示：** 正式执行会写入库存。请确认以下提交值无误后再继续。\\n" + summary },
    actionButton("确认正式执行", "calendar_run_confirm", actions.runConfirm, "danger", { confirmationId }),
    actionButton("取消", "calendar_run_cancel", actions.runCancel, "default", { confirmationId }),
  ]);
}

export function buildStopConfirmationCard(result: CalendarRecord = {}): CalendarCard {
  const confirmationId = String(result.confirmationId || "");
  const task = readRecord(result.task);
  return card("orange", "确认停止任务", [
    { tag: "markdown", content: "**风险提示：** 此操作只会停止当前运行任务。\\n当前消息：" + safeOperationalText(task.currentMessage, "运行中", "状态消息已脱敏", 100) },
    actionButton("确认停止", "calendar_stop_confirm", actions.stopConfirm, "danger", { confirmationId }),
    actionButton("取消", "calendar_stop_cancel", actions.stopCancel, "default", { confirmationId }),
  ]);
}

export function buildFailureCard(message: string): CalendarCard {
  return card("red", "日历库存操作失败", [{ tag: "markdown", content: "**原因：** " + safeFailureMessage(message) }]);
}

function taskForm(values: CalendarRecord): CalendarCardElement {
  return {
    tag: "form",
    name: "calendar_task_form",
    elements: [
      input("targetDate", "目标日期", "YYYY-MM-DD", true, values.targetDate || values.endDate || ""),
      input("stock", "库存", "正整数", true, values.stock || "100"),
      input("stepDelayMs", "普通操作停顿（ms）", "0-10000", true, values.stepDelayMs || "500"),
      input("datePickerDelayMs", "日期组件停顿（ms）", "0-10000", true, values.datePickerDelayMs || "500"),
      input("startProductId", "开始商品 ID（可选，较大）", "留空表示从第一页开始", false, values.startProductId || ""),
      input("endProductId", "结束商品 ID（可选，较小）", "留空表示不限", false, values.endProductId || ""),
      actionButton("普通预演", "calendar_dry_run", actions.dryRun, "primary", {}, true),
      actionButton("申请正式执行", "calendar_run_prepare", actions.runPrepare, "danger", {}, true),
    ],
  };
}

function input(name: string, label: string, placeholder: string, required: boolean, defaultValue: unknown): CalendarCardElement {
  return {
    tag: "input",
    name,
    required,
    width: "fill",
    default_value: String(defaultValue || ""),
    label: { tag: "plain_text", content: label },
    placeholder: { tag: "plain_text", content: placeholder },
  };
}

function actionButton(text: string, name: string, action: string, type: string, value: CalendarRecord = {}, submit = false): CalendarCardElement {
  return {
    tag: "button",
    text: { tag: "plain_text", content: text },
    type,
    name,
    ...(submit ? { form_action_type: "submit" } : {}),
    behaviors: [{ type: "callback", value: { action, ...value } }],
  };
}

function card(template: string, title: string, elements: CalendarCardElement[]): CalendarCard {
  return {
    schema: "2.0",
    config: { update_multi: true, wide_screen_mode: true },
    header: { template, title: { tag: "plain_text", content: title } },
    body: { elements },
  };
}

function statusTemplate(status: string): string {
  return status === "succeeded" ? "green" : status === "failed" ? "red" : status === "stopped" ? "grey" : status === "running" ? "yellow" : "blue";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = { idle: "待命", running: "运行中", succeeded: "已完成", failed: "失败", stopped: "已停止" };
  return labels[status] || status;
}

function safeDisplayText(value: unknown, fallback: string, maxLength: number): string {
  const normalized = normalizeDisplayText(value, fallback);
  return normalized.length > maxLength ? normalized.slice(0, maxLength - 1) + "…" : normalized;
}

function safeOperationalText(value: unknown, fallback: string, redacted: string, maxLength: number): string {
  const normalized = normalizeDisplayText(value, fallback);
  return isSensitiveOperationalText(normalized) ? redacted : safeDisplayText(normalized, fallback, maxLength);
}

function safeFailureMessage(value: unknown): string {
  return safeOperationalText(value, "未知错误", "操作失败，请检查目标服务与模块配置后重试。", 160);
}

function normalizeDisplayText(value: unknown, fallback: string): string {
  return String(value ?? "").replace(/[\\r\\n]+/g, " ").replace(/\\s+/g, " ").trim() || fallback;
}

function isSensitiveOperationalText(value: string): boolean {
  return /(?:https?:\\/\\/|<[^>]+>|app[_-]?secret|authorization|bearer|cookie|(?:auth|secret|token|password|credentials?|(?:api|access|private)[_-]?key)\\s*[:=]|operator[_-]?open[_-]?id|open[_-]?chat[_-]?id|test[_-]?chat[_-]?id|\\b(?:ou|oc|om)_[A-Za-z0-9_-]+\\b|\\bsk-[A-Za-z0-9_-]{8,}\\b)/i.test(value);
}

function safeLog(item: unknown): string {
  const entry = readRecord(item);
  const timestamp = safeOperationalText(entry.timestamp || entry.time || entry.createdAt || "", "", "时间已脱敏", 40);
  const rawMessage = entry.message !== undefined ? entry.message : typeof item === "string" ? item : "无日志消息";
  const message = safeOperationalText(rawMessage, "无日志消息", "日志内容已脱敏", 180);
  return (timestamp ? "[" + timestamp + "] " : "") + message;
}

function readRecord(value: unknown): CalendarRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as CalendarRecord : {};
}
`;
  }
  return `const actions = ${JSON.stringify(CALENDAR_STOCK_UPDATER_PROFILE.actions, null, 2)};

export function buildStartCard(state = {}) {
  return buildOperationsCard(state);
}

export function buildOperationsCard(state = {}) {
  const defaults = state.defaults && typeof state.defaults === "object" ? state.defaults : {};
  const task = state.task && typeof state.task === "object" ? state.task : {};
  const logs = Array.isArray(state.logs) ? state.logs.slice(-8) : [];
  const status = String(task.status || "idle");
  const running = status === "running";
  const summary = [
    "**状态摘要**",
    "**当前状态：** " + statusLabel(status),
    "**当前消息：** " + safeOperationalText(task.currentMessage, "等待开始", "状态消息已脱敏", 120),
    "**日期范围：** " + [task.startDate || defaults.startDate, task.targetDate || defaults.endDate || defaults.targetDate].filter(Boolean).join(" → "),
    "**库存：** " + String(task.stock || defaults.stock || "-"),
    "**商品范围：** " + [task.startProductId || defaults.startProductId || "从第一页开始", task.endProductId || defaults.endProductId || "不限"].join(" → "),
    "**启动时间：** " + String(task.startedAt || "-"),
  ].join("\\n");
  const elements = [{ tag: "markdown", content: summary }];
  if (!running) {
    elements.push({ tag: "markdown", content: "**任务参数**\\n填写后可普通预演，或申请正式执行。" });
    elements.push(taskForm({ ...defaults, ...task }));
  }
  elements.push(actionButton("刷新状态", "calendar_status_refresh", actions.refresh, "default"));
  if (running && !task.stopRequested) elements.push(actionButton("申请停止任务", "calendar_stop_prepare", actions.stopPrepare, "danger"));
  if (running && task.stopRequested) elements.push({ tag: "markdown", content: "**停止状态**\\n已请求停止，等待当前任务退出后刷新状态。" });
  if (logs.length) elements.push({ tag: "markdown", content: "**最近日志（仅显示最近 8 条，长行会截断）**\\n" + logs.map((item) => "- " + safeLog(item)).join("\\n") });
  return card(statusTemplate(status), "日历库存运行控制台", elements);
}

export function buildRunConfirmationCard(result = {}) {
  const confirmationId = String(result.confirmationId || "");
  const input = result.input && typeof result.input === "object" ? result.input : {};
  const summary = [
    "目标日期：" + String(input.targetDate || "-"),
    "库存：" + String(input.stock || "-"),
    "普通操作停顿（ms）：" + String(input.stepDelayMs || "-"),
    "日期组件停顿（ms）：" + String(input.datePickerDelayMs || "-"),
    "开始商品 ID：" + String(input.startProductId || "从第一页开始"),
    "结束商品 ID：" + String(input.endProductId || "不限"),
  ].join("\\n");
  return card("orange", "确认正式库存更新", [
    { tag: "markdown", content: "**风险提示：** 正式执行会写入库存。请确认以下提交值无误后再继续。\\n" + summary },
    actionButton("确认正式执行", "calendar_run_confirm", actions.runConfirm, "danger", { confirmationId }),
    actionButton("取消", "calendar_run_cancel", actions.runCancel, "default", { confirmationId }),
  ]);
}

export function buildStopConfirmationCard(result = {}) {
  const confirmationId = String(result.confirmationId || "");
  const task = result.task && typeof result.task === "object" ? result.task : {};
  return card("orange", "确认停止任务", [
    { tag: "markdown", content: "**风险提示：** 此操作只会停止当前运行任务。\\n当前消息：" + safeOperationalText(task.currentMessage, "运行中", "状态消息已脱敏", 100) },
    actionButton("确认停止", "calendar_stop_confirm", actions.stopConfirm, "danger", { confirmationId }),
    actionButton("取消", "calendar_stop_cancel", actions.stopCancel, "default", { confirmationId }),
  ]);
}

export function buildFailureCard(message) {
  return card("red", "日历库存操作失败", [{ tag: "markdown", content: "**原因：** " + safeFailureMessage(message) }]);
}

function taskForm(values) {
  return {
    tag: "form",
    name: "calendar_task_form",
    elements: [
      input("targetDate", "目标日期", "YYYY-MM-DD", true, values.targetDate || values.endDate || ""),
      input("stock", "库存", "正整数", true, values.stock || "100"),
      input("stepDelayMs", "普通操作停顿（ms）", "0-10000", true, values.stepDelayMs || "500"),
      input("datePickerDelayMs", "日期组件停顿（ms）", "0-10000", true, values.datePickerDelayMs || "500"),
      input("startProductId", "开始商品 ID（可选，较大）", "留空表示从第一页开始", false, values.startProductId || ""),
      input("endProductId", "结束商品 ID（可选，较小）", "留空表示不限", false, values.endProductId || ""),
      actionButton("普通预演", "calendar_dry_run", actions.dryRun, "primary", {}, true),
      actionButton("申请正式执行", "calendar_run_prepare", actions.runPrepare, "danger", {}, true),
    ],
  };
}

function input(name, label, placeholder, required, defaultValue) {
  return {
    tag: "input",
    name,
    required,
    width: "fill",
    default_value: String(defaultValue || ""),
    label: { tag: "plain_text", content: label },
    placeholder: { tag: "plain_text", content: placeholder },
  };
}

function actionButton(text, name, action, type, value = {}, submit = false) {
  return {
    tag: "button",
    text: { tag: "plain_text", content: text },
    type,
    name,
    ...(submit ? { form_action_type: "submit" } : {}),
    behaviors: [{ type: "callback", value: { action, ...value } }],
  };
}

function card(template, title, elements) {
  return {
    schema: "2.0",
    config: { update_multi: true, wide_screen_mode: true },
    header: { template, title: { tag: "plain_text", content: title } },
    body: { elements },
  };
}

function statusTemplate(status) {
  return status === "succeeded" ? "green" : status === "failed" ? "red" : status === "stopped" ? "grey" : status === "running" ? "yellow" : "blue";
}

function statusLabel(status) {
  return ({ idle: "待命", running: "运行中", succeeded: "已完成", failed: "失败", stopped: "已停止" })[status] || status;
}

function safeDisplayText(value, fallback, maxLength) {
  const normalized = normalizeDisplayText(value, fallback);
  return normalized.length > maxLength ? normalized.slice(0, maxLength - 1) + "…" : normalized;
}

function safeOperationalText(value, fallback, redacted, maxLength) {
  const normalized = normalizeDisplayText(value, fallback);
  return isSensitiveOperationalText(normalized) ? redacted : safeDisplayText(normalized, fallback, maxLength);
}

function safeFailureMessage(value) {
  return safeOperationalText(value, "未知错误", "操作失败，请检查目标服务与模块配置后重试。", 160);
}

function normalizeDisplayText(value, fallback) {
  return String(value ?? "").replace(/[\\r\\n]+/g, " ").replace(/\\s+/g, " ").trim() || fallback;
}

function isSensitiveOperationalText(value) {
  return /(?:https?:\\/\\/|<[^>]+>|app[_-]?secret|authorization|bearer|cookie|(?:auth|secret|token|password|credentials?|(?:api|access|private)[_-]?key)\\s*[:=]|operator[_-]?open[_-]?id|open[_-]?chat[_-]?id|test[_-]?chat[_-]?id|\\b(?:ou|oc|om)_[A-Za-z0-9_-]+\\b|\\bsk-[A-Za-z0-9_-]{8,}\\b)/i.test(value);
}

function safeLog(item) {
  const entry = item && typeof item === "object" ? item : {};
  const timestamp = safeOperationalText(entry.timestamp || entry.time || entry.createdAt || "", "", "时间已脱敏", 40);
  const rawMessage = entry.message !== undefined ? entry.message : typeof item === "string" ? item : "无日志消息";
  const message = safeOperationalText(rawMessage, "无日志消息", "日志内容已脱敏", 180);
  return (timestamp ? "[" + timestamp + "] " : "") + message;
}
`;
}

export function calendarAdapterValidationSource(options: { typed?: boolean } = {}): string {
  if (options.typed) {
    return `import type { CalendarRecord, CalendarTaskRunInput } from "./types.js";

export function assertAllowedOperator(operatorOpenId: string | undefined, allowedOperatorOpenIds: readonly string[] | undefined): void {
  if (!Array.isArray(allowedOperatorOpenIds) || allowedOperatorOpenIds.length === 0) throw new Error("尚未配置获准操作人，无法执行日历库存操作。请联系管理员完成操作人白名单配置。");
  if (!operatorOpenId || !allowedOperatorOpenIds.includes(operatorOpenId)) throw new Error("当前操作人未获授权，无法执行日历库存操作。请联系管理员确认操作人白名单配置。");
}

export function readObject(value: unknown): CalendarRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as CalendarRecord : {};
}

export function calendarTaskInput(value: unknown, mode: string): CalendarTaskRunInput {
  const input = readObject(value);
  const text = (key: string): string => typeof input[key] === "string" || typeof input[key] === "number" ? String(input[key]).trim() : "";
  const targetDate = text("targetDate");
  const stock = text("stock");
  const stepDelayMs = text("stepDelayMs") || "500";
  const datePickerDelayMs = text("datePickerDelayMs") || "500";
  const startProductId = text("startProductId");
  const endProductId = text("endProductId");
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(targetDate)) throw new Error("目标日期必须是 YYYY-MM-DD。");
  if (!/^\\d+$/.test(stock) || Number(stock) <= 0) throw new Error("库存必须是正整数。");
  for (const [name, candidate] of [["普通操作停顿", stepDelayMs], ["日期组件停顿", datePickerDelayMs]] as const) {
    if (!/^\\d+$/.test(candidate) || Number(candidate) > 10000) throw new Error(name + " 必须是 0 到 10000 的整数。");
  }
  for (const [name, candidate] of [["开始商品 ID", startProductId], ["结束商品 ID", endProductId]] as const) {
    if (candidate && (!/^\\d+$/.test(candidate) || Number(candidate) <= 0)) throw new Error(name + " 必须是正整数。");
  }
  if (startProductId && endProductId && Number(startProductId) < Number(endProductId)) throw new Error("结束商品 ID 不能大于开始商品 ID。");
  return { mode, targetDate, stock, stepDelayMs, datePickerDelayMs, startProductId, endProductId };
}
`;
  }
  return `export function assertAllowedOperator(operatorOpenId, allowedOperatorOpenIds) {
  if (!Array.isArray(allowedOperatorOpenIds) || allowedOperatorOpenIds.length === 0) throw new Error("尚未配置获准操作人，无法执行日历库存操作。请联系管理员完成操作人白名单配置。");
  if (!operatorOpenId || !allowedOperatorOpenIds.includes(operatorOpenId)) throw new Error("当前操作人未获授权，无法执行日历库存操作。请联系管理员确认操作人白名单配置。");
}

export function readObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function calendarTaskInput(value, mode) {
  const input = readObject(value);
  const text = (key) => typeof input[key] === "string" || typeof input[key] === "number" ? String(input[key]).trim() : "";
  const targetDate = text("targetDate");
  const stock = text("stock");
  const stepDelayMs = text("stepDelayMs") || "500";
  const datePickerDelayMs = text("datePickerDelayMs") || "500";
  const startProductId = text("startProductId");
  const endProductId = text("endProductId");
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(targetDate)) throw new Error("目标日期必须是 YYYY-MM-DD。");
  if (!/^\\d+$/.test(stock) || Number(stock) <= 0) throw new Error("库存必须是正整数。");
  for (const [name, candidate] of [["普通操作停顿", stepDelayMs], ["日期组件停顿", datePickerDelayMs]]) {
    if (!/^\\d+$/.test(candidate) || Number(candidate) > 10000) throw new Error(name + " 必须是 0 到 10000 的整数。");
  }
  for (const [name, candidate] of [["开始商品 ID", startProductId], ["结束商品 ID", endProductId]]) {
    if (candidate && (!/^\\d+$/.test(candidate) || Number(candidate) <= 0)) throw new Error(name + " 必须是正整数。");
  }
  if (startProductId && endProductId && Number(startProductId) < Number(endProductId)) throw new Error("结束商品 ID 不能大于开始商品 ID。");
  return { mode, targetDate, stock, stepDelayMs, datePickerDelayMs, startProductId, endProductId };
}
`;
}

export function calendarAdapterServiceClientSource(options: { typed?: boolean } = {}): string {
  if (options.typed) {
    return `import type { CalendarRecord } from "./types.js";

export async function callCalendar(baseUrl: string, method: string, path: string, body: CalendarRecord | null = null, timeoutMs = 30000): Promise<CalendarRecord> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(String(baseUrl || "").replace(/\\/+$/, "") + path, {
      method,
      signal: controller.signal,
      ...(method === "GET" ? {} : { headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body || {}) }),
    });
    const text = await response.text();
    const result = parseCalendarResponse(text);
    if (!response.ok) throw new Error("目标服务请求失败：" + method + " " + path + " 返回 HTTP " + response.status + "。");
    return result && typeof result === "object" && !Array.isArray(result) ? result as CalendarRecord : { value: result };
  } finally {
    clearTimeout(timeout);
  }
}

function parseCalendarResponse(text: string): unknown {
  try { return text ? JSON.parse(text) as unknown : {}; } catch { return { text }; }
}

`;
  }
  return `export async function callCalendar(baseUrl, method, path, body, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(String(baseUrl || "").replace(/\\/+$/, "") + path, {
      method,
      signal: controller.signal,
      ...(method === "GET" ? {} : { headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body || {}) }),
    });
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : {}; } catch { result = { text }; }
    if (!response.ok) throw new Error("目标服务请求失败：" + method + " " + path + " 返回 HTTP " + response.status + "。");
    return result && typeof result === "object" ? result : { value: result };
  } finally {
    clearTimeout(timeout);
  }
}
`;
}

export function calendarAdapterHandlersSource(options: { typed?: boolean } = {}): string {
  if (options.typed) {
    return `import { assertAllowedOperator, calendarTaskInput, readObject } from "./validation.js";
import { callCalendar } from "./service-client.js";
import { buildFailureCard, buildOperationsCard, buildRunConfirmationCard, buildStopConfirmationCard } from "./cards.js";
import type { AdapterActionContext, AdapterAuditEvent, AdapterDependencies, AdapterResult, CalendarRecord, CalendarTaskRunInput, CalendarTaskState } from "./types.js";

const actions = ${JSON.stringify(CALENDAR_STOCK_UPDATER_PROFILE.actions, null, 2)} as const;
const confirmations = new Map<string, CalendarConfirmation>();
const confirmationTtlMs = 5 * 60 * 1000;
const audit = (event: string, detail: CalendarRecord = {}): AdapterAuditEvent => ({ event, detail });

type ConfirmationKind = "run" | "stop";
interface ConfirmationBase { id: string; kind: ConfirmationKind; operatorOpenId: string; expiresAt: number; }
interface RunConfirmation extends ConfirmationBase { kind: "run"; input: CalendarTaskRunInput; }
interface StopConfirmation extends ConfirmationBase { kind: "stop"; task: CalendarRecord; taskIdentity: string; }
type CalendarConfirmation = RunConfirmation | StopConfirmation;

export async function handleCardAction(ctx: AdapterActionContext = { action: "" }, deps: AdapterDependencies = { targetBaseUrl: "" }): Promise<AdapterResult> {
  const action = String(ctx.action || "").replace(/[\\r\\n]+/g, " ").slice(0, 120);
  const auditEvents = [audit("calendar_card_action_received", { action, operator_open_id: ctx.operatorOpenId || "", chat_id: ctx.openChatId || "" })];
  try {
    const value = { ...readObject(ctx.value), ...readObject(ctx.formValue) };
    const baseUrl = String(deps.targetBaseUrl || "");
    assertAllowedOperator(ctx.operatorOpenId, deps.allowedOperatorOpenIds);
    if (action === actions.refresh) {
      const current = await state();
      return success(buildOperationsCard(current), current);
    }
    if (action === actions.runCancel || action === actions.stopCancel) {
      const confirmationId = String(value.confirmationId || "");
      if (confirmationId) cancelConfirmation(confirmationId, ctx.operatorOpenId);
      const current = await state();
      return success(buildOperationsCard(current), current);
    }
    if (action === actions.dryRun) {
      const result = await callCalendar(baseUrl, "POST", "/api/run", calendarTaskInput(value, "dry-run"), deps.timeoutMs);
      const current = await state();
      return success(buildOperationsCard(current), result);
    }
    if (action === actions.runPrepare) {
      const input = calendarTaskInput(value, "run");
      const current = await state();
      const task = readObject(current.task);
      if (task.status === "running") throw new Error("已有任务正在运行，请等待当前任务结束。");
      const confirmation = createRunConfirmation(ctx.operatorOpenId, input);
      return success(buildRunConfirmationCard({ confirmationId: confirmation.id, input }), { confirmationId: confirmation.id, input });
    }
    if (action === actions.runConfirm) {
      const confirmation = consumeConfirmation(String(value.confirmationId || ""), "run", ctx.operatorOpenId);
      const result = await callCalendar(baseUrl, "POST", "/api/run", confirmation.input, deps.timeoutMs);
      const current = await state();
      return success(buildOperationsCard(current), result);
    }
    if (action === actions.stopPrepare) {
      const current = await state();
      const task = readObject(current.task);
      if (task.status !== "running") throw new Error("当前没有运行中的任务。");
      const taskIdentity = identifyTask(task);
      if (!taskIdentity) throw new Error("当前任务缺少可确认的身份信息。");
      const confirmation = createStopConfirmation(ctx.operatorOpenId, task, taskIdentity);
      return success(buildStopConfirmationCard({ confirmationId: confirmation.id, task }), { confirmationId: confirmation.id, task });
    }
    if (action === actions.stopConfirm) {
      const confirmation = consumeConfirmation(String(value.confirmationId || ""), "stop", ctx.operatorOpenId);
      const current = await state();
      const task = readObject(current.task);
      if (task.status !== "running" || identifyTask(task) !== confirmation.taskIdentity) throw new Error("待停止任务已变化，请重新申请确认。");
      const result = await callCalendar(baseUrl, "POST", "/api/stop", {}, deps.timeoutMs);
      const updated = await state();
      return success(buildOperationsCard(updated), result);
    }
    throw new Error("不支持的日历库存卡片操作。");

    async function state(): Promise<CalendarTaskState> {
      return callCalendar(baseUrl, "GET", "/api/state", null, deps.timeoutMs) as Promise<CalendarTaskState>;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    auditEvents.push(audit("calendar_card_action_failed", { action, message }));
    return { ok: false, card: buildFailureCard(message), auditEvents };
  }

  function success(card: CalendarRecord, result: CalendarRecord): AdapterResult {
    auditEvents.push(audit("calendar_card_action_succeeded", { action }));
    return { ok: true, card, result, auditEvents };
  }
}

function createRunConfirmation(operatorOpenId: string | undefined, input: CalendarTaskRunInput): RunConfirmation {
  purgeExpiredConfirmations();
  const confirmation: RunConfirmation = { id: createConfirmationId(), kind: "run", operatorOpenId: String(operatorOpenId || ""), expiresAt: Date.now() + confirmationTtlMs, input };
  confirmations.set(confirmation.id, confirmation);
  return confirmation;
}

function createStopConfirmation(operatorOpenId: string | undefined, task: CalendarRecord, taskIdentity: string): StopConfirmation {
  purgeExpiredConfirmations();
  const confirmation: StopConfirmation = { id: createConfirmationId(), kind: "stop", operatorOpenId: String(operatorOpenId || ""), expiresAt: Date.now() + confirmationTtlMs, task, taskIdentity };
  confirmations.set(confirmation.id, confirmation);
  return confirmation;
}

function purgeExpiredConfirmations(): void {
  for (const [id, confirmation] of confirmations) if (confirmation.expiresAt < Date.now()) confirmations.delete(id);
}

function createConfirmationId(): string {
  return globalThis.crypto.randomUUID();
}

function consumeConfirmation<K extends ConfirmationKind>(id: string, kind: K, operatorOpenId: string | undefined): Extract<CalendarConfirmation, { kind: K }> {
  const confirmation = confirmations.get(id);
  if (!confirmation || confirmation.kind !== kind) throw new Error("确认已失效或类型不匹配。");
  if (confirmation.expiresAt < Date.now()) { confirmations.delete(id); throw new Error("确认已过期。"); }
  if (!operatorOpenId || confirmation.operatorOpenId !== String(operatorOpenId)) throw new Error("确认操作人与申请人不一致。");
  confirmations.delete(id);
  return confirmation as Extract<CalendarConfirmation, { kind: K }>;
}

function cancelConfirmation(id: string, operatorOpenId: string | undefined): void {
  const confirmation = confirmations.get(id);
  if (!confirmation) return;
  if (!operatorOpenId || confirmation.operatorOpenId !== String(operatorOpenId)) throw new Error("确认操作人与申请人不一致。");
  confirmations.delete(id);
}

function identifyTask(task: CalendarRecord): string {
  return String(task.taskId || task.pid || task.startedAt || "");
}

export const handleCalendarStockCardAction = handleCardAction;
`;
  }
  return `import { randomUUID } from "node:crypto";
import { assertAllowedOperator, calendarTaskInput, readObject } from "./validation.js";
import { callCalendar } from "./service-client.js";
import { buildFailureCard, buildOperationsCard, buildRunConfirmationCard, buildStopConfirmationCard } from "./cards.js";

const actions = ${JSON.stringify(CALENDAR_STOCK_UPDATER_PROFILE.actions, null, 2)};
const confirmations = new Map();
const confirmationTtlMs = 5 * 60 * 1000;
const audit = (event, detail = {}) => ({ event, detail });

export async function handleCardAction(ctx = {}, deps = {}) {
  const action = String(ctx.action || "").replace(/[\\r\\n]+/g, " ").slice(0, 120);
  const auditEvents = [audit("calendar_card_action_received", { action, operator_open_id: ctx.operatorOpenId || "", chat_id: ctx.openChatId || "" })];
  try {
    const value = { ...readObject(ctx.value), ...readObject(ctx.formValue) };
    const baseUrl = String(deps.targetBaseUrl || "");
    assertAllowedOperator(ctx.operatorOpenId, deps.allowedOperatorOpenIds);
    if (action === actions.refresh) {
      const current = await state();
      return success(buildOperationsCard(current), current);
    }
    if (action === actions.runCancel || action === actions.stopCancel) {
      const confirmationId = String(value.confirmationId || "");
      if (confirmationId) cancelConfirmation(confirmationId, ctx.operatorOpenId);
      const current = await state();
      return success(buildOperationsCard(current), current);
    }
    if (action === actions.dryRun) {
      const result = await callCalendar(baseUrl, "POST", "/api/run", calendarTaskInput(value, "dry-run"), deps.timeoutMs);
      const current = await state();
      return success(buildOperationsCard(current), result);
    }
    if (action === actions.runPrepare) {
      const input = calendarTaskInput(value, "run");
      const current = await state();
      if (current.task && current.task.status === "running") throw new Error("已有任务正在运行，请等待当前任务结束。");
      const confirmation = createConfirmation("run", ctx.operatorOpenId, { input });
      return success(buildRunConfirmationCard({ confirmationId: confirmation.id, input }), { confirmationId: confirmation.id, input });
    }
    if (action === actions.runConfirm) {
      const confirmation = consumeConfirmation(String(value.confirmationId || ""), "run", ctx.operatorOpenId);
      const result = await callCalendar(baseUrl, "POST", "/api/run", confirmation.input, deps.timeoutMs);
      const current = await state();
      return success(buildOperationsCard(current), result);
    }
    if (action === actions.stopPrepare) {
      const current = await state();
      if (!current.task || current.task.status !== "running") throw new Error("当前没有运行中的任务。");
      const taskIdentity = identifyTask(current.task);
      if (!taskIdentity) throw new Error("当前任务缺少可确认的身份信息。");
      const confirmation = createConfirmation("stop", ctx.operatorOpenId, { task: current.task, taskIdentity });
      return success(buildStopConfirmationCard({ confirmationId: confirmation.id, task: current.task }), { confirmationId: confirmation.id, task: current.task });
    }
    if (action === actions.stopConfirm) {
      const confirmation = consumeConfirmation(String(value.confirmationId || ""), "stop", ctx.operatorOpenId);
      const current = await state();
      if (!current.task || current.task.status !== "running" || identifyTask(current.task) !== confirmation.taskIdentity) throw new Error("待停止任务已变化，请重新申请确认。");
      const result = await callCalendar(baseUrl, "POST", "/api/stop", {}, deps.timeoutMs);
      const updated = await state();
      return success(buildOperationsCard(updated), result);
    }
    throw new Error("不支持的日历库存卡片操作。");

    async function state() {
      return callCalendar(baseUrl, "GET", "/api/state", null, deps.timeoutMs);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    auditEvents.push(audit("calendar_card_action_failed", { action, message }));
    return { ok: false, card: buildFailureCard(message), auditEvents };
  }

  function success(card, result) {
    auditEvents.push(audit("calendar_card_action_succeeded", { action }));
    return { ok: true, card, result, auditEvents };
  }
}

function createConfirmation(kind, operatorOpenId, detail) {
  for (const [id, confirmation] of confirmations) if (confirmation.expiresAt < Date.now()) confirmations.delete(id);
  const id = randomUUID();
  const confirmation = { id, kind, operatorOpenId: String(operatorOpenId || ""), expiresAt: Date.now() + confirmationTtlMs, ...detail };
  confirmations.set(id, confirmation);
  return confirmation;
}

function consumeConfirmation(id, kind, operatorOpenId) {
  const confirmation = confirmations.get(id);
  if (!confirmation || confirmation.kind !== kind) throw new Error("确认已失效或类型不匹配。");
  if (confirmation.expiresAt < Date.now()) { confirmations.delete(id); throw new Error("确认已过期。"); }
  if (!operatorOpenId || confirmation.operatorOpenId !== String(operatorOpenId)) throw new Error("确认操作人与申请人不一致。");
  confirmations.delete(id);
  return confirmation;
}

function cancelConfirmation(id, operatorOpenId) {
  const confirmation = confirmations.get(id);
  if (!confirmation) return;
  if (!operatorOpenId || confirmation.operatorOpenId !== String(operatorOpenId)) throw new Error("确认操作人与申请人不一致。");
  confirmations.delete(id);
}

function identifyTask(task) {
  return String(task && (task.taskId || task.pid || task.startedAt) || "");
}

export const handleCalendarStockCardAction = handleCardAction;
`;
}

function calendarTaskInputSchema(): Record<string, unknown> {
  return {
    type: "object",
    required: ["mode", "targetDate", "stock"],
    properties: {
      mode: { type: "string", enum: ["dry-run", "run"] },
      targetDate: { type: "string", description: "Target date in YYYY-MM-DD." },
      stock: { type: "string", description: "Positive inventory integer." },
      stepDelayMs: { type: "string", default: "500" },
      datePickerDelayMs: { type: "string", default: "500" },
      startProductId: { type: "string" },
      endProductId: { type: "string" },
    },
    additionalProperties: false,
  };
}
