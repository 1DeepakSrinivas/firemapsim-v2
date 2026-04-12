import z from "zod";

export const simulationOperationSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
  Operation: z.string(),
  time: z.coerce.number(),
});

export const simulationOperationListSchema = z.array(simulationOperationSchema);

export function parseSimulationOperationsResponse(
  data: unknown,
  endpoint: string,
) {
  const direct = simulationOperationListSchema.safeParse(data);
  if (direct.success) {
    return direct.data;
  }

  if (typeof data === "object" && data !== null) {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const nested = simulationOperationListSchema.safeParse(value);
      if (nested.success) {
        return nested.data;
      }
    }
  }

  throw new Error(`Invalid simulation operation list for ${endpoint}`);
}
