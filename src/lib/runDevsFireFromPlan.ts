import "server-only";

import type { WeatherValues } from "@/components/weather/WeatherPreview";
import {
  devsFirePost,
  parseSimulationOperationsResponse,
} from "@/mastra/tools/devsFire/_client";
import type { z } from "zod";

import { simulationOperationListSchema } from "@/mastra/tools/devsFire/_client";
import type { IgnitionPlan } from "@/types/ignitionPlan";

export type RunDevsFireResult = {
  userToken: string;
  operations: z.infer<typeof simulationOperationListSchema>;
  bbox: [number, number, number, number];
  weatherSource: "dynamic";
};

const SUPPRESSED_CELL_BATCH_SIZE = 50;

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
    xs: xsCols.map(String).join(","),
    ys: ysRows.map(String).join(","),
  };
}

export function planSegmentToDynamicIgnition(seg: {
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
}) {
  // DEVS-FIRE setDynamicIgnition expects x=row and y=column.
  // IgnitionPlan stores x=column and y=row.
  return {
    x1: seg.start_y,
    y1: seg.start_x,
    x2: seg.end_y,
    y2: seg.end_x,
  };
}


function mapIgnitionMode(mode: string): string {
  const m = mode.toLowerCase();
  if (m.includes("point") || m.includes("spot")) return "spot";
  return "continuous";
}

function bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stepSpacing: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let stepsSinceLastPoint = stepSpacing;

  while (true) {
    if (stepsSinceLastPoint >= stepSpacing) {
      points.push({ x: x0, y: y0 });
      stepsSinceLastPoint = 1;
    } else {
      stepsSinceLastPoint += 1;
    }

    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return points;
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
  const { plan, weather, simulationHours: simulationTimesteps } = input;

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

  await devsFirePost("/setCellResolution/", userToken, {
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
    const points = bresenhamLine(sup.x1, sup.y1, sup.x2, sup.y2, 1);
    for (let i = 0; i < points.length; i += SUPPRESSED_CELL_BATCH_SIZE) {
      const chunk = points.slice(i, i + SUPPRESSED_CELL_BATCH_SIZE);
      await Promise.all(
        chunk.map((point) =>
          devsFirePost("/setSuppressedCell/", userToken, {
            x1: point.x,
            y1: point.y,
            x2: point.x,
            y2: point.y,
          }),
        ),
      );
    }
  }

  for (const team of plan.team_infos) {
    const pointCols: number[] = [];
    const pointRows: number[] = [];
    let dynamicPathIndex = 0; // Tracks sequence of paths for the SAME team

    for (const seg of team.details) {
      const isPoint =
        seg.start_x === seg.end_x && seg.start_y === seg.end_y;
      const isStaticPoint = isPoint && seg.mode.includes("_static");

      if (isStaticPoint) {
        if (isPoint) {
          pointCols.push(seg.start_x);
          pointRows.push(seg.start_y);
        } else {
          const spacing =
            seg.mode === "point_static" && seg.distance && seg.distance > 0
              ? seg.distance
              : 1;
          const points = bresenhamLine(seg.start_x, seg.start_y, seg.end_x, seg.end_y, spacing);
          for (const p of points) {
            pointCols.push(p.x);
            pointRows.push(p.y);
          }
        }
      } else {
        const i1 = dynamicPathIndex * 2 + 1; // x1, x3, x5...
        const i2 = dynamicPathIndex * 2 + 2; // x2, x4, x6...
        const mapped = planSegmentToDynamicIgnition(seg);
        const dynParams: Record<string, number> = {
          [`x${i1}`]: mapped.x1,
          [`y${i1}`]: mapped.y1,
          [`x${i2}`]: mapped.x2,
          [`y${i2}`]: mapped.y2,
        };
        
        await devsFirePost("/setDynamicIgnition/", userToken, {
          teamNum: team.team_name,
          ...dynParams,
          speed: seg.speed,
          mode: mapIgnitionMode(seg.mode),
          distance:
            seg.mode === "continuous_static"
              ? (seg.distance && seg.distance > 0 ? seg.distance : 5)
              : seg.distance ?? undefined,
        });

        dynamicPathIndex++;
      }
    }
    if (pointCols.length > 0) {
      const { xs, ys } = planPointToDevsFirePointIgnition(pointCols, pointRows);
      await devsFirePost("/setPointIgnition/", userToken, { xs, ys });
    }
  }

  // DEVS-FIRE time scale: 1 timestep = roughly 1 second of real fire spread
  const timeSteps = Math.max(1, Math.min(100_000, Math.floor(simulationTimesteps)));
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
