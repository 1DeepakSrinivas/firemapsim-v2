import { createTool } from "@mastra/core/tools";
import z from "zod";

import { devsFireProxyPost, toErrorMessage } from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});

export const setSuppressedCell = createTool({
  id: "devs-fire-set-suppressed-cell",
  description: "Set a suppressed rectangular region in DEVS-FIRE.",
  inputSchema,
  execute: async ({ userToken, x1, y1, x2, y2 }) => {
    try {
      return await devsFireProxyPost("/setSuppressedCell/", userToken, {
        x1,
        y1,
        x2,
        y2,
      });
    } catch (error) {
      throw new Error(`setSuppressedCell failed: ${toErrorMessage(error)}`);
    }
  },
});
