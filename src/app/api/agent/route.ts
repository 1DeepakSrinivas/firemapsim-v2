import { NextRequest, NextResponse } from "next/server";
import z from "zod";

import { getSession } from "@/lib/auth";
import { mastra } from "@/mastra";

const requestSchema = z.object({
  prompt: z.string().min(1).optional(),
  messages: z.array(z.unknown()).optional(),
  threadId: z.string().min(1).optional(),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = requestSchema.parse(await request.json());
    const input = body.messages && body.messages.length > 0 ? body.messages : body.prompt;

    if (!input) {
      return NextResponse.json(
        { error: "Provide either messages[] or prompt." },
        { status: 400 },
      );
    }

    const agent = mastra.getAgent("fireSimAgent");
    const stream = await agent.stream(input as any, {
      memory: {
        thread: body.threadId ?? `thread-${crypto.randomUUID()}`,
        resource: session.user.id,
      },
    });

    const dataStreamResponse = (stream as any).toDataStreamResponse;
    if (typeof dataStreamResponse === "function") {
      return dataStreamResponse.call(stream);
    }

    const textStreamResponse = (stream as any).toTextStreamResponse;
    if (typeof textStreamResponse === "function") {
      return textStreamResponse.call(stream);
    }

    return NextResponse.json(
      { error: "Streaming response adapter not available." },
      { status: 500 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
