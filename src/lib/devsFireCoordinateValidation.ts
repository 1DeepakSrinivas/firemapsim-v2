import type { IgnitionPlan } from "@/types/ignitionPlan";
import type {
  IgnitionDispatchCommand,
} from "@/lib/devsFireIgnitionDispatch";

export class CoordinateOutOfBoundsError extends Error {
  readonly code = "coordinate_out_of_bounds" as const;
  readonly status = 400 as const;

  constructor(label: string, axis: string, value: number, max: number) {
    super(
      `${label} ${axis} coordinate ${value} is out of bounds [0, ${max}). ` +
        `Ensure all ignition and suppression points are within the ${max}x${max} grid.`,
    );
    this.name = "CoordinateOutOfBoundsError";
  }
}

function assertInBounds(value: number, label: string, axis: string, max: number): void {
  if (value < 0 || value >= max) {
    throw new CoordinateOutOfBoundsError(label, axis, value, max);
  }
}

/**
 * Validate that all coordinates destined for DEVS-FIRE are within `[0, cellDimension)`.
 *
 * Runtime-first convention: plan geometry, map overlays, and simulation operations
 * all use x=column, y=row.
 */
export function validateAllCoordinates(
  plan: IgnitionPlan,
  commands: IgnitionDispatchCommand[],
  cellDimension: number,
): void {
  // Suppression lines are sent with the same x/y orientation as the plan.
  for (let i = 0; i < plan.sup_infos.length; i += 1) {
    const sup = plan.sup_infos[i];
    const label = `Suppression line ${i + 1}`;
    assertInBounds(sup.x1, label, "x1 (col)", cellDimension);
    assertInBounds(sup.y1, label, "y1 (row)", cellDimension);
    assertInBounds(sup.x2, label, "x2 (col)", cellDimension);
    assertInBounds(sup.y2, label, "y2 (row)", cellDimension);
  }

  // Ignition commands also use x=column, y=row.
  for (const command of commands) {
    if (command.kind === "setDynamicIgnition") {
      const label = `Dynamic ignition (${command.teamName})`;
      assertInBounds(command.x1, label, "x1 (col)", cellDimension);
      assertInBounds(command.y1, label, "y1 (row)", cellDimension);
      assertInBounds(command.x2, label, "x2 (col)", cellDimension);
      assertInBounds(command.y2, label, "y2 (row)", cellDimension);
    } else {
      const label = `Point ignition (${command.teamName})`;
      for (const x of command.xs) {
        assertInBounds(x, label, "xs (col)", cellDimension);
      }
      for (const y of command.ys) {
        assertInBounds(y, label, "ys (row)", cellDimension);
      }
    }
  }
}
