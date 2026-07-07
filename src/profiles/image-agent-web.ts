import { buildFormFieldMaps, formFieldName } from "../field-mapping.js";
import type { CapabilityMap, ServiceManifest } from "../types.js";

export interface ImageAgentMeta {
  templates?: Array<{
    id: string;
    name?: string;
    allowed_sizes?: string[];
    default_size?: string;
    fields?: Array<{ key: string; label?: string; required?: boolean; placeholder?: string }>;
  }>;
}

export const IMAGE_AGENT_WEB_PROFILE = {
  id: "image-agent-web",
  actions: {
    generate: "image.generate.submit",
    iterate: "image.iterate.submit",
    batchSubmit: "image.batch.submit",
    batchRefresh: "image.batch.refresh",
  },
  capabilities: {
    generate: "image.generate",
    iterate: "image.iterate",
    batch: "image.batch",
  },
  endpoints: {
    generate: { method: "POST", path: "/api/generate", body: "multipart/form-data" },
    iterate: { method: "POST", path: "/api/iterate", body: "json" },
    batchSubmit: { method: "POST", path: "/api/batch", body: "multipart/form-data" },
    batchStatus: { method: "GET", path: "/api/batch/{batch_id}/status", body: "none" },
    batchDownload: { method: "GET", path: "/api/batch/{batch_id}/download", body: "none" },
  },
  env: {
    baseUrl: "IMAGE_AGENT_BASE_URL",
    timeoutMs: "IMAGE_AGENT_TIMEOUT_MS",
  },
} as const;

export function adapterServiceClientTs(): string {
  return `import type { BatchRequest, GeneratePreset, IterateRequest } from "./types.js";

export async function callImageGenerate(baseUrl: string, preset: GeneratePreset, timeoutMs = 120000): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const form = new FormData();
    form.set("template_id", preset.template_id);
    form.set("size", preset.size);
    form.set("fields_json", JSON.stringify(preset.fields));
    form.set("message", preset.message || "");
    form.set("reference_types_json", "[]");
    const response = await fetch(baseUrl.replace(/\\/+$/, "") + "/api/generate", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("image-agent-web /api/generate returned HTTP " + response.status);
    }
    const body = await response.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } finally {
    clearTimeout(timeout);
  }
}

export async function callImageIterate(baseUrl: string, request: IterateRequest, timeoutMs = 120000): Promise<Record<string, unknown>> {
  const response = await fetchWithTimeout(baseUrl.replace(/\\/+$/, "") + "/api/iterate", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ session_id: request.session_id, feedback: request.feedback }),
  }, timeoutMs, "image-agent-web /api/iterate");
  return readJsonResponse(response, "image-agent-web /api/iterate");
}

export async function callImageBatchCreate(baseUrl: string, request: BatchRequest, timeoutMs = 120000): Promise<{ batch_id: string }> {
  const form = new FormData();
  form.set("template_id", request.template_id);
  form.set("size", request.size);
  form.set("items_json", JSON.stringify(request.items));
  form.set("reference_types_json", "[]");
  const response = await fetchWithTimeout(baseUrl.replace(/\\/+$/, "") + "/api/batch", { method: "POST", body: form }, timeoutMs, "image-agent-web /api/batch");
  const parsed = await readJsonResponse(response, "image-agent-web /api/batch");
  const batchId = typeof parsed.batch_id === "string" ? parsed.batch_id : "";
  if (!batchId) throw new Error("image-agent-web /api/batch response did not include batch_id: " + JSON.stringify(parsed));
  return { batch_id: batchId };
}

export async function callImageBatchStatus(baseUrl: string, batchId: string, timeoutMs = 120000): Promise<Record<string, unknown>> {
  const response = await fetchWithTimeout(baseUrl.replace(/\\/+$/, "") + "/api/batch/" + encodeURIComponent(batchId) + "/status", {}, timeoutMs, "image-agent-web /api/batch/{batch_id}/status");
  return readJsonResponse(response, "image-agent-web /api/batch/{batch_id}/status");
}

export function resolveBatchDownloadUrl(baseUrl: string, batchId: string): string {
  return baseUrl.replace(/\\/+$/, "") + "/api/batch/" + encodeURIComponent(batchId) + "/download";
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(label + " timed out after " + timeoutMs + "ms.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonResponse(response: Response, label: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    const message = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "detail" in parsed ? String((parsed as { detail?: unknown }).detail) : text;
    throw new Error(label + " returned HTTP " + response.status + ": " + message);
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}
`;
}

