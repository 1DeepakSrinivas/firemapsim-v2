import { describe, expect, test } from "bun:test";

import { defaultIgnitionPlan } from "@/types/ignitionPlan";
import { bootstrapTerrainSession, fetchTerrainMatrix } from "./devsFireBrowser";

type RouteCall = {
  url: string;
  payload: Record<string, unknown> | null;
};

describe("devsFireBrowser terrain wiring", () => {
  test("bootstraps terrain session with connect -> resolution -> location route calls", async () => {
    const originalFetch = globalThis.fetch;
    const calls: RouteCall[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const payload =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null;
      calls.push({ url, payload });

      return new Response(JSON.stringify({ ok: true, data: { connected: true }, error: null }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    try {
      const plan = {
        ...defaultIgnitionPlan(),
        proj_center_lat: 33.753746,
        proj_center_lng: -84.38633,
        cellResolution: 30,
        cellSpaceDimension: 200,
        cellSpaceDimensionLat: 180,
      };

      await bootstrapTerrainSession(plan);

      expect(calls).toHaveLength(3);
      expect(calls[0]?.url).toBe("/api/devs-fire/connectToServer");
      expect(calls[1]?.url).toBe("/api/devs-fire/setCellResolution");
      expect(calls[1]?.payload).toMatchObject({
        cellResolution: 30,
        cellDimension: 200,
      });
      expect(calls[2]?.url).toBe("/api/devs-fire/setCellSpaceLocation");
      expect(calls[2]?.payload).toMatchObject({
        lat: 33.753746,
        lng: -84.38633,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("fetchTerrainMatrix reads matrix from envelope payload", async () => {
    const originalFetch = globalThis.fetch;
    let call = 0;

    globalThis.fetch = (async () => {
      call += 1;
      if (call === 1) {
        return new Response(
          JSON.stringify({ ok: true, data: { matrix: [[1, 2], [3, 4]] }, error: null }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ ok: true, data: { matrix: [[5, 6], [7, 8]] }, error: null }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    try {
      const fuel = await fetchTerrainMatrix("/getCellFuel/");
      const slope = await fetchTerrainMatrix("/getCellSlope/");

      expect(fuel).toEqual([[1, 2], [3, 4]]);
      expect(slope).toEqual([[5, 6], [7, 8]]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
