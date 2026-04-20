import "server-only";

import z from "zod";

import { devsFireRequest } from "@/lib/devsfire/httpClient";
import { DevsFireError, toErrorMessage } from "@/lib/devsfire/errors";

const operationSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
  Operation: z.string(),
  time: z.coerce.number(),
});

export const simulationOperationListSchema = z.array(operationSchema);
export type SimulationOperation = z.infer<typeof operationSchema>;

const CONNECT_ATTEMPT_TIMEOUT_MS = 15_000;

const CONNECT_ATTEMPTS: Array<{
  endpoint: string;
  method: "POST";
  body: "testtest" | "connect";
  headers: HeadersInit;
}> = [
  {
    endpoint: "/connectToServer/",
    method: "POST",
    body: "testtest",
    headers: { Accept: "application/json" },
  },
  {
    endpoint: "/connectToServer",
    method: "POST",
    body: "testtest",
    headers: { Accept: "application/json" },
  },
  {
    endpoint: "/connectToServer/",
    method: "POST",
    body: "connect",
    headers: { Accept: "application/json", "Content-Type": "text/plain" },
  },
  {
    endpoint: "/connectToServer",
    method: "POST",
    body: "connect",
    headers: { Accept: "application/json", "Content-Type": "text/plain" },
  },
];

function parseConnectToken(data: unknown): string {
  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }
  if (data && typeof data === "object") {
    const value = data as Record<string, unknown>;
    const token = value.token ?? value.userToken;
    if (typeof token === "string" && token.trim()) {
      return token.trim();
    }
  }
  throw new DevsFireError({
    type: "SimulationError",
    message: "connectToServer did not return a valid token.",
  });
}

function parseNumeric(data: unknown, endpoint: string): number {
  const direct = z.coerce.number().safeParse(data);
  if (direct.success) {
    return direct.data;
  }
  if (data && typeof data === "object") {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const nested = z.coerce.number().safeParse(value);
      if (nested.success) {
        return nested.data;
      }
    }
  }
  throw new DevsFireError({
    type: "SimulationError",
    message: `${endpoint} did not return a numeric value.`,
  });
}

function parseStringArray(data: unknown, endpoint: string): string[] {
  const direct = z.array(z.string()).safeParse(data);
  if (direct.success) {
    return direct.data;
  }
  if (data && typeof data === "object") {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const nested = z.array(z.string()).safeParse(value);
      if (nested.success) {
        return nested.data;
      }
    }
  }
  throw new DevsFireError({
    type: "SimulationError",
    message: `${endpoint} did not return a string list.`,
  });
}

function parseNumericMatrix(data: unknown, endpoint: string): number[][] {
  const matrixSchema = z.array(z.array(z.coerce.number()));
  const direct = matrixSchema.safeParse(data);
  if (direct.success) {
    return direct.data;
  }
  if (data && typeof data === "object") {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const nested = matrixSchema.safeParse(value);
      if (nested.success) {
        return nested.data;
      }
    }
  }
  throw new DevsFireError({
    type: "SimulationError",
    message: `${endpoint} did not return a numeric matrix.`,
  });
}

function parseCellState(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (data && typeof data === "object") {
    for (const value of Object.values(data as Record<string, unknown>)) {
      if (typeof value === "string") {
        return value;
      }
    }
  }
  throw new DevsFireError({
    type: "SimulationError",
    message: "getCellState did not return a cell state string.",
  });
}

function parseOperations(data: unknown, endpoint: string): SimulationOperation[] {
  const direct = simulationOperationListSchema.safeParse(data);
  if (direct.success) {
    return direct.data;
  }
  if (data && typeof data === "object") {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const nested = simulationOperationListSchema.safeParse(value);
      if (nested.success) {
        return nested.data;
      }
    }
  }
  throw new DevsFireError({
    type: "SimulationError",
    message: `${endpoint} did not return simulation operations.`,
  });
}

