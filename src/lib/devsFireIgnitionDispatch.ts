import type { IgnitionPlan, SegmentDetail } from "@/types/ignitionPlan";

export const MAX_POINT_IGNITIONS = 200;

export class TooManyPointIgnitionsError extends Error {
  readonly code = "too_many_point_ignitions" as const;
  readonly status = 400 as const;
  readonly pointCount: number;
  readonly limit: number;

  constructor(pointCount: number, limit = MAX_POINT_IGNITIONS) {
    super(
      `Too many point ignitions (${pointCount}). DEVS-FIRE supports at most ${limit} point ignitions per run.`,
    );
    this.name = "TooManyPointIgnitionsError";
    this.pointCount = pointCount;
    this.limit = limit;
  }
}

export type PointIgnitionCommand = {
  kind: "setPointIgnition";
  teamName: string;
  xs: number[];
  ys: number[];
};

export type DynamicIgnitionCommand = {
  kind: "setDynamicIgnition";
  teamName: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  speed: number;
  mode: "spot" | "continuous";
  distance?: number;
};

export type IgnitionDispatchCommand =
  | PointIgnitionCommand
  | DynamicIgnitionCommand;

export function isPointSegment(
  seg: Pick<SegmentDetail, "start_x" | "start_y" | "end_x" | "end_y">,
): boolean {
  return seg.start_x === seg.end_x && seg.start_y === seg.end_y;
}

export function mapIgnitionMode(mode: string): "spot" | "continuous" {
  const normalized = mode.toLowerCase();
  if (normalized.includes("point") || normalized.includes("spot")) return "spot";
  return "continuous";
}

/**
 * DEVS-FIRE setDynamicIgnition expects x=row and y=column.
 * IgnitionPlan stores x=column and y=row.
 */
export function planSegmentToDynamicIgnition(seg: {
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
}) {
  return {
    x1: seg.start_y,
    y1: seg.start_x,
    x2: seg.end_y,
    y2: seg.end_x,
  };
}

export function buildIgnitionDispatchCommands(plan: IgnitionPlan): {
  commands: IgnitionDispatchCommand[];
  pointIgnitionCount: number;
} {
  const commands: IgnitionDispatchCommand[] = [];
  let pointIgnitionCount = 0;

  for (const team of plan.team_infos) {
    const pointCols: number[] = [];
    const pointRows: number[] = [];

    for (const seg of team.details) {
      if (isPointSegment(seg)) {
        pointCols.push(seg.start_x);
        pointRows.push(seg.start_y);
        pointIgnitionCount += 1;
        continue;
      }

      const mapped = planSegmentToDynamicIgnition(seg);
      const dynamicCommand: DynamicIgnitionCommand = {
        kind: "setDynamicIgnition",
        teamName: team.team_name,
        x1: mapped.x1,
        y1: mapped.y1,
        x2: mapped.x2,
        y2: mapped.y2,
        speed: seg.speed,
        mode: mapIgnitionMode(seg.mode),
      };
      if (typeof seg.distance === "number" && Number.isFinite(seg.distance)) {
        dynamicCommand.distance = seg.distance;
      }
      commands.push(dynamicCommand);
    }

    if (pointCols.length > 0) {
      commands.push({
        kind: "setPointIgnition",
        teamName: team.team_name,
        xs: pointCols,
        ys: pointRows,
      });
    }
  }

  return { commands, pointIgnitionCount };
}

export function enforcePointIgnitionLimit(
  pointIgnitionCount: number,
  maxPointIgnitions = MAX_POINT_IGNITIONS,
): void {
  if (pointIgnitionCount > maxPointIgnitions) {
    throw new TooManyPointIgnitionsError(pointIgnitionCount, maxPointIgnitions);
  }
}
