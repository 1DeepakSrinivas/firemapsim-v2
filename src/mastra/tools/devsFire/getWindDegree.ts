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

export const getWindDegree = createTool({
  id: "devs-fire-get-wind-degree",
  description: "Get current wind direction in degrees.",
  inputSchema,
  outputSchema,
  execute: async ({ userToken }) => {
    try {
      const data = await devsFirePost("/getWindDegree/", userToken);
      return parseNumericResponse(data, "/getWindDegree/");
    } catch (error) {
      throw new Error(`getWindDegree failed: ${toErrorMessage(error)}`);
    }
  },
});
