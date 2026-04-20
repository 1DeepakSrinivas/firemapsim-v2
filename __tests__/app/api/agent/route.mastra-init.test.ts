import { describe, expect, mock, test } from "bun:test";
import type { NextRequest } from "next/server";

const mastraStub = { id: "mastra-stub" };
const getMastra = mock(() => mastraStub);
const handleChatStream = mock(async () => "mock-stream");
const createUIMessageStreamResponse = mock(() => new Response("ok"));
const upsertLocalUserFromClerk = mock(async () => undefined);
const auth = mock(async () => ({ userId: "user_123" }));
const currentUser = mock(async () => ({
  username: "demo",
  primaryEmailAddress: { emailAddress: "demo@example.com" },
  firstName: "Demo",
  lastName: "User",
  imageUrl: null,
}));

mock.module("@/mastra", () => ({
  getMastra,
}));

mock.module("@mastra/ai-sdk", () => ({
  handleChatStream,
}));

mock.module("ai", () => ({
  createUIMessageStreamResponse,
}));

mock.module("@/lib/user-store", () => ({
  upsertLocalUserFromClerk,
}));

mock.module("@clerk/nextjs/server", () => ({
  auth,
  currentUser,
}));

describe("/api/agent Mastra initialization", () => {
  test("does not initialize Mastra on import and initializes during POST", async () => {
    const route = await import("@/app/api/agent/route");

    expect(getMastra).toHaveBeenCalledTimes(0);

    const request = new Request("http://localhost:3000/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Hello agent" }),
      }) as unknown as NextRequest;

    const response = await route.POST(request);

    expect(response.status).toBe(200);
    expect(getMastra).toHaveBeenCalledTimes(1);
    expect(handleChatStream).toHaveBeenCalledTimes(1);
    const allCalls = handleChatStream.mock.calls as unknown as unknown[][];
    const firstCall = allCalls[0];
    const chatArgs = firstCall?.[0] as
      | { defaultOptions?: { memory?: unknown } }
      | undefined;
    expect(chatArgs?.defaultOptions?.memory).toBeUndefined();
  });
});
