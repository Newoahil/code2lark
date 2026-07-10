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



export function pythonHostCardsPy(): string {
  return `"""Card builders for the generated Feishu Python host."""

from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
from typing import Any, Dict


SPEC_DIR = Path(__file__).with_name("spec")


def load_start_card() -> Dict[str, Any]:
    with (SPEC_DIR / "start_card.json").open("r", encoding="utf-8") as handle:
        return json.load(handle)


def build_success_card(result: Dict[str, Any]) -> Dict[str, Any]:
    image_url = _string_value(result.get("image_url"))
    session_id = _string_value(result.get("session_id"))
    trace_id = _string_value(result.get("trace_id"))
    elements = [
        {"tag": "markdown", "content": "**Image:** " + image_url if image_url else "Image generation completed."},
    ]
    if trace_id:
        elements.append({"tag": "markdown", "content": "**Trace ID:** " + trace_id})
    if session_id:
        elements.append({
            "tag": "form",
            "name": "image_iterate_form",
            "elements": [
                {
                    "tag": "input",
                    "name": "param_feedback",
                    "required": True,
                    "width": "fill",
                    "input_type": "multiline_text",
                    "rows": 2,
                    "auto_resize": True,
                    "label": {"tag": "plain_text", "content": "Feedback"},
                    "placeholder": {"tag": "plain_text", "content": "Describe what to refine in the next image"},
                },
                {
                    "tag": "button",
                    "text": {"tag": "plain_text", "content": "Iterate image"},
                    "type": "primary",
                    "form_action_type": "submit",
                    "name": "submit_image_iterate",
                    "behaviors": [{"type": "callback", "value": {"action": "image.iterate.submit", "session_id": session_id}}],
                },
            ],
        })
    return _card("green", "Image generation complete", elements)


def build_failure_card(message: str) -> Dict[str, Any]:
    return _card("red", "Image generation failed", [{"tag": "markdown", "content": "**What happened:** " + str(message)}])


def build_running_card(action: str, trace_id: str = "") -> Dict[str, Any]:
    lines = ["The request was accepted and is running.", "**Action:** " + _string_value(action)]
    if trace_id:
        lines.append("**Trace ID:** " + trace_id)
    return _card("blue", "Image generation running", [{"tag": "markdown", "content": "\\n\\n".join(lines)}])


def build_batch_status_card(status: Dict[str, Any], download_url: str = "") -> Dict[str, Any]:
    total = _number_value(status.get("total"))
    done = _number_value(status.get("done"))
    completed_count = len(status.get("completed")) if isinstance(status.get("completed"), list) else 0
    failed_count = len(status.get("failed")) if isinstance(status.get("failed"), list) else 0
    running = status.get("running") is True
    finished = not running and total > 0 and done >= total
    batch_id = _string_value(status.get("batch_id"))
    lines = [
        "**Status:** " + ("running" if running else "completed" if finished else "not running"),
        "**Batch ID:** " + batch_id,
        "**Done:** " + str(done) + "/" + str(total),
        "**Completed:** " + str(completed_count),
        "**Failed:** " + str(failed_count),
    ]
    if _string_value(status.get("template_id")):
        lines.append("**Template:** " + _string_value(status.get("template_id")))
    if _string_value(status.get("size")):
        lines.append("**Size:** " + _string_value(status.get("size")))
    elements = [{"tag": "markdown", "content": "\\n\\n".join(lines)}]
    if finished and download_url and completed_count > 0:
        elements.append({"tag": "markdown", "content": "[Download completed images ZIP](" + download_url + ")"})
    if batch_id:
        elements.append({
            "tag": "button",
            "text": {"tag": "plain_text", "content": "Refresh status"},
            "type": "default",
            "behaviors": [{"type": "callback", "value": {"action": "image.batch.refresh", "batch_id": batch_id}}],
        })
    return _card(
        "blue" if running else "red" if failed_count > 0 else "green",
        "Batch running" if running else "Batch finished with failures" if failed_count > 0 else "Batch complete",
        elements,
    )


def clone_card(card: Dict[str, Any]) -> Dict[str, Any]:
    return deepcopy(card)


def _card(template: str, title: str, elements: list[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "schema": "2.0",
        "config": {"update_multi": True, "wide_screen_mode": True},
        "header": {"template": template, "title": {"tag": "plain_text", "content": title}},
        "body": {"elements": elements},
    }


def _string_value(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _number_value(value: Any) -> int:
    return int(value) if isinstance(value, (int, float)) and value == value else 0
`;
}

export function pythonHostServiceClientPy(): string {
  return `"""HTTP client for image-agent-web target calls."""

from __future__ import annotations

import json
from typing import Any, Dict


class TargetServiceError(RuntimeError):
    def __init__(self, operation: str, message: str, status_code: int | None = None, detail: Any = None):
        super().__init__(message)
        self.operation = operation
        self.status_code = status_code
        self.detail = detail

    def to_audit_detail(self) -> Dict[str, Any]:
        return {"operation": self.operation, "status_code": self.status_code, "detail": self.detail}


def call_generate(base_url: str, preset: Dict[str, Any], timeout_ms: int = 120000) -> Dict[str, Any]:
    data = {
        "template_id": _string_value(preset.get("template_id")),
        "size": _string_value(preset.get("size")),
        "fields_json": json.dumps(preset.get("fields") if isinstance(preset.get("fields"), dict) else {}, ensure_ascii=False),
        "message": _string_value(preset.get("message")),
        "reference_types_json": "[]",
    }
    response = _post(_join_url(base_url, "/api/generate"), data=data, timeout_ms=timeout_ms, operation="generate")
    return _read_json_response(response, "generate")


def call_iterate(base_url: str, request: Dict[str, Any], timeout_ms: int = 120000) -> Dict[str, Any]:
    payload = {"session_id": _string_value(request.get("session_id")), "feedback": _string_value(request.get("feedback"))}
    response = _post(_join_url(base_url, "/api/iterate"), json_body=payload, timeout_ms=timeout_ms, operation="iterate")
    return _read_json_response(response, "iterate")


def call_batch_create(base_url: str, request: Dict[str, Any], timeout_ms: int = 120000) -> Dict[str, Any]:
    data = {
        "template_id": _string_value(request.get("template_id")),
        "size": _string_value(request.get("size")),
        "items_json": json.dumps(request.get("items") if isinstance(request.get("items"), list) else [], ensure_ascii=False),
        "reference_types_json": "[]",
    }
    response = _post(_join_url(base_url, "/api/batch"), data=data, timeout_ms=timeout_ms, operation="batch")
    parsed = _read_json_response(response, "batch")
    if not _string_value(parsed.get("batch_id")):
        raise TargetServiceError("batch", "image-agent-web /api/batch response did not include batch_id", detail=parsed)
    return parsed


def call_batch_status(base_url: str, batch_id: str, timeout_ms: int = 120000) -> Dict[str, Any]:
    response = _get(_join_url(base_url, "/api/batch/" + _quote(batch_id) + "/status"), timeout_ms=timeout_ms, operation="batch_status")
    return _read_json_response(response, "batch_status")


def resolve_download_url(base_url: str, batch_id: str) -> str:
    return _join_url(base_url, "/api/batch/" + _quote(batch_id) + "/download")


def resolve_image_url(base_url: str, image_url: str) -> str:
    value = _string_value(image_url)
    if not value:
        return ""
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if value.startswith("/"):
        return _join_url(base_url, value)
    return _join_url(base_url, "/" + value)


def _post(url: str, *, data: Dict[str, str] | None = None, json_body: Dict[str, Any] | None = None, timeout_ms: int, operation: str):
    requests = _requests()
    try:
        return requests.post(url, data=data, json=json_body, timeout=_timeout_seconds(timeout_ms))
    except requests.exceptions.Timeout as exc:
        raise TargetServiceError(operation, operation + " timed out after " + str(timeout_ms) + "ms") from exc
    except requests.exceptions.RequestException as exc:
        raise TargetServiceError(operation, operation + " request failed: " + str(exc)) from exc


def _get(url: str, *, timeout_ms: int, operation: str):
    requests = _requests()
    try:
        return requests.get(url, timeout=_timeout_seconds(timeout_ms))
    except requests.exceptions.Timeout as exc:
        raise TargetServiceError(operation, operation + " timed out after " + str(timeout_ms) + "ms") from exc
    except requests.exceptions.RequestException as exc:
        raise TargetServiceError(operation, operation + " request failed: " + str(exc)) from exc


def _read_json_response(response: Any, operation: str) -> Dict[str, Any]:
    text = getattr(response, "text", "") or ""
    try:
        parsed = response.json() if text else {}
    except ValueError:
        parsed = {"raw": text}
    status_code = int(getattr(response, "status_code", 0) or 0)
    if status_code < 200 or status_code >= 300:
        message = parsed.get("detail") if isinstance(parsed, dict) else text
        raise TargetServiceError(operation, "image-agent-web " + operation + " returned HTTP " + str(status_code) + ": " + str(message), status_code=status_code, detail=parsed)
    return parsed if isinstance(parsed, dict) else {}


def _requests():
    import requests
    return requests


def _timeout_seconds(timeout_ms: int) -> float:
    return max(int(timeout_ms), 1) / 1000.0


def _join_url(base_url: str, path: str) -> str:
    return str(base_url).rstrip("/") + path


def _quote(value: str) -> str:
    from urllib.parse import quote
    return quote(str(value), safe="")


def _string_value(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""
`;
}

