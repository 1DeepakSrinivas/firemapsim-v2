import { createTool } from "@mastra/core/tools";
import z from "zod";

import { devsFireProxyPost, toErrorMessage } from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
  fileContent: z.string(),
  fileName: z.string().min(1),
});

export const loadSlope = createTool({
  id: "devs-fire-load-slope",
  description: "Upload a custom slope map to DEVS-FIRE.",
  inputSchema,
  execute: async ({ userToken, fileContent, fileName }) => {
    try {
      return await devsFireProxyPost(
        "/loadSlope/",
        userToken,
        {},
        fileContent,
        {
          "Content-Type": "text/plain",
          fileName,
        },
      );
    } catch (error) {
      throw new Error(`loadSlope failed: ${toErrorMessage(error)}`);
    }
  },
});
