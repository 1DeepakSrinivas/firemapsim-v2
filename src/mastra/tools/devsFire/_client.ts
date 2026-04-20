import "server-only";

import z from "zod";
import {
  DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS,
  parseTimeoutMs,
} from "./config";
import { devsFireRequest } from "@/lib/devsfire/httpClient";
import { DevsFireError } from "@/lib/devsfire/errors";

export {
  parseSimulationOperationsResponse,
  simulationOperationListSchema,
  simulationOperationSchema,
} from "./simulationOperations";

const DEVS_FIRE_CANONICAL_BASE_URL = "https://firesim.cs.gsu.edu/api";
const DEVS_FIRE_HOSTNAME = "firesim.cs.gsu.edu";

function normalizedPathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

function normalizeDevsFireBaseUrl(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate) {
    return DEVS_FIRE_CANONICAL_BASE_URL;
  }

  const withoutTrailingSlash = candidate.replace(/\/+$/, "");

  try {
    const parsed = new URL(withoutTrailingSlash);
    if (parsed.hostname === DEVS_FIRE_HOSTNAME) {
      const path = normalizedPathname(parsed.pathname);
      const isDeprecatedLegacyBase = parsed.port === "8084" && path === "/api";
      const isRootHost = path === "/";
      const isApiHost = path === "/api";

      if (isDeprecatedLegacyBase || isRootHost || isApiHost) {
        return DEVS_FIRE_CANONICAL_BASE_URL;
      }
    }
  } catch {
    // Keep non-URL values unchanged for explicit runtime visibility.
  }

  return withoutTrailingSlash;
}

export const DEVS_FIRE_BASE_URL = normalizeDevsFireBaseUrl(
  process.env.DEVS_FIRE_BASE_URL,
);
export const DEVS_FIRE_PROXY_PATH = "/api/devs-fire";

const DEVS_FIRE_REQUEST_TIMEOUT_MS = parseTimeoutMs(
  process.env.DEVS_FIRE_REQUEST_TIMEOUT_MS,
  DEFAULT_DEVS_FIRE_REQUEST_TIMEOUT_MS,
);

export const numericMatrixSchema = z.array(z.array(z.coerce.number()));

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

export type DevsFireConnectProbeClassification =
  | "success"
  | "upstream_timeout"
  | "upstream_unreachable"
  | "upstream_http_error"
  | "upstream_html_response"
  | "invalid_connect_payload";

export type DevsFireConnectProbeAttempt = {
  method: "POST" | "GET";
  url: string;
  elapsedMs: number;
  status?: number;
  location?: string;
  contentType?: string;
  tokenDetected: boolean;
  htmlLike: boolean;
  outcome: DevsFireConnectProbeClassification;
  preview?: string;
  error?: string;
};

export type DevsFireConnectProbeResult = {
  ok: boolean;
  baseUrl: string;
  classification: DevsFireConnectProbeClassification;
  attempts: DevsFireConnectProbeAttempt[];
  totalMs: number;
  error?: string;
};

const proxyEnvelopeSchema = z.object({
  data: z.unknown(),
});

const CONNECT_ATTEMPTS = [
  { method: "POST", path: "/connectToServer", body: "connect", contentType: "text/plain" },
  { method: "POST", path: "/connectToServer/", body: "connect", contentType: "text/plain" },
  { method: "GET", path: "/connectToServer" },
  { method: "GET", path: "/connectToServer/" },
] as const;

const DEFAULT_CONNECT_PROBE_TIMEOUT_MS = 30_000;

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

function looksLikeHtmlDocument(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return (
    trimmed.startsWith("<!doctype html") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<head") ||
    trimmed.startsWith("<body")
  );
}

function parseDevsFireResponse(text: string, endpoint: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    if (looksLikeHtmlDocument(text)) {
      throw new Error(
        `DEVS-FIRE returned HTML for ${endpoint}. Verify DEVS_FIRE_BASE_URL is an API host (expected ${DEVS_FIRE_CANONICAL_BASE_URL}).`,
      );
    }
    return text;
  }
}

function parseConnectToken(
  data: unknown,
): { token: string | null; htmlLike: boolean } {
  if (typeof data === "string") {
    const token = data.trim();
    if (!token) {
      return { token: null, htmlLike: false };
    }
    return { token, htmlLike: looksLikeHtmlDocument(token) };
  }

  if (data && typeof data === "object") {
    const value = data as Record<string, unknown>;
    const token = value.token ?? value.userToken;
    if (typeof token === "string") {
      const trimmed = token.trim();
      if (trimmed) {
        return { token: trimmed, htmlLike: looksLikeHtmlDocument(trimmed) };
      }
    }
  }

  return { token: null, htmlLike: false };
}

