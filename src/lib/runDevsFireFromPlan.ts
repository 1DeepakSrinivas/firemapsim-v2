import "server-only";

import type { WeatherValues } from "@/components/weather/WeatherPreview";
import { validateAllCoordinates } from "@/lib/devsFireCoordinateValidation";
import {
  buildIgnitionDispatchCommands,
  enforcePointIgnitionLimit,
} from "@/lib/devsFireIgnitionDispatch";
import {
  DEVS_FIRE_BASE_URL,
} from "@/mastra/tools/devsFire/_client";
import {
  computeBurnedArea,
  computePerimeterLength,
  connectToServer,
  getBurningCellNum,
  getPerimeterCells,
  getUnburnedCellNum,
  loadAspect,
  loadFuel,
  loadSlope,
  loadWindFlow,
  runSimulation,
  setCellResolution,
  setCellSpaceLocation,
  setDynamicIgnition,
  setPointIgnition,
  setSuppressedCell,
  setMultiParameters,
  setWindCondition,
  simulationOperationListSchema,
} from "@/lib/devsfire/endpoints";
import type { HourlyWeatherPoint } from "@/mastra/tools/weather/base";
import type { IgnitionPlan } from "@/types/ignitionPlan";
import type {
  DevsFireCallRecord,
  LatestSimulationFinalMetrics,
  LatestSimulationManifest,
} from "@/types/latestSimulation";
import type { z } from "zod";

export type RunDevsFireResult = {
  userToken: string;
  operations: z.infer<typeof simulationOperationListSchema>;
  bbox: [number, number, number, number];
  weatherSource: "dynamic" | "plan";
  manifest: LatestSimulationManifest;
  finalMetrics: LatestSimulationFinalMetrics;
};

const SUPPRESSED_CELL_BATCH_SIZE = 50;
const TIMESTEPS_PER_HOUR = 500;
const ENABLE_DEVS_FIRE_WINDFLOW =
  process.env.DEVS_FIRE_ENABLE_WINDFLOW === "1" ||
  process.env.DEVS_FIRE_ENABLE_WINDFLOW?.toLowerCase() === "true";
const ENABLE_DEVS_FIRE_MULTI_PARAMETERS =
  process.env.DEVS_FIRE_USE_MULTI_PARAMETERS === "1" ||
  process.env.DEVS_FIRE_USE_MULTI_PARAMETERS?.toLowerCase() === "true";

const CONNECT_RETRY_ATTEMPTS = 3;
const RUN_SIMULATION_RETRY_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 1_000;

export function meteoToDevsFireWindDirection(meteoDirection: number): number {
  return (meteoDirection + 180) % 360;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableDevsFireError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("abort") ||
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    /request failed for .*: 5\d\d/.test(message)
  );
}

async function withDevsFireRetry<T>(
  label: string,
  attempts: number,
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const shouldRetry =
        attempt < attempts && isRetryableDevsFireError(error);
      if (!shouldRetry) {
        throw error;
      }
      const waitMs = RETRY_BASE_DELAY_MS * attempt;
      const message =
        error instanceof Error ? error.message : "Unknown DEVS-FIRE error";
      console.warn(
        `[devs-fire] ${label} attempt ${attempt}/${attempts} failed; retrying in ${waitMs}ms`,
        message,
      );
      await sleep(waitMs);
    }
  }

  throw (lastError instanceof Error
    ? lastError
    : new Error(`DEVS-FIRE ${label} failed after ${attempts} attempts.`));
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

function normalizeMatrixRows(value: unknown): number[][] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length === 0) continue;
    const next = row
      .map((cell) => Number(cell))
      .filter((cell) => Number.isFinite(cell));
    if (next.length === row.length) {
      rows.push(next);
    }
  }
  return rows;
}

function matrixToText(rows: number[][]): string {
  return rows.map((row) => row.join("\t")).join("\n");
}

function resolveFuelMapContent(plan: IgnitionPlan): string | null {
  const fromString = plan.customizedFuelGrid?.trim();
  if (fromString) {
    return fromString;
  }
  const rows = normalizeMatrixRows(plan.fuel_data_adjusted);
  if (rows.length === 0) return null;
  return matrixToText(rows);
}

function resolveSlopeMapContent(plan: IgnitionPlan): string | null {
  const rows = normalizeMatrixRows(plan.slope_data_adjusted);
  if (rows.length === 0) return null;
  return matrixToText(rows);
}

