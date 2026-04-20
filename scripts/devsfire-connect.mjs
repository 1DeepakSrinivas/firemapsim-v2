#!/usr/bin/env bun
/**
 * Direct upstream connectivity check for DEVS-FIRE.
 *
 * Usage:
 *   bun scripts/devsfire-connect.mjs
 *   bun scripts/devsfire-connect.mjs --json
 *   bun scripts/devsfire-connect.mjs "https://firesim.cs.gsu.edu/api"
 *
 * Exits 0 if a token is returned, otherwise exits 1.
 */

/** Matches DEVS_FIRE_CANONICAL_BASE_URL in src/mastra/tools/devsFire/_client.ts */
const DEFAULT_BASE = "https://firesim.cs.gsu.edu/api";
const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeBase(url) {
  const trimmed = (url ?? "").trim();
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  if (!withoutTrailingSlash) return DEFAULT_BASE;

  try {
    const parsed = new URL(withoutTrailingSlash);
    if (parsed.hostname === "firesim.cs.gsu.edu") {
      const path = parsed.pathname.replace(/\/+$/, "") || "/";
      const isDeprecatedLegacyBase = parsed.port === "8084" && path === "/api";
      const isRootHost = path === "/";
      if (isDeprecatedLegacyBase || isRootHost) return DEFAULT_BASE;
    }
  } catch {
    // Keep user-provided value if parsing fails.
  }

  return withoutTrailingSlash;
}

function parseToken(json) {
  if (typeof json === "string" && json.trim()) return json.trim();
  if (json && typeof json === "object") {
    const token = json.userToken ?? json.token;
    if (typeof token === "string" && token.trim()) return token.trim();
  }
  return null;
}

function looksLikeHtml(value) {
  const trimmed = (value ?? "").trimStart().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

function parseMaybeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function classifyFinal(attempts) {
  if (attempts.some((attempt) => attempt.outcome === "success")) return "success";
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

function errorForClassification(classification) {
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

function parseArgs(argv) {
  const args = { json: false, base: DEFAULT_BASE };
  let baseCandidate;

  for (const arg of argv) {
    if (arg === "--json" || arg === "-j") {
      args.json = true;
      continue;
    }
    if (!baseCandidate) {
      baseCandidate = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  args.base = normalizeBase(baseCandidate ?? DEFAULT_BASE);
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.base.replace(/\/+$/, "");
  const startedAt = Date.now();
  const attempts = [
    { method: "POST", path: "/connectToServer", body: "connect", contentType: "text/plain" },
    { method: "POST", path: "/connectToServer/", body: "connect", contentType: "text/plain" },
    { method: "GET", path: "/connectToServer" },
    { method: "GET", path: "/connectToServer/" },
  ];
  const attemptResults = [];

  for (const attempt of attempts) {
    const url = `${root}${attempt.path}`;
    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: attempt.method,
        headers: {
          accept: "application/json",
          ...(attempt.contentType ? { "content-type": attempt.contentType } : {}),
        },
        body: attempt.method === "POST" ? attempt.body : undefined,
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });

      const text = await res.text();
      const parsed = parseMaybeJson(text);
      const token = parseToken(parsed);
      const tokenDetected = res.ok && Boolean(token) && !looksLikeHtml(token);
      const htmlLike = res.ok && ((token && looksLikeHtml(token)) || looksLikeHtml(text));
      const preview = text.trim() ? text.trim().slice(0, 300) : undefined;

      let outcome = "invalid_connect_payload";
      if (!res.ok) {
        outcome = "upstream_http_error";
      } else if (tokenDetected) {
        outcome = "success";
      } else if (htmlLike) {
        outcome = "upstream_html_response";
      }

      attemptResults.push({
        method: attempt.method,
        url,
        elapsedMs: Date.now() - attemptStartedAt,
        status: res.status,
        location: res.headers.get("location") ?? undefined,
        contentType: res.headers.get("content-type") ?? undefined,
        tokenDetected,
        htmlLike,
        outcome,
        preview,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
      const timedOut =
        (err && typeof err === "object" && err.name === "AbortError") ||
        /timed out|timeout|abort/i.test(message);

      attemptResults.push({
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

  const classification = classifyFinal(attemptResults);
  const report = {
    ok: classification === "success",
    baseUrl: args.base,
    classification,
    attempts: attemptResults,
    totalMs: Date.now() - startedAt,
    error: errorForClassification(classification),
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`baseUrl: ${report.baseUrl}`);
    console.log(`classification: ${report.classification}`);
    console.log(`ok: ${report.ok}`);
    for (const attempt of report.attempts) {
      const statusText = typeof attempt.status === "number" ? `${attempt.status}` : "n/a";
      console.log(
        `attempt: ${attempt.method} ${attempt.url} | outcome=${attempt.outcome} | status=${statusText} | elapsedMs=${attempt.elapsedMs}`,
      );
      if (attempt.error) {
        console.log(`  error: ${attempt.error}`);
      }
      if (attempt.location) {
        console.log(`  location: ${attempt.location}`);
      }
      if (attempt.contentType) {
        console.log(`  contentType: ${attempt.contentType}`);
      }
      if (attempt.preview && attempt.outcome !== "success") {
        console.log(`  preview: ${attempt.preview}`);
      }
    }
    if (report.error) {
      console.log(`error: ${report.error}`);
    }
    console.log(`totalMs: ${report.totalMs}`);
  }

  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
