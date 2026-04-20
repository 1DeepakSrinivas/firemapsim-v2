import { auth } from "@clerk/nextjs/server";
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
import { normalizeIgnitionPlan } from "@/types/ignitionPlan";
import { simulationRunBodySchema } from "@/app/api/simulation/run/route";
import { errorEnvelope, successEnvelope } from "@/lib/devsfire/envelope";
import { DevsFireError } from "@/lib/devsfire/errors";
import { setSessionCookie } from "@/lib/devsfire/session";

export const runtime = "nodejs";
export const maxDuration = 300;

const delegateBodySchema = simulationRunBodySchema.extend({
  reason: z.string().optional(),
});

/**
 * Agent-triggerable simulation runner.
 * Keeps DEVS-FIRE execution outside the agent tool layer.
 */
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
    const json = await request.json();
    const body = delegateBodySchema.parse(json);
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

    let output: Awaited<ReturnType<typeof runSimulationWithDynamicWeather>>;
    try {
      output = await runSimulationWithDynamicWeather({
        projectId: body.projectId,
        plan: normalizedPlan,
        weatherOverrides: body.weatherOverrides,
        simulationHours: body.simulationHours,
      });
    } catch (error) {
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
        "Failed to persist latest simulation snapshot for delegate run; returning successful response.",
        storageError,
      );
    }

    const response = successEnvelope(request, {
      ok: true,
      reason: body.reason ?? null,
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
