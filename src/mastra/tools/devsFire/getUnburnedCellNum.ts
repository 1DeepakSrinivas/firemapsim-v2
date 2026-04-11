import { createTool } from "@mastra/core/tools";
import z from "zod";

import {
  devsFireProxyPost,
  parseNumericResponse,
  toErrorMessage,
} from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
});

const outputSchema = z.number();

export const getUnburnedCellNum = createTool({
  id: "devs-fire-get-unburned-cell-num",
  description: "Get total number of unburned cells.",
  inputSchema,
  outputSchema,
  execute: async ({ userToken }) => {
    try {
      const data = await devsFireProxyPost("/getUnburnedCellNum/", userToken);
      return parseNumericResponse(data, "/getUnburnedCellNum/");
    } catch (error) {
      throw new Error(`getUnburnedCellNum failed: ${toErrorMessage(error)}`);
    }
  },
});
