import type { FireOverlayPoint, PerimeterGeoJSON } from "@/components/map/types";
import type { WeatherValues } from "@/components/weather/WeatherPreview";
import type { IgnitionPlan } from "@/types/ignitionPlan";

export type SimulationOperation = {
  x: number;
  y: number;
  Operation: string;
  time: number;
};

export type LatestSimulationGridMeta = {
  cellResolution: number;
  cellSpaceDimension: number;
  cellSpaceDimensionLat: number;
  projCenterLat: number;
  projCenterLng: number;
};

export type LatestSimulationFinalMetrics = {
  perimeterCells: string[];
  burnedArea: number | null;
  perimeterLength: number | null;
  burningCells: number | null;
  unburnedCells: number | null;
};

export type DevsFireCallRecord = {
  path: string;
  params?: Record<string, number | string | boolean>;
  bodyType?: "none" | "text";
};

export type AxisConventionCheck = {
  checked: boolean;
  transposeLikely: boolean;
  firstIgnition?: {
    x: number;
    y: number;
  };
  firstBurnTeam?: {
    x: number;
    y: number;
    time: number;
  };
};

export type LatestSimulationManifest = {
  startedAt: string;
  completedAt: string;
  baseUrl: string;
  projectId: string;
  terrainMode: "online" | "custom";
  weatherMode: "static" | "windflow";
  planSnapshot: IgnitionPlan;
  weatherFetched: WeatherValues;
  weatherUsed: WeatherValues;
  weatherOverrideApplied: string[];
  setupCalls: DevsFireCallRecord[];
  executionCalls: DevsFireCallRecord[];
  axisConventionCheck?: AxisConventionCheck;
};

export type LatestSimulationStats = {
  burning: number;
  burned: number;
  unburned: number;
};

export type LatestSimulationSummary = {
  completedAt: string;
  weatherSource: string;
  hasExactReplay: boolean;
  operationCount: number;
  stats: LatestSimulationStats;
  finalMetrics: Omit<LatestSimulationFinalMetrics, "perimeterCells">;
  gridMeta: LatestSimulationGridMeta;
  overlayPreview: FireOverlayPoint[];
};

export type LatestSimulationReplay = {
  summary: LatestSimulationSummary;
  manifest: LatestSimulationManifest;
  operations: SimulationOperation[];
  overlay: FireOverlayPoint[];
  perimeterGeoJSON: PerimeterGeoJSON;
  finalMetrics: LatestSimulationFinalMetrics;
};
