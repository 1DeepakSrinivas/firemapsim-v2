/**
 * Shape aligned with ignition plan / simulation project JSON (see ignitionPlan.json sample).
 */

import { syntheticBoundaryFromGrid } from "@/lib/projectBoundary";

export type SegmentDetail = {
  type: string;
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
  type?: string;
};

/** GeoJSON geometry for the project boundary (Polygon or MultiPolygon) */
export type BoundaryGeoJSON =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | null;

export type IgnitionPlan = {
  name?: string;
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

type PlanWithGridDims = {
  cellSpaceDimension: number;
  cellSpaceDimensionLat: number;
};

export function normalizeSquareCellSpaceSide(
  cellSpaceDimension: number,
  cellSpaceDimensionLat: number,
): number {
  const colSide = Number.isFinite(cellSpaceDimension)
    ? Math.max(1, Math.round(cellSpaceDimension))
    : 1;
  const rowSide = Number.isFinite(cellSpaceDimensionLat)
    ? Math.max(1, Math.round(cellSpaceDimensionLat))
    : colSide;
  return Math.max(colSide, rowSide);
}

export function withSquareGridDimensions<T extends PlanWithGridDims>(plan: T): T {
  const side = normalizeSquareCellSpaceSide(
    plan.cellSpaceDimension,
    plan.cellSpaceDimensionLat,
  );
  if (
    plan.cellSpaceDimension === side &&
    plan.cellSpaceDimensionLat === side
  ) {
    return plan;
  }
  return {
    ...plan,
    cellSpaceDimension: side,
    cellSpaceDimensionLat: side,
  };
}

export function defaultIgnitionPlan(): IgnitionPlan {
  return {
    name: "",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function coerceInteger(value: unknown): number | undefined {
  const number = coerceNumber(value);
  if (number === undefined) return undefined;
  return Math.round(number);
}

function normalizeDistance(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = coerceNumber(value);
  return parsed ?? null;
}

function isPointCoordinates(seg: {
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
}): boolean {
  return seg.start_x === seg.end_x && seg.start_y === seg.end_y;
}

export function normalizeLineIgnitionMode(
  mode: string | null | undefined,
): "continuous" | "spot" {
  const normalized = (mode ?? "").trim().toLowerCase();
  if (!normalized) return "continuous";
  if (normalized.includes("point") || normalized.includes("spot")) return "spot";
  return "continuous";
}

function normalizeLineIgnitionDistance(
  mode: "continuous" | "spot",
  distance: number | null | undefined,
): number | null {
  if (mode !== "spot") {
    return null;
  }
  if (typeof distance === "number" && Number.isFinite(distance)) {
    return distance;
  }
  // DEVS-FIRE docs: spot mode distance defaults to 0 when omitted.
  return 0;
}

function normalizeSegment(raw: unknown): SegmentDetail | null {
  if (!isRecord(raw)) return null;
  const startX = coerceNumber(raw.start_x);
  const startY = coerceNumber(raw.start_y);
  const endX = coerceNumber(raw.end_x);
  const endY = coerceNumber(raw.end_y);
  if (
    startX === undefined ||
    startY === undefined ||
    endX === undefined ||
    endY === undefined
  ) {
    return null;
  }

  return {
    type: typeof raw.type === "string" ? raw.type : "segment",
    start_x: startX,
    start_y: startY,
    end_x: endX,
    end_y: endY,
    speed: coerceNumber(raw.speed) ?? 3,
    mode: typeof raw.mode === "string" ? raw.mode : "continuous_static",
    distance: normalizeDistance(raw.distance),
  };
}

function normalizeTeam(raw: unknown, teamIndex: number): TeamInfo | null {
  if (!isRecord(raw)) return null;
  const detailsRaw = Array.isArray(raw.details) ? raw.details : [];
  const details = detailsRaw
    .map((entry) => normalizeSegment(entry))
    .filter((entry): entry is SegmentDetail => entry !== null)
    .map((entry) => {
      if (isPointCoordinates(entry)) {
        return entry;
      }
      const mode = normalizeLineIgnitionMode(entry.mode);
      return {
        ...entry,
        mode,
        distance: normalizeLineIgnitionDistance(mode, entry.distance),
      };
    });
  return {
    team_name:
      typeof raw.team_name === "string" && raw.team_name.trim() !== ""
        ? raw.team_name
        : `team${teamIndex}`,
    info_num: details.length,
    details,
  };
}

function normalizeSupInfo(raw: unknown): SupInfo | null {
  if (!isRecord(raw)) return null;
  const x1 = coerceNumber(raw.x1 ?? raw.start_x);
  const y1 = coerceNumber(raw.y1 ?? raw.start_y);
  const x2 = coerceNumber(raw.x2 ?? raw.end_x);
  const y2 = coerceNumber(raw.y2 ?? raw.end_y);
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
    return null;
  }
  return {
    x1,
    y1,
    x2,
    y2,
    ...(typeof raw.type === "string" ? { type: raw.type } : {}),
  };
}

/**
 * Compatibility ingress normalizer for API-shaped ignition plans.
 * Accepts numeric-like strings and suppression alias fields, and emits
 * our internal canonical shape.
 */
export function normalizeIgnitionPlan(raw: unknown): IgnitionPlan {
  const base = defaultIgnitionPlan();
  if (!isRecord(raw)) {
    return base;
  }

  const teamInfosRaw = Array.isArray(raw.team_infos) ? raw.team_infos : [];
  const team_infos =
    teamInfosRaw
      .map((team, index) => normalizeTeam(team, index))
      .filter((team): team is TeamInfo => team !== null) || [];

  const supInfosRaw = Array.isArray(raw.sup_infos) ? raw.sup_infos : [];
  const sup_infos = supInfosRaw
    .map((entry) => normalizeSupInfo(entry))
    .filter((entry): entry is SupInfo => entry !== null);

  const normalizedTeamInfos = team_infos.length > 0 ? team_infos : base.team_infos;

  const normalizedPlan: IgnitionPlan = {
    ...base,
    ...(typeof raw.name === "string" ? { name: raw.name } : {}),
    ...(typeof raw.info_type === "string" ? { info_type: raw.info_type } : {}),
    team_num: Math.max(
      coerceInteger(raw.team_num) ?? normalizedTeamInfos.length,
      normalizedTeamInfos.length,
    ),
    total_sim_time: coerceInteger(raw.total_sim_time) ?? base.total_sim_time,
    windSpeed: coerceNumber(raw.windSpeed) ?? base.windSpeed,
    windDegree: coerceNumber(raw.windDegree) ?? base.windDegree,
    temperature: coerceNumber(raw.temperature) ?? base.temperature,
    humidity: coerceNumber(raw.humidity) ?? base.humidity,
    team_infos: normalizedTeamInfos.map((team) => ({
      ...team,
      info_num: team.details.length,
    })),
    sup_infos,
    proj_center_lng: coerceNumber(raw.proj_center_lng) ?? base.proj_center_lng,
    proj_center_lat: coerceNumber(raw.proj_center_lat) ?? base.proj_center_lat,
    fuel_data_adjusted: Array.isArray(raw.fuel_data_adjusted)
      ? raw.fuel_data_adjusted
      : base.fuel_data_adjusted,
    customizedFuelGrid:
      typeof raw.customizedFuelGrid === "string"
        ? raw.customizedFuelGrid
        : base.customizedFuelGrid,
    slope_data_adjusted: Array.isArray(raw.slope_data_adjusted)
      ? raw.slope_data_adjusted
      : base.slope_data_adjusted,
    aspect_data_adjusted: Array.isArray(raw.aspect_data_adjusted)
      ? raw.aspect_data_adjusted
      : base.aspect_data_adjusted,
    cellResolution: coerceNumber(raw.cellResolution) ?? base.cellResolution,
    cellSpaceDimension:
      coerceInteger(raw.cellSpaceDimension) ?? base.cellSpaceDimension,
    cellSpaceDimensionLat:
      coerceInteger(raw.cellSpaceDimensionLat) ?? base.cellSpaceDimensionLat,
    customized_cell_state: Array.isArray(raw.customized_cell_state)
      ? raw.customized_cell_state
      : base.customized_cell_state,
    sup_num: sup_infos.length,
    ...(raw.boundaryGeoJSON !== undefined
      ? { boundaryGeoJSON: raw.boundaryGeoJSON as BoundaryGeoJSON }
      : {}),
  };
  return withSquareGridDimensions(normalizedPlan);
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
  distance: number | null = null,
): SegmentDetail {
  return {
    type: "segment",
    start_x,
    start_y,
    end_x,
    end_y,
    speed,
    mode,
    distance,
  };
}

/** Known ignition modes from API payloads + UI compatibility */
export const IGNITION_MODES = [
  { value: "continuous", label: "Continuous" },
  { value: "spot", label: "Spot" },
  { value: "point_static", label: "Point Static" },
  { value: "point_dynamic", label: "Point Dynamic" },
  { value: "continuous_static", label: "Continuous Static (Legacy)" },
  { value: "continuous_dynamic", label: "Continuous Dynamic (Legacy)" },
] as const;

export type IgnitionMode = (typeof IGNITION_MODES)[number]["value"];

export const LINE_IGNITION_MODES = [
  { value: "continuous", label: "Continuous" },
  { value: "spot", label: "Spot" },
] as const;

export const POINT_IGNITION_MODES = [
  { value: "point_static", label: "Point Static" },
  { value: "point_dynamic", label: "Point Dynamic" },
] as const;

export function ignitionModesForSegmentGeometry(isPoint: boolean) {
  return isPoint ? POINT_IGNITION_MODES : LINE_IGNITION_MODES;
}

export function ignitionModeForGeometry(
  mode: string,
  isPoint: boolean,
): string {
  const trimmed = mode.trim();
  if (isPoint) {
    return trimmed || "point_static";
  }
  return normalizeLineIgnitionMode(trimmed);
}

export function ignitionModeOptionsForCurrent(mode: string, isPoint: boolean) {
  const current = ignitionModeForGeometry(mode, isPoint);
  const options = ignitionModesForSegmentGeometry(isPoint);
  if (options.some((entry) => entry.value === current)) {
    return options;
  }
  return [{ value: current, label: `${current} (Custom)` }, ...options];
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
  mode?: string;
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
      const nextSeg: SegmentDetail = {
        ...seg,
        ...(edit.speed !== undefined ? { speed: edit.speed } : {}),
        ...(edit.mode !== undefined ? { mode: edit.mode } : {}),
        ...(edit.distance !== undefined ? { distance: edit.distance } : {}),
      };
      if (isPointCoordinates(nextSeg)) {
        return nextSeg;
      }
      const lineMode = normalizeLineIgnitionMode(nextSeg.mode);
      return {
        ...nextSeg,
        mode: lineMode,
        distance: normalizeLineIgnitionDistance(lineMode, nextSeg.distance),
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
      distance?: number | null;
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
      return withSquareGridDimensions({
        ...plan,
        proj_center_lng: payload.proj_center_lng,
        proj_center_lat: payload.proj_center_lat,
        cellResolution,
        cellSpaceDimension,
        cellSpaceDimensionLat,
        boundaryGeoJSON,
      });
    }
    case "point-ignition": {
      const speed = 3;
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
      return withSquareGridDimensions({ ...plan, team_infos: nextTeams });
    }
    case "line-ignition": {
      const speed = payload.speed ?? 3;
      const mode = normalizeLineIgnitionMode(payload.mode ?? "continuous");
      const distance = normalizeLineIgnitionDistance(mode, payload.distance);
      const seg = segmentLine(
        payload.start_x,
        payload.start_y,
        payload.end_x,
        payload.end_y,
        speed,
        mode,
        distance,
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
      return withSquareGridDimensions({ ...plan, team_infos: nextTeams });
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
      return withSquareGridDimensions({
        ...plan,
        sup_infos,
        sup_num: sup_infos.length,
      });
    }
    default:
      return withSquareGridDimensions(plan);
  }
}
