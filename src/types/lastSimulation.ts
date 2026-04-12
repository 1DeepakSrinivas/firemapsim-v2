import type { FireOverlayPoint, PerimeterGeoJSON } from "@/components/map/types";

export type LastSimulationSnapshot = {
  overlay: FireOverlayPoint[];
  perimeterGeoJSON: PerimeterGeoJSON;
  gridMeta?: {
    cellResolution: number;
    cellSpaceDimension: number;
    cellSpaceDimensionLat: number;
    projCenterLat: number;
    projCenterLng: number;
  };
  weatherSource?: string;
  completedAt: string;
};
