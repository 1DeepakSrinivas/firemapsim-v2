/**
 * Grid index ↔ WGS84 for scenario UI. Must stay in sync with
 * `ProjectWorkspace` handlePin / handleLine `toGrid` math.
 */

export type GridProjectionParams = {
  projCenterLat: number;
  projCenterLng: number;
  cellResolution: number;
  cellSpaceDimension: number;
  cellSpaceDimensionLat: number;
};

const METERS_PER_DEG = 111320;

/** Cell center (integer grid indices) → lat/lng — inverse of pin / line placement. */
export function gridCellCenterToLatLng(
  gx: number,
  gy: number,
  p: GridProjectionParams,
): { lat: number; lng: number } {
  const cosLat = Math.cos((p.projCenterLat * Math.PI) / 180);
  const dx = (gx - p.cellSpaceDimension / 2) * p.cellResolution;
  const dy = (gy - p.cellSpaceDimensionLat / 2) * p.cellResolution;
  const lng = p.projCenterLng + dx / (METERS_PER_DEG * cosLat);
  const lat = p.projCenterLat + dy / METERS_PER_DEG;
  return { lat, lng };
}

export function gridProjectionFromPlan(plan: {
  proj_center_lat: number;
  proj_center_lng: number;
  cellResolution: number;
  cellSpaceDimension: number;
  cellSpaceDimensionLat: number;
}): GridProjectionParams {
  return {
    projCenterLat: plan.proj_center_lat,
    projCenterLng: plan.proj_center_lng,
    cellResolution: plan.cellResolution,
    cellSpaceDimension: plan.cellSpaceDimension,
    cellSpaceDimensionLat: plan.cellSpaceDimensionLat,
  };
}
