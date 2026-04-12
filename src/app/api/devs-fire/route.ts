import { NextRequest, NextResponse } from "next/server";
import z from "zod";

import { devsFirePost, toErrorMessage } from "@/mastra/tools/devsFire/_client";

/** Upstream GSU server can be slow; abort avoids hanging the Next.js handler indefinitely. */
const DEVS_FIRE_PROXY_TIMEOUT_MS = 120_000;

const queryValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const requestSchema = z.object({
  path: z.string().min(1),
  token: z.string().optional(),
  params: z.record(z.string(), queryValueSchema).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const payload = requestSchema.parse(json);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEVS_FIRE_PROXY_TIMEOUT_MS);

    let data: unknown;
    try {
      data = await devsFirePost(
        payload.path,
        payload.token,
        payload.params ?? {},
        payload.body,
        payload.headers ?? {},
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        {
          error: `DEVS-FIRE request timed out after ${DEVS_FIRE_PROXY_TIMEOUT_MS / 1000}s.`,
        },
        { status: 504 },
      );
    }
    const message = toErrorMessage(error);
    const upstreamOrNetwork =
      message.includes("DEVS-FIRE request failed") || message.includes("fetch failed");
    return NextResponse.json(
      { error: message },
      { status: upstreamOrNetwork ? 502 : 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST for DEVS-FIRE proxy requests." },
    { status: 405 },
  );
}