export async function connectToServer() {
  let lastError: unknown = null;
  const attemptSummaries: string[] = [];

  for (const attempt of CONNECT_ATTEMPTS) {
    try {
      const data = await devsFireRequest({
        endpoint: attempt.endpoint,
        method: attempt.method,
        body: attempt.body,
        headers: attempt.headers,
        retries: 1,
        timeoutMs: CONNECT_ATTEMPT_TIMEOUT_MS,
      });
      return { token: parseConnectToken(data) };
    } catch (error) {
      lastError = error;
      if (error instanceof DevsFireError) {
        const status = error.status ? `status=${error.status}` : "status=n/a";
        const details = error.details ? ` details=${error.details}` : "";
        attemptSummaries.push(
          `${attempt.method} ${attempt.endpoint} body=${attempt.body} -> ${error.type} (${status})${details}`,
        );
      } else {
        attemptSummaries.push(
          `${attempt.method} ${attempt.endpoint} body=${attempt.body} -> ${toErrorMessage(error)}`,
        );
      }
    }
  }

  const details = attemptSummaries.join(" | ");
  if (lastError instanceof DevsFireError) {
    throw new DevsFireError({
      type: lastError.type,
      message: lastError.message,
      status: lastError.status,
      details: details || lastError.details,
      causeValue: lastError,
    });
  }

  throw new DevsFireError({
    type: "ConnectionError",
    message: "Failed to connect to DEVS-FIRE.",
    details: details || toErrorMessage(lastError),
    causeValue: lastError,
  });
}

export async function setCellResolution(input: {
  userToken: string;
  cellResolution: number;
  cellDimension: number;
}) {
  return devsFireRequest({
    endpoint: "/setCellResolution/",
    userToken: input.userToken,
    query: {
      cellResolution: input.cellResolution,
      cellDimension: input.cellDimension,
    },
  });
}

export async function getCellSpaceSize(input: { userToken: string }) {
  const data = await devsFireRequest({
    endpoint: "/getCellSpaceSize/",
    userToken: input.userToken,
  });
  return parseNumeric(data, "getCellSpaceSize");
}

export async function getCellSize(input: { userToken: string }) {
  const data = await devsFireRequest({
    endpoint: "/getCellSize/",
    userToken: input.userToken,
  });
  return parseNumeric(data, "getCellSize");
}

export async function setCellSpaceLocation(input: {
  userToken: string;
  lat: number;
  lng: number;
}) {
  return devsFireRequest({
    endpoint: "/setCellSpaceLocation/",
    userToken: input.userToken,
    query: { lat: input.lat, lng: input.lng },
  });
}

export async function setWindCondition(input: {
  userToken: string;
  windSpeed?: number;
  windDirection?: number;
}) {
  return devsFireRequest({
    endpoint: "/setWindCondition/",
    userToken: input.userToken,
    query: {
      windSpeed: input.windSpeed,
      windDirection: input.windDirection,
    },
  });
}

export async function loadWindFlow(input: {
  userToken: string;
  fileContent: string;
  fileName: string;
}) {
  return devsFireRequest({
    endpoint: "/loadWindFlow/",
    userToken: input.userToken,
    query: { weatherMap: input.fileName },
    body: input.fileContent,
    headers: {
      "Content-Type": "text/plain",
      fileName: input.fileName,
    },
  });
}

export async function loadFuel(input: {
  userToken: string;
  fileContent: string;
  fileName: string;
}) {
  return devsFireRequest({
    endpoint: "/loadFuel/",
    userToken: input.userToken,
    query: { fuelMap: input.fileName },
    body: input.fileContent,
    headers: {
      "Content-Type": "text/plain",
      fileName: input.fileName,
    },
  });
}

export async function loadSlope(input: {
  userToken: string;
  fileContent: string;
  fileName: string;
}) {
  return devsFireRequest({
    endpoint: "/loadSlope/",
    userToken: input.userToken,
    query: { slopeMap: input.fileName },
    body: input.fileContent,
    headers: {
      "Content-Type": "text/plain",
      fileName: input.fileName,
    },
  });
}

export async function loadAspect(input: {
  userToken: string;
  fileContent: string;
  fileName: string;
}) {
  return devsFireRequest({
    endpoint: "/loadAspect/",
    userToken: input.userToken,
    query: { aspectMap: input.fileName },
    body: input.fileContent,
    headers: {
      "Content-Type": "text/plain",
      fileName: input.fileName,
    },
  });
}

export async function getCellFuel(input: { userToken: string }) {
  const data = await devsFireRequest({
    endpoint: "/getCellFuel/",
    userToken: input.userToken,
  });
  return parseNumericMatrix(data, "getCellFuel");
}

