import { createLogger } from "@mastra/core/logger";
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";

import { fireSimAgent } from "./agents/firesim-agent";
import { simulateWorkflow } from "./workflows/simulate";

export const mastra = new Mastra({
  agents: {
    fireSimAgent,
  },
  workflows: {
    simulateWorkflow,
  },
  storage: new LibSQLStore({
    id: "firemapsim-mastra-storage",
    url: process.env.MASTRA_STORAGE_URL ?? "file:./tmp/mastra.db",
  }),
  logger: createLogger({
    name: "firemapsim-mastra",
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
  }),
});
