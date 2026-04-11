import { createTool } from "@mastra/core/tools";
import z from "zod";

import { devsFireProxyPost, toErrorMessage } from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
  cellResolution: z.number(),
  cellDimension: z.number(),
});

export const setCellResolution = createTool({
  id: "devs-fire-set-cell-resolution",
  description: "Set DEVS-FIRE cell resolution and cell-space dimensions.",
  inputSchema,
  execute: async ({ userToken, cellResolution, cellDimension }) => {
    try {
      return await devsFireProxyPost("/setCellResolution/", userToken, {
        cellResolution,
        cellDimension,
      });
    } catch (error) {
      throw new Error(`setCellResolution failed: ${toErrorMessage(error)}`);
    }
  },
});
