/**
 * Project boundary helpers: grid-aligned synthetic polygon (matches dashboard grid math)
 * and point-in-polygon tests for GeoJSON boundaries.
 */

import type { BoundaryGeoJSON, IgnitionPlan } from "@/types/ignitionPlan";

const METERS_PER_DEG = 111320;

/** Axis-aligned rectangle in WGS84 covering the simulation grid extent around the project center. */
export function syntheticBoundaryFromGrid(params: {
  proj_center_lat: number;
  proj_center_lng: number;
  cellResolution: number;
  cellSpaceDimension: number;
  cellSpaceDimensionLat: number;
}): BoundaryGeoJSON {
  const {
    proj_center_lat,
    proj_center_lng,
    cellResolution,
    cellSpaceDimension,
    cellSpaceDimensionLat,
  } = params;
  const cosLat = Math.cos((proj_center_lat * Math.PI) / 180);
  const halfWm = (cellSpaceDimension / 2) * cellResolution;
  const halfHm = (cellSpaceDimensionLat / 2) * cellResolution;
  const dLng = halfWm / (METERS_PER_DEG * cosLat);
  const dLat = halfHm / METERS_PER_DEG;
  const minLng = proj_center_lng - dLng;
  const maxLng = proj_center_lng + dLng;
  const minLat = proj_center_lat - dLat;
  const maxLat = proj_center_lat + dLat;
  return {
    type: "Polygon",
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ],
    ],
  };
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0];
    const yi = ring[i]![1];
    const xj = ring[j]![0];
    const yj = ring[j]![1];
    const denom = yj - yi;
    if (Math.abs(denom) < 1e-18) continue;
    const intersect =
      (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** True if [lng,lat] lies inside the polygon (exterior minus holes). */
function pointInPolygonCoords(lng: number, lat: number, coordinates: number[][][]): boolean {
  const outer = coordinates[0];
  if (!outer || outer.length < 3) return false;
  if (!pointInRing(lng, lat, outer)) return false;
  for (let h = 1; h < coordinates.length; h++) {
    const hole = coordinates[h];
    if (hole && hole.length >= 3 && pointInRing(lng, lat, hole)) return false;
  }
  return true;
}

/** True if [lng,lat] is inside the project boundary (Polygon or MultiPolygon). */
export function pointInBoundary(lat: number, lng: number, boundary: BoundaryGeoJSON): boolean {
  if (!boundary) return false;
  if (boundary.type === "Polygon") {
    return pointInPolygonCoords(lng, lat, boundary.coordinates);
  }
  if (boundary.type === "MultiPolygon") {
    for (const poly of boundary.coordinates) {
      if (pointInPolygonCoords(lng, lat, poly)) return true;
    }
    return false;
  }
  return false;
}

/** When loading older saves: add a synthetic grid boundary if center is set but polygon is missing. */
export function ensurePlanBoundary(plan: IgnitionPlan): IgnitionPlan {
  if (plan.boundaryGeoJSON) return plan;
  if (plan.proj_center_lng === 0 && plan.proj_center_lat === 0) return plan;
  return {
    ...plan,
    boundaryGeoJSON: syntheticBoundaryFromGrid({
      proj_center_lat: plan.proj_center_lat,
      proj_center_lng: plan.proj_center_lng,
      cellResolution: plan.cellResolution,
      cellSpaceDimension: plan.cellSpaceDimension,
      cellSpaceDimensionLat: plan.cellSpaceDimensionLat,
    }),
  };
}
