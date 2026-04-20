import "server-only";

import { z } from "zod";

import type { PerimeterGeoJSON } from "@/components/map/types";
import { sanitizeLastSimulationForDb } from "@/lib/projectPersistence";
import { buildStats } from "@/lib/simulationOverlay";
import { supabase } from "@/lib/supabase";
import {
  defaultIgnitionPlan,
  normalizeIgnitionPlan,
  type IgnitionPlan,
} from "@/types/ignitionPlan";
import type { LastSimulationSnapshot } from "@/types/lastSimulation";
import type {
  LatestSimulationFinalMetrics,
  LatestSimulationGridMeta,
  LatestSimulationManifest,
  LatestSimulationReplay,
  LatestSimulationSummary,
  SimulationOperation,
} from "@/types/latestSimulation";

const simulationOperationSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
  Operation: z.string(),
  time: z.coerce.number(),
});

const fireOverlayPointSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
  time: z.coerce.number(),
  state: z.enum(["burning", "burned", "unburned"]),
});

const gridMetaSchema = z.object({
  cellResolution: z.coerce.number(),
  cellSpaceDimension: z.coerce.number(),
  cellSpaceDimensionLat: z.coerce.number(),
  projCenterLat: z.coerce.number(),
  projCenterLng: z.coerce.number(),
});

const finalMetricsSchema = z.object({
  perimeterCells: z.array(z.string()),
  burnedArea: z.coerce.number().nullable(),
  perimeterLength: z.coerce.number().nullable(),
  burningCells: z.coerce.number().nullable(),
  unburnedCells: z.coerce.number().nullable(),
});

const summarySchema = z.object({
  completedAt: z.string(),
  weatherSource: z.string(),
  hasExactReplay: z.boolean(),
  operationCount: z.coerce.number(),
  stats: z.object({
    burning: z.coerce.number(),
    burned: z.coerce.number(),
    unburned: z.coerce.number(),
  }),
  finalMetrics: finalMetricsSchema.omit({ perimeterCells: true }),
  gridMeta: gridMetaSchema,
  overlayPreview: z.array(fireOverlayPointSchema),
});

const replaySchema = z.object({
  summary: summarySchema,
  manifest: z.object({
    startedAt: z.string(),
    completedAt: z.string(),
    baseUrl: z.string(),
    projectId: z.string(),
    terrainMode: z.enum(["online", "custom"]),
    weatherMode: z.enum(["static", "windflow"]),
    planSnapshot: z.unknown(),
    weatherFetched: z.unknown(),
    weatherUsed: z.unknown(),
    weatherOverrideApplied: z.array(z.string()),
    setupCalls: z.array(
      z.object({
        path: z.string(),
        params: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional(),
        bodyType: z.enum(["none", "text"]).optional(),
      }),
    ),
    executionCalls: z.array(
      z.object({
        path: z.string(),
        params: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional(),
        bodyType: z.enum(["none", "text"]).optional(),
      }),
    ),
    axisConventionCheck: z
      .object({
        checked: z.boolean(),
        transposeLikely: z.boolean(),
        firstIgnition: z
          .object({
            x: z.coerce.number(),
            y: z.coerce.number(),
          })
          .optional(),
        firstBurnTeam: z
          .object({
            x: z.coerce.number(),
            y: z.coerce.number(),
            time: z.coerce.number(),
          })
          .optional(),
      })
      .optional(),
  }),
  operations: z.array(simulationOperationSchema),
  overlay: z.array(fireOverlayPointSchema),
  perimeterGeoJSON: z.unknown().nullable(),
  finalMetrics: finalMetricsSchema,
});

const legacySnapshotSchema = z.object({
  overlay: z.array(fireOverlayPointSchema),
  perimeterGeoJSON: z.unknown().nullable().optional(),
  weatherSource: z.string().optional(),
  completedAt: z.string(),
  gridMeta: gridMetaSchema.optional(),
});

const MAX_OVERLAY_PREVIEW_POINTS = 20_000;

