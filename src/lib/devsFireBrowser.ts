/**
 * Browser-side DEVS-FIRE calls via `/api/devs-fire` proxy.
 * Sequence mirrors `runDevsFireFromPlan`: connect → setMultiParameters → setCellSpaceLocation →
 * setWindCondition, then getCellFuel / getCellSlope / getCellAspect.
 * GSU docs: “If using the online fuel data, then the location must be picked” via
 * `setCellSpaceLocation` before terrain matrices are valid.
 *
 * @see devs-fire-docs/api-usage.html
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
  const isHtmlLikeToken = (value: string): boolean => {
    const trimmed = value.trimStart().toLowerCase();
    return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
  };

  if (typeof data === "string") {
    const t = data.trim();
    if (t) {
      if (isHtmlLikeToken(t)) {
        throw new Error(
          "DEVS-FIRE returned HTML instead of a token. Check backend DEVS_FIRE_BASE_URL (expected https://firesim.cs.gsu.edu/api).",
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
          "DEVS-FIRE returned HTML instead of a token. Check backend DEVS_FIRE_BASE_URL (expected https://firesim.cs.gsu.edu/api).",
        );
      }
      return trimmed;
    }
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

/** WGS84 center for DEVS-FIRE query params; uses polygon centroid if plan center is still at origin. */
export function effectiveDevsFireLatLng(plan: IgnitionPlan): { lat: number; lng: number } {
  if (Math.abs(plan.proj_center_lat) > 1e-8 || Math.abs(plan.proj_center_lng) > 1e-8) {
    return { lat: plan.proj_center_lat, lng: plan.proj_center_lng };
  }
  const b = plan.boundaryGeoJSON;
  if (b?.type === "Polygon") {
    const ring = b.coordinates[0];
    if (ring && ring.length >= 3) {
      const n = ring.length - 1;
      let slat = 0;
      let slng = 0;
      for (let i = 0; i < n; i++) {
        const [lng, lat] = ring[i]!;
        slat += lat;
        slng += lng;
      }
      if (n > 0) {
        return { lat: slat / n, lng: slng / n };
      }
    }
  }
  return { lat: plan.proj_center_lat, lng: plan.proj_center_lng };
}

/** Aligns the server-side grid with the current project + weather (required before terrain matrices are meaningful). */
export async function setDevsFireMultiParameters(
  token: string,
  plan: IgnitionPlan,
  weather: WeatherValues,
): Promise<void> {
  const { lat, lng } = effectiveDevsFireLatLng(plan);
  const cellDimension = Math.max(plan.cellSpaceDimension, plan.cellSpaceDimensionLat);
  await postDevsFireProxy({
    path: "/setMultiParameters/",
    token,
    params: {
      lat,
      lng,
      windSpeed: weather.windSpeed,
      windDirection: weather.windDirection,
      cellResolution: plan.cellResolution,
      cellDimension,
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
  const { lat, lng } = effectiveDevsFireLatLng(plan);
  if (Math.abs(lat) < 1e-8 && Math.abs(lng) < 1e-8) {
    throw new Error(
      "Set a project location (map center) before fetching terrain — DEVS-FIRE needs a US lat/lng.",
    );
  }

  const token = await connectDevsFire();
  await setDevsFireMultiParameters(token, plan, weather);

  await postDevsFireProxy({
    path: "/setCellSpaceLocation/",
    token,
    params: { lat, lng },
  });
  await postDevsFireProxy({
    path: "/setWindCondition/",
    token,
    params: {
      windSpeed: weather.windSpeed,
      windDirection: weather.windDirection,
    },
  });

  return token;
}
