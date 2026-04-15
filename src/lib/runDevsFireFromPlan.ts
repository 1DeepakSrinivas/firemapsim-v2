import "server-only";

import type { WeatherValues } from "@/components/weather/WeatherPreview";
import {
  devsFirePost,
  parseSimulationOperationsResponse,
} from "@/mastra/tools/devsFire/_client";
import type { z } from "zod";

import { simulationOperationListSchema } from "@/mastra/tools/devsFire/_client";
import type { IgnitionPlan, SupInfo } from "@/types/ignitionPlan";

export type RunDevsFireResult = {
  userToken: string;
  operations: z.infer<typeof simulationOperationListSchema>;
  bbox: [number, number, number, number];
  weatherSource: "dynamic";
};

export function meteoToDevsFireWindDirection(meteoDirection: number): number {
  return (meteoDirection + 180) % 360;
}

function parseToken(data: unknown): string {
  const isHtmlLikeToken = (value: string): boolean => {
    const trimmed = value.trimStart().toLowerCase();
    return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
  };

  if (typeof data === "string") {
    const t = data.trim();
    if (t) {
      if (isHtmlLikeToken(t)) {
        throw new Error(
          "DEVS-FIRE connectToServer returned HTML instead of a token. Check DEVS_FIRE_BASE_URL (expected https://firesim.cs.gsu.edu/api).",
        );
      }
      return t;
    }
  }
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const token = o.token ?? o.userToken;
    if (typeof token === "string" && token.trim()) {
      const trimmed = token.trim();
      if (isHtmlLikeToken(trimmed)) {
        throw new Error(
          "DEVS-FIRE connectToServer returned HTML instead of a token. Check DEVS_FIRE_BASE_URL (expected https://firesim.cs.gsu.edu/api).",
        );
      }
      return trimmed;
    }
  }
  throw new Error("DEVS-FIRE connectToServer response did not include a token");
}

/**
 * DEVS-FIRE API uses row/column naming inconsistently across endpoints.
 * `runSimulation` returns x = column, y = row. `setPointIgnition` query params are
 * documented as xs = rows, ys = columns. Our IgnitionPlan stores grid x ≈ column, y ≈ row.
 */
export function planPointToDevsFirePointIgnition(xsCols: number[], ysRows: number[]) {
  return {
    xs: ysRows.map(String).join(","),
    ys: xsCols.map(String).join(","),
  };
}

export function planSegmentToDynamicIgnition(seg: {
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
}) {
  return {
    x1: seg.start_y,
    y1: seg.start_x,
    x2: seg.end_y,
    y2: seg.end_x,
  };
}

export function planSupToDevsFireRect(s: SupInfo) {
  return {
    x1: s.y1,
    y1: s.x1,
    x2: s.y2,
    y2: s.x2,
  };
}

function mapIgnitionMode(mode: string): string {
  const m = mode.toLowerCase();
  if (m.includes("spot")) return "spot";
  return "continuous";
}

function bboxFromPlan(plan: IgnitionPlan): [number, number, number, number] {
  const g = plan.boundaryGeoJSON;
  if (g?.type === "Polygon" && g.coordinates[0]?.length) {
    const ring = g.coordinates[0];
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const c of ring) {
      const [lng, lat] = c;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    if (Number.isFinite(minLng)) {
      return [minLng, minLat, maxLng, maxLat];
    }
  }
  const pad = 0.02;
  return [
    plan.proj_center_lng - pad,
    plan.proj_center_lat - pad,
    plan.proj_center_lng + pad,
    plan.proj_center_lat + pad,
  ];
}

export type RunDevsFireInput = {
  plan: IgnitionPlan;
  weather: WeatherValues;
  simulationHours: number;
};

/**
 * Full DEVS-FIRE sequence for a populated IgnitionPlan + scenario weather.
 * Calls the research server directly (no app proxy loop).
 */
export async function executeDevsFireSimulation(
  input: RunDevsFireInput,
): Promise<RunDevsFireResult> {
  const { plan, weather, simulationHours } = input;

  if (!plan.proj_center_lat || !plan.proj_center_lng) {
    throw new Error("Project center (proj_center_lat / proj_center_lng) is required.");
  }

  const rawConnect = await devsFirePost(
    "/connectToServer",
    undefined,
    {},
    "connect",
    { "Content-Type": "text/plain" },
  );
  const userToken = parseToken(rawConnect);

  const cellDimension = Math.max(
    plan.cellSpaceDimension,
    plan.cellSpaceDimensionLat,
  );
  const devsFireWindDirection = meteoToDevsFireWindDirection(weather.windDirection);

  await devsFirePost("/setMultiParameters/", userToken, {
    lat: plan.proj_center_lat,
    lng: plan.proj_center_lng,
    windSpeed: weather.windSpeed,
    windDirection: devsFireWindDirection,
    cellResolution: plan.cellResolution,
    cellDimension,
  });

  await devsFirePost("/setCellSpaceLocation/", userToken, {
    lat: plan.proj_center_lat,
    lng: plan.proj_center_lng,
  });

  await devsFirePost("/setWindCondition/", userToken, {
    windSpeed: weather.windSpeed,
    windDirection: devsFireWindDirection,
  });

  for (const sup of plan.sup_infos) {
    const r = planSupToDevsFireRect(sup);
    await devsFirePost("/setSuppressedCell/", userToken, r);
  }

  for (const team of plan.team_infos) {
    const pointCols: number[] = [];
    const pointRows: number[] = [];
    for (const seg of team.details) {
      const isPoint =
        seg.start_x === seg.end_x && seg.start_y === seg.end_y;
      if (isPoint) {
        pointCols.push(seg.start_x);
        pointRows.push(seg.start_y);
      } else {
        const dyn = planSegmentToDynamicIgnition(seg);
        await devsFirePost("/setDynamicIgnition/", userToken, {
          teamNum: team.team_name,
          ...dyn,
          speed: seg.speed,
          mode: mapIgnitionMode(seg.mode),
          distance: seg.distance ?? undefined,
        });
      }
    }
    if (pointCols.length > 0) {
      const { xs, ys } = planPointToDevsFirePointIgnition(pointCols, pointRows);
      await devsFirePost("/setPointIgnition/", userToken, { xs, ys });
    }
  }

  const timeSteps = Math.max(1, Math.min(100_000, Math.floor(simulationHours)));
  const runData = await devsFirePost("/runSimulation/", userToken, {
    time: timeSteps,
  });
  const operations = parseSimulationOperationsResponse(runData, "/runSimulation/");

  return {
    userToken,
    operations,
    bbox: bboxFromPlan(plan),
    weatherSource: "dynamic",
  };
}
