import { describe, expect, test } from "bun:test";

import {
  defaultIgnitionPlan,
  ignitionModeForGeometry,
  ignitionModeOptionsForCurrent,
  mergeActionIntoPlan,
  normalizeIgnitionPlan,
} from "@/types/ignitionPlan";

function buildApiSamplePlan() {
  return {
    name: "",
    info_type: "simulation",
    team_num: 2,
    total_sim_time: 12000,
    team_infos: [
      {
        team_name: "team0",
        info_num: 6,
        details: [
          {
            type: "segment",
            start_x: 10,
            start_y: 191,
            end_x: 9,
            end_y: 15,
            speed: 0.6,
            mode: "continuous_static",
            distance: null,
          },
          {
            type: "segment",
            start_x: 9,
            start_y: 15,
            end_x: 185,
            end_y: 12,
            speed: 0.6,
            mode: "continuous_static",
            distance: null,
          },
          {
            type: "segment",
            start_x: 185,
            start_y: 12,
            end_x: 189,
            end_y: 188,
            speed: 0.6,
            mode: "continuous_static",
            distance: null,
          },
          {
            type: "segment",
            start_x: 33,
            start_y: 87,
            end_x: 33,
            end_y: 87,
            speed: 0.6,
            mode: "continuous_static",
            distance: null,
          },
          {
            type: "segment",
            start_x: 35,
            start_y: 179,
            end_x: 35,
            end_y: 179,
            speed: 0.6,
            mode: "continuous_static",
            distance: null,
          },
          {
            type: "segment",
            start_x: 128,
            start_y: 183,
            end_x: 128,
            end_y: 183,
            speed: 0.6,
            mode: "continuous_static",
            distance: null,
          },
        ],
      },
      {
        team_name: "team2",
        info_num: 2,
        details: [
          {
            type: "segment",
            start_x: 38,
            start_y: 138,
            end_x: 74,
            end_y: 53,
            speed: 0.6,
            mode: "continuous_dynamic",
            distance: 3,
          },
          {
            type: "segment",
            start_x: 74,
            start_y: 53,
            end_x: 145,
            end_y: 48,
            speed: "0.9",
            mode: "spot",
            distance: null,
          },
        ],
      },
    ],
    windSpeed: "40",
    windDegree: "190",
    sup_infos: [
      {
        type: "supLine",
        start_x: 20,
        start_y: 190,
        end_x: 146,
        end_y: 69,
      },
      {
        type: "supLine",
        start_x: 146,
        start_y: 69,
        end_x: 175,
        end_y: 189,
      },
    ],
    proj_center_lng: -173859.01701560823,
    proj_center_lat: 1602981.8225626145,
    fuel_data_adjusted: [],
    customizedFuelGrid: "",
    slope_data_adjusted: [],
    aspect_data_adjusted: [],
    cellResolution: 30,
    cellSpaceDimension: 200,
    cellSpaceDimensionLat: 200,
    customized_cell_state: [],
    sup_num: 2,
  };
}

describe("normalizeIgnitionPlan", () => {
  test("normalizes API-formatted payload and line mode semantics", () => {
    const normalized = normalizeIgnitionPlan(buildApiSamplePlan());

    expect(normalized.name).toBe("");
    expect(normalized.windSpeed).toBe(40);
    expect(normalized.windDegree).toBe(190);
    expect(normalized.team_infos).toHaveLength(2);
    expect(normalized.team_infos[0]?.details).toHaveLength(6);
    expect(normalized.team_infos[1]?.details).toHaveLength(2);
    expect(normalized.team_infos[1]?.details[1]?.speed).toBe(0.9);
    expect(normalized.team_infos[1]?.details[1]?.mode).toBe("spot");
    expect(normalized.team_infos[1]?.details[1]?.distance).toBe(0);
    expect(normalized.team_infos[0]?.details[0]?.mode).toBe("continuous");
    expect(normalized.team_infos[1]?.details[0]?.mode).toBe("continuous");

    const pointModes =
      normalized.team_infos[0]?.details
        .filter((seg) => seg.start_x === seg.end_x && seg.start_y === seg.end_y)
        .map((seg) => seg.mode) ?? [];
    expect(pointModes).toEqual([
      "continuous_static",
      "continuous_static",
      "continuous_static",
    ]);

    expect(normalized.sup_infos).toHaveLength(2);
    expect(normalized.sup_infos[0]).toMatchObject({
      x1: 20,
      y1: 190,
      x2: 146,
      y2: 69,
      type: "supLine",
    });
    expect(normalized.sup_infos[1]).toMatchObject({
      x1: 146,
      y1: 69,
      x2: 175,
      y2: 189,
      type: "supLine",
    });

    expect(normalized.team_infos.map((team) => team.info_num)).toEqual(
      normalized.team_infos.map((team) => team.details.length),
    );
    expect(normalized.sup_num).toBe(normalized.sup_infos.length);
  });

  test("recomputes count fields from normalized arrays", () => {
    const sample = buildApiSamplePlan();
    const normalized = normalizeIgnitionPlan({
      ...sample,
      team_num: "1",
      sup_num: "999",
      team_infos: [
        {
          ...sample.team_infos[0],
          info_num: "123",
        },
      ],
      sup_infos: [sample.sup_infos[0]],
    });

    expect(normalized.team_num).toBe(1);
    expect(normalized.team_infos).toHaveLength(1);
    expect(normalized.team_infos[0]?.info_num).toBe(
      normalized.team_infos[0]?.details.length,
    );
    expect(normalized.sup_num).toBe(1);
  });

  test("normalizes rectangular grid dimensions into a square side length", () => {
    const normalized = normalizeIgnitionPlan({
      ...buildApiSamplePlan(),
      cellSpaceDimension: 180,
      cellSpaceDimensionLat: 240,
    });

    expect(normalized.cellSpaceDimension).toBe(240);
    expect(normalized.cellSpaceDimensionLat).toBe(240);
  });

  test("clamps normalized ignition/suppression coordinates to grid bounds", () => {
    const normalized = normalizeIgnitionPlan({
      ...buildApiSamplePlan(),
      cellSpaceDimension: 200,
      cellSpaceDimensionLat: 200,
      team_infos: [
        {
          team_name: "team0",
          details: [
            {
              type: "segment",
              start_x: -12,
              start_y: 500,
              end_x: 999,
              end_y: -4,
              speed: 0.6,
              mode: "continuous",
            },
          ],
        },
      ],
      sup_infos: [
        {
          x1: -7,
          y1: 255,
          x2: 700,
          y2: -8,
        },
      ],
    });

    expect(normalized.team_infos[0]?.details[0]).toMatchObject({
      start_x: 0,
      start_y: 199,
      end_x: 199,
      end_y: 0,
    });
    expect(normalized.sup_infos[0]).toEqual({
      x1: 0,
      y1: 199,
      x2: 199,
      y2: 0,
    });
  });
});

