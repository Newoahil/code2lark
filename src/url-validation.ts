export interface PublicCallbackAssessment {
  normalizedBaseUrl: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  canProbe: boolean;
}

export function normalizeUrlBase(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function requireHttpBaseUrl(value: string, key: string): string {
  const normalized = normalizeUrlBase(value);
  if (!normalized) return "";
  const parsed = parseHttpUrl(normalized);
  if (!parsed) {
    throw new Error(`${key} must be an absolute http(s) URL.`);
  }
  return normalizeUrlBase(parsed.toString());
}

export function assessPublicCallbackBaseUrl(
  value: string,
  options: { level2: boolean; allowLocalCallback: boolean },
): PublicCallbackAssessment {
  const normalized = normalizeUrlBase(value);
  if (!normalized) {
    return {
      normalizedBaseUrl: "",
      status: "warn",
      detail: "missing; required to configure Feishu card callback for real Level 2 verification",
      canProbe: false,
    };
  }

  const parsed = parseHttpUrl(normalized);
  if (!parsed) {
    return {
      normalizedBaseUrl: normalized,
      status: "fail",
      detail: "PUBLIC_CALLBACK_BASE_URL must be an absolute http(s) URL.",
      canProbe: false,
    };
  }

  const normalizedBaseUrl = normalizeUrlBase(parsed.toString());
  const hostType = classifyHost(parsed.hostname);
  if (hostType !== "public") {
    if (options.allowLocalCallback) {
      return {
        normalizedBaseUrl,
        status: "pass",
        detail: `Local/private callback URL ${normalizedBaseUrl}/webhook/card accepted because --allow-local-callback was set. Use a public HTTPS URL for real Feishu verification.`,
        canProbe: true,
      };
    }
    return {
      normalizedBaseUrl,
      status: options.level2 ? "fail" : "warn",
      detail: `PUBLIC_CALLBACK_BASE_URL points to ${hostType} host ${parsed.hostname}. Feishu cannot reach it directly; use a public HTTPS tunnel/domain, or --allow-local-callback only for local mock verification.`,
      canProbe: false,
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      normalizedBaseUrl,
      status: options.level2 ? "fail" : "warn",
      detail: "PUBLIC_CALLBACK_BASE_URL should use HTTPS for real Feishu webhook verification.",
      canProbe: !options.level2,
    };
  }

  return {
    normalizedBaseUrl,
    status: "pass",
    detail: `${normalizedBaseUrl}/webhook/card`,
    canProbe: true,
  };
}

export function publicCallbackWarnings(value: string): string[] {
  const normalized = normalizeUrlBase(value);
  if (!normalized) return [];
  const parsed = parseHttpUrl(normalized);
  if (!parsed) return ["PUBLIC_CALLBACK_BASE_URL is set but is not an absolute http(s) URL."];
  const hostType = classifyHost(parsed.hostname);
  const warnings: string[] = [];
  if (hostType !== "public") {
    warnings.push(`PUBLIC_CALLBACK_BASE_URL points to ${hostType} host ${parsed.hostname}; Feishu needs a public callback URL for real Level 2 verification.`);
  }
  if (parsed.protocol !== "https:") {
    warnings.push("PUBLIC_CALLBACK_BASE_URL should use HTTPS for real Feishu webhook verification.");
  }
  return warnings;
}

function parseHttpUrl(value: string): URL | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    if (!parsed.hostname) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function classifyHost(hostname: string): "public" | "local" | "private" {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host === "::1" || host === "0.0.0.0" || host.startsWith("127.")) {
    return "local";
  }
  if (host.endsWith(".local")) return "local";
  if (isPrivateIpv4(host) || host.startsWith("fc") || host.startsWith("fd")) {
    return "private";
  }
  return "public";
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = parts;
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 169 && second === 254);
}