function thinOverlayForPreview(overlay: z.infer<typeof fireOverlayPointSchema>[]) {
  if (overlay.length <= MAX_OVERLAY_PREVIEW_POINTS) {
    return overlay;
  }
  const step = Math.ceil(overlay.length / MAX_OVERLAY_PREVIEW_POINTS);
  const out: z.infer<typeof fireOverlayPointSchema>[] = [];
  for (let i = 0; i < overlay.length; i += step) {
    out.push(overlay[i]!);
  }
  return out;
}

function isMissingStorageError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string }).code;
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205"
  );
}

export function buildLatestSimulationSummary(input: {
  completedAt: string;
  weatherSource: string;
  gridMeta: LatestSimulationGridMeta;
  overlay: z.infer<typeof fireOverlayPointSchema>[];
  finalMetrics: LatestSimulationFinalMetrics;
  operationCount: number;
}): LatestSimulationSummary {
  const overlayPreview = thinOverlayForPreview(input.overlay);
  const stats = buildStats(input.overlay);

  return {
    completedAt: input.completedAt,
    weatherSource: input.weatherSource,
    hasExactReplay: true,
    operationCount: input.operationCount,
    stats: {
      burning: stats.burning,
      burned: stats.burned,
      unburned: stats.unburned,
    },
    finalMetrics: {
      burnedArea: input.finalMetrics.burnedArea,
      perimeterLength: input.finalMetrics.perimeterLength,
      burningCells: input.finalMetrics.burningCells,
      unburnedCells: input.finalMetrics.unburnedCells,
    },
    gridMeta: input.gridMeta,
    overlayPreview,
  };
}

type UpsertLatestSimulationResult = "ok" | "storage-unavailable";

type LatestSimulationProjectRow = {
  last_simulation?: unknown;
  plan?: unknown;
} | null;

function asPlan(raw: unknown): IgnitionPlan {
  if (!raw || typeof raw !== "object") {
    return defaultIgnitionPlan();
  }
  return normalizeIgnitionPlan(raw);
}

function weatherFromPlan(plan: IgnitionPlan) {
  return {
    windSpeed: plan.windSpeed,
    windDirection: plan.windDegree,
    temperature: plan.temperature ?? 72,
    humidity: plan.humidity ?? 38,
  };
}

function gridMetaFromPlan(plan: IgnitionPlan): LatestSimulationGridMeta {
  return {
    cellResolution: plan.cellResolution,
    cellSpaceDimension: plan.cellSpaceDimension,
    cellSpaceDimensionLat: plan.cellSpaceDimensionLat,
    projCenterLat: plan.proj_center_lat,
    projCenterLng: plan.proj_center_lng,
  };
}

function buildReplayFromLastSimulation(params: {
  projectId: string;
  plan: IgnitionPlan;
  snapshot: z.infer<typeof legacySnapshotSchema>;
}): LatestSimulationReplay {
  const gridMeta = params.snapshot.gridMeta ?? gridMetaFromPlan(params.plan);
  const summary = toLegacyOverlaySummary(
    params.snapshot.overlay,
    params.snapshot.completedAt,
    params.snapshot.weatherSource,
    gridMeta,
  );
  const weather = weatherFromPlan(params.plan);

  return {
    summary,
    manifest: {
      startedAt: params.snapshot.completedAt,
      completedAt: params.snapshot.completedAt,
      baseUrl: "legacy",
      projectId: params.projectId,
      terrainMode: "online",
      weatherMode: "static",
      planSnapshot: params.plan,
      weatherFetched: weather,
      weatherUsed: weather,
      weatherOverrideApplied: [],
      setupCalls: [],
      executionCalls: [],
    },
    operations: params.snapshot.overlay.map((point) => ({
      x: point.x,
      y: point.y,
      time: point.time,
      Operation: point.state,
    })),
    overlay: params.snapshot.overlay,
    perimeterGeoJSON: (params.snapshot.perimeterGeoJSON ??
      null) as PerimeterGeoJSON,
    finalMetrics: {
      perimeterCells: [],
      burnedArea: null,
      perimeterLength: null,
      burningCells: null,
      unburnedCells: null,
    },
  };
}