describe("ignition mode helpers", () => {
  test("normalizes line modes to DEVS-FIRE dynamic semantics", () => {
    expect(ignitionModeForGeometry("continuous_static", false)).toBe("continuous");
    expect(ignitionModeForGeometry("point_dynamic", false)).toBe("spot");
    expect(ignitionModeForGeometry("spot", false)).toBe("spot");
    expect(ignitionModeForGeometry("", false)).toBe("continuous");
  });

  test("keeps point mode semantics for point geometry", () => {
    expect(ignitionModeForGeometry("point_dynamic", true)).toBe("point_dynamic");
    expect(ignitionModeForGeometry("", true)).toBe("point_static");
    expect(ignitionModeForGeometry("custom_api_mode", true)).toBe(
      "custom_api_mode",
    );
  });

  test("normalizes unknown line mode to continuous while narrowing line options", () => {
    const options = ignitionModeOptionsForCurrent("custom_api_mode", false);
    expect(options[0]?.value).toBe("continuous");
    expect(options.some((entry) => entry.value === "continuous")).toBe(true);
    expect(options.some((entry) => entry.value === "spot")).toBe(true);
    expect(options.some((entry) => entry.value === "continuous_static")).toBe(false);
  });

  test("point mode options stay point-oriented", () => {
    const options = ignitionModeOptionsForCurrent("point_static", true);
    expect(options.some((entry) => entry.value === "point_static")).toBe(true);
    expect(options.some((entry) => entry.value === "point_dynamic")).toBe(true);
    expect(options.some((entry) => entry.value === "continuous")).toBe(false);
    expect(options.some((entry) => entry.value === "spot")).toBe(false);
  });
});

describe("mergeActionIntoPlan line ignition defaults", () => {
  test("defaults line ignitions to continuous mode with null distance", () => {
    const next = mergeActionIntoPlan(defaultIgnitionPlan(), {
      action: "line-ignition",
      start_x: 10,
      start_y: 20,
      end_x: 30,
      end_y: 40,
    });

    const seg = next.team_infos[0]?.details[0];
    expect(seg?.mode).toBe("continuous");
    expect(seg?.distance).toBeNull();
  });

  test("defaults spot-like line ignitions to distance 0", () => {
    const next = mergeActionIntoPlan(defaultIgnitionPlan(), {
      action: "line-ignition",
      start_x: 10,
      start_y: 20,
      end_x: 30,
      end_y: 40,
      mode: "point_static",
      distance: null,
    });

    const seg = next.team_infos[0]?.details[0];
    expect(seg?.mode).toBe("spot");
    expect(seg?.distance).toBe(0);
  });

  test("continuous line ignitions always clear distance payloads", () => {
    const next = mergeActionIntoPlan(defaultIgnitionPlan(), {
      action: "line-ignition",
      start_x: 10,
      start_y: 20,
      end_x: 30,
      end_y: 40,
      mode: "continuous_static",
      distance: 9,
    });

    const seg = next.team_infos[0]?.details[0];
    expect(seg?.mode).toBe("continuous");
    expect(seg?.distance).toBeNull();
  });

  test("clamps line ignition coordinates to grid bounds", () => {
    const next = mergeActionIntoPlan(defaultIgnitionPlan(), {
      action: "line-ignition",
      start_x: -5,
      start_y: 30,
      end_x: 200,
      end_y: 999,
    });

    const seg = next.team_infos[0]?.details[0];
    expect(seg).toMatchObject({
      start_x: 0,
      start_y: 30,
      end_x: 199,
      end_y: 199,
    });
  });
});

describe("mergeActionIntoPlan coordinate clamping", () => {
  test("clamps point ignition coordinates to grid bounds", () => {
    const next = mergeActionIntoPlan(defaultIgnitionPlan(), {
      action: "point-ignition",
      points: [{ x: 200, y: -1 }],
    });

    const seg = next.team_infos[0]?.details[0];
    expect(seg).toMatchObject({
      start_x: 199,
      start_y: 0,
      end_x: 199,
      end_y: 0,
    });
  });

  test("clamps fuel break coordinates to grid bounds", () => {
    const next = mergeActionIntoPlan(defaultIgnitionPlan(), {
      action: "fuel-break",
      x1: -9,
      y1: 210,
      x2: 240,
      y2: -5,
    });

    expect(next.sup_infos[0]).toEqual({
      x1: 0,
      y1: 199,
      x2: 199,
      y2: 0,
    });
  });
});