export function adapterServiceClientJs(): string {
  return `export async function callImageGenerate(baseUrl, preset, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const form = new FormData();
    form.set("template_id", preset.template_id);
    form.set("size", preset.size);
    form.set("fields_json", JSON.stringify(preset.fields));
    form.set("message", preset.message || "");
    form.set("reference_types_json", "[]");
    const response = await fetch(baseUrl.replace(/\\/+$/, "") + "/api/generate", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    if (!response.ok) {
      const message = parsed && typeof parsed === "object" && "detail" in parsed ? String(parsed.detail) : text;
      throw new Error("image-agent-web /api/generate returned HTTP " + response.status + ": " + message);
    }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("image-agent-web /api/generate timed out after " + timeoutMs + "ms.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callImageIterate(baseUrl, request, timeoutMs = 120000) {
  const response = await fetchWithTimeout(baseUrl.replace(/\\/+$/, "") + "/api/iterate", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ session_id: request.session_id, feedback: request.feedback }),
  }, timeoutMs, "image-agent-web /api/iterate");
  return readJsonResponse(response, "image-agent-web /api/iterate");
}

export async function callImageBatchCreate(baseUrl, request, timeoutMs = 120000) {
  const form = new FormData();
  form.set("template_id", request.template_id);
  form.set("size", request.size);
  form.set("items_json", JSON.stringify(request.items));
  form.set("reference_types_json", "[]");
  const response = await fetchWithTimeout(baseUrl.replace(/\\/+$/, "") + "/api/batch", { method: "POST", body: form }, timeoutMs, "image-agent-web /api/batch");
  const parsed = await readJsonResponse(response, "image-agent-web /api/batch");
  const batchId = typeof parsed.batch_id === "string" ? parsed.batch_id : "";
  if (!batchId) throw new Error("image-agent-web /api/batch response did not include batch_id: " + JSON.stringify(parsed));
  return { batch_id: batchId };
}

export async function callImageBatchStatus(baseUrl, batchId, timeoutMs = 120000) {
  const response = await fetchWithTimeout(baseUrl.replace(/\\/+$/, "") + "/api/batch/" + encodeURIComponent(batchId) + "/status", {}, timeoutMs, "image-agent-web /api/batch/{batch_id}/status");
  return readJsonResponse(response, "image-agent-web /api/batch/{batch_id}/status");
}

export function resolveBatchDownloadUrl(baseUrl, batchId) {
  return baseUrl.replace(/\\/+$/, "") + "/api/batch/" + encodeURIComponent(batchId) + "/download";
}

async function fetchWithTimeout(url, init, timeoutMs, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(label + " timed out after " + timeoutMs + "ms.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    const message = parsed && typeof parsed === "object" && "detail" in parsed ? String(parsed.detail) : text;
    throw new Error(label + " returned HTTP " + response.status + ": " + message);
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}
`;
}

export interface RuntimeTemplateSpec {
  id: string;
  name: string;
  allowedSizes: string[];
  defaultSize: string;
  fieldKeys: string[];
  requiredFieldKeys: string[];
}

export interface RuntimeFieldSpec {
  key: string;
  name: string;
  label: string;
  required: boolean;
  requiredFor: string[];
  placeholder: string;
  defaultValue: string;
}

export interface AdapterCardTemplateData {
  defaultPreset: ReturnType<typeof buildDefaultPreset>;
  templateSpecs: RuntimeTemplateSpec[];
  fieldSpecs: RuntimeFieldSpec[];
  fieldMaps: ReturnType<typeof buildFormFieldMaps>;
}

export function buildAdapterCardTemplateData(capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): AdapterCardTemplateData {
  const defaultPreset = buildDefaultPreset(capabilities, meta);
  const templateSpecs = buildTemplateSpecs(defaultPreset, meta);
  const fieldSpecs = buildFieldSpecs(defaultPreset, meta);
  const fieldMaps = buildFormFieldMaps(fieldSpecs);
  return { defaultPreset, templateSpecs, fieldSpecs, fieldMaps };
}

interface AdapterHandlerTemplateData {
  defaultPreset: { template_id: string; size: string; fields: Record<string, string>; message: string };
  requiredFieldsByTemplate: Record<string, string[]>;
  fieldLabels: Record<string, string>;
}

