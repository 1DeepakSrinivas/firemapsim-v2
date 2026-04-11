import { createTool } from "@mastra/core/tools";
import z from "zod";

import {
  devsFireProxyPost,
  parseNumericMatrixResponse,
  toErrorMessage,
} from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
});

const outputSchema = z.array(z.array(z.number()));

export const getCellFuel = createTool({
  id: "devs-fire-get-cell-fuel",
  description: "Get the loaded DEVS-FIRE fuel map.",
  inputSchema,
  outputSchema,
  execute: async ({ userToken }) => {
    try {
      const data = await devsFireProxyPost("/getCellFuel/", userToken);
      return parseNumericMatrixResponse(data, "/getCellFuel/");
    } catch (error) {
      throw new Error(`getCellFuel failed: ${toErrorMessage(error)}`);
    }
  },
});