function parseMaybeJson(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function summarizeResponsePreview(text: string): string | undefined {
  if (!text) {
    return undefined;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, 300);
}

function classifyConnectProbeAttempts(
  attempts: DevsFireConnectProbeAttempt[],
): DevsFireConnectProbeClassification {
  if (attempts.some((attempt) => attempt.outcome === "success")) {
    return "success";
  }
  if (attempts.some((attempt) => attempt.outcome === "upstream_html_response")) {
    return "upstream_html_response";
  }
  if (attempts.some((attempt) => attempt.outcome === "upstream_http_error")) {
    return "upstream_http_error";
  }
  if (attempts.some((attempt) => attempt.outcome === "upstream_unreachable")) {
    return "upstream_unreachable";
  }
  if (attempts.some((attempt) => attempt.outcome === "upstream_timeout")) {
    return "upstream_timeout";
  }

  return "invalid_connect_payload";
}

function connectProbeErrorMessage(
  classification: DevsFireConnectProbeClassification,
): string | undefined {
  switch (classification) {
    case "success":
      return undefined;
    case "upstream_timeout":
      return "DEVS-FIRE connect probe timed out before receiving a token.";
    case "upstream_unreachable":
      return "DEVS-FIRE connect probe could not reach upstream.";
    case "upstream_http_error":
      return "DEVS-FIRE connect probe received a non-2xx HTTP response.";
    case "upstream_html_response":
      return "DEVS-FIRE connect probe received HTML instead of a token.";
    case "invalid_connect_payload":
      return "DEVS-FIRE connect probe did not find a token in any successful response.";
    default:
      return "DEVS-FIRE connect probe failed.";
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
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<unknown> {
  const endpointPath = `/api${normalizePath(path).replace(/\/$/, "")}`;
  const timeoutMs = Math.max(
    1_000,
    Math.floor(options?.timeoutMs ?? DEVS_FIRE_REQUEST_TIMEOUT_MS),
  );

  try {
    return await devsFireRequest({
      endpoint: path,
      userToken: token,
      query: extraParams,
      body,
      headers,
      timeoutMs,
      signal: options?.signal,
    });
  } catch (error) {
    if (error instanceof DevsFireError) {
      if (error.type === "TimeoutError") {
        throw new Error(
          `DEVS-FIRE request timed out after ${Math.floor(timeoutMs / 1000)}s for ${endpointPath}`,
        );
      }

      if (error.type === "ServerError" || error.type === "SimulationError") {
        throw new Error(
          `DEVS-FIRE request failed for ${endpointPath}: ${error.details ?? error.message}`,
        );
      }

      if (error.type === "ConnectionError") {
        throw new Error(`DEVS-FIRE request failed for ${endpointPath}: fetch failed`);
      }
    }

    throw error;
  }
}

export async function connectToDevsFire(): Promise<unknown> {
  const connectPath = "/connectToServer";
  try {
    return await devsFirePost(
      connectPath,
      undefined,
      {},
      "connect",
      { "Content-Type": "text/plain" },
    );
  } catch (error) {
    throw new Error(
      `DEVS-FIRE connectToServer failed for ${DEVS_FIRE_BASE_URL}${connectPath}: ${toErrorMessage(error)}`,
    );
  }
}

export async function probeDevsFireConnect(options?: {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<DevsFireConnectProbeResult> {
  const startedAt = Date.now();
  const baseUrl = normalizeDevsFireBaseUrl(options?.baseUrl ?? DEVS_FIRE_BASE_URL);
  const root = baseUrl.replace(/\/+$/, "");
  const timeoutMs = Math.max(
    1_000,
    Math.floor(options?.timeoutMs ?? DEFAULT_CONNECT_PROBE_TIMEOUT_MS),
  );
  const fetchImpl = options?.fetchImpl ?? fetch;
  const attempts: DevsFireConnectProbeAttempt[] = [];

  for (const attempt of CONNECT_ATTEMPTS) {
    const url = `${root}${attempt.path}`;
    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const requestHeaders = new Headers({ Accept: "application/json" });
      if ("contentType" in attempt && attempt.contentType) {
        requestHeaders.set("Content-Type", attempt.contentType);
      }

      const response = await fetchImpl(url, {
        method: attempt.method,
        headers: requestHeaders,
        body:
          attempt.method === "POST" && "body" in attempt
            ? attempt.body
            : undefined,
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });

      const text = await response.text();
      const parsed = parseMaybeJson(text);
      const parsedToken = parseConnectToken(parsed);
      const tokenDetected =
        response.ok && Boolean(parsedToken.token) && !parsedToken.htmlLike;
      const htmlLike =
        response.ok && (parsedToken.htmlLike || looksLikeHtmlDocument(text));

      let outcome: DevsFireConnectProbeClassification;
      if (!response.ok) {
        outcome = "upstream_http_error";
      } else if (tokenDetected) {
        outcome = "success";
      } else if (htmlLike) {
        outcome = "upstream_html_response";
      } else {
        outcome = "invalid_connect_payload";
      }

      attempts.push({
        method: attempt.method,
        url,
        elapsedMs: Date.now() - attemptStartedAt,
        status: response.status,
        location: response.headers.get("location") ?? undefined,
        contentType: response.headers.get("content-type") ?? undefined,
        tokenDetected,
        htmlLike,
        outcome,
        preview: summarizeResponsePreview(text),
      });
    } catch (error) {
      const message = toErrorMessage(error);
      const timedOut =
        (error as { name?: string })?.name === "AbortError" ||
        message.toLowerCase().includes("timed out") ||
        message.toLowerCase().includes("timeout") ||
        message.toLowerCase().includes("abort");

      attempts.push({
        method: attempt.method,
        url,
        elapsedMs: Date.now() - attemptStartedAt,
        tokenDetected: false,
        htmlLike: false,
        outcome: timedOut ? "upstream_timeout" : "upstream_unreachable",
        error: message,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const classification = classifyConnectProbeAttempts(attempts);
  const ok = classification === "success";

  return {
    ok,
    baseUrl,
    classification,
    attempts,
    totalMs: Date.now() - startedAt,
    error: connectProbeErrorMessage(classification),
  };
}