function buildAdapterHandlerTemplateData(capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): AdapterHandlerTemplateData {
  const generateCapability = capabilities.capabilities.find((capability) => capability.id === "image.generate") || capabilities.capabilities[0];
  const properties = isRecord(generateCapability?.input_schema.properties) ? generateCapability.input_schema.properties : {};
  const templateProperty = isRecord(properties.template_id) ? properties.template_id : {};
  const fieldsProperty = isRecord(properties.fields) ? properties.fields : {};
  const defaultTemplate = typeof templateProperty.default === "string" ? templateProperty.default : meta?.templates?.[0]?.id || "product-image";
  const defaultSizeByTemplate = isRecord(fieldsProperty.default_size_by_template) ? fieldsProperty.default_size_by_template : {};
  const defaultSize = typeof defaultSizeByTemplate[defaultTemplate] === "string" ? defaultSizeByTemplate[defaultTemplate] : "1024x1024";
  const defaultPreset = {
    template_id: defaultTemplate,
    size: defaultSize,
    fields: {},
    message: "",
  };
  const requiredFieldsByTemplate = Object.fromEntries((meta?.templates || []).map((template) => [
    template.id,
    (template.fields || []).filter((field) => field.required).map((field) => field.key),
  ]));
  const fieldLabels = Object.fromEntries((meta?.templates || []).flatMap((template) => (
    template.fields || []
  ).map((field) => [field.key, field.label || humanizeKey(field.key)])));
  return { defaultPreset, requiredFieldsByTemplate, fieldLabels };
}

export function adapterCardsJs(service: ServiceManifest, capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): string {
  return stripAdapterCardsTypeScript(adapterCardsTs(service, capabilities, meta));
}

function stripAdapterCardsTypeScript(source: string): string {
  return source
    .replace(/: Record<string, string>(?= =)/g, "")
    .replace(/\(\): Record<string, unknown>/g, "()")
    .replace(/\(result: Record<string, unknown>\): Record<string, unknown>/g, "(result)")
    .replace(/\(status: Record<string, unknown>, downloadUrl: string\): Record<string, unknown>/g, "(status, downloadUrl)")
    .replace(/\(message: string\): Record<string, unknown>/g, "(message)")
    .replace(/: unknown\[\](?= =)/g, "")
    .replace(/\(value: unknown\): number/g, "(value)")
    .replace(/\(value: unknown\): string/g, "(value)");
}

