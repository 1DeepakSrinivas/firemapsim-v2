import { createTool } from "@mastra/core/tools";
import z from "zod";

import { devsFireProxyPost, toErrorMessage } from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
  windSpeed: z.number(),
  windDirection: z.number().optional(),
});

export const setWindCondition = createTool({
  id: "devs-fire-set-wind-condition",
  description: "Set wind speed and optional wind direction for DEVS-FIRE.",
  inputSchema,
  execute: async ({ userToken, windSpeed, windDirection }) => {
    try {
      return await devsFireProxyPost("/setWindCondition/", userToken, {
        windSpeed,
        windDirection,
      });
    } catch (error) {
      throw new Error(`setWindCondition failed: ${toErrorMessage(error)}`);
    }
  },
});
