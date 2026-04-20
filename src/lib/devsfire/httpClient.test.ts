import { describe, expect, mock, test } from "bun:test";

import { DevsFireError } from "@/lib/devsfire/errors";

mock.module("server-only", () => ({}));

async function loadHttpClient() {
  return import("./httpClient");
}

describe("devsFireRequest", () => {
  test("classifies network failures as ConnectionError", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    try {
      const { devsFireRequest } = await loadHttpClient();
      const error = await devsFireRequest({
        endpoint: "/setCellResolution/",
        retries: 1,
      }).catch((err) => err);
      expect(error).toBeInstanceOf(DevsFireError);
      expect((error as DevsFireError).type).toBe("ConnectionError");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("classifies abort errors as TimeoutError", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      const error = new Error("aborted");
      (error as { name: string }).name = "AbortError";
      throw error;
    }) as unknown as typeof fetch;

    try {
      const { devsFireRequest } = await loadHttpClient();
      const error = await devsFireRequest({
        endpoint: "/runSimulation/",
        retries: 1,
      }).catch((err) => err);
      expect(error).toBeInstanceOf(DevsFireError);
      expect((error as DevsFireError).type).toBe("TimeoutError");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("classifies upstream 5xx as ServerError", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("Internal Error", { status: 500, statusText: "Internal Server Error" })) as unknown as typeof fetch;

    try {
      const { devsFireRequest } = await loadHttpClient();
      const error = await devsFireRequest({
        endpoint: "/runSimulation/",
        retries: 1,
      }).catch((err) => err);
      expect(error).toBeInstanceOf(DevsFireError);
      expect((error as DevsFireError).type).toBe("ServerError");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("classifies upstream 4xx as SimulationError", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("Bad Input", { status: 400, statusText: "Bad Request" })) as unknown as typeof fetch;

    try {
      const { devsFireRequest } = await loadHttpClient();
      const error = await devsFireRequest({
        endpoint: "/setPointIgnition/",
        retries: 1,
      }).catch((err) => err);
      expect(error).toBeInstanceOf(DevsFireError);
      expect((error as DevsFireError).type).toBe("SimulationError");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("retries server errors and succeeds on next attempt", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response("error", { status: 500, statusText: "Internal Server Error" });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const { devsFireRequest } = await loadHttpClient();
      const data = await devsFireRequest({
        endpoint: "/connectToServer/",
        retries: 2,
      });
      expect(callCount).toBe(2);
      expect(data).toEqual({ ok: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
