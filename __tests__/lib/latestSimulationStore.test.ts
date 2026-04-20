import { beforeEach, describe, expect, mock, test } from "bun:test";

import type {
  LatestSimulationReplay,
  LatestSimulationSummary,
} from "@/types/latestSimulation";
import { defaultIgnitionPlan } from "@/types/ignitionPlan";

mock.module("server-only", () => ({}));

let updateError: { code?: string; message: string } | null = null;
let updatePayload: Record<string, unknown> | null = null;
let selectData: unknown = null;
let selectError: { code?: string; message: string } | null = null;

const from = mock((table: string) => {
  if (table !== "map_projects") {
    throw new Error(`Unexpected table: ${table}`);
  }

  return {
    update: (payload: Record<string, unknown>) => {
      updatePayload = payload;
      return {
        eq: async () => ({ error: updateError }),
      };
    },
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: selectData,
          error: selectError,
        }),
      }),
    }),
  };
});

mock.module("@/lib/supabase", () => ({
  supabase: {
    from,
  },
}));

async function loadStoreModule() {
  return import("@/lib/latestSimulationStore");
}

function sampleSummary(): LatestSimulationSummary {
  return {
    completedAt: "2026-04-20T00:00:00.000Z",
    weatherSource: "dynamic",
    hasExactReplay: true,
    operationCount: 1,
    stats: { burning: 0, burned: 1, unburned: 0 },
    finalMetrics: {
      burnedArea: null,
      perimeterLength: null,
      burningCells: null,
      unburnedCells: null,
    },
    gridMeta: {
      cellResolution: 30,
      cellSpaceDimension: 200,
      cellSpaceDimensionLat: 200,
      projCenterLat: 10,
      projCenterLng: 20,
    },
    overlayPreview: [{ x: 1, y: 1, time: 0, state: "burned" as const }],
  };
}

function sampleReplay(): LatestSimulationReplay {
  return {
    summary: sampleSummary(),
    manifest: {
      startedAt: "2026-04-20T00:00:00.000Z",
      completedAt: "2026-04-20T00:00:00.000Z",
      baseUrl: "http://localhost",
      projectId: "project-1",
      terrainMode: "online",
      weatherMode: "static",
      planSnapshot: defaultIgnitionPlan(),
      weatherFetched: {
        windSpeed: 10,
        windDirection: 180,
        temperature: 72,
        humidity: 38,
      },
      weatherUsed: {
        windSpeed: 10,
        windDirection: 180,
        temperature: 72,
        humidity: 38,
      },
      weatherOverrideApplied: [],
      setupCalls: [],
      executionCalls: [],
    },
    operations: [{ x: 1, y: 1, time: 0, Operation: "burned" }],
    overlay: [{ x: 1, y: 1, time: 0, state: "burned" }],
    perimeterGeoJSON: null,
    finalMetrics: {
      perimeterCells: [],
      burnedArea: null,
      perimeterLength: null,
      burningCells: null,
      unburnedCells: null,
    },
  };
}

describe("latestSimulationStore", () => {
  beforeEach(() => {
    updateError = null;
    updatePayload = null;
    selectData = null;
    selectError = null;
    from.mockClear();
  });

  test("persists latest simulation snapshot to map_projects.last_simulation", async () => {
    const { upsertLatestSimulation } = await loadStoreModule();

    const result = await upsertLatestSimulation({
      projectId: "project-1",
      summary: sampleSummary(),
      replay: sampleReplay(),
    });

    expect(result).toBe("ok");
    expect(updatePayload?.last_simulation).toBeDefined();
  });

  test("returns storage-unavailable when legacy column is unavailable", async () => {
    const { upsertLatestSimulation } = await loadStoreModule();
    updateError = { code: "42703", message: "column does not exist" };

    const result = await upsertLatestSimulation({
      projectId: "project-1",
      summary: sampleSummary(),
      replay: sampleReplay(),
    });

    expect(result).toBe("storage-unavailable");
  });

  test("reads latest simulation summary from map_projects.last_simulation", async () => {
    const { readLatestSimulationSummary } = await loadStoreModule();
    selectData = {
      last_simulation: {
        overlay: [{ x: 1, y: 1, time: 0, state: "burned" }],
        perimeterGeoJSON: null,
        weatherSource: "dynamic",
        completedAt: "2026-04-20T00:00:00.000Z",
      },
      plan: {},
    };

    const summary = await readLatestSimulationSummary("project-1");

    expect(summary).not.toBeNull();
    expect(summary?.hasExactReplay).toBe(false);
    expect(summary?.operationCount).toBe(1);
  });
});