export function pythonHostHandlersPy(): string {
  return `"""Card action handler for the generated Feishu Python host."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping

import cards
import service_client
import validation


SPEC_DIR = Path(__file__).with_name("spec")


@dataclass(frozen=True)
class HandlerDeps:
    image_agent_base_url: str
    timeout_ms: int = 120000
    allowed_operator_open_ids: tuple[str, ...] = ()
    call_generate: Callable[..., Dict[str, Any]] = service_client.call_generate
    call_iterate: Callable[..., Dict[str, Any]] = service_client.call_iterate
    call_batch_create: Callable[..., Dict[str, Any]] = service_client.call_batch_create
    call_batch_status: Callable[..., Dict[str, Any]] = service_client.call_batch_status
    resolve_download_url: Callable[..., str] = service_client.resolve_download_url
    resolve_image_url: Callable[..., str] = service_client.resolve_image_url


def handle_card_action(ctx: Any, deps: HandlerDeps | Mapping[str, Any]) -> Dict[str, Any]:
    normalized = normalize_card_action(ctx)
    deps_obj = _deps_from_mapping(deps)
    audit_events = [_audit("python_host_card_action_received", {"action": normalized["action"]})]
    try:
        validation.assert_allowed_operator(normalized["operatorOpenId"], deps_obj.allowed_operator_open_ids)
        endpoints = _load_json("endpoints.json")
        actions = endpoints.get("actions") if isinstance(endpoints.get("actions"), dict) else {}
        action = normalized["action"]
        if action not in actions:
            raise ValueError("Unsupported card action: " + action)
        if action == "image.generate.submit":
            preset = _build_generate_preset(normalized)
            result = deps_obj.call_generate(deps_obj.image_agent_base_url, preset, deps_obj.timeout_ms)
            image_url = deps_obj.resolve_image_url(deps_obj.image_agent_base_url, _string_value(result.get("image_url")))
            if image_url:
                result["image_url"] = image_url
            audit_events.append(_audit("python_host_generation_succeeded", {"imageUrl": result.get("image_url", "")}))
            return _result(True, cards.build_success_card(result), audit_events, result=result)
        if action == "image.iterate.submit":
            request = _build_iterate_request(normalized)
            result = deps_obj.call_iterate(deps_obj.image_agent_base_url, request, deps_obj.timeout_ms)
            image_url = deps_obj.resolve_image_url(deps_obj.image_agent_base_url, _string_value(result.get("image_url")))
            if image_url:
                result["image_url"] = image_url
            audit_events.append(_audit("python_host_iteration_succeeded", {"session_id": result.get("session_id") or request["session_id"]}))
            return _result(True, cards.build_success_card(result), audit_events, result=result)
        if action == "image.batch.submit":
            request = _build_batch_request(normalized)
            created = deps_obj.call_batch_create(deps_obj.image_agent_base_url, request, deps_obj.timeout_ms)
            batch_id = _string_value(created.get("batch_id"))
            status = deps_obj.call_batch_status(deps_obj.image_agent_base_url, batch_id, deps_obj.timeout_ms)
            download_url = _batch_download_url(deps_obj, status)
            audit_events.append(_audit("python_host_batch_submitted", {"batchId": batch_id, "total": len(request["items"])}))
            return _result(True, cards.build_batch_status_card(status, download_url), audit_events, batchId=batch_id, batchStatus=status, downloadUrl=download_url)
        if action == "image.batch.refresh":
            batch_id = _string_value(normalized["value"].get("batch_id") or normalized["value"].get("batchId") or normalized["formValue"].get("param_batch_id"))
            if not batch_id:
                raise ValueError("batch_id is required.")
            status = deps_obj.call_batch_status(deps_obj.image_agent_base_url, batch_id, deps_obj.timeout_ms)
            download_url = _batch_download_url(deps_obj, status)
            audit_events.append(_audit("python_host_batch_status_checked", {"batchId": batch_id, "downloadUrl": download_url or None}))
            return _result(True, cards.build_batch_status_card(status, download_url), audit_events, batchId=batch_id, batchStatus=status, downloadUrl=download_url)
        raise ValueError("Unsupported card action: " + action)
    except Exception as exc:
        message = str(exc)
        audit_events.append(_audit("python_host_card_action_failed", {"message": message}))
        return _result(False, cards.build_failure_card(message), audit_events)


def normalize_card_action(ctx: Any) -> Dict[str, Any]:
    if isinstance(ctx, Mapping):
        value = _object_value(ctx.get("value"))
        form_value = _object_value(ctx.get("formValue") or ctx.get("form_value"))
        action = _string_value(ctx.get("action") or value.get("action"))
        return {
            "action": action,
            "value": value,
            "formValue": form_value,
            "operatorOpenId": _string_value(ctx.get("operatorOpenId") or ctx.get("operator_open_id")),
            "openMessageId": _string_value(ctx.get("openMessageId") or ctx.get("open_message_id")),
            "openChatId": _string_value(ctx.get("openChatId") or ctx.get("open_chat_id")),
        }
    event = getattr(ctx, "event", None)
    action_obj = getattr(event, "action", None)
    raw_value = getattr(action_obj, "value", None)
    value = _object_value(json.loads(raw_value) if isinstance(raw_value, str) and raw_value.strip().startswith("{") else raw_value)
    form_value = _object_value(getattr(action_obj, "form_value", None))
    operator = getattr(event, "operator", None)
    context = getattr(event, "context", None)
    return {
        "action": _string_value(value.get("action")),
        "value": value,
        "formValue": form_value,
        "operatorOpenId": _string_value(getattr(operator, "open_id", "")),
        "openMessageId": _string_value(getattr(context, "open_message_id", "")),
        "openChatId": _string_value(getattr(context, "open_chat_id", "")),
    }


def _build_generate_preset(normalized: Dict[str, Any]) -> Dict[str, Any]:
    base = normalized["value"].get("preset") if isinstance(normalized["value"].get("preset"), dict) else _load_json("preset.json")
    form_value = normalized["formValue"]
    fields = dict(base.get("fields") if isinstance(base.get("fields"), dict) else {})
    field_map = _load_json("field_map.json").get("formFieldToTemplateKey", {})
    for key, value in form_value.items():
        if key.startswith("field_") and isinstance(value, str):
            fields[str(field_map.get(key) or key.removeprefix("field_"))] = value.strip()
    preset = {
        "template_id": _string_value(form_value.get("param_template_id")) or _string_value(base.get("template_id")),
        "size": _string_value(form_value.get("param_size")) or _string_value(base.get("size")),
        "fields": fields,
        "message": _string_value(form_value.get("param_message")) or _string_value(base.get("message")),
    }
    validation.validate_size(preset["size"])
    validation.validate_required_fields(preset["template_id"], preset["fields"], _load_json("template_specs.json"), _load_json("field_specs.json"))
    return preset


def _build_iterate_request(normalized: Dict[str, Any]) -> Dict[str, Any]:
    session_id = _string_value(normalized["value"].get("session_id") or normalized["value"].get("sessionId") or normalized["formValue"].get("param_session_id"))
    feedback = _string_value(normalized["formValue"].get("param_feedback") or normalized["value"].get("feedback"))
    if not session_id or not feedback:
        raise ValueError("session_id and feedback are required.")
    return {"session_id": session_id, "feedback": feedback}


def _build_batch_request(normalized: Dict[str, Any]) -> Dict[str, Any]:
    preset = _load_json("preset.json")
    form_value = normalized["formValue"]
    value = normalized["value"]
    template_id = _string_value(form_value.get("param_batch_template_id") or value.get("template_id") or value.get("templateId") or preset.get("template_id"))
    size = _string_value(form_value.get("param_batch_size") or value.get("size") or preset.get("size"))
    validation.validate_size(size)
    items_json = _string_value(form_value.get("param_batch_items_json") or value.get("items_json") or value.get("itemsJson"))
    raw_items = json.loads(items_json) if items_json else value.get("items")
    items = validation.validate_batch_items(raw_items)
    return {"template_id": template_id, "size": size, "items": items}


def _batch_download_url(deps: HandlerDeps, status: Dict[str, Any]) -> str:
    batch_id = _string_value(status.get("batch_id"))
    completed = status.get("completed")
    if batch_id and status.get("running") is not True and isinstance(completed, list) and completed:
        return deps.resolve_download_url(deps.image_agent_base_url, batch_id)
    return ""


def _deps_from_mapping(deps: HandlerDeps | Mapping[str, Any]) -> HandlerDeps:
    if isinstance(deps, HandlerDeps):
        return deps
    return HandlerDeps(
        image_agent_base_url=_string_value(deps.get("imageAgentBaseUrl") or deps.get("image_agent_base_url")),
        timeout_ms=int(deps.get("timeoutMs") or deps.get("timeout_ms") or 120000),
        allowed_operator_open_ids=tuple(deps.get("allowedOperatorOpenIds") or deps.get("allowed_operator_open_ids") or ()),
        call_generate=deps.get("call_generate", service_client.call_generate),
        call_iterate=deps.get("call_iterate", service_client.call_iterate),
        call_batch_create=deps.get("call_batch_create", service_client.call_batch_create),
        call_batch_status=deps.get("call_batch_status", service_client.call_batch_status),
        resolve_download_url=deps.get("resolve_download_url", service_client.resolve_download_url),
        resolve_image_url=deps.get("resolve_image_url", service_client.resolve_image_url),
    )


def _result(ok: bool, card: Dict[str, Any], audit_events: List[Dict[str, Any]], **extra: Any) -> Dict[str, Any]:
    result = {"ok": ok, "card": card, "auditEvents": audit_events, "response": {"card": card}}
    result.update(extra)
    return result


def _audit(event: str, detail: Dict[str, Any]) -> Dict[str, Any]:
    return {"event": event, "detail": detail}


def _load_json(name: str) -> Any:
    with (SPEC_DIR / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _object_value(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _string_value(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""
`;
}

