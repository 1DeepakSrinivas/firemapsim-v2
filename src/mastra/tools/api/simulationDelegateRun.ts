import { createTool } from "@mastra/core/tools";
import z from "zod";

import { simulationRunBodySchema } from "@/app/api/simulation/run/route";
import { runSimulationWithDynamicWeather } from "@/lib/api/devsFireBackend";
import type { IgnitionPlan } from "@/types/ignitionPlan";

const inputSchema = simulationRunBodySchema.extend({
  reason: z.string().optional(),
});

const outputSchema = z.object({
  ok: z.boolean(),
  weatherSource: z.string().optional(),
});

export const simulationDelegateRun = createTool({
  id: "api-simulation-delegate-run",
  description:
    "Run the same backend simulation path as POST /api/simulation/run (dynamic weather + DEVS-FIRE). Uses shared server orchestration, not HTTP self-calls.",
  inputSchema,
  outputSchema,
  execute: async (payload) => {
    const parsed = inputSchema.parse(payload);
    const { reason: _reason, ...body } = parsed;

    const output = await runSimulationWithDynamicWeather({
      plan: body.plan as IgnitionPlan,
      weatherOverrides: body.weatherOverrides,
      simulationHours: body.simulationHours,
    });

    return {
      ok: true,
      weatherSource: output.result.weatherSource,
    };
  },
});
