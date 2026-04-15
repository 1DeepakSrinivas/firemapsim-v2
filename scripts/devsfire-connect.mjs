#!/usr/bin/env bun
/**
 * Direct upstream connectivity check for DEVS-FIRE.
 *
 * Usage:
 *   bun scripts/devsfire-connect.mjs
 *   bun scripts/devsfire-connect.mjs "https://firesim.cs.gsu.edu/api"
 *
 * Exits 0 if a token is returned, otherwise exits 1.
 */

const CANONICAL_BASE = "https://firesim.cs.gsu.edu/api";

function normalizeBase(url) {
  const trimmed = (url ?? "").trim();
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  if (!withoutTrailingSlash) return CANONICAL_BASE;

  try {
    const parsed = new URL(withoutTrailingSlash);
    if (parsed.hostname === "firesim.cs.gsu.edu") {
      const path = parsed.pathname.replace(/\/+$/, "") || "/";
      const isDeprecatedLegacyBase = parsed.port === "8084" && path === "/api";
      const isRootHost = path === "/";
      const isApiHost = path === "/api";
      if (isDeprecatedLegacyBase || isRootHost || isApiHost) return CANONICAL_BASE;
    }
  } catch {
    // Keep user-provided value if parsing fails.
  }

  return withoutTrailingSlash;
}

const base = normalizeBase(process.argv[2] ?? CANONICAL_BASE);

function parseToken(json) {
  if (typeof json === "string" && json.trim()) return json.trim();
  if (json && typeof json === "object") {
    const token = json.userToken ?? json.token;
    if (typeof token === "string" && token.trim()) return token.trim();
  }
  return null;
}

async function main() {
  const url = `${base.replace(/\/$/, "")}/connectToServer`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "text/plain",
      },
      body: "testtest",
      signal: controller.signal,
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Upstream might return plain text; keep `text`.
    }

    const token = parseToken(json ?? text);

    const htmlLike =
      typeof token === "string" &&
      (/^\s*<!doctype html/i.test(token) || /^\s*<html/i.test(token));

    console.log("url", url);
    console.log("status", res.status);
    if (token && !htmlLike) {
      console.log("userToken", token);
      process.exit(0);
    }

    console.log("response", (json ?? text ?? "").toString().slice(0, 500));
    process.exit(1);
  } finally {
    clearTimeout(timeoutId);
  }
}

main().catch((err) => {
  console.error(err?.name === "AbortError" ? "Timed out after 30s" : err);
  process.exit(1);
});
