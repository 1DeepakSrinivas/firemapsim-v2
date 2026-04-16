import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

import {
  classifySimulationError,
  runSimulationWithDynamicWeather,
} from "@/lib/api/devsFireBackend";
import { simulationRunBodySchema } from "@/app/api/simulation/run/route";

export const runtime = "nodejs";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const json = await request.json();
    const body = delegateBodySchema.parse(json);

    const hasIgnition = body.plan.team_infos.some((t) => t.details.length > 0);
    if (!hasIgnition) {
      return NextResponse.json(
        { error: "At least one ignition segment is required." },
        { status: 400 },
      );
    }

    const output = await runSimulationWithDynamicWeather({
      plan: body.plan as import("@/types/ignitionPlan").IgnitionPlan,
      weatherOverrides: body.weatherOverrides,
      simulationHours: body.simulationHours,
    });

    return NextResponse.json({
      ok: true,
      reason: body.reason ?? null,
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
