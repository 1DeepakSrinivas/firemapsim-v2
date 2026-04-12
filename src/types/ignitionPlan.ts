/**
 * Shape aligned with ignition plan / simulation project JSON (see ignitionPlan.json sample).
 */

import { syntheticBoundaryFromGrid } from "@/lib/projectBoundary";

export type SegmentDetail = {
  type: "segment";
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
  speed: number;
  mode: string;
  distance: number | null;
};

export type TeamInfo = {
  team_name: string;
  info_num: number;
  details: SegmentDetail[];
};

/** Suppression / fuel-break region in grid space (axis-aligned rectangle or degenerate line as x1=x2 or y1=y2) */
export type SupInfo = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/** GeoJSON geometry for the project boundary (Polygon or MultiPolygon) */
export type BoundaryGeoJSON =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | null;

export type IgnitionPlan = {
  info_type: string;
  team_num: number;
  total_sim_time: number;
  windSpeed: number;
  windDegree: number;
  /** °F — kept in sync with scenario weather for saves / simulation metadata */
  temperature?: number;
  /** % relative humidity — kept in sync with scenario weather */
  humidity?: number;
  team_infos: TeamInfo[];
  sup_infos: SupInfo[];
  proj_center_lng: number;
  proj_center_lat: number;
  fuel_data_adjusted: unknown[];
  customizedFuelGrid: string;
  slope_data_adjusted: unknown[];
  aspect_data_adjusted: unknown[];
  cellResolution: number;
  cellSpaceDimension: number;
  cellSpaceDimensionLat: number;
  customized_cell_state: unknown[];
  sup_num: number;
  /** Optional project boundary shown as a highlighted border on the map */
  boundaryGeoJSON?: BoundaryGeoJSON;
};

export function defaultIgnitionPlan(): IgnitionPlan {
  return {
    info_type: "simulation",
    team_num: 1,
    total_sim_time: 12000,
    windSpeed: 10,
    windDegree: 180,
    temperature: 72,
    humidity: 38,
    team_infos: [
      {
        team_name: "team0",
        info_num: 0,
        details: [],
      },
    ],
    sup_infos: [],
    proj_center_lng: 0,
    proj_center_lat: 0,
    fuel_data_adjusted: [],
    customizedFuelGrid: "",
    slope_data_adjusted: [],
    aspect_data_adjusted: [],
    cellResolution: 30,
    cellSpaceDimension: 200,
    cellSpaceDimensionLat: 200,
    customized_cell_state: [],
    sup_num: 0,
  };
}

function segmentPoint(x: number, y: number, speed: number, mode: string): SegmentDetail {
  return {
    type: "segment",
    start_x: x,
    start_y: y,
    end_x: x,
    end_y: y,
    speed,
    mode,
    distance: null,
  };
}

function segmentLine(
  start_x: number,
  start_y: number,
  end_x: number,
  end_y: number,
  speed: number,
  mode: string,
): SegmentDetail {
  return {
    type: "segment",
    start_x,
    start_y,
    end_x,
    end_y,
    speed,
    mode,
    distance: null,
  };
}

/** Ignition modes supported by DEVS-FIRE */
export const IGNITION_MODES = [
  { value: "continuous_static", label: "Continuous Static" },
  { value: "continuous_dynamic", label: "Continuous Dynamic" },
  { value: "point_static", label: "Point Static" },
  { value: "point_dynamic", label: "Point Dynamic" },
] as const;

export type IgnitionMode = (typeof IGNITION_MODES)[number]["value"];

/** Mutable fields the user can edit per-segment in the ignition lines panel */
export type SegmentEdit = {
  teamIndex: number;
  segmentIndex: number;
  speed?: number;
  mode?: IgnitionMode;
  distance?: number | null;
  teamName?: string;
};

export function applySegmentEdit(plan: IgnitionPlan, edit: SegmentEdit): IgnitionPlan {
  const teams = plan.team_infos.map((team, ti) => {
    if (ti !== edit.teamIndex) return team;
    const details = team.details.map((seg, si) => {
      if (si !== edit.segmentIndex) return seg;
      return {
        ...seg,
        ...(edit.speed !== undefined ? { speed: edit.speed } : {}),
        ...(edit.mode !== undefined ? { mode: edit.mode } : {}),
        ...(edit.distance !== undefined ? { distance: edit.distance } : {}),
      };
    });
    return {
      ...team,
      ...(edit.teamName !== undefined ? { team_name: edit.teamName } : {}),
      details,
    };
  });
  return { ...plan, team_infos: teams };
}

