import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  readLatestSimulationReplay,
  toLegacyOverlaySummary,
} from "@/lib/latestSimulationStore";
import { supabase } from "@/lib/supabase";
import type { LatestSimulationReplay } from "@/types/latestSimulation";
import {
  defaultIgnitionPlan,
  normalizeIgnitionPlan,
  type IgnitionPlan,
} from "@/types/ignitionPlan";
import type { PerimeterGeoJSON } from "@/components/map/types";

const projectIdSchema = z.string().uuid();

const legacySnapshotSchema = z.object({
  overlay: z.array(
    z.object({
      x: z.coerce.number(),
      y: z.coerce.number(),
      time: z.coerce.number(),
      state: z.enum(["burning", "burned", "unburned"]),
    }),
  ),
  perimeterGeoJSON: z.unknown().nullable().optional(),
  weatherSource: z.string().optional(),
  completedAt: z.string(),
});

type RouteContext = { params: Promise<{ projectId: string }> };

function asPlan(raw: unknown): IgnitionPlan {
  if (!raw || typeof raw !== "object") return defaultIgnitionPlan();
  return normalizeIgnitionPlan(raw);
}

export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedProjectId = projectIdSchema.safeParse((await context.params).projectId);
  if (!parsedProjectId.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const projectId = parsedProjectId.data;

  const { data: project, error: projectErr } = await supabase
    .from("map_projects")
    .select("user_id, plan")
    .eq("id", projectId)
    .maybeSingle();

  if (projectErr || !project || project.user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const replay = await readLatestSimulationReplay(projectId);
  if (replay) {
    return NextResponse.json({ latestSimulationReplay: replay });
  }

  const { data: legacyData } = await supabase
    .from("map_projects")
    .select("last_simulation")
    .eq("id", projectId)
    .maybeSingle();
  const legacyParsed = legacySnapshotSchema.safeParse(
    (legacyData as { last_simulation?: unknown } | null)?.last_simulation,
  );
  if (!legacyParsed.success) {
    return NextResponse.json(
      { error: "No simulation replay is available yet." },
      { status: 404 },
    );
  }

  const plan = asPlan((project as { plan?: unknown }).plan);
  const summary = toLegacyOverlaySummary(
    legacyParsed.data.overlay,
    legacyParsed.data.completedAt,
    legacyParsed.data.weatherSource,
    {
      cellResolution: plan.cellResolution,
      cellSpaceDimension: plan.cellSpaceDimension,
      cellSpaceDimensionLat: plan.cellSpaceDimensionLat,
      projCenterLat: plan.proj_center_lat,
      projCenterLng: plan.proj_center_lng,
    },
  );

  const fallbackReplay: LatestSimulationReplay = {
    summary,
    manifest: {
      startedAt: legacyParsed.data.completedAt,
      completedAt: legacyParsed.data.completedAt,
      baseUrl: "legacy",
      projectId,
      terrainMode: "online",
      weatherMode: "static",
      planSnapshot: plan,
      weatherFetched: {
        windSpeed: plan.windSpeed,
        windDirection: plan.windDegree,
        temperature: plan.temperature ?? 72,
        humidity: plan.humidity ?? 38,
      },
      weatherUsed: {
        windSpeed: plan.windSpeed,
        windDirection: plan.windDegree,
        temperature: plan.temperature ?? 72,
        humidity: plan.humidity ?? 38,
      },
      weatherOverrideApplied: [],
      setupCalls: [],
      executionCalls: [],
    },
    operations: legacyParsed.data.overlay.map((point) => ({
      x: point.x,
      y: point.y,
      time: point.time,
      Operation: point.state,
    })),
    overlay: legacyParsed.data.overlay,
    perimeterGeoJSON: (legacyParsed.data.perimeterGeoJSON ?? null) as PerimeterGeoJSON,
    finalMetrics: {
      perimeterCells: [],
      burnedArea: null,
      perimeterLength: null,
      burningCells: null,
      unburnedCells: null,
    },
  };

  return NextResponse.json({ latestSimulationReplay: fallbackReplay });
}
