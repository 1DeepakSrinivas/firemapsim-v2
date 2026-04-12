import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import { upsertLocalUserFromClerk } from "@/lib/user-store";
import { mastra } from "@/mastra";
import type { SimulateWorkflowInput } from "@/mastra/workflows/simulate";

export const runtime = "nodejs";

function jsonSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseQueryAsInput(searchParams: URLSearchParams): SimulateWorkflowInput {
  const address = searchParams.get("address") ?? undefined;
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const simulationHours = searchParams.get("simulationHours");
  const radiusMeters = searchParams.get("radiusMeters");
  const userToken = searchParams.get("userToken") ?? undefined;

  return {
    address,
    lat: lat ? Number(lat) : undefined,
    lng: lng ? Number(lng) : undefined,
    simulationHours: simulationHours ? Number(simulationHours) : 24,
    radiusMeters: radiusMeters ? Number(radiusMeters) : 250,
    userToken,
  };
}

export async function GET(request: NextRequest) {
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
    const input = parseQueryAsInput(request.nextUrl.searchParams);
    const workflow = mastra.getWorkflow("simulateWorkflow");
    const run = await workflow.createRun({ resourceId: userId });
    const output = run.stream({ inputData: input, closeOnSuspend: true });

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of output.fullStream as any) {
            controller.enqueue(
              encoder.encode(jsonSseEvent("simulation-event", event)),
            );
          }

          const result = await output.result;
          controller.enqueue(encoder.encode(jsonSseEvent("simulation-result", result)));
          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          controller.enqueue(
            encoder.encode(jsonSseEvent("simulation-error", { error: message })),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
