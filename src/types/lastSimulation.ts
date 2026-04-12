import type { FireOverlayPoint, PerimeterGeoJSON } from "@/components/map/types";

export type LastSimulationSnapshot = {
  overlay: FireOverlayPoint[];
  perimeterGeoJSON: PerimeterGeoJSON;
  weatherSource?: string;
  completedAt: string;
};