export function adapterCardsTs(service: ServiceManifest, capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): string {
  const { defaultPreset, templateSpecs, fieldSpecs, fieldMaps } = buildAdapterCardTemplateData(capabilities, meta);
  return `export const defaultPreset = ${JSON.stringify(defaultPreset, null, 2)};

export const templateSpecs = ${JSON.stringify(templateSpecs, null, 2)};

export const fieldSpecs = ${JSON.stringify(fieldSpecs, null, 2)};

export const templateKeyToFormField: Record<string, string> = ${JSON.stringify(fieldMaps.templateKeyToFormField, null, 2)};

export const formFieldToTemplateKey: Record<string, string> = ${JSON.stringify(fieldMaps.formFieldToTemplateKey, null, 2)};

export function buildStartCard(): Record<string, unknown> {
  const defaultBatchItemsJson = JSON.stringify([{ fields: defaultPreset.fields }], null, 2);
  return {
    config: { wide_screen_mode: true },
    header: { template: "blue", title: { tag: "plain_text", content: "Image Agent MVP" } },
    elements: [
      { tag: "markdown", content: "**Target service:** " + ${JSON.stringify(service.service.name)} + "\\n\\n**Templates:** " + templateSpecs.map((template) => template.id).join(", ") + "\\n\\nFill the parameters and submit to run /api/generate." },
      {
        tag: "form",
        name: "image_generate_form",
        elements: [
          { tag: "input", name: "param_template_id", required: true, default_value: defaultPreset.template_id, width: "fill", label: { tag: "plain_text", content: "Template ID" }, placeholder: { tag: "plain_text", content: templateSpecs.map((template) => template.id).join(" / ") } },
          { tag: "input", name: "param_size", required: true, default_value: defaultPreset.size, width: "fill", label: { tag: "plain_text", content: "Size" }, placeholder: { tag: "plain_text", content: "WIDTHxHEIGHT" } },
          ...fieldSpecs.map((field) => ({ tag: "input", name: templateKeyToFormField[field.key] || field.name, required: field.required, default_value: field.defaultValue, width: "fill", label: { tag: "plain_text", content: field.label }, placeholder: { tag: "plain_text", content: field.placeholder || field.defaultValue || "Enter value" } })),
          { tag: "input", name: "param_message", required: false, default_value: defaultPreset.message || "", width: "fill", input_type: "multiline_text", rows: 2, auto_resize: true, label: { tag: "plain_text", content: "Message" }, placeholder: { tag: "plain_text", content: "Optional extra instruction" } },
          { tag: "button", text: { tag: "plain_text", content: "Generate image" }, type: "primary", action_type: "form_submit", name: "submit_image_generate", value: { action: "image.generate.submit", preset: defaultPreset } },
          { tag: "button", text: { tag: "plain_text", content: "Reset" }, type: "default", action_type: "form_reset", name: "reset_image_generate" },
        ],
      },
      { tag: "hr" },
      { tag: "markdown", content: "Use batch mode for long-running /api/batch jobs. Submit a JSON array of items, then refresh the returned progress card when needed." },
      {
        tag: "form",
        name: "image_batch_form",
        elements: [
          { tag: "input", name: "param_batch_template_id", required: true, default_value: defaultPreset.template_id, width: "fill", label: { tag: "plain_text", content: "Batch template ID" }, placeholder: { tag: "plain_text", content: templateSpecs.map((template) => template.id).join(" / ") } },
          { tag: "input", name: "param_batch_size", required: true, default_value: defaultPreset.size, width: "fill", label: { tag: "plain_text", content: "Batch size" }, placeholder: { tag: "plain_text", content: "WIDTHxHEIGHT" } },
          { tag: "input", name: "param_batch_items_json", required: true, default_value: defaultBatchItemsJson, width: "fill", input_type: "multiline_text", rows: 5, auto_resize: true, label: { tag: "plain_text", content: "Batch items JSON" }, placeholder: { tag: "plain_text", content: "[{ \\\"fields\\\": { ... } }]" } },
          { tag: "button", text: { tag: "plain_text", content: "Start batch" }, type: "primary", action_type: "form_submit", name: "submit_image_batch", value: { action: "image.batch.submit" } },
          { tag: "button", text: { tag: "plain_text", content: "Reset" }, type: "default", action_type: "form_reset", name: "reset_image_batch" },
        ],
      },
    ],
  };
}

export function buildSuccessCard(result: Record<string, unknown>): Record<string, unknown> {
  const imageUrl = typeof result.image_url === "string" ? result.image_url : "";
  const sessionId = typeof result.session_id === "string" ? result.session_id : "";
  const elements: unknown[] = [
    { tag: "markdown", content: imageUrl ? "**Image:** " + imageUrl : "Image generation completed." },
  ];
  if (sessionId) {
    elements.push({
      tag: "form",
      name: "image_iterate_form",
      elements: [
        {
          tag: "input",
          name: "param_feedback",
          required: true,
          width: "fill",
          input_type: "multiline_text",
          rows: 2,
          auto_resize: true,
          label: { tag: "plain_text", content: "Feedback" },
          placeholder: { tag: "plain_text", content: "Describe what to refine in the next image" },
        },
        {
          tag: "button",
          text: { tag: "plain_text", content: "Iterate image" },
          type: "primary",
          action_type: "form_submit",
          name: "submit_image_iterate",
          value: { action: "image.iterate.submit", session_id: sessionId },
        },
      ],
    });
  }
  return {
    config: { wide_screen_mode: true },
    header: { template: "green", title: { tag: "plain_text", content: "Image generation complete" } },
    elements,
  };
}

export function buildBatchStatusCard(status: Record<string, unknown>, downloadUrl: string): Record<string, unknown> {
  const total = numberValue(status.total);
  const done = numberValue(status.done);
  const completedCount = Array.isArray(status.completed) ? status.completed.length : 0;
  const failedCount = Array.isArray(status.failed) ? status.failed.length : 0;
  const running = status.running === true;
  const finished = !running && total > 0 && done >= total;
  const batchId = stringValue(status.batch_id);
  const elements: unknown[] = [
    {
      tag: "markdown",
      content: [
        "**Status:** " + (running ? "running" : finished ? "completed" : "not running"),
        "**Batch ID:** " + batchId,
        "**Done:** " + done + "/" + total,
        "**Completed:** " + completedCount,
        "**Failed:** " + failedCount,
        stringValue(status.template_id) ? "**Template:** " + stringValue(status.template_id) : "",
        stringValue(status.size) ? "**Size:** " + stringValue(status.size) : "",
      ].filter(Boolean).join("\\n\\n"),
    },
  ];
  if (finished && downloadUrl && completedCount > 0) {
    elements.push({ tag: "markdown", content: "[Download completed images ZIP](" + downloadUrl + ")" });
  }
  if (batchId) {
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "Refresh status" },
          type: "default",
          value: { action: "image.batch.refresh", batch_id: batchId },
        },
      ],
    });
  }
  return {
    config: { wide_screen_mode: true },
    header: {
      template: running ? "blue" : failedCount > 0 ? "red" : "green",
      title: { tag: "plain_text", content: running ? "Batch running" : failedCount > 0 ? "Batch finished with failures" : "Batch complete" },
    },
    elements,
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildFailureCard(message: string): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: { template: "red", title: { tag: "plain_text", content: "Image generation failed" } },
    elements: [{ tag: "markdown", content: "**What happened:** " + message }],
  };
}
`;
}

