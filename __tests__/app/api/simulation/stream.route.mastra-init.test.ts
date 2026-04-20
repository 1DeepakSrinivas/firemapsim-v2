import { describe, expect, mock, test } from "bun:test";
import type { NextRequest } from "next/server";

const streamMock = mock(() => ({
  fullStream: (async function* () {
    yield { type: "noop" };
  })(),
  result: Promise.resolve({ result: { ok: true } }),
}));

const createRun = mock(async () => ({
  stream: streamMock,
}));

const getWorkflow = mock(() => ({
  createRun,
}));

const getMastra = mock(() => ({
  getWorkflow,
}));

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

mock.module("@/lib/user-store", () => ({
  upsertLocalUserFromClerk,
}));

mock.module("@clerk/nextjs/server", () => ({
  auth,
  currentUser,
}));

describe("/api/simulation/stream Mastra initialization", () => {
  test("does not initialize Mastra on import and initializes during GET", async () => {
    const route = await import("@/app/api/simulation/stream/route");

    expect(getMastra).toHaveBeenCalledTimes(0);

    const url =
      "http://localhost:3000/api/simulation/stream?lat=37.77&lng=-122.44";
    const request = new Request(url, { method: "GET" }) as Request & {
      nextUrl: URL;
    };
    request.nextUrl = new URL(url);

    const response = await route.GET(request as unknown as NextRequest);

    expect(response.status).toBe(200);
    expect(getMastra).toHaveBeenCalledTimes(1);
    expect(getWorkflow).toHaveBeenCalledWith("simulateWorkflow");

    await response.text();
    expect(streamMock).toHaveBeenCalledTimes(1);
  });
});
