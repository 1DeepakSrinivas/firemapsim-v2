import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

let probeResult: {
  ok: boolean;
  baseUrl: string;
  classification: string;
  attempts: Array<Record<string, unknown>>;
  totalMs: number;
  error?: string;
} = {
  ok: false,
  baseUrl: "https://firesim.cs.gsu.edu/api",
  classification: "upstream_timeout",
  attempts: [],
  totalMs: 10,
  error: "timed out",
};

const probeDevsFireConnect = mock(async () => probeResult);

mock.module("@/mastra/tools/devsFire/_client", () => ({
  probeDevsFireConnect,
  toErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Unknown error"),
}));

async function callDiagnostics(headers?: HeadersInit) {
  const { GET } = await import("@/app/api/devs-fire/diagnostics/route");
  return GET(
    new Request("http://localhost:3000/api/devs-fire/diagnostics", {
      method: "GET",
      headers,
    }),
  );
}

describe("/api/devs-fire/diagnostics", () => {
  beforeEach(() => {
    process.env.DEVS_FIRE_DIAGNOSTICS_KEY = "diagnostics-secret";
    probeResult = {
      ok: false,
      baseUrl: "https://firesim.cs.gsu.edu/api",
      classification: "upstream_timeout",
      attempts: [],
      totalMs: 10,
      error: "timed out",
    };
  });

  test("returns 401 when authorization header is missing", async () => {
    const response = await callDiagnostics();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.ok).toBeFalse();
    expect(body.error.message).toBe("Missing Authorization bearer token.");
  });

  test("returns 403 when bearer token is invalid", async () => {
    const response = await callDiagnostics({
      Authorization: "Bearer wrong-secret",
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.ok).toBeFalse();
    expect(body.error.message).toBe("Invalid diagnostics token.");
  });

  test("returns 200 with diagnostics payload when bearer token is valid", async () => {
    probeResult = {
      ok: true,
      baseUrl: "https://firesim.cs.gsu.edu/api",
      classification: "success",
      attempts: [
        {
          method: "POST",
          url: "https://firesim.cs.gsu.edu/api/connectToServer",
          elapsedMs: 12,
          tokenDetected: true,
          htmlLike: false,
          outcome: "success",
        },
      ],
      totalMs: 12,
    };

    const response = await callDiagnostics({
      Authorization: "Bearer diagnostics-secret",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBeTrue();
    expect(body.data.classification).toBe("success");
    expect(body.data.attempts).toHaveLength(1);
  });
});