/** Payloads emitted from scenario action modals (manual or agent). */
export type ActionPayload =
  | {
      action: "location";
      proj_center_lng: number;
      proj_center_lat: number;
      cellResolution?: number;
      cellSpaceDimension?: number;
      cellSpaceDimensionLat?: number;
      boundaryGeoJSON?: BoundaryGeoJSON;
    }
  | {
      action: "point-ignition";
      points: Array<{ x: number; y: number; speed?: number; mode?: string }>;
    }
  | {
      action: "line-ignition";
      start_x: number;
      start_y: number;
      end_x: number;
      end_y: number;
      speed?: number;
      mode?: string;
    }
  | {
      action: "fuel-break";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      /** When true (rectangle map draw / rectangular modal), store as four boundary segments */
      splitIntoRectangleEdges?: boolean;
    };

export function mergeActionIntoPlan(plan: IgnitionPlan, payload: ActionPayload): IgnitionPlan {
  switch (payload.action) {
    case "location": {
      if (plan.boundaryGeoJSON) {
        return plan;
      }
      const cellResolution = payload.cellResolution ?? plan.cellResolution;
      const cellSpaceDimension = payload.cellSpaceDimension ?? plan.cellSpaceDimension;
      const cellSpaceDimensionLat = payload.cellSpaceDimensionLat ?? plan.cellSpaceDimensionLat;
      const boundaryGeoJSON =
        payload.boundaryGeoJSON ??
        syntheticBoundaryFromGrid({
          proj_center_lat: payload.proj_center_lat,
          proj_center_lng: payload.proj_center_lng,
          cellResolution,
          cellSpaceDimension,
          cellSpaceDimensionLat,
        });
      return {
        ...plan,
        proj_center_lng: payload.proj_center_lng,
        proj_center_lat: payload.proj_center_lat,
        cellResolution,
        cellSpaceDimension,
        cellSpaceDimensionLat,
        boundaryGeoJSON,
      };
    }
    case "point-ignition": {
      const speed = 0.6;
      const mode = "continuous_static";
      const newDetails = payload.points.map((p) =>
        segmentPoint(p.x, p.y, p.speed ?? speed, p.mode ?? mode),
      );
      const team0 = plan.team_infos[0] ?? {
        team_name: "team0",
        info_num: 0,
        details: [],
      };
      const details = [...team0.details, ...newDetails];
      const nextTeams: TeamInfo[] = [
        { ...team0, info_num: details.length, details },
        ...plan.team_infos.slice(1),
      ];
      return { ...plan, team_infos: nextTeams };
    }
    case "line-ignition": {
      const speed = payload.speed ?? 0.6;
      const mode = payload.mode ?? "continuous_static";
      const seg = segmentLine(
        payload.start_x,
        payload.start_y,
        payload.end_x,
        payload.end_y,
        speed,
        mode,
      );
      const team0 = plan.team_infos[0] ?? {
        team_name: "team0",
        info_num: 0,
        details: [],
      };
      const details = [...team0.details, seg];
      const nextTeams: TeamInfo[] = [
        { ...team0, info_num: details.length, details },
        ...plan.team_infos.slice(1),
      ];
      return { ...plan, team_infos: nextTeams };
    }
    case "fuel-break": {
      const minX = Math.min(payload.x1, payload.x2);
      const maxX = Math.max(payload.x1, payload.x2);
      const minY = Math.min(payload.y1, payload.y2);
      const maxY = Math.max(payload.y1, payload.y2);
      const pieces: SupInfo[] = payload.splitIntoRectangleEdges
        ? [
            { x1: minX, y1: minY, x2: maxX, y2: minY },
            { x1: minX, y1: maxY, x2: maxX, y2: maxY },
            { x1: minX, y1: minY, x2: minX, y2: maxY },
            { x1: maxX, y1: minY, x2: maxX, y2: maxY },
          ]
        : [{ x1: minX, y1: minY, x2: maxX, y2: maxY }];
      const sup_infos = [...plan.sup_infos, ...pieces];
      return {
        ...plan,
        sup_infos,
        sup_num: sup_infos.length,
      };
    }
    default:
      return plan;
  }
}
