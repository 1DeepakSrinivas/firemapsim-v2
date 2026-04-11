import { createTool } from "@mastra/core/tools";
import z from "zod";

import { devsFireProxyPost, toErrorMessage } from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
  xs: z.string().min(1),
  ys: z.string().min(1),
});

export const setPointIgnition = createTool({
  id: "devs-fire-set-point-ignition",
  description: "Set one or more ignition points in DEVS-FIRE.",
  inputSchema,
  execute: async ({ userToken, xs, ys }) => {
    try {
      return await devsFireProxyPost("/setPointIgnition/", userToken, {
        xs,
        ys,
      });
    } catch (error) {
      throw new Error(`setPointIgnition failed: ${toErrorMessage(error)}`);
    }
  },
});
