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

export const computeBurnedArea = createTool({
  id: "devs-fire-compute-burned-area",
  description: "Compute total burned area from DEVS-FIRE state.",
  inputSchema,
  outputSchema,
  execute: async ({ userToken }) => {
    try {
      const data = await devsFirePost("/computeBurnedArea/", userToken);
      return parseNumericResponse(data, "/computeBurnedArea/");
    } catch (error) {
      throw new Error(`computeBurnedArea failed: ${toErrorMessage(error)}`);
    }
  },
});
