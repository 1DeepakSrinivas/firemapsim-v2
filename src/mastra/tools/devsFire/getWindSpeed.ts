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

export const getWindSpeed = createTool({
  id: "devs-fire-get-wind-speed",
  description: "Get current DEVS-FIRE wind speed.",
  inputSchema,
  outputSchema,
  execute: async ({ userToken }) => {
    try {
      const data = await devsFirePost("/getWindSpeed/", userToken);
      return parseNumericResponse(data, "/getWindSpeed/");
    } catch (error) {
      throw new Error(`getWindSpeed failed: ${toErrorMessage(error)}`);
    }
  },
});