export function adapterHandlersTs(service: ServiceManifest, capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): string {
  const { defaultPreset, requiredFieldsByTemplate, fieldLabels } = buildAdapterHandlerTemplateData(capabilities, meta);
  return `import { auditEvent } from "./audit-events.js";
import { buildBatchStatusCard, buildFailureCard, buildSuccessCard, formFieldToTemplateKey } from "./cards.js";
import { callImageBatchCreate, callImageBatchStatus, callImageGenerate, callImageIterate, resolveBatchDownloadUrl } from "./service-client.js";
import type { AdapterActionContext, AdapterDependencies, AdapterResult, BatchRequest, GeneratePreset, IterateRequest } from "./types.js";
import { assertAllowedOperator, mergeGeneratePresetWithFormValue, validateSize } from "./validation.js";

const defaultPreset: GeneratePreset = ${JSON.stringify(defaultPreset, null, 2)};
const requiredFieldsByTemplate: Record<string, string[]> = ${JSON.stringify(requiredFieldsByTemplate, null, 2)};
const fieldLabels: Record<string, string> = ${JSON.stringify(fieldLabels, null, 2)};

export async function handleImageAgentCardAction(ctx: AdapterActionContext, deps: AdapterDependencies): Promise<AdapterResult> {
  const auditEvents = [auditEvent("adapter_card_action_received", { action: ctx.action, service: ${JSON.stringify(service.service.name)} })];
  try {
    assertAllowedOperator(ctx.operatorOpenId, deps.allowedOperatorOpenIds);
    if (ctx.action === "image.generate.submit") {
      const actionValue = ctx.value && typeof ctx.value === "object" ? ctx.value : {};
      const basePreset = isGeneratePreset((actionValue as { preset?: unknown }).preset) ? (actionValue as { preset: GeneratePreset }).preset : defaultPreset;
      const preset = mergeGeneratePresetWithFormValue(basePreset, ctx.formValue, formFieldToTemplateKey);
      validateGeneratePreset(preset);
      const result = await callImageGenerate(deps.imageAgentBaseUrl, preset, deps.timeoutMs);
      auditEvents.push(auditEvent("adapter_generation_succeeded", { imageUrl: result.image_url || "" }));
      return { ok: true, card: buildSuccessCard(result), result, auditEvents };
    }
    if (ctx.action === "image.iterate.submit") {
      const request = buildIterateRequest(ctx.value, ctx.formValue);
      const result = await callImageIterate(deps.imageAgentBaseUrl, request, deps.timeoutMs);
      auditEvents.push(auditEvent("adapter_iteration_succeeded", { session_id: result.session_id || request.session_id }));
      return { ok: true, card: buildSuccessCard(result), result, auditEvents };
    }
    if (ctx.action === "image.batch.submit") {
      const request = buildBatchRequest(ctx.value, ctx.formValue);
      const created = await callImageBatchCreate(deps.imageAgentBaseUrl, request, deps.timeoutMs);
      const status = await callImageBatchStatus(deps.imageAgentBaseUrl, created.batch_id, deps.timeoutMs);
      const downloadUrl = batchDownloadUrl(deps.imageAgentBaseUrl, status);
      auditEvents.push(auditEvent("adapter_batch_submitted", { batchId: created.batch_id, template_id: request.template_id, size: request.size, total: request.items.length, downloadUrl }));
      auditEvents.push(auditEvent("adapter_batch_status_checked", summarizeBatchStatus(status, downloadUrl)));
      return { ok: true, card: buildBatchStatusCard(status, downloadUrl), batchId: created.batch_id, batchStatus: status, downloadUrl, auditEvents };
    }
    if (ctx.action === "image.batch.refresh") {
      const batchId = stringValue(ctx.value?.batch_id || ctx.value?.batchId || ctx.formValue?.param_batch_id);
      if (!batchId) throw new Error("batch_id is required.");
      const status = await callImageBatchStatus(deps.imageAgentBaseUrl, batchId, deps.timeoutMs);
      const downloadUrl = batchDownloadUrl(deps.imageAgentBaseUrl, status);
      auditEvents.push(auditEvent("adapter_batch_status_checked", summarizeBatchStatus(status, downloadUrl)));
      return { ok: true, card: buildBatchStatusCard(status, downloadUrl), batchId, batchStatus: status, downloadUrl, auditEvents };
    }
    throw new Error("Unsupported adapter action: " + ctx.action);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    auditEvents.push(auditEvent("adapter_generation_failed", { message }));
    return { ok: false, card: buildFailureCard(message), auditEvents };
  }
}

function buildIterateRequest(value: Record<string, unknown> | undefined, formValue: Record<string, unknown> | undefined): IterateRequest {
  const sessionId = stringValue(value?.session_id || value?.sessionId || formValue?.param_session_id);
  const feedback = stringValue(formValue?.param_feedback || value?.feedback);
  if (!sessionId || !feedback) throw new Error("session_id and feedback are required.");
  return { session_id: sessionId, feedback };
}

function buildBatchRequest(value: Record<string, unknown> | undefined, formValue: Record<string, unknown> | undefined): BatchRequest {
  const templateId = stringValue(formValue?.param_batch_template_id || value?.template_id || value?.templateId || defaultPreset.template_id);
  const size = typeof formValue?.param_batch_size === "string"
    ? formValue.param_batch_size.trim()
    : stringValue(value?.size || defaultPreset.size);
  validateSize(size);
  const itemsJson = stringValue(formValue?.param_batch_items_json || value?.items_json || value?.itemsJson);
  const rawItems = itemsJson ? JSON.parse(itemsJson) : Array.isArray(value?.items) ? value.items : [];
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new Error("Batch items JSON must include at least one item.");
  return { template_id: templateId, size, items: rawItems as BatchRequest["items"] };
}

function batchDownloadUrl(baseUrl: string, status: Record<string, unknown>): string {
  const batchId = stringValue(status.batch_id);
  const completed = Array.isArray(status.completed) ? status.completed.length : 0;
  return batchId && status.running !== true && completed > 0 ? resolveBatchDownloadUrl(baseUrl, batchId) : "";
}

function validateGeneratePreset(preset: GeneratePreset): void {
  const requiredFields = requiredFieldsByTemplate[preset.template_id] || [];
  for (const key of requiredFields) {
    const value = preset.fields[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error((fieldLabels[key] || key) + " is required.");
    }
  }
}

function summarizeBatchStatus(status: Record<string, unknown>, downloadUrl: string): Record<string, unknown> {
  return {
    batchId: stringValue(status.batch_id),
    template_id: status.template_id,
    size: status.size,
    total: numberValue(status.total),
    done: numberValue(status.done),
    running: status.running === true,
    completed: Array.isArray(status.completed) ? status.completed.length : 0,
    failed: Array.isArray(status.failed) ? status.failed.length : 0,
    downloadUrl: downloadUrl || undefined,
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isGeneratePreset(value: unknown): value is GeneratePreset {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && typeof (value as { template_id?: unknown }).template_id === "string"
    && typeof (value as { size?: unknown }).size === "string"
    && (value as { fields?: unknown }).fields
    && typeof (value as { fields?: unknown }).fields === "object"
    && !Array.isArray((value as { fields?: unknown }).fields));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
`;
}

