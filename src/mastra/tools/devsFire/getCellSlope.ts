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

export const getCellSlope = createTool({
  id: "devs-fire-get-cell-slope",
  description: "Get the loaded DEVS-FIRE slope map.",
  inputSchema,
  outputSchema,
  execute: async ({ userToken }) => {
    try {
      const data = await devsFirePost("/getCellSlope/", userToken);
      return parseNumericMatrixResponse(data, "/getCellSlope/");
    } catch (error) {
      throw new Error(`getCellSlope failed: ${toErrorMessage(error)}`);
    }
  },
});