export async function getCellSlope(input: { userToken: string }) {
  const data = await devsFireRequest({
    endpoint: "/getCellSlope/",
    userToken: input.userToken,
  });
  return parseNumericMatrix(data, "getCellSlope");
}

export async function getCellAspect(input: { userToken: string }) {
  const data = await devsFireRequest({
    endpoint: "/getCellAspect/",
    userToken: input.userToken,
  });
  return parseNumericMatrix(data, "getCellAspect");
}

export async function setPointIgnition(input: {
  userToken: string;
  xs: string;
  ys: string;
}) {
  return devsFireRequest({
    endpoint: "/setPointIgnition/",
    userToken: input.userToken,
    query: {
      xs: input.xs,
      ys: input.ys,
    },
  });
}

export async function setDynamicIgnition(input: {
  userToken: string;
  teamNum: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  speed: number;
  mode?: string;
  distance?: number;
  waitTime?: number;
}) {
  return devsFireRequest({
    endpoint: "/setDynamicIgnition/",
    userToken: input.userToken,
    query: {
      teamNum: input.teamNum,
      x1: input.x1,
      y1: input.y1,
      x2: input.x2,
      y2: input.y2,
      speed: input.speed,
      mode: input.mode,
      distance: input.distance,
      waitTime: input.waitTime,
    },
  });
}

export async function setSuppressedCell(input: {
  userToken: string;
  x1: number;
  y1: number;
  x2?: number;
  y2?: number;
}) {
  return devsFireRequest({
    endpoint: "/setSuppressedCell/",
    userToken: input.userToken,
    query: {
      x1: input.x1,
      y1: input.y1,
      x2: input.x2,
      y2: input.y2,
    },
  });
}

export async function runSimulation(input: { userToken: string; time: number }) {
  const data = await devsFireRequest({
    endpoint: "/runSimulation/",
    userToken: input.userToken,
    query: { time: input.time },
  });
  return parseOperations(data, "runSimulation");
}

export async function continueSimulation(input: {
  userToken: string;
  time: number;
}) {
  const data = await devsFireRequest({
    endpoint: "/continueSimulation/",
    userToken: input.userToken,
    query: { time: input.time },
  });
  return parseOperations(data, "continueSimulation");
}

export async function getPerimeterCells(input: { userToken: string }) {
  const data = await devsFireRequest({
    endpoint: "/getPerimeterCells/",
    userToken: input.userToken,
  });
  return parseStringArray(data, "getPerimeterCells");
}

export async function computeBurnedArea(input: { userToken: string }) {
  const data = await devsFireRequest({
    endpoint: "/computeBurnedArea/",
    userToken: input.userToken,
  });
  return parseNumeric(data, "computeBurnedArea");
}

export async function computePerimeterLength(input: { userToken: string }) {
  const data = await devsFireRequest({
    endpoint: "/computePerimeterLength/",
    userToken: input.userToken,
  });
  return parseNumeric(data, "computePerimeterLength");
}

export async function getBurningCellNum(input: { userToken: string }) {
  const data = await devsFireRequest({
    endpoint: "/getBurningCellNum/",
    userToken: input.userToken,
  });
  return parseNumeric(data, "getBurningCellNum");
}

export async function getUnburnedCellNum(input: { userToken: string }) {
  const data = await devsFireRequest({
    endpoint: "/getUnburnedCellNum/",
    userToken: input.userToken,
  });
  return parseNumeric(data, "getUnburnedCellNum");
}

export async function getCellState(input: {
  userToken: string;
  x: number;
  y: number;
}) {
  const data = await devsFireRequest({
    endpoint: "/getCellState/",
    userToken: input.userToken,
    query: { x: input.x, y: input.y },
  });
  return parseCellState(data);
}

export async function setMultiParameters(input: {
  userToken: string;
  x?: number;
  y?: number;
  lat?: number;
  lng?: number;
  windSpeed?: number;
  windDirection?: number;
  cellResolution?: number;
  cellDimension?: number;
}) {
  return devsFireRequest({
    endpoint: "/setMultiParameters/",
    userToken: input.userToken,
    query: input,
  });
}
