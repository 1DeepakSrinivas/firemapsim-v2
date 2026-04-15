import { createTool } from "@mastra/core/tools";
import z from "zod";

import { devsFirePost, toErrorMessage } from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
  fileContent: z.string(),
  fileName: z.string().min(1),
});

export const loadWindFlow = createTool({
  id: "devs-fire-load-wind-flow",
  description: "Upload a windflow definition file to DEVS-FIRE.",
  inputSchema,
  execute: async ({ userToken, fileContent, fileName }) => {
    try {
      return await devsFirePost(
        "/loadWindFlow/",
        userToken,
        {
          weatherMap: fileName,
        },
        fileContent,
        {
          "Content-Type": "text/plain",
          fileName,
        },
      );
    } catch (error) {
      throw new Error(`loadWindFlow failed: ${toErrorMessage(error)}`);
    }
  },
});
