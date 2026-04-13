import { createTool } from "@mastra/core/tools";
import z from "zod";

import {
  devsFirePost,
  parseNumericMatrixResponse,
  toErrorMessage,
} from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
});

const outputSchema = z.array(z.array(z.number()));

export const getCellAspect = createTool({
  id: "devs-fire-get-cell-aspect",
  description: "Get the loaded DEVS-FIRE aspect map.",
  inputSchema,
  outputSchema,
  execute: async ({ userToken }) => {
    try {
      const data = await devsFirePost("/getCellAspect/", userToken);
      return parseNumericMatrixResponse(data, "/getCellAspect/");
    } catch (error) {
      throw new Error(`getCellAspect failed: ${toErrorMessage(error)}`);
    }
  },
});
