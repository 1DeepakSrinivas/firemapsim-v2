import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

import {
  classifySimulationError,
  runSimulationWithDynamicWeather,
} from "@/lib/api/devsFireBackend";
import {
  buildLatestSimulationSummary,
  upsertLatestSimulation,
} from "@/lib/latestSimulationStore";
import { normalizeOverlay } from "@/lib/simulationOverlay";
import { supabase } from "@/lib/supabase";
import type { LatestSimulationReplay } from "@/types/latestSimulation";
import { upsertLocalUserFromClerk } from "@/lib/user-store";
import { normalizeIgnitionPlan } from "@/types/ignitionPlan";
import { errorEnvelope, successEnvelope } from "@/lib/devsfire/envelope";
import { DevsFireError } from "@/lib/devsfire/errors";
import { setSessionCookie } from "@/lib/devsfire/session";

export const runtime = "nodejs";
export const maxDuration = 300;

const weatherSchema = z.object({
  windSpeed: z.coerce.number(),
  windDirection: z.coerce.number(),
  temperature: z.coerce.number(),
  humidity: z.coerce.number(),
});

const segmentSchema = z.object({
  type: z.string().optional(),
  start_x: z.coerce.number(),
  start_y: z.coerce.number(),
  end_x: z.coerce.number(),
  end_y: z.coerce.number(),
  speed: z.coerce.number(),
  mode: z.string(),
  distance: z.coerce.number().nullable().optional(),
});

const teamSchema = z.object({
  team_name: z.string(),
  info_num: z.coerce.number().optional(),
  details: z.array(segmentSchema),
});

const supSchema = z.object({
  type: z.string().optional(),
  x1: z.coerce.number().optional(),
  y1: z.coerce.number().optional(),
  x2: z.coerce.number().optional(),
  y2: z.coerce.number().optional(),
  start_x: z.coerce.number().optional(),
  start_y: z.coerce.number().optional(),
  end_x: z.coerce.number().optional(),
  end_y: z.coerce.number().optional(),
});

const planSchema = z
  .object({
    info_type: z.string().optional(),
    name: z.string().optional(),
    team_num: z.coerce.number().optional(),
    total_sim_time: z.coerce.number().optional(),
    windSpeed: z.coerce.number().optional(),
    windDegree: z.coerce.number().optional(),
    temperature: z.coerce.number().optional(),
    humidity: z.coerce.number().optional(),
    team_infos: z.array(teamSchema),
    sup_infos: z.array(supSchema),
    proj_center_lng: z.coerce.number(),
    proj_center_lat: z.coerce.number(),
    cellResolution: z.coerce.number().positive(),
    cellSpaceDimension: z.coerce.number().int().positive(),
    cellSpaceDimensionLat: z.coerce.number().int().positive(),
    boundaryGeoJSON: z.unknown().optional().nullable(),
    fuel_data_adjusted: z.array(z.unknown()).optional(),
    customizedFuelGrid: z.string().optional(),
    slope_data_adjusted: z.array(z.unknown()).optional(),
    aspect_data_adjusted: z.array(z.unknown()).optional(),
    customized_cell_state: z.array(z.unknown()).optional(),
    sup_num: z.coerce.number().optional(),
  })
  .passthrough();

export const simulationRunBodySchema = z.object({
  projectId: z.string().uuid(),
  plan: planSchema,
  simulationHours: z.coerce.number().int().positive().max(100_000),
  weatherOverrides: weatherSchema.partial().optional(),
});

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return errorEnvelope(
      request,
      new DevsFireError({
        type: "SimulationError",
        message: "Unauthorized",
        status: 401,
      }),
    );
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
    const normalizedPlan = normalizeIgnitionPlan(body.plan);
    const { data: projectOwner, error: projectOwnerError } = await supabase
      .from("map_projects")
      .select("user_id")
      .eq("id", body.projectId)
      .maybeSingle();
    if (projectOwnerError || !projectOwner || projectOwner.user_id !== userId) {
      return errorEnvelope(
        request,
        new DevsFireError({
          type: "SimulationError",
          message: "Not found",
          status: 404,
        }),
      );
    }

    const hasIgnition = normalizedPlan.team_infos.some((t) => t.details.length > 0);
    if (!hasIgnition) {
      return errorEnvelope(
        request,
        new DevsFireError({
          type: "SimulationError",
          message: "At least one ignition segment is required.",
          status: 400,
        }),
      );
    }

    try {
      const output = await runSimulationWithDynamicWeather({
        projectId: body.projectId,
        plan: normalizedPlan,
        weatherOverrides: body.weatherOverrides,
        simulationHours: body.simulationHours,
      });
      const overlay = normalizeOverlay(output.result.operations);
      const summary = buildLatestSimulationSummary({
        completedAt: output.result.manifest.completedAt,
        weatherSource: output.result.weatherSource,
        operationCount: output.result.operations.length,
        overlay,
        gridMeta: {
          cellResolution: normalizedPlan.cellResolution,
          cellSpaceDimension: normalizedPlan.cellSpaceDimension,
          cellSpaceDimensionLat: normalizedPlan.cellSpaceDimensionLat,
          projCenterLat: normalizedPlan.proj_center_lat,
          projCenterLng: normalizedPlan.proj_center_lng,
        },
        finalMetrics: output.result.finalMetrics,
      });
      const replay: LatestSimulationReplay = {
        summary,
        manifest: {
          ...output.result.manifest,
          projectId: body.projectId,
        },
        operations: output.result.operations,
        overlay,
        perimeterGeoJSON: null,
        finalMetrics: output.result.finalMetrics,
      };
      try {
        await upsertLatestSimulation({
          projectId: body.projectId,
          summary,
          replay,
        });
      } catch (storageError) {
        console.warn(
          "Failed to persist latest simulation snapshot; returning successful run response.",
          storageError,
        );
      }

      const response = successEnvelope(request, {
        operations: output.result.operations,
        bbox: output.result.bbox,
        cellResolution: normalizedPlan.cellResolution,
        cellSpaceDimension: normalizedPlan.cellSpaceDimension,
        cellSpaceDimensionLat: normalizedPlan.cellSpaceDimensionLat,
        projCenterLat: normalizedPlan.proj_center_lat,
        projCenterLng: normalizedPlan.proj_center_lng,
        weatherFetched: output.weatherFetched,
        weatherUsed: output.weatherUsed,
        weatherOverrideApplied: output.weatherOverrideApplied,
        weatherSource: output.result.weatherSource,
        latestSimulationSummary: summary,
        latestSimulationReplay: replay,
      });
      setSessionCookie(response, output.result.userToken);
      return response;
    } catch (error) {
      const weatherFetchFailure =
        error instanceof Error &&
        (error.message.toLowerCase().includes("open-meteo") ||
          error.message.toLowerCase().includes("weather"));
      if (weatherFetchFailure) {
        return errorEnvelope(
          request,
          new DevsFireError({
            type: "ConnectionError",
            message: error instanceof Error ? error.message : "Dynamic weather fetch failed",
            status: 502,
          }),
        );
      }
      const classified = classifySimulationError(error);
      if (classified.code !== "simulation_failed") {
        return NextResponse.json(
          {
            code: classified.code,
            error: classified.message,
            details: classified.details,
            hint: classified.hint,
          },
          { status: classified.status },
        );
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorEnvelope(
        request,
        new DevsFireError({
          type: "SimulationError",
          message: "Invalid request",
          details: JSON.stringify(error.issues),
          status: 400,
        }),
      );
    }
    return errorEnvelope(request, error);
  }
}
