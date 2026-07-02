export interface ProbeResult {
  status: "available" | "unavailable" | "not_checked";
  detail: string;
  data?: unknown;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function getJsonWithTimeout(
  url: string,
  timeoutMs = 4000,
  headers: Record<string, string> = {},
): Promise<ProbeResult> {
  if (!url) {
    return { status: "not_checked", detail: "No base URL was provided." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      return {
        status: "unavailable",
        detail: `GET ${url} returned HTTP ${response.status}.`,
        data,
      };
    }

    return {
      status: "available",
      detail: `GET ${url} returned HTTP ${response.status}.`,
      data,
    };
  } catch (error) {
    return {
      status: "unavailable",
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function postJsonWithTimeout(
  url: string,
  payload: unknown,
  timeoutMs = 10000,
  headers: Record<string, string> = {},
): Promise<ProbeResult> {
  if (!url) {
    return { status: "not_checked", detail: "No URL was provided." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      return {
        status: "unavailable",
        detail: `POST ${url} returned HTTP ${response.status}.`,
        data,
      };
    }

    return {
      status: "available",
      detail: `POST ${url} returned HTTP ${response.status}.`,
      data,
    };
  } catch (error) {
    return {
      status: "unavailable",
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}
