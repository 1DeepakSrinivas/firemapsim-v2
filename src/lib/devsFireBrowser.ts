/**
 * Browser-side DEVS-FIRE helpers using server-managed session cookies.
 * Frontend never reads or transmits upstream userToken directly.
 */

import type { IgnitionPlan } from "@/types/ignitionPlan";
import type { WeatherValues } from "@/components/weather/WeatherPreview";

type Envelope<T> = {
  ok: boolean;
  data: T | null;
  error: { type: string; message: string; details?: string } | null;
};

async function postEnvelope<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.ok || json.data == null) {
    const message =
      json?.error?.message ??
      (typeof json?.error === "string" ? json.error : undefined) ??
      `HTTP ${res.status}`;
    throw new Error(message);
  }
  return json.data;
}

export async function connectDevsFire(): Promise<void> {
  await postEnvelope<{ connected: boolean }>("/api/devs-fire/connectToServer", {});
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

/** Aligns the server-side grid with the current project (required before terrain matrices are meaningful). */
export async function setDevsFireCellResolution(plan: IgnitionPlan): Promise<void> {
  const cellDimension = Math.max(plan.cellSpaceDimension, plan.cellSpaceDimensionLat);
  await postEnvelope<{ updated: boolean }>("/api/devs-fire/setCellResolution", {
    cellResolution: plan.cellResolution,
    cellDimension,
  });
}

function endpointPathToRoute(path: string): string {
  const cleaned = path.replace(/^\/+|\/+$/g, "");
  if (!cleaned) {
    throw new Error("Invalid DEVS-FIRE endpoint path.");
  }
  return `/api/devs-fire/${cleaned}`;
}

function normalizeMatrixPayload(data: unknown, path: string): number[][] {
  if (!data || typeof data !== "object") {
    throw new Error(`Unexpected response from ${path}`);
  }

  const record = data as Record<string, unknown>;
  const matrix = record.matrix;
  if (!Array.isArray(matrix)) {
    throw new Error(`Unexpected response from ${path}`);
  }
  return matrix as number[][];
}

export async function fetchTerrainMatrix(path: string): Promise<number[][]> {
  const data = await postEnvelope<Record<string, unknown>>(endpointPathToRoute(path), {});
  return normalizeMatrixPayload(data, path);
}

/**
 * Opens a fresh DEVS-FIRE session and configures grid + location so that terrain
 * matrix endpoints (getCellFuel, getCellSlope, getCellAspect) return meaningful data.
 */
export async function bootstrapTerrainSession(
  plan: IgnitionPlan,
  _weather?: WeatherValues,
): Promise<void> {
  const { lat, lng } = effectiveDevsFireLatLng(plan);
  if (Math.abs(lat) < 1e-8 && Math.abs(lng) < 1e-8) {
    throw new Error(
      "Set a project location (map center) before fetching terrain — DEVS-FIRE needs a US lat/lng.",
    );
  }

  await connectDevsFire();
  await setDevsFireCellResolution(plan);
  await postEnvelope<{ updated: boolean }>("/api/devs-fire/setCellSpaceLocation", {
    lat,
    lng,
  });
}
