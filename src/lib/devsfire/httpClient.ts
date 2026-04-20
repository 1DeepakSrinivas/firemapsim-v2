import "server-only";

import {
  DEVS_FIRE_BASE_URL,
  DEVS_FIRE_TIMEOUT_MS,
  DEFAULT_DEVS_FIRE_RETRIES,
} from "@/lib/devsfire/config";
import {
  classifyUnknownError,
  DevsFireError,
  toErrorMessage,
} from "@/lib/devsfire/errors";

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

type DevsFireRequestInput = {
  endpoint: string;
  method?: "POST" | "GET";
  userToken?: string;
  query?: QueryParams;
  body?: unknown;
  headers?: HeadersInit;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
};

function normalizeEndpoint(endpoint: string): string {
  if (!endpoint.startsWith("/")) {
    return `/${endpoint}`;
  }
  return endpoint;
}

function toBodyAndHeaders(
  body: unknown,
  headers: Headers,
): { body?: BodyInit; headers: Headers } {
  if (body === undefined || body === null) {
    return { headers };
  }

  if (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream
  ) {
    return { body, headers };
  }

  if (!headers.get("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return { body: JSON.stringify(body), headers };
}

function looksLikeHtml(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return (
    trimmed.startsWith("<!doctype html") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<head") ||
    trimmed.startsWith("<body")
  );
}

function parseResponseBody(text: string, endpoint: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    if (looksLikeHtml(text)) {
      throw new DevsFireError({
        type: "SimulationError",
        message: `DEVS-FIRE returned HTML for ${endpoint}.`,
        details: text.slice(0, 300),
      });
    }
    return text;
  }
}

function shouldRetry(error: DevsFireError): boolean {
  return (
    error.type === "ConnectionError" ||
    error.type === "TimeoutError" ||
    error.type === "ServerError"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function devsFireRequest(input: DevsFireRequestInput): Promise<unknown> {
  const endpoint = normalizeEndpoint(input.endpoint);
  const url = new URL(`${DEVS_FIRE_BASE_URL}${endpoint}`);
  const query = input.query ?? {};

  if (input.userToken) {
    url.searchParams.set("userToken", input.userToken);
  }

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeoutMs = Math.max(1_000, Math.floor(input.timeoutMs ?? DEVS_FIRE_TIMEOUT_MS));
  const retries = Math.max(1, Math.floor(input.retries ?? DEFAULT_DEVS_FIRE_RETRIES));
  const requestHeaders = new Headers(input.headers);
  const requestBody = toBodyAndHeaders(input.body, requestHeaders);

  let lastError: DevsFireError | null = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let removeAbortListener: (() => void) | null = null;
    if (input.signal) {
      if (input.signal.aborted) {
        controller.abort();
      } else {
        const onAbort = () => controller.abort();
        input.signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => input.signal?.removeEventListener("abort", onAbort);
      }
    }

    try {
      const response = await fetch(url, {
        method: input.method ?? "POST",
        headers: requestBody.headers,
        body: requestBody.body,
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });
      const text = await response.text();

      if (response.status >= 500) {
        throw new DevsFireError({
          type: "ServerError",
          message: `DEVS-FIRE server error for ${endpoint}.`,
          details: `${response.status} ${response.statusText} ${text.slice(0, 300)}`.trim(),
          status: response.status,
        });
      }

      if (!response.ok) {
        throw new DevsFireError({
          type: "SimulationError",
          message: `DEVS-FIRE rejected request for ${endpoint}.`,
          details: `${response.status} ${response.statusText} ${text.slice(0, 300)}`.trim(),
          status: response.status,
        });
      }

      return parseResponseBody(text, endpoint);
    } catch (error) {
      const classified =
        error instanceof DevsFireError
          ? error
          : (error as { name?: string })?.name === "AbortError"
            ? new DevsFireError({
                type: "TimeoutError",
                message: `DEVS-FIRE request timed out for ${endpoint}.`,
                details: `timeout=${timeoutMs}ms`,
                causeValue: error,
              })
            : classifyUnknownError(error, `DEVS-FIRE request failed for ${endpoint}.`);

      lastError = classified;
      const retryable = attempt < retries && shouldRetry(classified);
      if (!retryable) {
        break;
      }
      await sleep(250 * attempt);
    } finally {
      clearTimeout(timeoutId);
      removeAbortListener?.();
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new DevsFireError({
    type: "UnknownError",
    message: `DEVS-FIRE request failed for ${input.endpoint}.`,
    details: toErrorMessage(lastError),
  });
}
