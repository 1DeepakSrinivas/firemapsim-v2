import { createTool } from "@mastra/core/tools";
import z from "zod";

import { devsFirePost, toErrorMessage } from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
  teamNum: z.string().min(1),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  speed: z.number(),
  mode: z.string().optional(),
  distance: z.number().optional(),
  waitTime: z.number().optional(),
});

export const setDynamicIgnition = createTool({
  id: "devs-fire-set-dynamic-ignition",
  description: "Configure dynamic burn-team ignition in DEVS-FIRE.",
  inputSchema,
  execute: async ({
    userToken,
    teamNum,
    x1,
    y1,
    x2,
    y2,
    speed,
    mode,
    distance,
    waitTime,
  }) => {
    try {
      return await devsFirePost("/setDynamicIgnition/", userToken, {
        teamNum,
        x1,
        y1,
        x2,
        y2,
        speed,
        mode,
        distance,
        waitTime,
      });
    } catch (error) {
      throw new Error(`setDynamicIgnition failed: ${toErrorMessage(error)}`);
    }
  },
});
