export type IntegrationMode = "embedded-adapter" | "standalone-runtime" | "self-hosted-runtime";
export type HostReceiveMode = "embedded-webhook" | "embedded-long-connection" | "standalone-runtime" | "hybrid";

export function normalizeHostReceiveMode(value: string, integrationMode: IntegrationMode): HostReceiveMode {
  const normalized = value.trim();
  if (!normalized) {
    if (integrationMode === "embedded-adapter") return "embedded-webhook";
    if (integrationMode === "self-hosted-runtime") return "embedded-long-connection";
    return "standalone-runtime";
  }
  if (normalized === "embedded-webhook" || normalized === "webhook") return "embedded-webhook";
  if (normalized === "embedded-long-connection" || normalized === "long-connection" || normalized === "long_connection") return "embedded-long-connection";
  if (normalized === "standalone-runtime" || normalized === "standalone") return "standalone-runtime";
  if (normalized === "hybrid") return "hybrid";
  throw new Error('--host-mode must be "embedded-webhook", "embedded-long-connection", "hybrid", or "standalone-runtime".');
}

export function hostModeUsesWebhook(hostReceiveMode: HostReceiveMode): boolean {
  return hostReceiveMode === "embedded-webhook" || hostReceiveMode === "hybrid" || hostReceiveMode === "standalone-runtime";
}

export function hostModeUsesLongConnection(hostReceiveMode: HostReceiveMode): boolean {
  return hostReceiveMode === "embedded-long-connection" || hostReceiveMode === "hybrid";
}
