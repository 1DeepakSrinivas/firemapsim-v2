import { NextResponse } from "next/server";

import {
  DEVS_FIRE_BASE_URL,
  devsFirePost,
  toErrorMessage,
} from "@/mastra/tools/devsFire/_client";

export const runtime = "nodejs";

function parseToken(data: unknown): string {
  const isHtmlLikeToken = (value: string): boolean => {
    const trimmed = value.trimStart().toLowerCase();
    return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
  };

  if (typeof data === "string") {
    const token = data.trim();
    if (token.length > 0) {
      if (isHtmlLikeToken(token)) {
        throw new Error(
          "connectToServer returned HTML instead of token; check DEVS_FIRE_BASE_URL (expected https://firesim.cs.gsu.edu/api).",
        );
      }
      return token;
    }
  }

  if (data && typeof data === "object") {
    const value = data as Record<string, unknown>;
    const token = value.token ?? value.userToken;
    if (typeof token === "string" && token.trim().length > 0) {
      const trimmed = token.trim();
      if (isHtmlLikeToken(trimmed)) {
        throw new Error(
          "connectToServer returned HTML instead of token; check DEVS_FIRE_BASE_URL (expected https://firesim.cs.gsu.edu/api).",
        );
      }
      return trimmed;
    }
  }

  throw new Error("connectToServer response did not include a token");
}

function classifySmokeError(error: unknown): {
  code: string;
  message: string;
  status: number;
} {
  const message = toErrorMessage(error);
  const lower = message.toLowerCase();

  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("abort")) {
    return {
      code: "upstream_timeout",
      message,
      status: 504,
    };
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network")
  ) {
    return {
      code: "upstream_unreachable",
      message,
      status: 502,
    };
  }

  if (lower.includes("request failed")) {
    return {
      code: "upstream_http_error",
      message,
      status: 502,
    };
  }

  return {
    code: "smoke_failed",
    message,
    status: 500,
  };
}

/**
 * Minimal DEVS-FIRE connectivity probe.
 * Makes the bare minimum upstream call (connectToServer) and returns token shape diagnostics.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    const connectStartedAt = Date.now();
    const raw = await devsFirePost(
      "/connectToServer",
      undefined,
      {},
      "connect",
      { "Content-Type": "text/plain" },
    );
    const token = parseToken(raw);

    return NextResponse.json({
      ok: true,
      baseUrl: DEVS_FIRE_BASE_URL,
      stage: "connect",
      latencyMs: Date.now() - connectStartedAt,
      totalMs: Date.now() - startedAt,
      tokenLength: token.length,
      tokenPreview: `${token.slice(0, 8)}...`,
    });
  } catch (error) {
    const classified = classifySmokeError(error);
    return NextResponse.json(
      {
        ok: false,
        baseUrl: DEVS_FIRE_BASE_URL,
        stage: "connect",
        code: classified.code,
        error: classified.message,
        totalMs: Date.now() - startedAt,
      },
      { status: classified.status },
    );
  }
}
