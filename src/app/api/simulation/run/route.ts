import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

import { executeDevsFireSimulation } from "@/lib/runDevsFireFromPlan";
import { upsertLocalUserFromClerk } from "@/lib/user-store";
import { fetchCurrentWeatherForCoords } from "@/lib/weather/openMeteoCurrent";

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

const bodySchema = z.object({
  plan: planSchema,
  simulationHours: z.number().int().positive().max(100_000),
  weatherOverrides: weatherSchema.partial().optional(),
});

function classifySimulationError(
  error: unknown,
): { code: string; message: string; status: number } {
  const message = error instanceof Error ? error.message : "Unknown error";
  const lower = message.toLowerCase();

  if (
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("abort")
  ) {
    return {
      code: "upstream_timeout",
      message:
        "DEVS-FIRE upstream timed out. Please retry shortly; if it persists, verify server availability.",
      status: 504,
    };
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("couldn't connect") ||
    lower.includes("failed to fetch") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network")
  ) {
    return {
      code: "upstream_unreachable",
      message:
        "DEVS-FIRE upstream is unreachable from the server. Check network/firewall and DEVS_FIRE_BASE_URL.",
      status: 502,
    };
  }

  if (lower.includes("invalid") && lower.includes("response")) {
    return {
      code: "invalid_upstream_response",
      message: "DEVS-FIRE returned an invalid response payload.",
      status: 502,
    };
  }

  return { code: "simulation_failed", message, status: 500 };
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clerkUser = await currentUser();
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

  try {
    const json = await request.json();
    const body = bodySchema.parse(json);

    const hasIgnition = body.plan.team_infos.some((t) => t.details.length > 0);
    if (!hasIgnition) {
      return NextResponse.json(
        { error: "At least one ignition segment is required." },
        { status: 400 },
      );
    }

    let weatherFetched;
    try {
      const fetched = await fetchCurrentWeatherForCoords(
        body.plan.proj_center_lat,
        body.plan.proj_center_lng,
      );
      weatherFetched = fetched.weather;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Dynamic weather fetch failed";
      return NextResponse.json(
        {
          code: "weather_fetch_failed",
          error: message,
        },
        { status: 502 },
      );
    }

    const weatherOverrides = body.weatherOverrides ?? {};
    const weatherUsed = {
      ...weatherFetched,
      ...weatherOverrides,
    };

    const overrideFields = Object.keys(weatherOverrides).filter(
      (k) => weatherOverrides[k as keyof typeof weatherOverrides] !== undefined,
    );

    const result = await executeDevsFireSimulation({
      plan: body.plan as import("@/types/ignitionPlan").IgnitionPlan,
      weather: weatherUsed,
      simulationHours: body.simulationHours,
    });

    return NextResponse.json({
      userToken: result.userToken,
      operations: result.operations,
      bbox: result.bbox,
      cellResolution: body.plan.cellResolution,
      cellSpaceDimension: body.plan.cellSpaceDimension,
      cellSpaceDimensionLat: body.plan.cellSpaceDimensionLat,
      projCenterLat: body.plan.proj_center_lat,
      projCenterLng: body.plan.proj_center_lng,
      weatherFetched,
      weatherUsed,
      weatherOverrideApplied: overrideFields,
      weatherSource: result.weatherSource,
    });
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
