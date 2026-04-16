import { createTool } from "@mastra/core/tools";
import z from "zod";

import {
  devsFirePost,
  parseNumericResponse,
  toErrorMessage,
} from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
});

const outputSchema = z.number();

export const getBurningCellNum = createTool({
  id: "devs-fire-get-burning-cell-num",
  description: "Get the number of currently burning cells.",
  inputSchema,
  outputSchema,
  execute: async ({ userToken }) => {
    try {
      const data = await devsFirePost("/getBurningCellNum/", userToken);
      return parseNumericResponse(data, "/getBurningCellNum/");
    } catch (error) {
      throw new Error(`getBurningCellNum failed: ${toErrorMessage(error)}`);
    }
  },
});
