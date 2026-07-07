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
