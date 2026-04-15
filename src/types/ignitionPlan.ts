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

/** Suppression / fuel-break segment in grid space (single cell when start=end). */
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

/** Line ignitions (segment start ≠ end): spread along the segment */
export const LINE_IGNITION_MODES = IGNITION_MODES.filter((m) =>
  m.value.startsWith("continuous_"),
);

/** Point ignitions (segment start = end): single-cell ignition */
export const POINT_IGNITION_MODES = IGNITION_MODES.filter((m) =>
  m.value.startsWith("point_"),
);

export function ignitionModesForSegmentGeometry(isPoint: boolean) {
  return isPoint ? POINT_IGNITION_MODES : LINE_IGNITION_MODES;
}

/** Valid mode for UI when stored value mismatches geometry (e.g. legacy data). */
export function ignitionModeForGeometry(
  mode: string,
  isPoint: boolean,
): IgnitionMode {
  const allowed = ignitionModesForSegmentGeometry(isPoint);
  const match = allowed.find((m) => m.value === mode);
  if (match) return match.value;
  return allowed[0].value;
}

/** Team slots available in the ignition UI (Team 1 … Team 10 → indices 0–9). */
export const IGNITION_TEAM_PICKER_COUNT = 10;

/** Ensure `team_infos` has at least `IGNITION_TEAM_PICKER_COUNT` entries so teams 1–10 can be addressed. */
export function ensureIgnitionTeamSlots(plan: IgnitionPlan): IgnitionPlan {
  if (plan.team_infos.length >= IGNITION_TEAM_PICKER_COUNT) {
    return {
      ...plan,
      team_num: Math.max(plan.team_num, IGNITION_TEAM_PICKER_COUNT),
    };
  }
  const teams = [...plan.team_infos];
  for (let i = teams.length; i < IGNITION_TEAM_PICKER_COUNT; i++) {
    teams.push({
      team_name: `team${i + 1}`,
      info_num: 0,
      details: [],
    });
  }
  return {
    ...plan,
    team_infos: teams,
    team_num: Math.max(plan.team_num, IGNITION_TEAM_PICKER_COUNT),
  };
}

function moveSegmentToTeam(
  plan: IgnitionPlan,
  fromTeamIndex: number,
  segmentIndex: number,
  toTeamIndex: number,
): IgnitionPlan {
  if (fromTeamIndex === toTeamIndex) return plan;
  if (
    toTeamIndex < 0 ||
    toTeamIndex >= IGNITION_TEAM_PICKER_COUNT ||
    fromTeamIndex < 0
  ) {
    return plan;
  }
  const normalized = ensureIgnitionTeamSlots(plan);
  const src = normalized.team_infos[fromTeamIndex];
  if (!src || segmentIndex < 0 || segmentIndex >= src.details.length) return plan;
  const seg = src.details[segmentIndex];
  const newSrcDetails = src.details.filter((_, i) => i !== segmentIndex);
  const dst = normalized.team_infos[toTeamIndex];
  if (!dst) return plan;
  const newDstDetails = [...dst.details, seg];
  const team_infos = normalized.team_infos.map((team, ti) => {
    if (ti === fromTeamIndex) return { ...team, details: newSrcDetails, info_num: newSrcDetails.length };
    if (ti === toTeamIndex) return { ...team, details: newDstDetails, info_num: newDstDetails.length };
    return team;
  });
  return { ...normalized, team_infos };
}

/** Mutable fields the user can edit per-segment in the ignition lines panel */
export type SegmentEdit = {
  teamIndex: number;
  segmentIndex: number;
  speed?: number;
  mode?: IgnitionMode;
  distance?: number | null;
  /** @deprecated Prefer `moveToTeamIndex`; kept for programmatic renames */
  teamName?: string;
  /** Move this segment to another team slot (0–9 ↔ Team 1–10). */
  moveToTeamIndex?: number;
};

export function applySegmentEdit(plan: IgnitionPlan, edit: SegmentEdit): IgnitionPlan {
  if (edit.moveToTeamIndex !== undefined && edit.moveToTeamIndex !== edit.teamIndex) {
    return moveSegmentToTeam(plan, edit.teamIndex, edit.segmentIndex, edit.moveToTeamIndex);
  }

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
      const mode = "point_static";
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
      const pieces: SupInfo[] = payload.splitIntoRectangleEdges
        ? [
            {
              x1: Math.min(payload.x1, payload.x2),
              y1: Math.min(payload.y1, payload.y2),
              x2: Math.max(payload.x1, payload.x2),
              y2: Math.min(payload.y1, payload.y2),
            },
            {
              x1: Math.min(payload.x1, payload.x2),
              y1: Math.max(payload.y1, payload.y2),
              x2: Math.max(payload.x1, payload.x2),
              y2: Math.max(payload.y1, payload.y2),
            },
            {
              x1: Math.min(payload.x1, payload.x2),
              y1: Math.min(payload.y1, payload.y2),
              x2: Math.min(payload.x1, payload.x2),
              y2: Math.max(payload.y1, payload.y2),
            },
            {
              x1: Math.max(payload.x1, payload.x2),
              y1: Math.min(payload.y1, payload.y2),
              x2: Math.max(payload.x1, payload.x2),
              y2: Math.max(payload.y1, payload.y2),
            },
          ]
        : [{ x1: payload.x1, y1: payload.y1, x2: payload.x2, y2: payload.y2 }];
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
