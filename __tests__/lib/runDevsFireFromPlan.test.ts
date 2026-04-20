import { beforeEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";

import { normalizeIgnitionPlan } from "@/types/ignitionPlan";

mock.module("server-only", () => ({}));
mock.module("@/mastra/tools/devsFire/_client", () => ({
  DEVS_FIRE_BASE_URL: "https://firesim.cs.gsu.edu/api",
}));

const calls = {
  setCellResolution: 0,
  setCellSpaceLocation: 0,
  setWindCondition: 0,
  setPointIgnition: 0,
  setDynamicIgnition: 0,
  setSuppressedCell: 0,
  loadFuel: 0,
  loadSlope: 0,
  loadAspect: 0,
  setMultiParameters: 0,
  runSimulation: 0,
};

const suppressedCellRequests: Array<{
  x1: number;
  y1: number;
  x2?: number;
  y2?: number;
}> = [];

const simulationOperationListSchema = z.array(
  z.object({
    x: z.number(),
    y: z.number(),
    Operation: z.string(),
    time: z.number(),
  }),
);

mock.module("@/lib/devsfire/endpoints", () => ({
  connectToServer: async () => ({ token: "token-123" }),
  setCellResolution: async () => {
    calls.setCellResolution += 1;
    return {};
  },
  setCellSpaceLocation: async () => {
    calls.setCellSpaceLocation += 1;
    return {};
  },
  setWindCondition: async () => {
    calls.setWindCondition += 1;
    return {};
  },
  setPointIgnition: async () => {
    calls.setPointIgnition += 1;
    return {};
  },
  setDynamicIgnition: async () => {
    calls.setDynamicIgnition += 1;
    return {};
  },
  setSuppressedCell: async (input: {
    x1: number;
    y1: number;
    x2?: number;
    y2?: number;
  }) => {
    calls.setSuppressedCell += 1;
    suppressedCellRequests.push(input);
    return {};
  },
  loadFuel: async () => {
    calls.loadFuel += 1;
    return {};
  },
  loadSlope: async () => {
    calls.loadSlope += 1;
    return {};
  },
  loadAspect: async () => {
    calls.loadAspect += 1;
    return {};
  },
  loadWindFlow: async () => ({}),
  setMultiParameters: async () => {
    calls.setMultiParameters += 1;
    return {};
  },
  runSimulation: async () => {
    calls.runSimulation += 1;
    return [
      { x: 100, y: 100, Operation: "BurnTeam", time: 0 },
      { x: 100, y: 101, Operation: "BurnCell", time: 25 },
    ];
  },
  continueSimulation: async () => [],
  getPerimeterCells: async () => [],
  computeBurnedArea: async () => 10,
  computePerimeterLength: async () => 12,
  getBurningCellNum: async () => 2,
  getUnburnedCellNum: async () => 39998,
  getCellState: async () => "Burning",
  getCellSpaceSize: async () => 200,
  getCellSize: async () => 30,
  getCellFuel: async () => [[1]],
  getCellSlope: async () => [[0]],
  getCellAspect: async () => [[0]],
  simulationOperationListSchema,
}));

describe("executeDevsFireSimulation terrain/location setup", () => {
  beforeEach(() => {
    for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
      calls[key] = 0;
    }
    suppressedCellRequests.length = 0;
    delete process.env.DEVS_FIRE_USE_MULTI_PARAMETERS;
    delete process.env.DEVS_FIRE_ENABLE_WINDFLOW;
  });

  test("sets cell-space location when fuel is online, even with custom slope/aspect", async () => {
    const { executeDevsFireSimulation } = await import("@/lib/runDevsFireFromPlan");

    const plan = normalizeIgnitionPlan({
      info_type: "simulation",
      team_num: 1,
      total_sim_time: 12000,
      windSpeed: 8,
      windDegree: 180,
      team_infos: [
        {
          team_name: "team0",
          details: [
            {
              type: "segment",
              start_x: 100,
              start_y: 100,
              end_x: 100,
              end_y: 100,
              speed: 1,
              mode: "point_static",
              distance: null,
            },
          ],
        },
      ],
      sup_infos: [],
      proj_center_lng: -122.4194,
      proj_center_lat: 37.7749,
      fuel_data_adjusted: [],
      customizedFuelGrid: "",
      slope_data_adjusted: [
        [0, 1],
        [1, 2],
      ],
      aspect_data_adjusted: [
        [90, 120],
        [180, 210],
      ],
      cellResolution: 30,
      cellSpaceDimension: 200,
      cellSpaceDimensionLat: 200,
      customized_cell_state: [],
      sup_num: 0,
    });

    const result = await executeDevsFireSimulation({
      plan,
      weather: {
        windSpeed: 8,
        windDirection: 225,
        temperature: 70,
        humidity: 30,
      },
      simulationHours: 1200,
      weatherSource: "dynamic",
      hourlyWeather: [],
      weatherFetched: {
        windSpeed: 8,
        windDirection: 225,
        temperature: 70,
        humidity: 30,
      },
      weatherOverrideApplied: [],
      projectId: "project-1",
    });

    expect(calls.setCellResolution).toBe(1);
    expect(calls.setCellSpaceLocation).toBe(1);
    expect(calls.setWindCondition).toBe(1);
    expect(calls.loadFuel).toBe(0);
    expect(calls.loadSlope).toBe(1);
    expect(calls.loadAspect).toBe(1);
    expect(calls.runSimulation).toBe(1);
    expect(result.manifest.axisConventionCheck).toEqual({
      checked: true,
      transposeLikely: false,
      firstIgnition: { x: 100, y: 100 },
      firstBurnTeam: { x: 100, y: 100, time: 0 },
    });
  });

  test("sends suppression coordinates without row/column transposition", async () => {
    const { executeDevsFireSimulation } = await import("@/lib/runDevsFireFromPlan");

    const plan = normalizeIgnitionPlan({
      info_type: "simulation",
      team_num: 1,
      total_sim_time: 12000,
      windSpeed: 8,
      windDegree: 180,
      team_infos: [
        {
          team_name: "team0",
          details: [
            {
              type: "segment",
              start_x: 100,
              start_y: 100,
              end_x: 100,
              end_y: 100,
              speed: 1,
              mode: "point_static",
              distance: null,
            },
          ],
        },
      ],
      sup_infos: [{ x1: 12, y1: 150, x2: 12, y2: 150 }],
      proj_center_lng: -122.4194,
      proj_center_lat: 37.7749,
      fuel_data_adjusted: [],
      customizedFuelGrid: "",
      slope_data_adjusted: [],
      aspect_data_adjusted: [],
      cellResolution: 30,
      cellSpaceDimension: 200,
      cellSpaceDimensionLat: 200,
      customized_cell_state: [],
      sup_num: 1,
    });

    await executeDevsFireSimulation({
      plan,
      weather: {
        windSpeed: 8,
        windDirection: 225,
        temperature: 70,
        humidity: 30,
      },
      simulationHours: 1200,
      weatherSource: "dynamic",
      hourlyWeather: [],
      weatherFetched: {
        windSpeed: 8,
        windDirection: 225,
        temperature: 70,
        humidity: 30,
      },
      weatherOverrideApplied: [],
      projectId: "project-1",
    });

    expect(calls.setSuppressedCell).toBe(1);
    expect(suppressedCellRequests[0]).toMatchObject({
      x1: 12,
      y1: 150,
      x2: 12,
      y2: 150,
    });
  });
});
