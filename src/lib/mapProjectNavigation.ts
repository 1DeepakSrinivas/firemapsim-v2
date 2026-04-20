import type { IgnitionPlan } from "@/types/ignitionPlan";
import { hasNonZeroCenter, isValidGeodeticCenter } from "@/lib/geoCoords";

/** True when the plan has a real map position worth navigating to (not the default empty project). */
export function hasSavedProjectMapPosition(plan: IgnitionPlan): boolean {
  if (plan.boundaryGeoJSON) return true;
  return hasNonZeroCenter(plan.proj_center_lat, plan.proj_center_lng);
}

/**
 * Navigate the Leaflet map to the saved project: fit bounds to the boundary when present,
 * otherwise fly to project center.
 */
export async function navigateMapToProject(
  map: import("leaflet").Map,
  plan: IgnitionPlan,
): Promise<void> {
  const L = await import("leaflet");

  if (plan.boundaryGeoJSON) {
    try {
      const layer = L.geoJSON(plan.boundaryGeoJSON as Parameters<typeof L.geoJSON>[0]);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [20, 20],
          maxZoom: 16,
          animate: true,
        });
        return;
      }
    } catch {
      /* fall through to center */
    }
  }

  if (isValidGeodeticCenter(plan.proj_center_lat, plan.proj_center_lng)) {
    map.flyTo([plan.proj_center_lat, plan.proj_center_lng], 13, {
      animate: true,
      duration: 1.2,
    });
  }
}

/** Stable key for map position only (ignores wind/weather fields on the plan). */
export function projectMapPositionKey(projectId: string, plan: IgnitionPlan): string {
  return `${projectId}|${plan.proj_center_lat}|${plan.proj_center_lng}|${plan.boundaryGeoJSON ? JSON.stringify(plan.boundaryGeoJSON) : ""}`;
}
