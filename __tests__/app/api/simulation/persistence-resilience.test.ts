import { describe, expect, mock, test } from "bun:test";
import type { NextRequest } from "next/server";

const projectId = "2449abd4-262a-4d74-85fd-a733e5ff2e28";

const auth = mock(async () => ({ userId: "user_123" }));
const currentUser = mock(async () => ({
  username: "demo",
  primaryEmailAddress: { emailAddress: "demo@example.com" },
  firstName: "Demo",
  lastName: "User",
  imageUrl: null,
}));

const upsertLocalUserFromClerk = mock(async () => undefined);

const runSimulationWithDynamicWeather = mock(async () => ({
  weatherFetched: {
    windSpeed: 12,
    windDirection: 180,
    temperature: 72,
    humidity: 35,
  },
  weatherUsed: {
    windSpeed: 12,
    windDirection: 180,
    temperature: 72,
    humidity: 35,
  },
  weatherOverrideApplied: [],
  result: {
    manifest: {
      startedAt: "2026-04-20T00:00:00.000Z",
      completedAt: "2026-04-20T00:10:00.000Z",
      baseUrl: "http://localhost",
      projectId,
      terrainMode: "online",
      weatherMode: "static",
      planSnapshot: {},
      weatherFetched: {},
      weatherUsed: {},
      weatherOverrideApplied: [],
      setupCalls: [],
      executionCalls: [],
    },
    operations: [{ x: 1, y: 1, time: 0, Operation: "burned" }],
    bbox: null,
    weatherSource: "dynamic",
    finalMetrics: {
      perimeterCells: [],
      burnedArea: null,
      perimeterLength: null,
      burningCells: null,
      unburnedCells: null,
    },
    userToken: "token-123",
  },
}));

let updateCalls = 0;
let updateError: { code?: string; message: string } | null = {
  code: "XX000",
  message: "write failed",
};

const supabase = {
  from: mock((table: string) => {
    if (table !== "map_projects") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { user_id: "user_123" },
            error: null,
          }),
        }),
      }),
      update: () => ({
        eq: async () => {
          updateCalls += 1;
          return { error: updateError };
        },
      }),
    };
  }),
};

mock.module("@clerk/nextjs/server", () => ({
  auth,
  currentUser,
}));

mock.module("@/lib/user-store", () => ({
  upsertLocalUserFromClerk,
}));

mock.module("@/lib/api/devsFireBackend", () => ({
  runSimulationWithDynamicWeather,
}));

mock.module("@/lib/supabase", () => ({
  supabase,
}));

function validBody() {
  return {
    projectId,
    simulationHours: 24,
    plan: {
      team_infos: [
        {
          team_name: "team0",
          details: [
            {
              start_x: 0,
              start_y: 0,
              end_x: 0,
              end_y: 0,
              speed: 3,
              mode: "continuous_static",
              distance: null,
            },
          ],
        },
      ],
      sup_infos: [],
      proj_center_lng: -122.44,
      proj_center_lat: 37.77,
      cellResolution: 30,
      cellSpaceDimension: 200,
      cellSpaceDimensionLat: 200,
    },
  };
}

describe("simulation persistence resilience", () => {
  test("run route succeeds even when latest simulation persistence fails", async () => {
    updateCalls = 0;
    updateError = { code: "XX000", message: "write failed" };
    const route = await import("@/app/api/simulation/run/route");

    const request = new Request("http://localhost:3000/api/simulation/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    }) as unknown as NextRequest;

    const response = await route.POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.latestSimulationSummary).toBeDefined();
    expect(updateCalls).toBe(1);
  });

  test("delegate run route succeeds even when latest simulation persistence fails", async () => {
    updateCalls = 0;
    updateError = { code: "XX000", message: "write failed" };
    const route = await import("@/app/api/simulation/delegate-run/route");

    const request = new Request(
      "http://localhost:3000/api/simulation/delegate-run",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validBody(),
          reason: "agent-triggered",
        }),
      },
    ) as unknown as NextRequest;

    const response = await route.POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.ok).toBe(true);
    expect(updateCalls).toBe(1);
  });
});