function resolveAspectMapContent(plan: IgnitionPlan): string | null {
  const rows = normalizeMatrixRows(plan.aspect_data_adjusted);
  if (rows.length === 0) return null;
  return matrixToText(rows);
}

function buildWindflowContent(
  hourlyWeather: HourlyWeatherPoint[],
  simulationTimesteps: number,
): string | null {
  if (!hourlyWeather.length) return null;
  const durationHours = Math.max(1, Math.ceil(simulationTimesteps / TIMESTEPS_PER_HOUR));
  const rowCount = Math.min(durationHours, hourlyWeather.length);
  if (rowCount <= 0) return null;

  const rows = hourlyWeather.slice(0, rowCount).map((point, hour) => {
    const windDirection = Number(
      meteoToDevsFireWindDirection(point.windDirection).toFixed(2),
    );
    return `${hour}\t0\t${Number(point.temperature.toFixed(2))}\t${Number(point.windSpeed.toFixed(2))}\t${windDirection}`;
  });

  return [
    "5",
    String(rowCount),
    "hour\tminute\ttemperature\twind_speed\twind_direction",
    ...rows,
  ].join("\n");
}

async function safeNumericEndpoint(
  userToken: string,
  path: string,
): Promise<number | null> {
  try {
    switch (path) {
      case "/computeBurnedArea/":
        return await computeBurnedArea({ userToken });
      case "/computePerimeterLength/":
        return await computePerimeterLength({ userToken });
      case "/getBurningCellNum/":
        return await getBurningCellNum({ userToken });
      case "/getUnburnedCellNum/":
        return await getUnburnedCellNum({ userToken });
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function safePerimeterCells(userToken: string): Promise<string[]> {
  try {
    return await getPerimeterCells({ userToken });
  } catch {
    return [];
  }
}

export type RunDevsFireInput = {
  plan: IgnitionPlan;
  weather: WeatherValues;
  weatherFetched?: WeatherValues;
  weatherOverrideApplied?: string[];
  hourlyWeather?: HourlyWeatherPoint[];
  weatherSource?: "dynamic" | "plan";
  simulationHours: number;
  projectId?: string;
};

/**
 * Full DEVS-FIRE sequence for a populated IgnitionPlan + scenario weather.
 * Calls the research server directly (no app proxy loop).
 */
export async function executeDevsFireSimulation(
  input: RunDevsFireInput,
): Promise<RunDevsFireResult> {
  const startedAt = new Date().toISOString();
  const {
    plan,
    weather,
    weatherFetched = weather,
    weatherOverrideApplied = [],
    hourlyWeather = [],
    weatherSource = "dynamic",
    simulationHours: simulationTimesteps,
  } = input;

  const fuelContent = resolveFuelMapContent(plan);
  const slopeContent = resolveSlopeMapContent(plan);
  const aspectContent = resolveAspectMapContent(plan);
  const usesCustomTerrain = Boolean(fuelContent || slopeContent || aspectContent);

  if (!usesCustomTerrain && (!plan.proj_center_lat || !plan.proj_center_lng)) {
    throw new Error("Project center (proj_center_lat / proj_center_lng) is required.");
  }

  const setupCalls: DevsFireCallRecord[] = [];
  const executionCalls: DevsFireCallRecord[] = [];

  let lastStepLabel = "connectToServer";
  const withStep = async <T>(path: string, action: () => Promise<T>): Promise<T> => {
    lastStepLabel = path;
    return action();
  };

  const connectResult = await withDevsFireRetry(
    "connectToServer",
    CONNECT_RETRY_ATTEMPTS,
    () => connectToServer(),
  );
  const userToken = connectResult.token;

  const cellDimension = Math.max(plan.cellSpaceDimension, plan.cellSpaceDimensionLat);

  // Pre-validate all coordinates before making any DEVS-FIRE calls.
  // Build the dispatch early so we can check ignition coords too.
  const ignitionDispatch = buildIgnitionDispatchCommands(plan);
  enforcePointIgnitionLimit(ignitionDispatch.pointIgnitionCount);
  validateAllCoordinates(plan, ignitionDispatch.commands, cellDimension);

  try {

  let usedMultiParameters = false;
  if (ENABLE_DEVS_FIRE_MULTI_PARAMETERS && !usesCustomTerrain) {
    try {
      setupCalls.push({
        path: "/setMultiParameters/",
        params: {
          lat: plan.proj_center_lat,
          lng: plan.proj_center_lng,
          windSpeed: weather.windSpeed,
          windDirection: meteoToDevsFireWindDirection(weather.windDirection),
          cellResolution: plan.cellResolution,
          cellDimension,
        },
      });
      await withStep("/setMultiParameters/", () =>
        setMultiParameters({
          userToken,
          lat: plan.proj_center_lat,
          lng: plan.proj_center_lng,
          windSpeed: weather.windSpeed,
          windDirection: meteoToDevsFireWindDirection(weather.windDirection),
          cellResolution: plan.cellResolution,
          cellDimension,
        }),
      );
      usedMultiParameters = true;
    } catch {
      usedMultiParameters = false;
    }
  }

  if (!usedMultiParameters) {
    setupCalls.push({
      path: "/setCellResolution/",
      params: {
        cellResolution: plan.cellResolution,
        cellDimension,
      },
    });
    await withStep("/setCellResolution/", () =>
      setCellResolution({
        userToken,
        cellResolution: plan.cellResolution,
        cellDimension,
      }),
    );
  }

  if (usesCustomTerrain) {
    if (fuelContent) {
      setupCalls.push({
        path: "/loadFuel/",
        params: { fuelMap: "fuel.txt" },
        bodyType: "text",
      });
      await withStep("/loadFuel/", () =>
        loadFuel({
          userToken,
          fileName: "fuel.txt",
          fileContent: fuelContent,
        }),
      );
    }
    if (slopeContent) {
      setupCalls.push({
        path: "/loadSlope/",
        params: { slopeMap: "slope.txt" },
        bodyType: "text",
      });
      await withStep("/loadSlope/", () =>
        loadSlope({
          userToken,
          fileName: "slope.txt",
          fileContent: slopeContent,
        }),
      );
    }
    if (aspectContent) {
      setupCalls.push({
        path: "/loadAspect/",
        params: { aspectMap: "aspect.txt" },
        bodyType: "text",
      });
      await withStep("/loadAspect/", () =>
        loadAspect({
          userToken,
          fileName: "aspect.txt",
          fileContent: aspectContent,
        }),
      );
    }
  } else if (!usedMultiParameters) {
    setupCalls.push({
      path: "/setCellSpaceLocation/",
      params: {
        lat: plan.proj_center_lat,
        lng: plan.proj_center_lng,
      },
    });
    await withStep("/setCellSpaceLocation/", () =>
      setCellSpaceLocation({
        userToken,
        lat: plan.proj_center_lat,
        lng: plan.proj_center_lng,
      }),
    );
  }

  const windflowContent = ENABLE_DEVS_FIRE_WINDFLOW
    ? buildWindflowContent(hourlyWeather, simulationTimesteps)
    : null;
  let weatherMode: "static" | "windflow" = "static";
  let shouldApplyStaticWind = !usedMultiParameters;
  if (windflowContent) {
    try {
      setupCalls.push({
        path: "/loadWindFlow/",
        params: { weatherMap: "weather_artificial.txt" },
        bodyType: "text",
      });
      await withStep("/loadWindFlow/", () =>
        loadWindFlow({
          userToken,
          fileName: "weather_artificial.txt",
          fileContent: windflowContent,
        }),
      );
      weatherMode = "windflow";
      shouldApplyStaticWind = false;
    } catch {
      // Fallback to static wind so simulation still runs if windflow upload is rejected.
      shouldApplyStaticWind = true;
    }
  }
  if (shouldApplyStaticWind) {
    const devsFireWindDirection = meteoToDevsFireWindDirection(weather.windDirection);
    setupCalls.push({
      path: "/setWindCondition/",
      params: {
        windSpeed: weather.windSpeed,
        windDirection: devsFireWindDirection,
      },
    });
    await withStep("/setWindCondition/", () =>
      setWindCondition({
        userToken,
        windSpeed: weather.windSpeed,
        windDirection: devsFireWindDirection,
      }),
    );
  }

  for (const sup of plan.sup_infos) {
    // Plan stores x=column, y=row; DEVS-FIRE setSuppressedCell expects x=row, y=column.
    // Swap coordinates to match the same convention used by planSegmentToDynamicIgnition.
    const dfX1 = sup.y1;
    const dfY1 = sup.x1;
    const dfX2 = sup.y2;
    const dfY2 = sup.x2;
    const points = bresenhamLine(dfX1, dfY1, dfX2, dfY2, 1);
    setupCalls.push({
      path: "/setSuppressedCell/",
      params: {
        x1: dfX1,
        y1: dfY1,
        x2: dfX2,
        y2: dfY2,
        pointCount: points.length,
      },
    });
    for (let i = 0; i < points.length; i += SUPPRESSED_CELL_BATCH_SIZE) {
      const chunk = points.slice(i, i + SUPPRESSED_CELL_BATCH_SIZE);
      await Promise.all(
        chunk.map((point) =>
          withStep("/setSuppressedCell/", () =>
            setSuppressedCell({
              userToken,
              x1: point.x,
              y1: point.y,
              x2: point.x,
              y2: point.y,
            }),
          ),
        ),
      );
    }
  }

  // ignitionDispatch was already built and validated before the try block.

  for (const command of ignitionDispatch.commands) {
    if (command.kind === "setPointIgnition") {
      const { xs, ys } = planPointToDevsFirePointIgnition(command.xs, command.ys);
      setupCalls.push({
        path: "/setPointIgnition/",
        params: { xs, ys },
      });
      await withStep("/setPointIgnition/", () =>
        setPointIgnition({ userToken, xs, ys }),
      );
      continue;
    }

    const dynParams: Record<string, number | string> = {
      x1: command.x1,
      y1: command.y1,
      x2: command.x2,
      y2: command.y2,
      teamNum: command.teamName,
      speed: command.speed,
      mode: command.mode,
    };
    if (typeof command.distance === "number" && Number.isFinite(command.distance)) {
      dynParams.distance = command.distance;
    }
    setupCalls.push({
      path: "/setDynamicIgnition/",
      params: dynParams,
    });
    await withStep("/setDynamicIgnition/", () =>
      setDynamicIgnition({
        userToken,
        teamNum: String(dynParams.teamNum),
        x1: Number(dynParams.x1),
        y1: Number(dynParams.y1),
        x2: Number(dynParams.x2),
        y2: Number(dynParams.y2),
        speed: Number(dynParams.speed),
        mode: typeof dynParams.mode === "string" ? dynParams.mode : undefined,
        distance:
          typeof dynParams.distance === "number" ? dynParams.distance : undefined,
      }),
    );
  }

  // DEVS-FIRE time scale: 1 timestep = roughly 1 second of real fire spread
  const timeSteps = Math.max(1, Math.min(100_000, Math.floor(simulationTimesteps)));
  executionCalls.push({
    path: "/runSimulation/",
    params: { time: timeSteps },
  });
  const operations = await withDevsFireRetry(
    "runSimulation",
    RUN_SIMULATION_RETRY_ATTEMPTS,
    () => withStep("/runSimulation/", () => runSimulation({ userToken, time: timeSteps })),
  );

  const finalMetrics: LatestSimulationFinalMetrics = {
    perimeterCells: await safePerimeterCells(userToken),
    burnedArea: await safeNumericEndpoint(userToken, "/computeBurnedArea/"),
    perimeterLength: await safeNumericEndpoint(userToken, "/computePerimeterLength/"),
    burningCells: await safeNumericEndpoint(userToken, "/getBurningCellNum/"),
    unburnedCells: await safeNumericEndpoint(userToken, "/getUnburnedCellNum/"),
  };

  const completedAt = new Date().toISOString();
  const manifest: LatestSimulationManifest = {
    startedAt,
    completedAt,
    baseUrl: DEVS_FIRE_BASE_URL,
    projectId: input.projectId ?? "unknown-project",
    terrainMode: usesCustomTerrain ? "custom" : "online",
    weatherMode,
    planSnapshot: plan,
    weatherFetched,
    weatherUsed: weather,
    weatherOverrideApplied,
    setupCalls,
    executionCalls,
  };

  return {
    userToken,
    operations,
    bbox: bboxFromPlan(plan),
    weatherSource,
    manifest,
    finalMetrics,
  };

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `[devs-fire] Simulation failed at step "${lastStepLabel}" (project: ${input.projectId ?? "unknown"}):`,
      msg,
    );
    throw error;
  }
}
