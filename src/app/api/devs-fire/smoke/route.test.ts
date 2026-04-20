import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

let connectBehavior: () => Promise<{ token: string }> = async () => ({
  token: "token-12345678",
});

mock.module("@/lib/devsfire/endpoints", () => ({
  connectToServer: () => connectBehavior(),
}));

mock.module("@/lib/devsfire/routeHandlers", () => ({
  ensureAuthedUser: async () => "user_123",
}));

async function callSmoke() {
  const { GET } = await import("./route");
  return GET(new Request("http://localhost:3000/api/devs-fire/smoke"));
}

describe("/api/devs-fire/smoke", () => {
  test("returns envelope success payload", async () => {
    connectBehavior = async () => ({ token: "token-12345678" });

    const response = await callSmoke();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBeTrue();
    expect(body.data.baseUrl).toBe("https://firesim.cs.gsu.edu/api");
    expect(body.data.stage).toBe("connect");
    expect(typeof body.data.latencyMs).toBe("number");
    expect(typeof body.data.totalMs).toBe("number");
    expect(body.data.tokenLength).toBe(14);
    expect(body.data.tokenPreview).toBe("token-12...");
  });

  test("returns envelope error payload", async () => {
    connectBehavior = async () => {
      throw new Error("timed out while connecting");
    };

    const response = await callSmoke();
    expect(response.status).toBe(504);

    const body = await response.json();
    expect(body.ok).toBeFalse();
    expect(body.error.type).toBe("TimeoutError");
  });
});
