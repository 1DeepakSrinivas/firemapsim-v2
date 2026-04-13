import "server-only";

import z from "zod";

export {
  parseSimulationOperationsResponse,
  simulationOperationListSchema,
  simulationOperationSchema,
} from "./simulationOperations";

export const DEVS_FIRE_BASE_URL =
  process.env.DEVS_FIRE_BASE_URL ?? "http://firesim.cs.gsu.edu:8084/api";
export const DEVS_FIRE_PROXY_PATH = "/api/devs-fire";

function parseTimeoutMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const DEVS_FIRE_REQUEST_TIMEOUT_MS = parseTimeoutMs(
  process.env.DEVS_FIRE_REQUEST_TIMEOUT_MS,
  30_000,
);

export const numericMatrixSchema = z.array(z.array(z.coerce.number()));

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

const proxyEnvelopeSchema = z.object({
  data: z.unknown(),
});

function normalizePath(path: string): string {
  if (path.startsWith("/")) {
    return path;
  }

  return `/${path}`;
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

  const contentType = headers.get("Content-Type");
  if (!contentType) {
    headers.set("Content-Type", "application/json");
  }

  return { body: JSON.stringify(body), headers };
}

function parseDevsFireResponse(text: string, endpoint: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function parseDevsFireData<T>(
  schema: z.ZodType<T>,
  data: unknown,
  endpoint: string,
): T {
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    throw new Error(
      `Invalid DEVS-FIRE response for ${endpoint}: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export function parseNumericResponse(data: unknown, endpoint: string): number {
  const direct = z.coerce.number().safeParse(data);
  if (direct.success) {
    return direct.data;
  }

  if (typeof data === "object" && data !== null) {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const nested = z.coerce.number().safeParse(value);
      if (nested.success) {
        return nested.data;
      }
    }
  }

  throw new Error(`Invalid numeric DEVS-FIRE response for ${endpoint}`);
}

export function parseStringArrayResponse(
  data: unknown,
  endpoint: string,
): string[] {
  const direct = z.array(z.string()).safeParse(data);
  if (direct.success) {
    return direct.data;
  }

  if (typeof data === "object" && data !== null) {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const nested = z.array(z.string()).safeParse(value);
      if (nested.success) {
        return nested.data;
      }
    }
  }

  throw new Error(`Invalid string[] DEVS-FIRE response for ${endpoint}`);
}

export function parseNumericMatrixResponse(
  data: unknown,
  endpoint: string,
): number[][] {
  const direct = numericMatrixSchema.safeParse(data);
  if (direct.success) {
    return direct.data;
  }

  if (typeof data === "object" && data !== null) {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const nested = numericMatrixSchema.safeParse(value);
      if (nested.success) {
        return nested.data;
      }
    }
  }

  throw new Error(`Invalid numeric matrix DEVS-FIRE response for ${endpoint}`);
}

export function getDevsFireProxyUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000";

  return `${appUrl}${DEVS_FIRE_PROXY_PATH}`;
}

/**
 * Browser-oriented proxy: POSTs to this app's `/api/devs-fire`.
 * Server-side code (Mastra tools, workflows, `executeDevsFireSimulation`) should use
 * {@link devsFirePost} directly to avoid relying on `NEXT_PUBLIC_APP_URL` self-fetch.
 */
export async function devsFireProxyPost(
  path: string,
  token?: string,
  extraParams: QueryParams = {},
  body?: unknown,
  headers: HeadersInit = {},
): Promise<unknown> {
  const response = await fetch(getDevsFireProxyUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path,
      token,
      params: extraParams,
      body,
      headers,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Proxy request failed (${response.status} ${response.statusText}): ${detail.slice(0, 300)}`,
    );
  }

  const json = await response.json();
  const parsed = proxyEnvelopeSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(`Invalid proxy response envelope: ${parsed.error.message}`);
  }

  return parsed.data.data;
}

export async function devsFirePost(
  path: string,
  token?: string,
  extraParams: QueryParams = {},
  body?: unknown,
  headers: HeadersInit = {},
  options?: { signal?: AbortSignal },
): Promise<unknown> {
  const url = new URL(`${DEVS_FIRE_BASE_URL}${normalizePath(path)}`);

  if (token) {
    url.searchParams.set("userToken", token);
  }

  for (const [key, value] of Object.entries(extraParams)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const requestHeaders = new Headers(headers);
  const requestParts = toBodyAndHeaders(body, requestHeaders);

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    Math.max(1_000, DEVS_FIRE_REQUEST_TIMEOUT_MS),
  );

  let removeAbortListener: (() => void) | null = null;
  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      const onAbort = () => controller.abort();
      options.signal.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () => options.signal?.removeEventListener("abort", onAbort);
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: requestParts.headers,
      body: requestParts.body,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw new Error(
        `DEVS-FIRE request timed out after ${Math.floor(DEVS_FIRE_REQUEST_TIMEOUT_MS / 1000)}s for ${url.pathname}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    removeAbortListener?.();
  }

  const responseText = await response.text();

  if (!response.ok) {
    const detail = responseText ? ` - ${responseText.slice(0, 300)}` : "";
    throw new Error(
      `DEVS-FIRE request failed for ${url.pathname}: ${response.status} ${response.statusText}${detail}`,
    );
  }

  return parseDevsFireResponse(responseText, url.pathname);
}
