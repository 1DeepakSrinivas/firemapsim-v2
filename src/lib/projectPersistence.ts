import type { FireOverlayPoint } from "@/components/map/types";
import type { LastSimulationSnapshot } from "@/types/lastSimulation";

/**
 * Very large `last_simulation.overlay` arrays can exceed practical JSONB / request limits
 * and cause Supabase updates to fail. Thin uniformly by index (preserves rough time order
 * from typical API responses) so saves and replay still work with fewer points.
 */
const MAX_LAST_SIMULATION_OVERLAY_POINTS = 20_000;

export function thinOverlayForPersistence(
  points: FireOverlayPoint[],
  maxPoints = MAX_LAST_SIMULATION_OVERLAY_POINTS,
): FireOverlayPoint[] {
  if (points.length <= maxPoints) {
    return points;
  }
  const step = Math.ceil(points.length / maxPoints);
  const out: FireOverlayPoint[] = [];
  for (let i = 0; i < points.length; i += step) {
    out.push(points[i]!);
  }
  return out;
}

export function sanitizeLastSimulationForDb(
  snapshot: LastSimulationSnapshot | null,
): LastSimulationSnapshot | null {
  if (!snapshot) {
    return null;
  }
  return {
    ...snapshot,
    overlay: thinOverlayForPersistence(snapshot.overlay),
  };
}
