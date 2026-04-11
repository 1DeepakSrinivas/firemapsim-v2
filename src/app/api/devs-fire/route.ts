import { NextRequest, NextResponse } from "next/server";
import z from "zod";

import { devsFirePost, toErrorMessage } from "@/mastra/tools/devsFire/_client";

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

    const data = await devsFirePost(
      payload.path,
      payload.token,
      payload.params ?? {},
      payload.body,
      payload.headers ?? {},
    );

    return NextResponse.json({ data });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: toErrorMessage(error) }, { status });
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST for DEVS-FIRE proxy requests." },
    { status: 405 },
  );
}