export function pythonHostLocalContractTestPy(): string {
  return `"""Local contract test for the generated Feishu Python host.

This test starts a stdlib localhost mock of image-agent-web and drives
handlers.handle_card_action directly. It does not import lark-oapi, does not
use real Feishu credentials, and does not contact any non-local network.
"""

from __future__ import annotations

from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import time
from typing import Any, Dict, List
from urllib.parse import parse_qs, urlparse

import app
import cards
import handlers


REQUESTS: List[Dict[str, Any]] = []


class MockImageAgentHandler(BaseHTTPRequestHandler):
    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def do_POST(self) -> None:
        length = int(self.headers.get("content-length") or "0")
        raw = self.rfile.read(length).decode("utf-8")
        content_type = self.headers.get("content-type", "")
        parsed_form = {key: values[-1] for key, values in parse_qs(raw, keep_blank_values=True).items()}
        parsed_json: Dict[str, Any] = {}
        if "application/json" in content_type:
            parsed_json = json.loads(raw or "{}")
        REQUESTS.append({
            "method": "POST",
            "path": self.path,
            "content_type": content_type,
            "raw": raw,
            "form": parsed_form,
            "json": parsed_json,
        })
        if self.path == "/api/generate":
            if parsed_form.get("message") == "target-500":
                self._json(500, {"detail": "mock target failure"})
                return
            if parsed_form.get("message") == "target-timeout":
                time.sleep(0.25)
            self._json(200, {"image_url": "/outputs/generated.png", "session_id": "session-contract", "trace_id": "trace-generate"})
            return
        if self.path == "/api/iterate":
            self._json(200, {"image_url": "/outputs/iterated.png", "session_id": parsed_json.get("session_id", ""), "trace_id": "trace-iterate"})
            return
        if self.path == "/api/batch":
            self._json(200, {"batch_id": "batch-contract"})
            return
        self._json(404, {"detail": "not found"})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        REQUESTS.append({"method": "GET", "path": parsed.path, "content_type": self.headers.get("content-type", ""), "raw": "", "form": {}, "json": {}})
        if parsed.path == "/api/batch/batch-contract/status":
            self._json(200, {
                "batch_id": "batch-contract",
                "template_id": "launch-banner",
                "size": "1200x628",
                "total": 1,
                "done": 1,
                "running": False,
                "completed": [{"image_url": "https://example.invalid/batch.png"}],
                "failed": [],
            })
            return
        self._json(404, {"detail": "not found"})

    def _json(self, status: int, body: Dict[str, Any]) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, OSError):
            return


def main() -> None:
    with mock_server() as base_url:
        run_contract(base_url)
    print("feishu-host contract: PASS")


def run_contract(base_url: str) -> None:
    REQUESTS.clear()
    assert_start_message_request()
    preset = load_spec("preset.json")
    template_id = preset["template_id"]
    size = preset["size"]
    generate_result = handlers.handle_card_action(generate_ctx(), deps(base_url))
    assert generate_result["ok"] is True, generate_result
    assert "http://127.0.0.1:" in json.dumps(generate_result["card"]), generate_result
    assert "/outputs/generated.png" in json.dumps(generate_result["card"]), generate_result
    generate_request = only_request("POST", "/api/generate")
    assert_form_request(generate_request, {
        "template_id": template_id,
        "size": size,
        "message": "contract generate",
        "reference_types_json": "[]",
    })
    generate_fields = json.loads(generate_request["form"]["fields_json"])
    primary_key = primary_template_key()
    secondary_key = secondary_template_key()
    assert generate_fields[primary_key] == "Contract primary", generate_fields
    if secondary_key:
        assert generate_fields[secondary_key] == "Contract secondary", generate_fields

    before = len(REQUESTS)
    iterate_result = handlers.handle_card_action({
        "action": "image.iterate.submit",
        "value": {"action": "image.iterate.submit", "session_id": "session-contract"},
        "formValue": {"param_feedback": "make it brighter"},
        "operatorOpenId": "operator-ok",
    }, deps(base_url))
    assert iterate_result["ok"] is True, iterate_result
    iterate_request = REQUESTS[before]
    assert iterate_request["method"] == "POST" and iterate_request["path"] == "/api/iterate", iterate_request
    assert "application/json" in iterate_request["content_type"], iterate_request
    assert iterate_request["json"] == {"session_id": "session-contract", "feedback": "make it brighter"}, iterate_request

    before = len(REQUESTS)
    batch_result = handlers.handle_card_action({
        "action": "image.batch.submit",
        "value": {"action": "image.batch.submit"},
        "formValue": {
            "param_batch_template_id": template_id,
            "param_batch_size": size,
            "param_batch_items_json": json.dumps([{"fields": {primary_key: "Batch primary"}}]),
        },
        "operatorOpenId": "operator-ok",
    }, deps(base_url))
    assert batch_result["ok"] is True, batch_result
    assert batch_result["downloadUrl"].endswith("/api/batch/batch-contract/download"), batch_result
    batch_create = REQUESTS[before]
    batch_status = REQUESTS[before + 1]
    assert batch_create["method"] == "POST" and batch_create["path"] == "/api/batch", batch_create
    assert_form_request(batch_create, {"template_id": template_id, "size": size, "reference_types_json": "[]"})
    assert json.loads(batch_create["form"]["items_json"])[0]["fields"][primary_key] == "Batch primary", batch_create
    assert batch_status["method"] == "GET" and batch_status["path"] == "/api/batch/batch-contract/status", batch_status

    before = len(REQUESTS)
    refresh_result = handlers.handle_card_action({
        "action": "image.batch.refresh",
        "value": {"action": "image.batch.refresh", "batch_id": "batch-contract"},
        "formValue": {},
        "operatorOpenId": "operator-ok",
    }, deps(base_url))
    assert refresh_result["ok"] is True, refresh_result
    assert refresh_result["downloadUrl"].endswith("/api/batch/batch-contract/download"), refresh_result
    assert REQUESTS[before]["method"] == "GET" and REQUESTS[before]["path"] == "/api/batch/batch-contract/status", REQUESTS[before]
    assert "Download completed images ZIP" in json.dumps(refresh_result["card"]), refresh_result

    assert_no_target_call(base_url, invalid_size_ctx(), "Size must use")
    prove_missing_required_no_call(base_url)
    assert_no_target_call(base_url, generate_ctx(), "not authorized", allowed=("someone-else",))
    assert_no_target_call(base_url, {"action": "unknown.action", "value": {"action": "unknown.action"}, "formValue": {}, "operatorOpenId": "operator-ok"}, "Unsupported card action")

    before = len(REQUESTS)
    target_500 = handlers.handle_card_action(generate_ctx(message="target-500"), deps(base_url))
    assert target_500["ok"] is False, target_500
    assert len(REQUESTS) == before + 1, REQUESTS[before:]
    assert "HTTP 500" in json.dumps(target_500), target_500

    before = len(REQUESTS)
    timeout_result = handlers.handle_card_action(generate_ctx(message="target-timeout"), deps(base_url, timeout_ms=50))
    assert timeout_result["ok"] is False, timeout_result
    assert len(REQUESTS) == before + 1, REQUESTS[before:]
    assert "timed out" in json.dumps(timeout_result), timeout_result

    prove_special_field_mapping(base_url)


def prove_special_field_mapping(base_url: str) -> None:
    field_map_path = Path(__file__).with_name("spec") / "field_map.json"
    original = json.loads(field_map_path.read_text(encoding="utf-8"))
    patched = json.loads(json.dumps(original))
    patched.setdefault("formFieldToTemplateKey", {})["field_hero_title"] = "hero-title"
    patched.setdefault("templateKeyToFormField", {})["hero-title"] = "field_hero_title"
    field_map_path.write_text(json.dumps(patched, indent=2, ensure_ascii=False) + "\\n", encoding="utf-8")
    try:
        before = len(REQUESTS)
        result = handlers.handle_card_action(generate_ctx(extra_form={"field_hero_title": "Mapped Hero"}), deps(base_url))
        assert result["ok"] is True, result
        request = REQUESTS[before]
        fields = json.loads(request["form"]["fields_json"])
        assert fields["hero-title"] == "Mapped Hero", fields
    finally:
        field_map_path.write_text(json.dumps(original, indent=2, ensure_ascii=False) + "\\n", encoding="utf-8")


def prove_missing_required_no_call(base_url: str) -> None:
    template_specs_path = Path(__file__).with_name("spec") / "template_specs.json"
    original = json.loads(template_specs_path.read_text(encoding="utf-8"))
    patched = json.loads(json.dumps(original))
    template_id = load_spec("preset.json")["template_id"]
    required_key = primary_template_key()
    for template in patched:
        if template.get("id") == template_id:
            keys = list(template.get("requiredFieldKeys") or [])
            if required_key not in keys:
                keys.append(required_key)
            template["requiredFieldKeys"] = keys
            break
    template_specs_path.write_text(json.dumps(patched, indent=2, ensure_ascii=False) + "\\n", encoding="utf-8")
    try:
        assert_no_target_call(base_url, missing_required_ctx(required_key), "is required")
    finally:
        template_specs_path.write_text(json.dumps(original, indent=2, ensure_ascii=False) + "\\n", encoding="utf-8")


def generate_ctx(message: str = "contract generate", extra_form: Dict[str, Any] | None = None) -> Dict[str, Any]:
    preset = load_spec("preset.json")
    template_id = preset["template_id"]
    size = preset["size"]
    primary_key = primary_template_key()
    secondary_key = secondary_template_key()
    field_map = load_spec("field_map.json")["templateKeyToFormField"]
    form = {
        "param_template_id": template_id,
        "param_size": size,
        field_map[primary_key]: "Contract primary",
        "param_message": message,
    }
    if secondary_key:
        form[field_map[secondary_key]] = "Contract secondary"
    if extra_form:
        form.update(extra_form)
    return {"action": "image.generate.submit", "value": {"action": "image.generate.submit"}, "formValue": form, "operatorOpenId": "operator-ok"}


def invalid_size_ctx() -> Dict[str, Any]:
    ctx = generate_ctx()
    ctx["formValue"] = dict(ctx["formValue"])
    ctx["formValue"]["param_size"] = "0xbad"
    return ctx


def missing_required_ctx(required_key: str) -> Dict[str, Any]:
    ctx = generate_ctx()
    ctx["formValue"] = dict(ctx["formValue"])
    ctx["formValue"][load_spec("field_map.json")["templateKeyToFormField"][required_key]] = ""
    return ctx


def primary_template_key() -> str:
    field_map = load_spec("field_map.json")["templateKeyToFormField"]
    return next(iter(field_map.keys()))


def secondary_template_key() -> str:
    keys = list(load_spec("field_map.json")["templateKeyToFormField"].keys())
    return keys[1] if len(keys) > 1 else ""


def load_spec(name: str) -> Any:
    return json.loads((Path(__file__).with_name("spec") / name).read_text(encoding="utf-8"))


def assert_no_target_call(base_url: str, ctx: Dict[str, Any], expected_message: str, allowed: tuple[str, ...] = ()) -> None:
    before = len(REQUESTS)
    result = handlers.handle_card_action(ctx, deps(base_url, allowed=allowed))
    assert result["ok"] is False, result
    assert expected_message in json.dumps(result, ensure_ascii=False), result
    assert len(REQUESTS) == before, REQUESTS[before:]


def deps(base_url: str, timeout_ms: int = 120000, allowed: tuple[str, ...] = ()) -> Dict[str, Any]:
    return {"image_agent_base_url": base_url, "timeout_ms": timeout_ms, "allowed_operator_open_ids": allowed}


def assert_start_message_request() -> None:
    with temporary_env({
        "FEISHU_APP_ID": "dummy_app_id",
        "FEISHU_APP_SECRET": "dummy_app_secret",
        "FEISHU_CONNECTION_MODE": "websocket",
        "IMAGE_AGENT_BASE_URL": "http://127.0.0.1:8000",
        "TEST_CHAT_ID": "oc_dummy_chat",
    }):
        request = app.build_start_message_request()
    assert request["receive_id_type"] == "chat_id", request
    assert request["receive_id"] == "oc_dummy_chat", request
    assert request["msg_type"] == "interactive", request
    assert json.loads(request["content"]) == cards.load_start_card(), request
    assert "feishu_app_id" not in request, request
    assert "feishu_app_secret" not in request, request

    with temporary_env({
        "FEISHU_APP_ID": "dummy_app_id",
        "FEISHU_APP_SECRET": "dummy_app_secret",
        "FEISHU_CONNECTION_MODE": "websocket",
        "IMAGE_AGENT_BASE_URL": "http://127.0.0.1:8000",
        "TEST_CHAT_ID": "",
    }):
        try:
            app.build_start_message_request()
        except RuntimeError as exc:
            assert "TEST_CHAT_ID" in str(exc), "missing TEST_CHAT_ID should be clear: " + str(exc)
        else:
            raise AssertionError("missing TEST_CHAT_ID should fail")


def only_request(method: str, path: str) -> Dict[str, Any]:
    matches = [item for item in REQUESTS if item["method"] == method and item["path"] == path]
    assert len(matches) == 1, matches
    return matches[0]


def assert_form_request(request: Dict[str, Any], expected: Dict[str, str]) -> None:
    assert "application/x-www-form-urlencoded" in request["content_type"], request
    for key, value in expected.items():
        assert request["form"].get(key) == value, {"expected": expected, "request": request}


@contextmanager
def temporary_env(values: Dict[str, str]):
    previous = {key: os.environ.get(key) for key in values}
    try:
        for key, value in values.items():
            os.environ[key] = value
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


@contextmanager
def mock_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), MockImageAgentHandler)
    host, port = server.server_address
    import threading
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield "http://" + host + ":" + str(port)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    main()
`;
}


