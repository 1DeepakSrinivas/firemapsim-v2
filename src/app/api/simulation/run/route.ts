import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

import {
  classifySimulationError,
  runSimulationWithDynamicWeather,
} from "@/lib/api/devsFireBackend";
import { upsertLocalUserFromClerk } from "@/lib/user-store";

export const runtime = "nodejs";

const weatherSchema = z.object({
  windSpeed: z.number(),
  windDirection: z.number(),
  temperature: z.number(),
  humidity: z.number(),
});

const segmentSchema = z.object({
  type: z.string().optional(),
  start_x: z.number(),
  start_y: z.number(),
  end_x: z.number(),
  end_y: z.number(),
  speed: z.number(),
  mode: z.string(),
  distance: z.number().nullable().optional(),
});

const teamSchema = z.object({
  team_name: z.string(),
  info_num: z.number().optional(),
  details: z.array(segmentSchema),
});

const supSchema = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});

const planSchema = z
  .object({
    info_type: z.string().optional(),
    team_num: z.number().optional(),
    total_sim_time: z.number().optional(),
    windSpeed: z.number().optional(),
    windDegree: z.number().optional(),
    temperature: z.number().optional(),
    humidity: z.number().optional(),
    team_infos: z.array(teamSchema),
    sup_infos: z.array(supSchema),
    proj_center_lng: z.number(),
    proj_center_lat: z.number(),
    cellResolution: z.number().positive(),
    cellSpaceDimension: z.number().int().positive(),
    cellSpaceDimensionLat: z.number().int().positive(),
    boundaryGeoJSON: z.unknown().optional().nullable(),
    fuel_data_adjusted: z.array(z.unknown()).optional(),
    customizedFuelGrid: z.string().optional(),
    slope_data_adjusted: z.array(z.unknown()).optional(),
    aspect_data_adjusted: z.array(z.unknown()).optional(),
    customized_cell_state: z.array(z.unknown()).optional(),
    sup_num: z.number().optional(),
  })
  .passthrough();

export const simulationRunBodySchema = z.object({
  plan: planSchema,
  simulationHours: z.number().int().positive().max(100_000),
  weatherOverrides: weatherSchema.partial().optional(),
});

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clerkUser = await currentUser();
    try {
      await upsertLocalUserFromClerk({
        clerkUserId: userId,
        username: clerkUser?.username ?? null,
        email: clerkUser?.primaryEmailAddress?.emailAddress ?? null,
        name:
          [clerkUser?.firstName, clerkUser?.lastName]
            .filter(Boolean)
            .join(" ") || clerkUser?.username || null,
        imageUrl: clerkUser?.imageUrl ?? null,
      });
    } catch (error) {
      console.warn("Failed to sync Clerk user before simulation run.", error);
    }

    const json = await request.json();
    const body = simulationRunBodySchema.parse(json);

    const hasIgnition = body.plan.team_infos.some((t) => t.details.length > 0);
    if (!hasIgnition) {
      return NextResponse.json(
        { error: "At least one ignition segment is required." },
        { status: 400 },
      );
    }

    try {
      const output = await runSimulationWithDynamicWeather({
        plan: body.plan as import("@/types/ignitionPlan").IgnitionPlan,
        weatherOverrides: body.weatherOverrides,
        simulationHours: body.simulationHours,
      });

      return NextResponse.json({
        userToken: output.result.userToken,
        operations: output.result.operations,
        bbox: output.result.bbox,
        cellResolution: body.plan.cellResolution,
        cellSpaceDimension: body.plan.cellSpaceDimension,
        cellSpaceDimensionLat: body.plan.cellSpaceDimensionLat,
        projCenterLat: body.plan.proj_center_lat,
        projCenterLng: body.plan.proj_center_lng,
        weatherFetched: output.weatherFetched,
        weatherUsed: output.weatherUsed,
        weatherOverrideApplied: output.weatherOverrideApplied,
        weatherSource: output.result.weatherSource,
      });
    } catch (error) {
      const weatherFetchFailure =
        error instanceof Error &&
        (error.message.toLowerCase().includes("open-meteo") ||
          error.message.toLowerCase().includes("weather"));
      if (weatherFetchFailure) {
        return NextResponse.json(
          {
            code: "weather_fetch_failed",
            error: error instanceof Error ? error.message : "Dynamic weather fetch failed",
          },
          { status: 502 },
        );
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 },
      );
    }
    const classified = classifySimulationError(error);
    return NextResponse.json(
      {
        code: classified.code,
        error: classified.message,
        details:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.message
            : undefined,
      },
      { status: classified.status },
    );
  }
}
