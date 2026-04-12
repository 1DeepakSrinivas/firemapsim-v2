/**
 * Browser-side DEVS-FIRE calls via `/api/devs-fire` proxy.
 * Per API docs, almost all endpoints require `userToken` from `connectToServer` first,
 * and the grid should be positioned with `setMultiParameters` before `getCellFuel` / etc.
 *
 * @see https://sims.cs.gsu.edu/sims/research/API_usage.html
 */

import type { IgnitionPlan } from "@/types/ignitionPlan";
import type { WeatherValues } from "@/components/weather/WeatherPreview";

type ProxyPayload = {
  path: string;
  token?: string;
  params?: Record<string, string | number | boolean | null>;
  body?: unknown;
  headers?: Record<string, string>;
};

async function postDevsFireProxy(payload: ProxyPayload): Promise<unknown> {
  const res = await fetch("/api/devs-fire", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json()) as { data?: unknown; error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json.data;
}

export function parseUserToken(data: unknown): string {
  if (typeof data === "string") {
    const t = data.trim();
    if (t) return t;
  }
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const token = o.token ?? o.userToken;
    if (typeof token === "string" && token.trim()) return token.trim();
  }
  throw new Error("DEVS-FIRE response did not include a user token");
}

export async function connectDevsFire(): Promise<string> {
  const data = await postDevsFireProxy({
    path: "/connectToServer",
    body: "connect",
    headers: { "Content-Type": "text/plain" },
  });
  return parseUserToken(data);
}

/** Aligns the server-side grid with the current project + weather (required before terrain matrices are meaningful). */
export async function setDevsFireMultiParameters(
  token: string,
  plan: IgnitionPlan,
  weather: WeatherValues,
): Promise<void> {
  await postDevsFireProxy({
    path: "/setMultiParameters/",
    token,
    params: {
      lat: plan.proj_center_lat,
      lng: plan.proj_center_lng,
      windSpeed: weather.windSpeed,
      windDirection: weather.windDirection,
      cellResolution: plan.cellResolution,
      cellDimension: plan.cellSpaceDimension,
    },
  });
}

function normalizeMatrixPayload(data: unknown, path: string): number[][] {
  if (Array.isArray(data)) return data as number[][];
  if (data && typeof data === "object") {
    for (const v of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(v)) return v as number[][];
    }
  }
  throw new Error(`Unexpected response from ${path}`);
}

export async function fetchTerrainMatrix(path: string, token: string): Promise<number[][]> {
  const data = await postDevsFireProxy({ path, token });
  return normalizeMatrixPayload(data, path);
}

export async function bootstrapTerrainSession(
  plan: IgnitionPlan,
  weather: WeatherValues,
): Promise<string> {
  const token = await connectDevsFire();
  await setDevsFireMultiParameters(token, plan, weather);
  return token;
}