export function adapterHandlersJs(service: ServiceManifest, capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): string {
  const { defaultPreset, requiredFieldsByTemplate, fieldLabels } = buildAdapterHandlerTemplateData(capabilities, meta);
  return `import { auditEvent } from "./audit-events.js";
import { buildBatchStatusCard, buildFailureCard, buildSuccessCard, formFieldToTemplateKey } from "./cards.js";
import { callImageBatchCreate, callImageBatchStatus, callImageGenerate, callImageIterate, resolveBatchDownloadUrl } from "./service-client.js";
import { assertAllowedOperator, mergeGeneratePresetWithFormValue, validateSize } from "./validation.js";

const defaultPreset = ${JSON.stringify(defaultPreset, null, 2)};
const requiredFieldsByTemplate = ${JSON.stringify(requiredFieldsByTemplate, null, 2)};
const fieldLabels = ${JSON.stringify(fieldLabels, null, 2)};

export async function handleImageAgentCardAction(ctx, deps) {
  const action = typeof ctx?.action === "string" ? ctx.action : "";
  const auditEvents = [auditEvent("adapter_card_action_received", { action, service: ${JSON.stringify(service.service.name)} })];
  try {
    assertAllowedOperator(ctx?.operatorOpenId, deps?.allowedOperatorOpenIds);
    if (action === "image.generate.submit") {
      const actionValue = ctx?.value && typeof ctx.value === "object" ? ctx.value : {};
      const basePreset = isGeneratePreset(actionValue.preset) ? actionValue.preset : defaultPreset;
      const preset = mergeGeneratePresetWithFormValue(basePreset, ctx?.formValue, formFieldToTemplateKey);
      validateGeneratePreset(preset);
      const result = await callImageGenerate(String(deps?.imageAgentBaseUrl || ""), preset, Number(deps?.timeoutMs || 120000));
      auditEvents.push(auditEvent("adapter_generation_succeeded", { imageUrl: result.image_url || "" }));
      return { ok: true, card: buildSuccessCard(result), result, auditEvents };
    }
    if (action === "image.iterate.submit") {
      const request = buildIterateRequest(ctx?.value, ctx?.formValue);
      const result = await callImageIterate(String(deps?.imageAgentBaseUrl || ""), request, Number(deps?.timeoutMs || 120000));
      auditEvents.push(auditEvent("adapter_iteration_succeeded", { session_id: result.session_id || request.session_id }));
      return { ok: true, card: buildSuccessCard(result), result, auditEvents };
    }
    if (action === "image.batch.submit") {
      const request = buildBatchRequest(ctx?.value, ctx?.formValue);
      const created = await callImageBatchCreate(String(deps?.imageAgentBaseUrl || ""), request, Number(deps?.timeoutMs || 120000));
      const status = await callImageBatchStatus(String(deps?.imageAgentBaseUrl || ""), created.batch_id, Number(deps?.timeoutMs || 120000));
      const downloadUrl = batchDownloadUrl(String(deps?.imageAgentBaseUrl || ""), status);
      auditEvents.push(auditEvent("adapter_batch_submitted", { batchId: created.batch_id, template_id: request.template_id, size: request.size, total: request.items.length, downloadUrl }));
      auditEvents.push(auditEvent("adapter_batch_status_checked", summarizeBatchStatus(status, downloadUrl)));
      return { ok: true, card: buildBatchStatusCard(status, downloadUrl), batchId: created.batch_id, batchStatus: status, downloadUrl, auditEvents };
    }
    if (action === "image.batch.refresh") {
      const batchId = stringValue(ctx?.value?.batch_id || ctx?.value?.batchId || ctx?.formValue?.param_batch_id);
      if (!batchId) throw new Error("batch_id is required.");
      const status = await callImageBatchStatus(String(deps?.imageAgentBaseUrl || ""), batchId, Number(deps?.timeoutMs || 120000));
      const downloadUrl = batchDownloadUrl(String(deps?.imageAgentBaseUrl || ""), status);
      auditEvents.push(auditEvent("adapter_batch_status_checked", summarizeBatchStatus(status, downloadUrl)));
      return { ok: true, card: buildBatchStatusCard(status, downloadUrl), batchId, batchStatus: status, downloadUrl, auditEvents };
    }
    throw new Error("Unsupported adapter action: " + action);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    auditEvents.push(auditEvent("adapter_generation_failed", { message }));
    return { ok: false, card: buildFailureCard(message), auditEvents };
  }
}

function buildIterateRequest(value, formValue) {
  const sessionId = stringValue(value?.session_id || value?.sessionId || formValue?.param_session_id);
  const feedback = stringValue(formValue?.param_feedback || value?.feedback);
  if (!sessionId || !feedback) throw new Error("session_id and feedback are required.");
  return { session_id: sessionId, feedback };
}

function buildBatchRequest(value, formValue) {
  const templateId = stringValue(formValue?.param_batch_template_id || value?.template_id || value?.templateId || defaultPreset.template_id);
  const size = typeof formValue?.param_batch_size === "string"
    ? formValue.param_batch_size.trim()
    : stringValue(value?.size || defaultPreset.size);
  validateSize(size);
  const itemsJson = stringValue(formValue?.param_batch_items_json || value?.items_json || value?.itemsJson);
  const rawItems = itemsJson ? JSON.parse(itemsJson) : Array.isArray(value?.items) ? value.items : [];
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new Error("Batch items JSON must include at least one item.");
  return { template_id: templateId, size, items: rawItems };
}

function batchDownloadUrl(baseUrl, status) {
  const batchId = stringValue(status?.batch_id);
  const completed = Array.isArray(status?.completed) ? status.completed.length : 0;
  return batchId && status?.running !== true && completed > 0 ? resolveBatchDownloadUrl(baseUrl, batchId) : "";
}

function validateGeneratePreset(preset) {
  const requiredFields = requiredFieldsByTemplate[preset.template_id] || [];
  for (const key of requiredFields) {
    const value = preset.fields[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error((fieldLabels[key] || key) + " is required.");
    }
  }
}

function summarizeBatchStatus(status, downloadUrl) {
  return {
    batchId: stringValue(status?.batch_id),
    template_id: status?.template_id,
    size: status?.size,
    total: numberValue(status?.total),
    done: numberValue(status?.done),
    running: status?.running === true,
    completed: Array.isArray(status?.completed) ? status.completed.length : 0,
    failed: Array.isArray(status?.failed) ? status.failed.length : 0,
    downloadUrl: downloadUrl || undefined,
  };
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isGeneratePreset(value) {
  return value && typeof value === "object"
    && typeof value.template_id === "string"
    && typeof value.size === "string"
    && value.fields && typeof value.fields === "object";
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
`;
}

