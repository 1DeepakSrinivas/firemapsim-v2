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
 * Suppression coordinates from the plan use x=column, y=row (internal convention).
 * After the row/column swap applied at call time, DEVS-FIRE sees x=row, y=column.
 * This function checks the post-swap values.
 *
 * Ignition dispatch commands are already in DEVS-FIRE convention (x=row, y=column).
 */
export function validateAllCoordinates(
  plan: IgnitionPlan,
  commands: IgnitionDispatchCommand[],
  cellDimension: number,
): void {
  // Suppression lines — plan coords need swap (x=col→y, y=row→x)
  for (let i = 0; i < plan.sup_infos.length; i += 1) {
    const sup = plan.sup_infos[i];
    const label = `Suppression line ${i + 1}`;
    // After swap: DEVS-FIRE x=sup.y, DEVS-FIRE y=sup.x
    assertInBounds(sup.y1, label, "x1 (row)", cellDimension);
    assertInBounds(sup.x1, label, "y1 (col)", cellDimension);
    assertInBounds(sup.y2, label, "x2 (row)", cellDimension);
    assertInBounds(sup.x2, label, "y2 (col)", cellDimension);
  }

  // Ignition commands — already in DEVS-FIRE convention from dispatch
  for (const command of commands) {
    if (command.kind === "setDynamicIgnition") {
      const label = `Dynamic ignition (${command.teamName})`;
      assertInBounds(command.x1, label, "x1 (row)", cellDimension);
      assertInBounds(command.y1, label, "y1 (col)", cellDimension);
      assertInBounds(command.x2, label, "x2 (row)", cellDimension);
      assertInBounds(command.y2, label, "y2 (col)", cellDimension);
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