export async function upsertLatestSimulation(params: {
  projectId: string;
  summary: LatestSimulationSummary;
  replay: LatestSimulationReplay;
}): Promise<UpsertLatestSimulationResult> {
  const snapshot = sanitizeLastSimulationForDb({
    overlay: params.replay.overlay,
    perimeterGeoJSON: params.replay.perimeterGeoJSON,
    gridMeta: params.summary.gridMeta,
    weatherSource: params.summary.weatherSource,
    completedAt: params.summary.completedAt,
  } satisfies LastSimulationSnapshot);

  const { error } = await supabase.from("map_projects").update(
    {
      last_simulation: snapshot,
      updated_at: new Date().toISOString(),
    },
  ).eq("id", params.projectId);

  if (!error) {
    return "ok";
  }
  if (isMissingStorageError(error)) {
    return "storage-unavailable";
  }
  throw new Error(error.message);
}

export async function readLatestSimulationSummary(
  projectId: string,
): Promise<LatestSimulationSummary | null> {
  const { data, error } = await supabase
    .from("map_projects")
    .select("last_simulation, plan")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    if (isMissingStorageError(error)) {
      return null;
    }
    throw new Error(error.message);
  }

  const row = data as LatestSimulationProjectRow;
  if (!row) {
    return null;
  }

  const parsedSnapshot = legacySnapshotSchema.safeParse(row.last_simulation);
  if (!parsedSnapshot.success) {
    return null;
  }

  const plan = asPlan(row.plan);
  const gridMeta = parsedSnapshot.data.gridMeta ?? gridMetaFromPlan(plan);
  return toLegacyOverlaySummary(
    parsedSnapshot.data.overlay,
    parsedSnapshot.data.completedAt,
    parsedSnapshot.data.weatherSource,
    gridMeta,
  );
}

export async function readLatestSimulationReplay(
  projectId: string,
): Promise<LatestSimulationReplay | null> {
  const { data, error } = await supabase
    .from("map_projects")
    .select("last_simulation, plan")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    if (isMissingStorageError(error)) {
      return null;
    }
    throw new Error(error.message);
  }

  const row = data as LatestSimulationProjectRow;
  if (!row) {
    return null;
  }

  const parsedSnapshot = legacySnapshotSchema.safeParse(row.last_simulation);
  if (!parsedSnapshot.success) {
    return null;
  }

  const replay = buildReplayFromLastSimulation({
    projectId,
    plan: asPlan(row.plan),
    snapshot: parsedSnapshot.data,
  });
  const parsedReplay = replaySchema.safeParse(replay);
  if (!parsedReplay.success) {
    return null;
  }

  return parsedReplay.data as LatestSimulationReplay;
}

export function toLegacyOverlaySummary(
  overlay: z.infer<typeof fireOverlayPointSchema>[],
  completedAt: string,
  weatherSource: string | undefined,
  gridMeta: LatestSimulationGridMeta,
): LatestSimulationSummary {
  const summary = buildLatestSimulationSummary({
    completedAt,
    weatherSource: weatherSource ?? "dynamic",
    gridMeta,
    overlay,
    finalMetrics: {
      perimeterCells: [],
      burnedArea: null,
      perimeterLength: null,
      burningCells: null,
      unburnedCells: null,
    },
    operationCount: overlay.length,
  });
  return {
    ...summary,
    hasExactReplay: false,
  };
}

export type LatestSimulationSchemas = {
  summary: typeof summarySchema;
  replay: typeof replaySchema;
  operation: typeof simulationOperationSchema;
};

export const latestSimulationSchemas: LatestSimulationSchemas = {
  summary: summarySchema,
  replay: replaySchema,
  operation: simulationOperationSchema,
};

export type ParsedLatestSimulationSummary = z.infer<typeof summarySchema>;
export type ParsedLatestSimulationReplay = z.infer<typeof replaySchema>;
export type ParsedSimulationOperation = z.infer<typeof simulationOperationSchema>;

export type LatestSimulationBuildInput = {
  manifest: LatestSimulationManifest;
  operations: SimulationOperation[];
  overlay: z.infer<typeof fireOverlayPointSchema>[];
  finalMetrics: LatestSimulationFinalMetrics;
};