function buildDefaultPreset(capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): {
  template_id: string;
  size: string;
  fields: Record<string, string>;
  message: string;
} {
  const capability = capabilities.capabilities.find((item) => item.id === "image.generate") || capabilities.capabilities[0];
  const properties = isRecord(capability?.input_schema.properties) ? capability.input_schema.properties : {};
  const templateProperty = isRecord(properties.template_id) ? properties.template_id : {};
  const sizeProperty = isRecord(properties.size) ? properties.size : {};
  const firstTemplate = meta?.templates?.[0];
  const templateId = firstTemplate?.id || stringScalar(templateProperty.default) || "product-image";
  const size = firstTemplate?.default_size || firstTemplate?.allowed_sizes?.[0] || stringScalar(sizeProperty.default) || "1024x1024";
  const fields = buildDefaultFields(firstTemplate?.fields || []);

  return {
    template_id: templateId,
    size,
    fields,
    message: "Generated from Lark-deployer MVP test card.",
  };
}

function buildDefaultFields(fields: NonNullable<ImageAgentMeta["templates"]>[number]["fields"]): Record<string, string> {
  if (!fields?.length) {
    return {
      theme: "MVP test product visual",
      selling_points: "clean composition, clear subject, commerce-ready style",
      ad_copy: "MVP Test",
      style_hint: "bright, polished, modern",
    };
  }

  return Object.fromEntries(fields.map((field) => [field.key, defaultFieldValue(field.key)]));
}

