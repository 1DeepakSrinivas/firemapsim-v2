import { describe, expect, test } from "bun:test";

import { updatePlanPatchSchema } from "@/mastra/tools/api/updatePlan";
import { defaultIgnitionPlan, normalizeIgnitionPlan } from "@/types/ignitionPlan";

describe("updatePlanPatchSchema ignition segment aliases", () => {
  test("maps x1/y1/x2/y2 aliases to canonical ignition segment fields", () => {
    const parsed = updatePlanPatchSchema.parse({
      team_infos: [
        {
          details: [
            {
              x1: 10,
              y1: 20,
              x2: 30,
              y2: 40,
              mode: "continuous",
              speed: 3,
            },
          ],
        },
      ],
    });

    expect(parsed.team_infos?.[0]?.details?.[0]).toEqual({
      start_x: 10,
      start_y: 20,
      end_x: 30,
      end_y: 40,
      mode: "continuous",
      speed: 3,
    });
  });

  test("maps x/y point aliases to canonical point ignition segment fields", () => {
    const parsed = updatePlanPatchSchema.parse({
      team_infos: [
        {
          details: [
            {
              x: 55,
              y: 77,
              mode: "point_static",
              speed: 2,
            },
          ],
        },
      ],
    });

    expect(parsed.team_infos?.[0]?.details?.[0]).toEqual({
      start_x: 55,
      start_y: 77,
      end_x: 55,
      end_y: 77,
      mode: "point_static",
      speed: 2,
    });
  });

  test("alias ignition line patch survives normalize and remains renderable/in-bounds", () => {
    const parsed = updatePlanPatchSchema.parse({
      team_infos: [
        {
          details: [
            {
              x1: -10,
              y1: 10,
              x2: 300,
              y2: 25,
              mode: "continuous",
              speed: 3,
            },
          ],
        },
      ],
    });

    const normalized = normalizeIgnitionPlan({
      ...defaultIgnitionPlan(),
      ...parsed,
      cellSpaceDimension: 200,
      cellSpaceDimensionLat: 200,
    });

    const seg = normalized.team_infos[0]?.details[0];
    expect(seg).toMatchObject({
      start_x: 0,
      start_y: 10,
      end_x: 199,
      end_y: 25,
    });
    expect(seg?.start_x === seg?.end_x && seg?.start_y === seg?.end_y).toBe(false);
  });
});
