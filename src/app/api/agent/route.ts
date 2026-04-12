import { handleChatStream } from "@mastra/ai-sdk";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

import { mastra } from "@/mastra";
import { upsertLocalUserFromClerk } from "@/lib/user-store";

const requestSchema = z
  .object({
    prompt: z.string().min(1).optional(),
    messages: z.array(z.unknown()).optional(),
    threadId: z.string().min(1).optional(),
    trigger: z.string().optional(),
    messageId: z.string().optional(),
    id: z.string().optional(),
  })
  .passthrough();

export const runtime = "nodejs";

function parseChatTrigger(
  value: string | undefined,
): "submit-message" | "regenerate-message" | undefined {
  if (value === "submit-message" || value === "regenerate-message") {
    return value;
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clerkUser = await currentUser();
  await upsertLocalUserFromClerk({
    clerkUserId: userId,
    username: clerkUser?.username ?? null,
    email: clerkUser?.primaryEmailAddress?.emailAddress ?? null,
    name:
      [clerkUser?.firstName, clerkUser?.lastName]
        .filter(Boolean)
        .join(" ") || clerkUser?.username || null,
    imageUrl: clerkUser?.imageUrl ?? null,
  });

  try {
    const body = requestSchema.parse(await request.json());

    let messages = body.messages as UIMessage[] | undefined;
    if (!messages?.length && body.prompt) {
      messages = [
        {
          id: crypto.randomUUID(),
          role: "user",
          parts: [{ type: "text", text: body.prompt }],
        },
      ];
    }

    if (!messages?.length) {
      return NextResponse.json(
        { error: "Provide either messages[] or prompt." },
        { status: 400 },
      );
    }

    const thread = body.threadId ?? `thread-${crypto.randomUUID()}`;

    const uiStream = await handleChatStream({
      mastra,
      agentId: "firesim-agent",
      version: "v6",
      params: {
        messages,
        trigger: parseChatTrigger(body.trigger),
      },
      defaultOptions: {
        memory: {
          thread,
          resource: userId,
        },
      },
    });

    return createUIMessageStreamResponse({
      stream: uiStream as Parameters<
        typeof createUIMessageStreamResponse
      >[0]["stream"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
