import { describe, expect, test } from "bun:test";

import {
  MAX_POINT_IGNITIONS,
  TooManyPointIgnitionsError,
  buildIgnitionDispatchCommands,
  enforcePointIgnitionLimit,
} from "./devsFireIgnitionDispatch";
import { normalizeIgnitionPlan } from "@/types/ignitionPlan";

describe("buildIgnitionDispatchCommands", () => {
  test("dispatches line segments as direct dynamic ignitions", () => {
    const plan = normalizeIgnitionPlan({
      team_infos: [
        {
          team_name: "team0",
          details: [
            {
              start_x: 10,
              start_y: 190,
              end_x: 11,
              end_y: 8,
              speed: 3,
              mode: "continuous_static",
              distance: null,
            },
            {
              start_x: 11,
              start_y: 8,
              end_x: 193,
              end_y: 7,
              speed: 4,
              mode: "spot",
              distance: 3,
            },
          ],
        },
      ],
      sup_infos: [],
      proj_center_lng: -123.1,
      proj_center_lat: 46.9,
      cellResolution: 30,
      cellSpaceDimension: 200,
      cellSpaceDimensionLat: 200,
    });

    const { commands, pointIgnitionCount } = buildIgnitionDispatchCommands(plan);
    expect(pointIgnitionCount).toBe(0);
    expect(commands).toHaveLength(2);
    expect(commands.every((command) => command.kind === "setDynamicIgnition")).toBe(
      true,
    );

    const [first, second] = commands;
    expect(first).toMatchObject({
      kind: "setDynamicIgnition",
      x1: 190,
      y1: 10,
      x2: 8,
      y2: 11,
      mode: "continuous",
      speed: 3,
      teamName: "team0",
    });
    expect(second).toMatchObject({
      kind: "setDynamicIgnition",
      x1: 8,
      y1: 11,
      x2: 7,
      y2: 193,
      mode: "spot",
      speed: 4,
      distance: 3,
      teamName: "team0",
    });
    expect(Object.hasOwn(first ?? {}, "x3")).toBe(false);
    expect(Object.hasOwn(second ?? {}, "x3")).toBe(false);
  });

  test("keeps true points as setPointIgnition payloads", () => {
    const plan = normalizeIgnitionPlan({
      team_infos: [
        {
          team_name: "team0",
          details: [
            {
              start_x: 10,
              start_y: 10,
              end_x: 10,
              end_y: 10,
              speed: 3,
              mode: "point_static",
              distance: null,
            },
            {
              start_x: 11,
              start_y: 15,
              end_x: 11,
              end_y: 15,
              speed: 3,
              mode: "point_dynamic",
              distance: null,
            },
          ],
        },
      ],
      sup_infos: [],
      proj_center_lng: -123.1,
      proj_center_lat: 46.9,
      cellResolution: 30,
      cellSpaceDimension: 200,
      cellSpaceDimensionLat: 200,
    });

    const { commands, pointIgnitionCount } = buildIgnitionDispatchCommands(plan);
    expect(pointIgnitionCount).toBe(2);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      kind: "setPointIgnition",
      teamName: "team0",
      xs: [10, 11],
      ys: [10, 15],
    });
  });
});

describe("enforcePointIgnitionLimit", () => {
  test("allows <=200 point ignitions", () => {
    expect(() => enforcePointIgnitionLimit(MAX_POINT_IGNITIONS)).not.toThrow();
  });

  test("throws too_many_point_ignitions above limit", () => {
    expect(() => enforcePointIgnitionLimit(MAX_POINT_IGNITIONS + 1)).toThrow(
      TooManyPointIgnitionsError,
    );
    try {
      enforcePointIgnitionLimit(MAX_POINT_IGNITIONS + 1);
    } catch (error) {
      expect(error).toBeInstanceOf(TooManyPointIgnitionsError);
      expect((error as TooManyPointIgnitionsError).code).toBe(
        "too_many_point_ignitions",
      );
      expect((error as TooManyPointIgnitionsError).status).toBe(400);
    }
  });
});