export function buildPythonHostEndpointsSpec(): Record<string, unknown> {
  return {
    schema_version: "0.1",
    target: "image-agent-web",
    actions: {
      [IMAGE_AGENT_WEB_PROFILE.actions.generate]: {
        operation: "generate",
        method: IMAGE_AGENT_WEB_PROFILE.endpoints.generate.method,
        path: IMAGE_AGENT_WEB_PROFILE.endpoints.generate.path,
        content_type: "multipart/form-data",
        body: "form",
        fields: ["template_id", "size", "fields_json", "message", "reference_types_json"],
      },
      [IMAGE_AGENT_WEB_PROFILE.actions.iterate]: {
        operation: "iterate",
        method: IMAGE_AGENT_WEB_PROFILE.endpoints.iterate.method,
        path: IMAGE_AGENT_WEB_PROFILE.endpoints.iterate.path,
        content_type: "application/json",
        body: "json",
        fields: ["session_id", "feedback"],
      },
      [IMAGE_AGENT_WEB_PROFILE.actions.batchSubmit]: {
        operation: "batch",
        method: IMAGE_AGENT_WEB_PROFILE.endpoints.batchSubmit.method,
        path: IMAGE_AGENT_WEB_PROFILE.endpoints.batchSubmit.path,
        content_type: "multipart/form-data",
        body: "form",
        fields: ["template_id", "size", "items_json", "reference_types_json"],
      },
      [IMAGE_AGENT_WEB_PROFILE.actions.batchRefresh]: {
        operation: "batch_status",
        method: IMAGE_AGENT_WEB_PROFILE.endpoints.batchStatus.method,
        path: IMAGE_AGENT_WEB_PROFILE.endpoints.batchStatus.path,
        body: "none",
        path_params: ["batch_id"],
      },
    },
    supporting_endpoints: {
      batch_download: {
        method: "GET",
        path: IMAGE_AGENT_WEB_PROFILE.endpoints.batchDownload.path,
        path_params: ["batch_id"],
      },
      meta: {
        method: "GET",
        path: "/api/meta",
      },
    },
  };
}


