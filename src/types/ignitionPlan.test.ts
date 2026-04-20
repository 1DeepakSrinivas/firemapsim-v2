import { describe, expect, test } from "bun:test";

import {
  ignitionModeForGeometry,
  ignitionModeOptionsForCurrent,
  normalizeIgnitionPlan,
} from "./ignitionPlan";

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
  test("normalizes API-formatted payload and preserves modes", () => {
    const normalized = normalizeIgnitionPlan(buildApiSamplePlan());

    expect(normalized.name).toBe("");
    expect(normalized.windSpeed).toBe(40);
    expect(normalized.windDegree).toBe(190);
    expect(normalized.team_infos).toHaveLength(2);
    expect(normalized.team_infos[0]?.details).toHaveLength(6);
    expect(normalized.team_infos[1]?.details).toHaveLength(2);
    expect(normalized.team_infos[1]?.details[1]?.speed).toBe(0.9);
    expect(normalized.team_infos[1]?.details[1]?.mode).toBe("spot");

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
});

describe("ignition mode helpers", () => {
  test("preserves API mode strings without geometry rewrites", () => {
    expect(ignitionModeForGeometry("continuous_static", true)).toBe(
      "continuous_static",
    );
    expect(ignitionModeForGeometry("spot", false)).toBe("spot");
    expect(ignitionModeForGeometry("custom_api_mode", true)).toBe(
      "custom_api_mode",
    );
  });

  test("includes unknown mode as current selectable option", () => {
    const options = ignitionModeOptionsForCurrent("custom_api_mode");
    expect(options[0]?.value).toBe("custom_api_mode");
    expect(options.some((entry) => entry.value === "continuous_static")).toBe(true);
  });
});
