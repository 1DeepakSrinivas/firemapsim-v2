import { createTool } from "@mastra/core/tools";
import z from "zod";

import { devsFireProxyPost, toErrorMessage } from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
  fileContent: z.string(),
  fileName: z.string().min(1),
});

export const loadAspect = createTool({
  id: "devs-fire-load-aspect",
  description: "Upload a custom aspect map to DEVS-FIRE.",
  inputSchema,
  execute: async ({ userToken, fileContent, fileName }) => {
    try {
      return await devsFireProxyPost(
        "/loadAspect/",
        userToken,
        {},
        fileContent,
        {
          "Content-Type": "text/plain",
          fileName,
        },
      );
    } catch (error) {
      throw new Error(`loadAspect failed: ${toErrorMessage(error)}`);
    }
  },
});