export function buildStartCardSpec(service: ServiceManifest, data: AdapterCardTemplateData): Record<string, unknown> {
  const { defaultPreset, templateSpecs, fieldSpecs, fieldMaps } = data;
  const defaultBatchItemsJson = JSON.stringify([{ fields: defaultPreset.fields }], null, 2);
  return {
    schema: "2.0",
    config: { update_multi: true, wide_screen_mode: true },
    header: { template: "blue", title: { tag: "plain_text", content: "Image Agent MVP" } },
    body: { elements: [
      { tag: "markdown", content: `**Target service:** ${service.service.name}\n\n**Templates:** ${templateSpecs.map((template) => template.id).join(", ")}\n\nFill the parameters and submit to run /api/generate.` },
      {
        tag: "form",
        name: "image_generate_form",
        elements: [
          { tag: "input", name: "param_template_id", required: true, default_value: defaultPreset.template_id, width: "fill", label: { tag: "plain_text", content: "Template ID" }, placeholder: { tag: "plain_text", content: templateSpecs.map((template) => template.id).join(" / ") } },
          { tag: "input", name: "param_size", required: true, default_value: defaultPreset.size, width: "fill", label: { tag: "plain_text", content: "Size" }, placeholder: { tag: "plain_text", content: "WIDTHxHEIGHT" } },
          ...fieldSpecs.map((field) => ({ tag: "input", name: fieldMaps.templateKeyToFormField[field.key] || field.name, required: field.required, default_value: field.defaultValue, width: "fill", label: { tag: "plain_text", content: field.label }, placeholder: { tag: "plain_text", content: field.placeholder || field.defaultValue || "Enter value" } })),
          { tag: "input", name: "param_message", required: false, default_value: defaultPreset.message || "", width: "fill", input_type: "multiline_text", rows: 2, auto_resize: true, label: { tag: "plain_text", content: "Message" }, placeholder: { tag: "plain_text", content: "Optional extra instruction" } },
          { tag: "button", text: { tag: "plain_text", content: "Generate image" }, type: "primary", form_action_type: "submit", name: "submit_image_generate", behaviors: [{ type: "callback", value: { action: IMAGE_AGENT_WEB_PROFILE.actions.generate, preset: defaultPreset } }] },
          { tag: "button", text: { tag: "plain_text", content: "Reset" }, type: "default", form_action_type: "reset", name: "reset_image_generate" },
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
          { tag: "button", text: { tag: "plain_text", content: "Start batch" }, type: "primary", form_action_type: "submit", name: "submit_image_batch", behaviors: [{ type: "callback", value: { action: IMAGE_AGENT_WEB_PROFILE.actions.batchSubmit } }] },
          { tag: "button", text: { tag: "plain_text", content: "Reset" }, type: "default", form_action_type: "reset", name: "reset_image_batch" },
        ],
      },
    ] },
  };
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

export function runtimeImageAgentClientTs(): string {
  return `import fs from "node:fs";
import path from "node:path";

export interface GeneratePreset {
  template_id: string;
  size: string;
  fields: Record<string, string>;
  message?: string;
}

export interface BatchStatus {
  batch_id: string;
  template_id?: string;
  size?: string;
  total?: number;
  done?: number;
  running?: boolean;
  completed?: Array<Record<string, unknown>>;
  failed?: Array<Record<string, unknown>>;
}

export interface ImageAgentResult {
  session_id?: string;
  analysis?: string;
  image_url?: string;
  prompt_used?: string;
  round?: number;
  template_id?: string;
  size?: string;
}

export async function getMeta(baseUrl: string, timeoutMs = 5000): Promise<unknown> {
  const response = await fetchWithTimeout(\`\${baseUrl}/api/meta\`, {}, timeoutMs, "image-agent-web /api/meta");
  if (!response.ok) {
    throw new Error(\`image-agent-web /api/meta returned HTTP \${response.status}\`);
  }
  return response.json();
}

export function resolveImageUrl(baseUrl: string, imageUrl: string | undefined): string {
  if (!imageUrl) return "";
  if (/^https?:\\/\\//i.test(imageUrl)) return imageUrl;
  return \`\${baseUrl}\${imageUrl.startsWith("/") ? "" : "/"}\${imageUrl}\`;
}

export async function downloadImageToTemp(imageUrl: string, traceId: string, timeoutMs: number): Promise<string> {
  const response = await fetchWithTimeout(imageUrl, {}, timeoutMs, "generated image download");
  if (!response.ok) {
    throw new Error(\`Failed to download generated image: HTTP \${response.status}\`);
  }
  const contentType = response.headers.get("content-type") || "image/png";
  const extension = contentType.includes("jpeg") ? "jpg" : "png";
  const buffer = Buffer.from(await response.arrayBuffer());
  const filePath = path.join(process.cwd(), "tmp", \`\${traceId}.\${extension}\`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(\`\${label} timed out after \${timeoutMs}ms.\`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
`;
}

export function runtimeCardsTs(service: ServiceManifest, capabilities: CapabilityMap, meta: ImageAgentMeta | undefined): string {
  const defaultPreset = buildDefaultPreset(capabilities, meta);
  const templateSpecs = buildTemplateSpecs(defaultPreset, meta);
  const fieldSpecs = buildFieldSpecs(defaultPreset, meta);
  return `import type { BatchStatus, GeneratePreset, ImageAgentResult } from "./image-agent-client.js";

export const defaultPreset: GeneratePreset = ${JSON.stringify(defaultPreset, null, 2)};

export const templateSpecs = ${JSON.stringify(templateSpecs, null, 2)};

export const fieldSpecs = ${JSON.stringify(fieldSpecs, null, 2)};

export function buildStartCard() {
  const defaultBatchItemsJson = JSON.stringify([{ fields: defaultPreset.fields }], null, 2);
  return {
    config: { wide_screen_mode: true },
    header: { template: "blue", title: { tag: "plain_text", content: "Image Agent MVP" } },
    elements: [
      { tag: "markdown", content: "**Target service:** ${service.service.name}\\n\\n**Templates:** " + templateSpecs.map((template) => template.id).join(", ") + "\\n\\nFill the parameters and submit to run /api/generate." },
      {
        tag: "form",
        name: "image_generate_form",
        elements: [
          { tag: "input", name: "param_template_id", required: true, default_value: defaultPreset.template_id, width: "fill", label: { tag: "plain_text", content: "Template ID" }, placeholder: { tag: "plain_text", content: templateSpecs.map((template) => template.id).join(" / ") } },
          { tag: "input", name: "param_size", required: true, default_value: defaultPreset.size, width: "fill", label: { tag: "plain_text", content: "Size" }, placeholder: { tag: "plain_text", content: "WIDTHxHEIGHT" } },
          ...fieldSpecs.map((field) => ({ tag: "input", name: field.name, required: field.required, default_value: field.defaultValue, width: "fill", label: { tag: "plain_text", content: field.label }, placeholder: { tag: "plain_text", content: field.placeholder || field.defaultValue || "Enter value" } })),
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
          { tag: "input", name: "param_batch_items_json", required: true, default_value: defaultBatchItemsJson, width: "fill", input_type: "multiline_text", rows: 5, auto_resize: true, label: { tag: "plain_text", content: "Batch items JSON" }, placeholder: { tag: "plain_text", content: "[{ \\"fields\\": { ... } }]" } },
          { tag: "button", text: { tag: "plain_text", content: "Start batch" }, type: "primary", action_type: "form_submit", name: "submit_image_batch", value: { action: "image.batch.submit" } },
          { tag: "button", text: { tag: "plain_text", content: "Reset" }, type: "default", action_type: "form_reset", name: "reset_image_batch" },
        ],
      },
    ],
  };
}

export function buildRunningCard(traceId: string, preset: GeneratePreset) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: "Generating image" },
    },
    elements: [
      { tag: "markdown", content: \`**Status:** running\\n\\n**Trace:** \${traceId}\\n\\n**Template:** \${preset.template_id}\\n\\n**Size:** \${preset.size}\` },
    ],
  };
}

export function buildIterationRunningCard(traceId: string, sessionId: string) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: "Iterating image" },
    },
    elements: [
      { tag: "markdown", content: \`**Status:** running\\n\\n**Trace:** \${traceId}\\n\\n**Session:** \${escapeText(sessionId)}\` },
    ],
  };
}

export function buildBatchRunningCard(traceId: string, batchId: string, templateId = "", size = "", total = 0) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: "Batch running" },
    },
    elements: [
      {
        tag: "markdown",
        content: [
          "**Status:** running",
          \`**Trace:** \${traceId}\`,
          \`**Batch ID:** \${escapeText(batchId)}\`,
          templateId ? \`**Template:** \${escapeText(templateId)}\` : "",
          size ? \`**Size:** \${escapeText(size)}\` : "",
          total ? \`**Total:** \${total}\` : "",
        ].filter(Boolean).join("\\n\\n"),
      },
    ],
  };
}

export function buildBatchStatusCard(traceId: string, status: BatchStatus, downloadUrl: string) {
  const total = numberOrZero(status.total);
  const done = numberOrZero(status.done);
  const completedCount = Array.isArray(status.completed) ? status.completed.length : 0;
  const failedCount = Array.isArray(status.failed) ? status.failed.length : 0;
  const running = status.running === true;
  const finished = !running && total > 0 && done >= total;
  const hasFailures = failedCount > 0;
  const headerTemplate = running ? "blue" : hasFailures ? "red" : finished ? "green" : "blue";
  const title = running ? "Batch running" : hasFailures ? "Batch finished with failures" : finished ? "Batch complete" : "Batch status";
  const batchId = status.batch_id || "";
  const elements: unknown[] = [
    {
      tag: "markdown",
      content: [
        \`**Status:** \${running ? "running" : finished ? "completed" : "not running"}\`,
        \`**Trace:** \${traceId}\`,
        \`**Batch ID:** \${escapeText(batchId)}\`,
        \`**Progress:** \${done} / \${total}\`,
        \`**Completed:** \${completedCount}\`,
        \`**Failed:** \${failedCount}\`,
        status.template_id ? \`**Template:** \${escapeText(status.template_id)}\` : "",
        status.size ? \`**Size:** \${escapeText(status.size)}\` : "",
      ].filter(Boolean).join("\\n\\n"),
    },
  ];

  if (finished && downloadUrl && completedCount > 0) {
    elements.push({
      tag: "markdown",
      content: \`[Download completed images ZIP](\${downloadUrl})\`,
    });
  }

  if (batchId) {
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "Refresh status" },
          type: "default",
          value: {
            action: "image.batch.refresh",
            batch_id: batchId,
          },
        },
      ],
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      template: headerTemplate,
      title: { tag: "plain_text", content: title },
    },
    elements,
  };
}

export function buildSuccessCard(traceId: string, result: ImageAgentResult, imageKey: string, fallbackUrl: string) {
  const elements: unknown[] = [
    { tag: "markdown", content: \`**Status:** succeeded\\n\\n**Trace:** \${traceId}\\n\\n**Analysis:** \${escapeText(result.analysis || "No analysis returned.")}\` },
  ];

  if (imageKey) {
    elements.push({ tag: "img", img_key: imageKey, alt: { tag: "plain_text", content: "Generated image" } });
  } else if (fallbackUrl) {
    elements.push({ tag: "markdown", content: \`Image upload did not produce an image_key. Open target output: \${fallbackUrl}\` });
  }

  if (result.session_id) {
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
          fallback: {
            tag: "fallback_text",
            text: { tag: "plain_text", content: "Input requires Feishu 6.8 or later." },
          },
        },
        {
          tag: "button",
          text: { tag: "plain_text", content: "Iterate image" },
          type: "primary",
          action_type: "form_submit",
          name: "submit_image_iterate",
          value: {
            action: "image.iterate.submit",
            session_id: result.session_id,
          },
        },
      ],
      fallback: {
        tag: "fallback_text",
        text: { tag: "plain_text", content: "Form input requires Feishu 6.6 or later." },
      },
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      template: "green",
      title: { tag: "plain_text", content: "Image generated" },
    },
    elements,
  };
}

export function buildInfoCard(traceId: string, title: string, message: string) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: title },
    },
    elements: [
      {
        tag: "markdown",
        content: \`**State:** duplicate action ignored\\n\\n**Trace ID:** \${traceId}\\n\\n**Next step:** \${escapeText(message)}\`,
      },
    ],
  };
}

export function buildFailureCard(traceId: string, message: string) {
  const nextStep = failureNextStep(message);
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "red",
      title: { tag: "plain_text", content: "Image generation failed" },
    },
    elements: [
      {
        tag: "markdown",
        content: \`**State:** failed\\n\\n**Trace ID:** \${traceId}\\n\\n**What happened:** \${escapeText(message)}\\n\\n**Next step:** \${nextStep}\`,
      },
    ],
  };
}

function escapeText(value: string): string {
  return value.replace(/[<>]/g, "");
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function failureNextStep(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("not authorized") || normalized.includes("operator_open_id")) {
    return "Use an allowed Feishu operator open_id or update ALLOWED_OPERATOR_OPEN_IDS, then submit again.";
  }
  if (normalized.includes("invalid card input") || normalized.includes("size must") || normalized.includes(" is required")) {
    return "Correct the card parameters and submit the form again.";
  }
  if (normalized.includes("timed out")) {
    return "Check target-service latency or raise IMAGE_AGENT_TIMEOUT_MS, then retry.";
  }
  if (normalized.includes("missing feishu") || normalized.includes("requires open_message_id")) {
    return "Complete bot-runtime/.env and Feishu callback/message permissions, then rerun verification.";
  }
  if (normalized.includes("unsupported card action")) {
    return "Refresh the start card and submit the generated form button.";
  }
  return "Check bot-runtime/audit.log with the trace ID, fix the target or runtime issue, then retry.";
}
`;
}

export function runtimeIndexTs(): string {
  return `import http from "node:http";
import fs from "node:fs";
import * as lark from "@larksuiteoapi/node-sdk";
import { audit, makeTraceId, readAuditTail } from "./audit.js";
import { buildFailureCard, buildInfoCard, buildRunningCard, buildStartCard, buildSuccessCard, defaultPreset, fieldSpecs, templateSpecs } from "./cards.js";
import { loadConfig } from "./config.js";
import { downloadImageToTemp, resolveImageUrl } from "./image-agent-client.js";
import type { BatchStatus, GeneratePreset, ImageAgentResult } from "./image-agent-client.js";

const config = loadConfig();
let cachedClient: lark.Client | undefined;
const adapterHandlersModule = "../../adapter/handlers.js";
const CARD_ACTION_DEDUPE_TTL_MS = 120_000;
const cardActionDedupe = new Map<string, CardActionDedupeEntry>();

interface AdapterResult {
  ok?: boolean;
  card?: unknown;
  result?: unknown;
  batchId?: string;
  batchStatus?: unknown;
  downloadUrl?: string;
  auditEvents?: Array<{ event: string; detail: Record<string, unknown> }>;
}

interface AdapterHandlersModule {
  handleImageAgentCardAction(ctx: Record<string, unknown>, deps: Record<string, unknown>): Promise<AdapterResult>;
}

interface CardActionDedupeEntry {
  traceId: string;
  card: unknown;
  expiresAt: number;
}

function requireFeishuApiConfig(): void {
  if (!config.feishuApiConfigured) {
    throw new Error(\`Missing Feishu API config: \${config.missingFeishuApiKeys.join(", ")}\`);
  }
}

function requireCallbackConfig(): void {
  if (!config.callbackConfigured) {
    throw new Error(\`Missing Feishu callback config: \${config.missingCallbackKeys.join(", ")}\`);
  }
}

function requireSendConfig(): void {
  if (!config.sendConfigured) {
    throw new Error(\`Missing Feishu send config: \${config.missingSendKeys.join(", ")}\`);
  }
}

function getClient(): lark.Client {
  requireFeishuApiConfig();
  if (!cachedClient) {
    cachedClient = new lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      domain: config.feishuOpenApiBaseUrl || lark.Domain.Feishu,
    });
  }
  return cachedClient;
}

async function sendCardToTestChat(card: unknown) {
  requireSendConfig();
  const response = await getClient().im.message.create({
    params: { receive_id_type: "chat_id" },
    data: {
      receive_id: config.testChatId,
      msg_type: "interactive",
      content: JSON.stringify(card),
    },
  });
  assertFeishuApiSuccess(response, "message.create");
  return response;
}

async function uploadImage(imageUrl: string, traceId: string): Promise<string> {
  if (!config.uploadImageToLark || !imageUrl) return "";
  const filePath = await downloadImageToTemp(imageUrl, traceId, config.imageAgentTimeoutMs);
  try {
    const result: any = await getClient().im.image.create({
      data: {
        image_type: "message",
        image: fs.createReadStream(filePath),
      },
    });
    assertFeishuApiSuccess(result, "image.create");
    const imageKey = result?.data?.image_key || result?.image_key || "";
    return imageKey;
  } finally {
    fs.rmSync(filePath, { force: true });
  }
}

async function updateCardMessage(messageId: string, card: unknown, traceId: string): Promise<void> {
  requireFeishuApiConfig();
  const tenantAccessToken = await getTenantAccessToken();
  const response = await fetch(\`\${getOpenApiBaseUrl()}/open-apis/im/v1/messages/\${encodeURIComponent(messageId)}\`, {
    method: "PATCH",
    headers: {
      "Authorization": \`Bearer \${tenantAccessToken}\`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ content: JSON.stringify(card) }),
  });
  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(\`Feishu message.patch returned HTTP \${response.status}: \${safeJsonStringify(body)}\`);
  }
  assertFeishuApiSuccess(body, "message.patch");
  audit({ trace_id: traceId, event: "message_patch_succeeded", detail: { messageId } });
}

async function getTenantAccessToken(): Promise<string> {
  const response = await fetch(\`\${getOpenApiBaseUrl()}/open-apis/auth/v3/tenant_access_token/internal\`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
  });
  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(\`Feishu tenant_access_token returned HTTP \${response.status}: \${safeJsonStringify(body)}\`);
  }
  assertFeishuApiSuccess(body, "tenant_access_token");
  const token = isRecord(body) && typeof body.tenant_access_token === "string" ? body.tenant_access_token : "";
  if (!token) {
    throw new Error(\`Feishu tenant_access_token response did not include tenant_access_token: \${safeJsonStringify(body)}\`);
  }
  return token;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getOpenApiBaseUrl(): string {
  return config.feishuOpenApiBaseUrl || "https://open.feishu.cn";
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

interface GenerationRun {
  traceId: string;
  result?: ImageAgentResult;
  imageUrl: string;
  imageKey: string;
  card: unknown;
}

async function runGeneration(preset: GeneratePreset, uploadToLark: boolean, traceId = makeTraceId()): Promise<GenerationRun> {
  audit({ trace_id: traceId, event: "generation_started", detail: { preset, uploadToLark } });
  const running = buildRunningCard(traceId, preset);
  audit({ trace_id: traceId, event: "running_card_built", detail: { running } });

  const adapter = await loadAdapterHandlers();
  const adapterResult = await adapter.handleImageAgentCardAction({
    action: "image.generate.submit",
    value: { action: "image.generate.submit", preset },
    formValue: {},
  }, {
    imageAgentBaseUrl: config.imageAgentBaseUrl,
    timeoutMs: config.imageAgentTimeoutMs,
  });
  for (const event of adapterResult.auditEvents || []) {
    audit({ trace_id: traceId, event: event.event, detail: event.detail || {} });
  }
  if (!adapterResult.ok) {
    throw new Error(adapterFailureMessage(adapterResult));
  }
  const result = normalizeImageAgentResult(adapterResult.result);
  const imageUrl = resolveImageUrl(config.imageAgentBaseUrl, result.image_url);
  let imageKey = "";
  if (uploadToLark && config.feishuApiConfigured) {
    try {
      imageKey = await uploadImage(imageUrl, traceId);
    } catch (error) {
      audit({
        trace_id: traceId,
        event: "image_upload_failed",
        detail: { message: error instanceof Error ? error.message : String(error), imageUrl },
      });
    }
  }

  audit({ trace_id: traceId, event: "generation_succeeded", detail: { imageUrl, imageKey } });
  return {
    traceId,
    result,
    imageUrl,
    imageKey,
    card: buildSuccessCard(traceId, result, imageKey, imageUrl),
  };
}

async function loadAdapterHandlers(): Promise<AdapterHandlersModule> {
  return await import(adapterHandlersModule) as AdapterHandlersModule;
}

function normalizeImageAgentResult(value: unknown): ImageAgentResult {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ImageAgentResult : {};
}

function adapterFailureMessage(adapterResult: unknown): string {
  if (!isRecord(adapterResult)) return "Adapter action failed.";
  const auditEvents = Array.isArray(adapterResult.auditEvents) ? adapterResult.auditEvents : [];
  for (let index = auditEvents.length - 1; index >= 0; index -= 1) {
    const event = auditEvents[index];
    if (!isRecord(event) || !isRecord(event.detail)) continue;
    const message = event.detail.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Adapter action failed.";
}

interface CardActionRun {
  ok: boolean;
  traceId: string;
  card: unknown;
  error?: string;
  batchId?: string;
  batchStatus?: BatchStatus;
  downloadUrl?: string;
}

async function runCardAction(data: any, options: { requireCallbackConfig: boolean; uploadToLark: boolean; asyncUpdate: boolean; dedupe: boolean }): Promise<CardActionRun> {
  const traceId = makeTraceId();
  const actionValue = getActionValue(data);
  const action = typeof actionValue.action === "string" ? actionValue.action : "";
  const formValue = getFormValue(data);
  const preset = isPreset(actionValue.preset) ? mergePresetWithFormValue(actionValue.preset, formValue) : undefined;
  const callbackContext = extractCallbackContext(data);
  audit({
    trace_id: traceId,
    event: "card_action_received",
    detail: {
      action,
      form_value_keys: isRecord(formValue) ? Object.keys(formValue) : [],
      ...callbackContext,
    },
  });

  if (!isSupportedCardAction(action)) {
    return {
      ok: false,
      traceId,
      card: buildFailureCard(traceId, "Unsupported card action."),
      error: "Unsupported card action.",
    };
  }

  const dedupeKey = options.dedupe ? buildCardActionDedupeKey(action, actionValue, formValue, callbackContext) : "";
  if (dedupeKey) {
    const duplicate = findDuplicateCardAction(dedupeKey, traceId, callbackContext);
    if (duplicate) {
      return {
        ok: true,
        traceId,
        card: duplicate.card,
      };
    }
    rememberCardAction(dedupeKey, traceId, buildInfoCard(traceId, "Card action already queued", "This card action is already being processed. The original request will update the card when it finishes."));
  }

  try {
    if (options.requireCallbackConfig) {
      requireCallbackConfig();
    }
    if (options.asyncUpdate && action === "image.generate.submit" && preset) {
      requireFeishuApiConfig();
      const messageId = typeof callbackContext.open_message_id === "string" ? callbackContext.open_message_id : "";
      if (!messageId) {
        throw new Error("Async card action requires open_message_id in the callback context.");
      }
      const runningCard = buildRunningCard(traceId, preset);
      audit({ trace_id: traceId, event: "async_generation_queued", detail: { messageId, preset } });
      rememberCardAction(dedupeKey, traceId, runningCard);
      void completeAsyncCardAction(messageId, preset, options.uploadToLark, traceId, callbackContext, dedupeKey);
      return {
        ok: true,
        traceId,
        card: runningCard,
      };
    }
    const adapter = await loadAdapterHandlers();
    const adapterResult = await adapter.handleImageAgentCardAction({
      action,
      value: actionValue,
      formValue: isRecord(formValue) ? formValue : {},
      operatorOpenId: typeof callbackContext.operator_open_id === "string" ? callbackContext.operator_open_id : undefined,
      openMessageId: typeof callbackContext.open_message_id === "string" ? callbackContext.open_message_id : undefined,
      openChatId: typeof callbackContext.open_chat_id === "string" ? callbackContext.open_chat_id : undefined,
    }, {
      imageAgentBaseUrl: config.imageAgentBaseUrl,
      timeoutMs: config.imageAgentTimeoutMs,
      allowedOperatorOpenIds: config.allowedOperatorOpenIds,
    });
    for (const event of adapterResult.auditEvents || []) {
      const translated = translateAdapterAuditEvent(event, callbackContext);
      audit({ trace_id: traceId, event: translated.event, detail: translated.detail });
    }
    const card = adapterResult.ok ? decorateAdapterCard(adapterResult.card, traceId) : buildFailureCard(traceId, adapterFailureMessage(adapterResult));
    rememberCardAction(dedupeKey, traceId, card);
    return {
      ok: Boolean(adapterResult.ok),
      traceId,
      card,
      batchId: adapterResult.batchId,
      batchStatus: normalizeBatchStatus(adapterResult.batchStatus, adapterResult.batchId),
      downloadUrl: adapterResult.downloadUrl,
      error: adapterResult.ok ? undefined : adapterFailureMessage(adapterResult),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureCard = buildFailureCard(traceId, message);
    rememberCardAction(dedupeKey, traceId, failureCard);
    audit({ trace_id: traceId, event: "generation_failed", detail: { message, ...callbackContext } });
    return {
      ok: false,
      traceId,
      card: failureCard,
      error: message,
    };
  }
}

function isSupportedCardAction(action: string): boolean {
  return action === "image.generate.submit"
    || action === "image.iterate.submit"
    || action === "image.batch.submit"
    || action === "image.batch.refresh";
}

function decorateAdapterCard(card: unknown, traceId: string): unknown {
  if (!isRecord(card) || !Array.isArray(card.elements)) return card;
  const elements = card.elements.map((element) => isRecord(element) ? { ...element } : element);
  elements.push({ tag: "markdown", content: "**Trace ID:** " + traceId });
  return { ...card, elements };
}

function normalizeBatchStatus(value: unknown, batchId: string | undefined): BatchStatus | undefined {
  if (!isRecord(value)) return undefined;
  return { ...value, batch_id: typeof value.batch_id === "string" ? value.batch_id : batchId || "" } as BatchStatus;
}

function translateAdapterAuditEvent(
  event: { event: string; detail: Record<string, unknown> },
  callbackContext: Record<string, unknown>,
): { event: string; detail: Record<string, unknown> } {
  if (event.event === "adapter_generation_failed") {
    const message = typeof event.detail.message === "string" ? event.detail.message : "Adapter action failed.";
    const normalized = message.toLowerCase();
    if (normalized.includes("not authorized") || normalized.includes("operator_open_id")) {
      return {
        event: "card_action_unauthorized",
        detail: {
          message,
          allowed_operator_count: config.allowedOperatorOpenIds.length,
          ...callbackContext,
        },
      };
    }
    if (normalized.includes("timed out")) {
      return { event: "generation_failed", detail: { message, ...callbackContext } };
    }
    return { event: "card_action_validation_failed", detail: { errors: [message], ...callbackContext } };
  }
  if (event.event === "adapter_batch_submitted") {
    return {
      event: "batch_started",
      detail: {
        template_id: event.detail.template_id,
        size: event.detail.size,
        total: event.detail.total,
        ...callbackContext,
      },
    };
  }
  if (event.event === "adapter_batch_status_checked") {
    return { event: "batch_status_checked", detail: { ...event.detail, ...callbackContext } };
  }
  return event;
}

function buildCardActionDedupeKey(
  action: string,
  payload: unknown,
  formValue: unknown,
  callbackContext: Record<string, unknown>,
): string {
  return safeJsonStringify({
    action,
    payload,
    formValue: isRecord(formValue) ? formValue : {},
    operator_open_id: callbackContext.operator_open_id || "",
    open_message_id: callbackContext.open_message_id || "",
    open_chat_id: callbackContext.open_chat_id || "",
  });
}

function findDuplicateCardAction(
  dedupeKey: string,
  traceId: string,
  callbackContext: Record<string, unknown>,
): CardActionDedupeEntry | undefined {
  cleanupCardActionDedupe();
  const duplicate = cardActionDedupe.get(dedupeKey);
  if (!duplicate) return undefined;
  audit({
    trace_id: traceId,
    event: "card_action_duplicate",
    detail: {
      original_trace_id: duplicate.traceId,
      dedupe_ttl_seconds: Math.round(CARD_ACTION_DEDUPE_TTL_MS / 1000),
      ...callbackContext,
    },
  });
  return duplicate;
}

function rememberCardAction(dedupeKey: string, traceId: string, card: unknown): void {
  if (!dedupeKey) return;
  cardActionDedupe.set(dedupeKey, {
    traceId,
    card,
    expiresAt: Date.now() + CARD_ACTION_DEDUPE_TTL_MS,
  });
}

function cleanupCardActionDedupe(): void {
  const now = Date.now();
  for (const [key, value] of cardActionDedupe.entries()) {
    if (value.expiresAt <= now) {
      cardActionDedupe.delete(key);
    }
  }
}

async function completeAsyncCardAction(
  messageId: string,
  preset: GeneratePreset,
  uploadToLark: boolean,
  traceId: string,
  callbackContext: Record<string, unknown>,
  dedupeKey: string,
): Promise<void> {
  try {
    const run = await runGeneration(preset, uploadToLark, traceId);
    rememberCardAction(dedupeKey, traceId, run.card);
    await updateCardMessage(messageId, run.card, traceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureCard = buildFailureCard(traceId, message);
    rememberCardAction(dedupeKey, traceId, failureCard);
    audit({ trace_id: traceId, event: "async_generation_failed", detail: { message, ...callbackContext } });
    try {
      await updateCardMessage(messageId, failureCard, traceId);
    } catch (patchError) {
      audit({
        trace_id: traceId,
        event: "message_patch_failed",
        detail: { message: patchError instanceof Error ? patchError.message : String(patchError), originalError: message },
      });
    }
  }
}

const cardHandler = new lark.CardActionHandler(
  {
    encryptKey: config.encryptKey,
    verificationToken: config.verificationToken,
  },
  async (data: any) => {
    const run = await runCardAction(data, {
      requireCallbackConfig: true,
      uploadToLark: config.uploadImageToLark && config.feishuApiConfigured,
      asyncUpdate: config.cardActionMode === "async",
      dedupe: true,
    });
    return run.card;
  },
);

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", "http://localhost");

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true,
      service: "image-agent-web-lark-runtime",
      feishuConfigured: config.feishuConfigured,
      feishuApiConfigured: config.feishuApiConfigured,
      callbackConfigured: config.callbackConfigured,
      sendConfigured: config.sendConfigured,
      cardActionMode: config.cardActionMode,
      feishuOpenApiBaseUrl: config.feishuOpenApiBaseUrl,
      uploadImageToLark: config.uploadImageToLark,
      operatorAuthConfigured: config.allowedOperatorOpenIds.length > 0,
      allowedOperatorCount: config.allowedOperatorOpenIds.length,
      missingFeishuKeys: config.missingFeishuKeys,
      missingFeishuApiKeys: config.missingFeishuApiKeys,
      missingCallbackKeys: config.missingCallbackKeys,
      missingSendKeys: config.missingSendKeys,
      publicCallbackBaseUrl: config.publicCallbackBaseUrl,
      imageAgentBaseUrl: config.imageAgentBaseUrl,
      imageAgentTimeoutMs: config.imageAgentTimeoutMs,
      debugEnabled: config.allowDebugWithoutFeishu,
      debugProtected: !config.allowDebugWithoutFeishu || Boolean(config.debugAccessToken),
    }));
    return;
  }

  if (requestUrl.pathname.startsWith("/debug/") && !isDebugRequestAllowed(req)) {
    writeJson(res, 403, {
      ok: false,
      error: config.allowDebugWithoutFeishu
        ? "Debug endpoint access denied. Provide DEBUG_ACCESS_TOKEN with Authorization: Bearer <token> or x-lark-deployer-debug-token."
        : "Debug endpoints are disabled. Set ALLOW_DEBUG_WITHOUT_FEISHU=1 for local verification.",
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/debug/audit-tail") {
    const requestedLimit = Number(requestUrl.searchParams.get("limit") || "50");
    const limit = Number.isInteger(requestedLimit) ? requestedLimit : 50;
    const events = readAuditTail(limit);
    writeJson(res, 200, { ok: true, count: events.length, events });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/debug/start-card") {
    const traceId = makeTraceId();
    try {
      const body = await readJsonBody(req);
      const response = isRecord(body?.mockFeishuResponse) && config.allowDebugWithoutFeishu
        ? assertMockFeishuResponse(body.mockFeishuResponse)
        : await sendCardToTestChat(buildStartCard());
      audit({
        trace_id: traceId,
        event: "start_card_sent",
        detail: {
          messageId: extractFeishuMessageId(response),
          responseCode: isRecord(response) ? response.code : undefined,
        },
      });
      writeJson(res, 200, { ok: true, traceId, response });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      audit({ trace_id: traceId, event: "start_card_failed", detail: { message } });
      writeJson(res, 500, { ok: false, traceId, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/debug/simulate-generate") {
    try {
      const body = await readJsonBody(req);
      const preset = isPreset(body?.preset) ? body.preset : defaultPreset;
      const uploadToLark = Boolean(body?.uploadToLark) && config.feishuApiConfigured;
      const run = await runGeneration(preset, uploadToLark);
      writeJson(res, 200, { ok: true, ...run });
    } catch (error) {
      const traceId = makeTraceId();
      const message = error instanceof Error ? error.message : String(error);
      audit({ trace_id: traceId, event: "debug_simulate_failed", detail: { message } });
      writeJson(res, 500, { ok: false, traceId, card: buildFailureCard(traceId, message), error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/debug/simulate-card-action") {
    try {
      const body = await readJsonBody(req);
      const preset = isPreset(body?.preset) ? body.preset : defaultPreset;
      const actionName = typeof body?.action === "string" ? body.action : "image.generate.submit";
      const formValue = isRecord(body?.formValue) ? body.formValue : buildDefaultFormValueForAction(actionName, preset);
      const eventShape = body?.eventShape === "v2" ? "v2" : "legacy";
      const valueAsJsonString = body?.valueAsJsonString === true;
      const uploadToLark = Boolean(body?.uploadToLark) && config.feishuApiConfigured;
      const actionValue = buildDebugActionValue(body, preset);
      const event = eventShape === "v2"
        ? buildDebugCardActionEventV2(preset, formValue, valueAsJsonString, actionValue)
        : buildDebugCardActionEvent(preset, formValue, valueAsJsonString, actionValue);
      const run = await runCardAction(event, {
        requireCallbackConfig: false,
        uploadToLark,
        asyncUpdate: body?.asyncUpdate === true,
        dedupe: body?.dedupe === true,
      });
      writeJson(res, run.ok ? 200 : 500, run);
    } catch (error) {
      const traceId = makeTraceId();
      const message = error instanceof Error ? error.message : String(error);
      audit({ trace_id: traceId, event: "debug_card_action_failed", detail: { message } });
      writeJson(res, 500, { ok: false, traceId, card: buildFailureCard(traceId, message), error: message });
    }
    return;
  }

  if (requestUrl.pathname === "/webhook/card") {
    await handleCardWebhook(req, res);
    return;
  }

  writeJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(config.port, config.host, () => {
  console.log(\`Lark bot runtime listening on http://\${config.host}:\${config.port}\`);
  console.log("Card callback path: /webhook/card");
  if (!config.feishuConfigured) {
    console.log(\`Feishu config incomplete: \${config.missingFeishuKeys.join(", ")}\`);
    console.log("Local debug endpoint available: POST /debug/simulate-generate");
  }
  if (config.allowDebugWithoutFeishu && config.debugAccessToken) {
    console.log("Debug endpoints require DEBUG_ACCESS_TOKEN.");
  }
  if (config.allowDebugWithoutFeishu && !config.debugAccessToken) {
    console.log("Debug endpoints are unprotected. Set DEBUG_ACCESS_TOKEN before exposing this runtime publicly.");
  }
});

function writeJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function assertMockFeishuResponse(response: Record<string, unknown>): Record<string, unknown> {
  assertFeishuApiSuccess(response, "mock message.create");
  return response;
}

function extractFeishuMessageId(response: unknown): string {
  if (!isRecord(response)) return "";
  const data = isRecord(response.data) ? response.data : {};
  return stringFromUnknown(data.message_id)
    || stringFromUnknown(data.messageId)
    || stringFromUnknown(data.open_message_id)
    || stringFromUnknown(response.message_id)
    || stringFromUnknown(response.messageId)
    || stringFromUnknown(response.open_message_id);
}

function stringFromUnknown(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isDebugRequestAllowed(req: http.IncomingMessage): boolean {
  if (!config.allowDebugWithoutFeishu) return false;
  if (!config.debugAccessToken) return true;
  const headerToken = firstHeaderValue(req.headers["x-lark-deployer-debug-token"]);
  if (headerToken === config.debugAccessToken) return true;
  const authorization = firstHeaderValue(req.headers.authorization);
  return authorization === \`Bearer \${config.debugAccessToken}\`;
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function assertFeishuApiSuccess(response: unknown, operation: string): void {
  if (!isRecord(response) || !Object.prototype.hasOwnProperty.call(response, "code")) return;
  const rawCode = response.code;
  const code = typeof rawCode === "number" ? rawCode : Number(rawCode);
  if (Number.isFinite(code) && code === 0) return;
  const message = typeof response.msg === "string"
    ? response.msg
    : typeof response.message === "string"
      ? response.message
      : "Unknown Feishu API error";
  throw new Error(\`Feishu \${operation} failed with code \${String(rawCode)}: \${message}\`);
}

async function handleCardWebhook(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    writeJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  let body: any;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    return;
  }

  const data = Object.assign(Object.create({ headers: req.headers }), body);
  try {
    const { isChallenge, challenge } = lark.generateChallenge(data, { encryptKey: config.encryptKey });
    if (isChallenge) {
      writeJson(res, 200, challenge);
      return;
    }
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  if (!config.callbackConfigured) {
    writeJson(res, 503, {
      ok: false,
      error: \`Feishu callback config incomplete: \${config.missingCallbackKeys.join(", ")}\`,
      missingFeishuKeys: config.missingCallbackKeys,
    });
    return;
  }

  const card = await cardHandler.invoke(data);
  if (!card) {
    writeJson(res, 401, { ok: false, error: "Card callback verification failed or no card was returned." });
    return;
  }
  writeJson(res, 200, card);
}

function buildDebugCardActionEvent(
  preset: GeneratePreset,
  formValue: Record<string, unknown>,
  valueAsJsonString = false,
  actionValue?: Record<string, unknown>,
): Record<string, unknown> {
  const value = actionValue || {
    action: "image.generate.submit",
    preset,
  };
  return {
    open_id: "debug_open_id",
    user_id: "debug_user_id",
    tenant_key: "debug_tenant_key",
    open_message_id: "debug_message_id",
    context: {
      open_chat_id: "debug_chat_id",
      open_message_id: "debug_message_id",
    },
    action: {
      tag: "button",
      form_value: formValue,
      value: valueAsJsonString ? JSON.stringify(value) : value,
    },
  };
}

function buildDebugCardActionEventV2(
  preset: GeneratePreset,
  formValue: Record<string, unknown>,
  valueAsJsonString = false,
  actionValue?: Record<string, unknown>,
): Record<string, unknown> {
  const value = actionValue || {
    action: "image.generate.submit",
    preset,
  };
  return {
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      tenant_key: "debug_v2_tenant_key",
    },
    event: {
      operator: {
        open_id: "debug_v2_open_id",
        user_id: "debug_v2_user_id",
      },
      token: "debug_v2_card_update_token",
      action: {
        tag: "button",
        name: "submit_image_generate",
        form_value: formValue,
        value: valueAsJsonString ? JSON.stringify(value) : value,
      },
      context: {
        open_chat_id: "debug_v2_chat_id",
        open_message_id: "debug_v2_message_id",
      },
    },
  };
}

function buildDebugActionValue(body: any, preset: GeneratePreset): Record<string, unknown> {
  if (body?.action === "image.iterate.submit") {
    return {
      action: "image.iterate.submit",
      session_id: stringFromUnknown(body?.session_id || body?.sessionId) || "debug_session_id",
    };
  }
  if (body?.action === "image.batch.submit") {
    return {
      action: "image.batch.submit",
    };
  }
  if (body?.action === "image.batch.refresh") {
    return {
      action: "image.batch.refresh",
      batch_id: stringFromUnknown(body?.batch_id || body?.batchId) || "debug_batch_id",
    };
  }
  return {
    action: "image.generate.submit",
    preset,
  };
}

function buildDefaultFormValueForAction(action: string, preset: GeneratePreset): Record<string, string> {
  if (action === "image.iterate.submit") {
    return { param_feedback: "Make the image cleaner and more conversion-focused." };
  }
  if (action === "image.batch.submit") {
    return buildDefaultBatchFormValue(preset);
  }
  if (action === "image.batch.refresh") {
    return {};
  }
  return buildDefaultFormValue(preset);
}

function buildDefaultFormValue(preset: GeneratePreset): Record<string, string> {
  return {
    param_template_id: preset.template_id,
    param_size: preset.size,
    param_message: preset.message || "",
    ...Object.fromEntries(fieldSpecs.map((field) => [field.name, preset.fields[field.key] || ""])),
  };
}

function buildDefaultBatchFormValue(preset: GeneratePreset): Record<string, string> {
  return {
    param_batch_template_id: preset.template_id,
    param_batch_size: preset.size,
    param_batch_items_json: JSON.stringify([{ fields: preset.fields }], null, 2),
  };
}

function getActionValue(data: any): Record<string, unknown> {
  const value = getActionObject(data)?.value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getFormValue(data: any): unknown {
  const action = getActionObject(data);
  if (isRecord(action?.form_value)) return action.form_value;
  if (isRecord(action?.formValue)) return action.formValue;
  if (isRecord(data?.form_value)) return data.form_value;
  if (isRecord(data?.formValue)) return data.formValue;
  return undefined;
}

function getActionObject(data: any): Record<string, unknown> | undefined {
  if (isRecord(data?.action)) return data.action;
  if (isRecord(data?.event?.action)) return data.event.action;
  return undefined;
}

function mergePresetWithFormValue(preset: GeneratePreset, formValue: unknown): GeneratePreset {
  if (!formValue || typeof formValue !== "object") return preset;
  const submitted = formValue as Record<string, unknown>;
  let templateId = preset.template_id;
  let size = preset.size;
  let message = preset.message || "";
  const fields = { ...preset.fields };
  if (Object.prototype.hasOwnProperty.call(submitted, "param_template_id")) {
    templateId = typeof submitted.param_template_id === "string" ? submitted.param_template_id.trim() : "";
  }
  if (Object.prototype.hasOwnProperty.call(submitted, "param_size")) {
    size = typeof submitted.param_size === "string" ? submitted.param_size.trim() : "";
  }
  if (Object.prototype.hasOwnProperty.call(submitted, "param_message")) {
    message = typeof submitted.param_message === "string" ? submitted.param_message.trim() : "";
  }
  for (const field of fieldSpecs) {
    if (Object.prototype.hasOwnProperty.call(submitted, field.name)) {
      const submittedValue = submitted[field.name];
      fields[field.key] = typeof submittedValue === "string" ? submittedValue.trim() : "";
    }
  }
  return {
    ...preset,
    template_id: templateId,
    size,
    message,
    fields,
  };
}

function validatePreset(preset: GeneratePreset): string[] {
  const errors: string[] = [];
  const template = findTemplateSpec(preset.template_id);
  if (!template) {
    errors.push(\`Template ID must be one of: \${templateSpecs.map((item) => item.id).join(", ")}.\`);
  }
  if (!/^([1-9]\\d*)x([1-9]\\d*)$/i.test(preset.size.trim())) {
    errors.push("Size must use WIDTHxHEIGHT, for example 1024x1024.");
  }

  const requiredKeys = template
    ? new Set(template.requiredFieldKeys)
    : new Set(fieldSpecs.filter((field) => field.required).map((field) => field.key));
  for (const field of fieldSpecs) {
    if (!requiredKeys.has(field.key)) continue;
    const value = preset.fields[field.key];
    if (typeof value !== "string" || !value.trim()) {
      errors.push(field.label + " is required.");
    }
  }

  return errors;
}

function findTemplateSpec(templateId: string): { id: string; requiredFieldKeys: string[] } | undefined {
  return templateSpecs.find((template) => template.id === templateId);
}

function isOperatorAllowed(callbackContext: Record<string, unknown>): boolean {
  if (!config.allowedOperatorOpenIds.length) return true;
  const operatorOpenId = typeof callbackContext.operator_open_id === "string" ? callbackContext.operator_open_id : "";
  return Boolean(operatorOpenId && config.allowedOperatorOpenIds.includes(operatorOpenId));
}

function extractCallbackContext(data: any): Record<string, unknown> {
  const event = isRecord(data?.event) ? data.event : {};
  const eventOperator = isRecord(event.operator) ? event.operator : {};
  const eventContext = isRecord(event.context) ? event.context : {};
  const action = getActionObject(data);
  return compactObject({
    operator_open_id: data?.open_id || data?.operator?.open_id || data?.operator?.openId || eventOperator.open_id || eventOperator.openId,
    operator_user_id: data?.user_id || data?.operator?.user_id || data?.operator?.userId || eventOperator.user_id || eventOperator.userId,
    tenant_key: data?.tenant_key || data?.header?.tenant_key || event.tenant_key,
    open_message_id: data?.open_message_id || data?.context?.open_message_id || data?.messageId || eventContext.open_message_id || event.messageId,
    open_chat_id: data?.open_chat_id || data?.context?.open_chat_id || data?.chatId || eventContext.open_chat_id || event.chatId,
    action_tag: action?.tag,
    action_option: action?.option,
    action_name: action?.name,
  });
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function isPreset(value: unknown): value is GeneratePreset {
  if (!value || typeof value !== "object") return false;
  const candidate = value as GeneratePreset;
  return typeof candidate.template_id === "string"
    && typeof candidate.size === "string"
    && typeof candidate.fields === "object"
    && candidate.fields !== null;
}
`;
}
