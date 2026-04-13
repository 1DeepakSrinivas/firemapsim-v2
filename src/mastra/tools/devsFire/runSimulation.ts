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

export const runSimulation = createTool({
  id: "devs-fire-run-simulation",
  description: "Run DEVS-FIRE simulation from scratch.",
  inputSchema,
  outputSchema: simulationOperationListSchema,
  execute: async ({ userToken, time }) => {
    try {
      const data = await devsFirePost(
        "/runSimulation/",
        userToken,
        { time },
      );

      return parseSimulationOperationsResponse(data, "/runSimulation/");
    } catch (error) {
      throw new Error(`runSimulation failed: ${toErrorMessage(error)}`);
    }
  },
});
