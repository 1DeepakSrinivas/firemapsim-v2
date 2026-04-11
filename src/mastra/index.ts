import { createLogger } from "@mastra/core/logger";
import { Mastra } from "@mastra/core/mastra";

import { fireSimAgent } from "./agents/firesim-agent";
import { simulateWorkflow } from "./workflows/simulate";

export const mastra = new Mastra({
  agents: {
    fireSimAgent,
  },
  workflows: {
    simulateWorkflow,
  },
  logger: createLogger({
    name: "firemapsim-mastra",
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
  }),
});
