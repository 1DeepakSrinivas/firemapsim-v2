import { createTool } from "@mastra/core/tools";
import z from "zod";

const segmentDetailSchema = z
  .object({
    type: z.string().optional(),
    start_x: z.coerce.number().optional(),
    start_y: z.coerce.number().optional(),
    end_x: z.coerce.number().optional(),
    end_y: z.coerce.number().optional(),
    // Compatibility aliases commonly produced by agent/model outputs.
    x1: z.coerce.number().optional(),
    y1: z.coerce.number().optional(),
    x2: z.coerce.number().optional(),
    y2: z.coerce.number().optional(),
    x: z.coerce.number().optional(),
    y: z.coerce.number().optional(),
    speed: z.coerce.number().optional(),
    mode: z.string().optional(),
    distance: z.coerce.number().nullable().optional(),
  })
  .transform((value) => {
    const startX =
      value.start_x ?? value.x1 ?? value.x ?? value.end_x ?? value.x2;
    const startY =
      value.start_y ?? value.y1 ?? value.y ?? value.end_y ?? value.y2;
    const endX = value.end_x ?? value.x2 ?? startX;
    const endY = value.end_y ?? value.y2 ?? startY;
    return {
      ...(value.type ? { type: value.type } : {}),
      ...(startX !== undefined ? { start_x: startX } : {}),
      ...(startY !== undefined ? { start_y: startY } : {}),
      ...(endX !== undefined ? { end_x: endX } : {}),
      ...(endY !== undefined ? { end_y: endY } : {}),
      ...(value.speed !== undefined ? { speed: value.speed } : {}),
      ...(value.mode !== undefined ? { mode: value.mode } : {}),
      ...(value.distance !== undefined ? { distance: value.distance } : {}),
    };
  });

const teamInfoSchema = z.object({
  team_name: z.string().optional(),
  info_num: z.coerce.number().int().optional(),
  details: z.array(segmentDetailSchema).optional(),
});

const supInfoSchema = z
  .object({
    type: z.string().optional(),
    x1: z.coerce.number().optional(),
    y1: z.coerce.number().optional(),
    x2: z.coerce.number().optional(),
    y2: z.coerce.number().optional(),
    start_x: z.coerce.number().optional(),
    start_y: z.coerce.number().optional(),
    end_x: z.coerce.number().optional(),
    end_y: z.coerce.number().optional(),
  })
  .transform((value) => ({
    x1: value.x1 ?? value.start_x,
    y1: value.y1 ?? value.start_y,
    x2: value.x2 ?? value.end_x,
    y2: value.y2 ?? value.end_y,
    ...(value.type ? { type: value.type } : {}),
  }));

const boundaryGeoSchema = z.union([
  z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
  }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(
      z.array(z.array(z.tuple([z.number(), z.number()]))),
    ),
  }),
]);

export const updatePlanPatchSchema = z
  .object({
    name: z.string().optional(),
    info_type: z.string().optional(),
    team_num: z.coerce.number().int().optional(),
    total_sim_time: z.coerce.number().int().positive().optional(),
    windSpeed: z.coerce.number().optional(),
    windDegree: z.coerce.number().optional(),
    temperature: z.coerce.number().optional(),
    humidity: z.coerce.number().optional(),
    team_infos: z.array(teamInfoSchema).optional(),
    sup_infos: z.array(supInfoSchema).optional(),
    proj_center_lng: z.coerce.number().optional(),
    proj_center_lat: z.coerce.number().optional(),
    fuel_data_adjusted: z.array(z.unknown()).optional(),
    customizedFuelGrid: z.string().optional(),
    slope_data_adjusted: z.array(z.unknown()).optional(),
    aspect_data_adjusted: z.array(z.unknown()).optional(),
    cellResolution: z.coerce.number().int().positive().optional(),
    cellSpaceDimension: z.coerce.number().int().positive().optional(),
    cellSpaceDimensionLat: z.coerce.number().int().positive().optional(),
    customized_cell_state: z.array(z.unknown()).optional(),
    sup_num: z.coerce.number().int().optional(),
    boundaryGeoJSON: boundaryGeoSchema.nullable().optional(),
  })
  .partial();

export const updatePlanTool = createTool({
  id: "update-plan",
  description:
    "Patch frontend simulation plan fields based on user instructions. Provide only the fields explicitly requested or confirmed.",
  inputSchema: updatePlanPatchSchema,
  outputSchema: z.object({
    patch: updatePlanPatchSchema,
  }),
  execute: async (patch) => {
    return { patch };
  },
});
