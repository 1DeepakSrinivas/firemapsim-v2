import { describe, expect, mock, test } from "bun:test";

import { parseSimulationOperationsResponse } from "./simulationOperations";

async function loadClientModule() {
  mock.module("server-only", () => ({}));
  return import("./_client");
}

describe("parseSimulationOperationsResponse", () => {
  test("parses GSU API sample with string numeric fields", () => {
    const raw = [
      { x: "80", y: "80", Operation: "BurnTeam", time: "0.0" },
    ];
    const out = parseSimulationOperationsResponse(raw, "/runSimulation/");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      x: 80,
      y: 80,
      Operation: "BurnTeam",
      time: 0,
    });
  });

  test("parses nested envelope", () => {
    const raw = { data: [{ x: 1, y: 2, Operation: "X", time: 1.5 }] };
    const out = parseSimulationOperationsResponse(raw, "/runSimulation/");
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(1);
  });
});

describe("connectToDevsFire", () => {
  test("posts legacy connect payload to canonical /api endpoint", async () => {
    const { connectToDevsFire } = await loadClientModule();
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response("token-123", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const token = await connectToDevsFire();
      expect(token).toBe("token-123");
      expect(calls).toHaveLength(1);

      const call = calls[0]!;
      const url =
        typeof call.input === "string"
          ? call.input
          : call.input instanceof URL
            ? call.input.toString()
            : call.input.url;

      expect(url).toBe("https://firesim.cs.gsu.edu/api/connectToServer");
      expect(call.init?.method).toBe("POST");
      expect(call.init?.body).toBe("connect");

      const headers = new Headers(call.init?.headers);
      expect(headers.get("content-type")).toBe("text/plain");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("includes endpoint path and status in connect failures", async () => {
    const { connectToDevsFire } = await loadClientModule();
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response("<html>blocked</html>", {
        status: 405,
        statusText: "Not Allowed",
      });
    }) as unknown as typeof fetch;

    try {
      const error = await connectToDevsFire()
        .then(() => null)
        .catch((err) => err as Error);
      expect(error).not.toBeNull();
      expect(error?.message).toContain("https://firesim.cs.gsu.edu/api/connectToServer");
      expect(error?.message).toContain("/api/connectToServer");
      expect(error?.message).toContain("405 Not Allowed");
      expect(calls).toHaveLength(1);

      const call = calls[0]!;
      const url =
        typeof call.input === "string"
          ? call.input
          : call.input instanceof URL
            ? call.input.toString()
            : call.input.url;
      expect(url).toBe("https://firesim.cs.gsu.edu/api/connectToServer");
      expect(call.init?.body).toBe("connect");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("probeDevsFireConnect", () => {
  test("classifies timeout/abort errors as upstream_timeout", async () => {
    const { probeDevsFireConnect } = await loadClientModule();
    const fetchImpl = (async () => {
      const error = new Error("aborted");
      (error as { name: string }).name = "AbortError";
      throw error;
    }) as unknown as typeof fetch;

    const result = await probeDevsFireConnect({
      baseUrl: "https://firesim.cs.gsu.edu/api",
      fetchImpl,
    });

    expect(result.ok).toBeFalse();
    expect(result.classification).toBe("upstream_timeout");
    expect(result.attempts).toHaveLength(4);
    expect(result.attempts.every((attempt) => attempt.outcome === "upstream_timeout")).toBeTrue();
  });

  test("classifies network failures as upstream_unreachable", async () => {
    const { probeDevsFireConnect } = await loadClientModule();
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const result = await probeDevsFireConnect({
      baseUrl: "https://firesim.cs.gsu.edu/api",
      fetchImpl,
    });

    expect(result.ok).toBeFalse();
    expect(result.classification).toBe("upstream_unreachable");
    expect(result.attempts).toHaveLength(4);
  });

  test("classifies non-2xx responses as upstream_http_error", async () => {
    const { probeDevsFireConnect } = await loadClientModule();
    const fetchImpl = (async () =>
      new Response("not allowed", { status: 405, statusText: "Not Allowed" })) as unknown as typeof fetch;

    const result = await probeDevsFireConnect({
      baseUrl: "https://firesim.cs.gsu.edu/api",
      fetchImpl,
    });

    expect(result.ok).toBeFalse();
    expect(result.classification).toBe("upstream_http_error");
    expect(result.attempts).toHaveLength(4);
    expect(result.attempts.every((attempt) => attempt.status === 405)).toBeTrue();
  });

  test("classifies HTML responses as upstream_html_response", async () => {
    const { probeDevsFireConnect } = await loadClientModule();
    const fetchImpl = (async () =>
      new Response("<html>blocked</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;

    const result = await probeDevsFireConnect({
      baseUrl: "https://firesim.cs.gsu.edu/api",
      fetchImpl,
    });

    expect(result.ok).toBeFalse();
    expect(result.classification).toBe("upstream_html_response");
    expect(result.attempts).toHaveLength(4);
    expect(result.attempts.every((attempt) => attempt.htmlLike)).toBeTrue();
  });

  test("classifies token-less 200 payloads as invalid_connect_payload", async () => {
    const { probeDevsFireConnect } = await loadClientModule();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ foo: "bar" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    const result = await probeDevsFireConnect({
      baseUrl: "https://firesim.cs.gsu.edu/api",
      fetchImpl,
    });

    expect(result.ok).toBeFalse();
    expect(result.classification).toBe("invalid_connect_payload");
    expect(result.attempts).toHaveLength(4);
  });

  test("keeps probing remaining attempts after an abort and still succeeds later", async () => {
    const { probeDevsFireConnect } = await loadClientModule();
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      if (call === 1) {
        const error = new Error("aborted");
        (error as { name: string }).name = "AbortError";
        throw error;
      }
      if (call === 2) {
        return new Response("token-123", { status: 200 });
      }
      return new Response(JSON.stringify({ foo: "bar" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await probeDevsFireConnect({
      baseUrl: "https://firesim.cs.gsu.edu/api",
      fetchImpl,
    });

    expect(result.ok).toBeTrue();
    expect(result.classification).toBe("success");
    expect(result.attempts).toHaveLength(4);
    expect(result.attempts[0]?.outcome).toBe("upstream_timeout");
    expect(result.attempts[1]?.outcome).toBe("success");
  });
});