function buildTemplateSpecs(
  defaultPreset: { template_id: string; size: string; fields: Record<string, string> },
  meta: ImageAgentMeta | undefined,
): RuntimeTemplateSpec[] {
  const templates = meta?.templates;
  if (!templates?.length) {
    return [
      {
        id: defaultPreset.template_id,
        name: defaultPreset.template_id,
        allowedSizes: [defaultPreset.size],
        defaultSize: defaultPreset.size,
        fieldKeys: Object.keys(defaultPreset.fields),
        requiredFieldKeys: Object.keys(defaultPreset.fields),
      },
    ];
  }

  return templates.map((template) => ({
    id: template.id,
    name: template.name || template.id,
    allowedSizes: template.allowed_sizes || [],
    defaultSize: template.default_size || template.allowed_sizes?.[0] || defaultPreset.size,
    fieldKeys: (template.fields || []).map((field) => field.key),
    requiredFieldKeys: (template.fields || []).filter((field) => field.required).map((field) => field.key),
  }));
}

function buildFieldSpecs(
  defaultPreset: { fields: Record<string, string> },
  meta: ImageAgentMeta | undefined,
): RuntimeFieldSpec[] {
  const templates = meta?.templates;
  if (!templates?.length) {
    return Object.entries(defaultPreset.fields).map(([key, value]) => ({
      key,
      name: formFieldName(key),
      label: humanizeKey(key),
      required: Boolean(value),
      requiredFor: [],
      placeholder: value,
      defaultValue: value,
    }));
  }

  const byKey = new Map<string, RuntimeFieldSpec>();
  for (const template of templates) {
    for (const field of template.fields || []) {
      const existing = byKey.get(field.key);
      const requiredFor = field.required ? [template.id] : [];
      if (existing) {
        existing.requiredFor.push(...requiredFor);
        if (!existing.placeholder && field.placeholder) {
          existing.placeholder = field.placeholder;
        }
        continue;
      }
      byKey.set(field.key, {
        key: field.key,
        name: formFieldName(field.key),
        label: field.label || humanizeKey(field.key),
        required: false,
        requiredFor,
        placeholder: field.placeholder || defaultPreset.fields[field.key] || humanizeKey(field.key),
        defaultValue: defaultPreset.fields[field.key] || "",
      });
    }
  }
  return Array.from(byKey.values());
}

function defaultFieldValue(key: string): string {
  const defaults: Record<string, string> = {
    theme: "MVP test product visual",
    selling_points: "clean composition, clear subject, commerce-ready style",
    ad_copy: "MVP Test",
    style_hint: "bright, polished, modern",
    product_name: "MVP Product",
    activity_mood: "launch campaign",
  };
  return defaults[key] || `MVP ${humanizeKey(key)}`;
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "value";
}

function stringScalar(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
