import { createTool } from "@mastra/core/tools";
import z from "zod";

const segmentDetailSchema = z.object({
  type: z.literal("segment").optional(),
  start_x: z.number().optional(),
  start_y: z.number().optional(),
  end_x: z.number().optional(),
  end_y: z.number().optional(),
  speed: z.number().optional(),
  mode: z.string().optional(),
  distance: z.number().nullable().optional(),
});

const teamInfoSchema = z.object({
  team_name: z.string().optional(),
  info_num: z.number().int().optional(),
  details: z.array(segmentDetailSchema).optional(),
});

const supInfoSchema = z.object({
  x1: z.number().optional(),
  y1: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
});

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
    info_type: z.string().optional(),
    team_num: z.number().int().optional(),
    total_sim_time: z.number().int().positive().optional(),
    windSpeed: z.number().optional(),
    windDegree: z.number().optional(),
    temperature: z.number().optional(),
    humidity: z.number().optional(),
    team_infos: z.array(teamInfoSchema).optional(),
    sup_infos: z.array(supInfoSchema).optional(),
    proj_center_lng: z.number().optional(),
    proj_center_lat: z.number().optional(),
    fuel_data_adjusted: z.array(z.unknown()).optional(),
    customizedFuelGrid: z.string().optional(),
    slope_data_adjusted: z.array(z.unknown()).optional(),
    aspect_data_adjusted: z.array(z.unknown()).optional(),
    cellResolution: z.number().int().positive().optional(),
    cellSpaceDimension: z.number().int().positive().optional(),
    cellSpaceDimensionLat: z.number().int().positive().optional(),
    customized_cell_state: z.array(z.unknown()).optional(),
    sup_num: z.number().int().optional(),
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
