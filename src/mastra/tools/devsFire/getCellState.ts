import { createTool } from "@mastra/core/tools";
import z from "zod";

import { devsFirePost, toErrorMessage } from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

export const getCellState = createTool({
  id: "devs-fire-get-cell-state",
  description: "Get the burn state of a specific DEVS-FIRE cell.",
  inputSchema,
  execute: async ({ userToken, x, y }) => {
    try {
      return await devsFirePost("/getCellState/", userToken, { x, y });
    } catch (error) {
      throw new Error(`getCellState failed: ${toErrorMessage(error)}`);
    }
  },
});
