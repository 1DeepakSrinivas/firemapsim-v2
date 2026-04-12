import type { FireOverlayPoint, PerimeterGeoJSON } from "@/components/map/types";

export function normalizeOverlay(payload: unknown): FireOverlayPoint[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const value = item as Record<string, unknown>;
      const x = Number(value.x ?? 0);
      const y = Number(value.y ?? 0);
      const time = Number(value.time ?? 0);
      const op = String(value.Operation ?? value.state ?? "").toLowerCase();

      let state: FireOverlayPoint["state"] = "unburned";
      if (
        op.includes("burning") ||
        op.includes("ignite") ||
        op.includes("burnteam")
      ) {
        state = "burning";
      } else if (op.includes("burned") || op.includes("burn")) {
        state = "burned";
      }

      return {
        x,
        y,
        time,
        state,
      } satisfies FireOverlayPoint;
    })
    .filter((item): item is FireOverlayPoint => item !== null);
}

export function normalizePerimeter(payload: unknown): PerimeterGeoJSON {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const maybe = payload as Record<string, unknown>;
  if (
    maybe.type === "Feature" ||
    maybe.type === "LineString" ||
    maybe.type === "Polygon"
  ) {
    return maybe as PerimeterGeoJSON;
  }

  return null;
}

export function buildStats(points: FireOverlayPoint[]): {
  burning: number;
  burned: number;
  unburned: number;
  updatedAt: number;
} {
  let burning = 0;
  let burned = 0;
  let unburned = 0;

  for (const point of points) {
    if (point.state === "burning") {
      burning += 1;
    } else if (point.state === "burned") {
      burned += 1;
    } else {
      unburned += 1;
    }
  }

  return {
    burning,
    burned,
    unburned,
    updatedAt: Date.now(),
  };
}
