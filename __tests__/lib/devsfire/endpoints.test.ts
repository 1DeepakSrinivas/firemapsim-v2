import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

let lastPathname = "";
let lastMethod = "";
let lastBody = "";
let queue: Array<{ body: string; status?: number; statusText?: string }> = [];
let fetchCallCount = 0;

async function loadEndpoints() {
  return import("@/lib/devsfire/endpoints");
}

describe("devsfire endpoint wrappers", () => {
  beforeEach(() => {
    lastPathname = "";
    lastMethod = "";
    lastBody = "";
    queue = [];
    fetchCallCount = 0;
  });

  test("connectToServer returns token from string payload", async () => {
    const endpoints = await loadEndpoints();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCallCount += 1;
      const url =
        typeof input === "string"
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
      lastPathname = url.pathname;
      lastMethod = (init?.method ?? "GET").toUpperCase();
      lastBody = String(init?.body ?? "");
      return new Response("abc-token", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const out = await endpoints.connectToServer();
      expect(out.token).toBe("abc-token");
      expect(lastPathname).toBe("/api/connectToServer/");
      expect(lastMethod).toBe("POST");
      expect(lastBody).toBe("testtest");
      expect(fetchCallCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("missing wrappers getCellSpaceSize/getCellSize parse numeric responses", async () => {
    const endpoints = await loadEndpoints();
    const originalFetch = globalThis.fetch;
    queue = [{ body: "200" }, { body: "{\"value\":\"30\"}" }];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
      lastPathname = url.pathname;
      const next = queue.shift();
      return new Response(next?.body ?? "null", { status: next?.status ?? 200 });
    }) as unknown as typeof fetch;

    try {
      const space = await endpoints.getCellSpaceSize({ userToken: "t1" });
      expect(space).toBe(200);
      expect(lastPathname).toBe("/api/getCellSpaceSize/");

      const cell = await endpoints.getCellSize({ userToken: "t1" });
      expect(cell).toBe(30);
      expect(lastPathname).toBe("/api/getCellSize/");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("setMultiParameters sends endpoint and query payload", async () => {
    const endpoints = await loadEndpoints();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
      lastPathname = url.pathname;
      expect(url.searchParams.get("lat")).toBe("33.7");
      expect(url.searchParams.get("windSpeed")).toBe("10");
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      await endpoints.setMultiParameters({
        userToken: "t1",
        lat: 33.7,
        lng: -84.3,
        windSpeed: 10,
        cellResolution: 30,
        cellDimension: 200,
      });
      expect(lastPathname).toBe("/api/setMultiParameters/");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("terrain read wrappers parse matrix response", async () => {
    const endpoints = await loadEndpoints();
    const originalFetch = globalThis.fetch;
    queue = [
      { body: "[[1,2],[3,4]]" },
      { body: "{\"matrix\":[[5,6]]}" },
      { body: "{\"data\":[[7,8]]}" },
    ];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
      lastPathname = url.pathname;
      const next = queue.shift();
      return new Response(next?.body ?? "null", { status: next?.status ?? 200 });
    }) as unknown as typeof fetch;

    try {
      expect(await endpoints.getCellFuel({ userToken: "t1" })).toEqual([
        [1, 2],
        [3, 4],
      ]);
      expect(lastPathname).toBe("/api/getCellFuel/");

      expect(await endpoints.getCellSlope({ userToken: "t1" })).toEqual([[5, 6]]);
      expect(lastPathname).toBe("/api/getCellSlope/");

      expect(await endpoints.getCellAspect({ userToken: "t1" })).toEqual([[7, 8]]);
      expect(lastPathname).toBe("/api/getCellAspect/");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("run/continue wrappers parse operation list", async () => {
    const endpoints = await loadEndpoints();
    const originalFetch = globalThis.fetch;
    const operations =
      '[{"x":"1","y":"2","Operation":"BurnTeam","time":"0.0"}]';
    queue = [{ body: operations }, { body: operations }];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
      lastPathname = url.pathname;
      const next = queue.shift();
      return new Response(next?.body ?? "[]", { status: next?.status ?? 200 });
    }) as unknown as typeof fetch;

    try {
      const runOps = await endpoints.runSimulation({ userToken: "t1", time: 50 });
      expect(runOps[0]?.x).toBe(1);
      expect(lastPathname).toBe("/api/runSimulation/");

      const contOps = await endpoints.continueSimulation({ userToken: "t1", time: 50 });
      expect(contOps[0]?.x).toBe(1);
      expect(lastPathname).toBe("/api/continueSimulation/");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
