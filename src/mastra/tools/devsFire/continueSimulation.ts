import { createTool } from "@mastra/core/tools";
import z from "zod";

import {
  devsFirePost,
  parseSimulationOperationsResponse,
  simulationOperationListSchema,
  toErrorMessage,
} from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
  time: z.number(),
});

export const continueSimulation = createTool({
  id: "devs-fire-continue-simulation",
  description: "Continue a DEVS-FIRE simulation for additional time.",
  inputSchema,
  outputSchema: simulationOperationListSchema,
  execute: async ({ userToken, time }) => {
    try {
      const data = await devsFirePost(
        "/continueSimulation/",
        userToken,
        { time },
      );

      return parseSimulationOperationsResponse(data, "/continueSimulation/");
    } catch (error) {
      throw new Error(`continueSimulation failed: ${toErrorMessage(error)}`);
    }
  },
});
