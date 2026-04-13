import { createTool } from "@mastra/core/tools";
import z from "zod";

import { devsFirePost, toErrorMessage } from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
  fileContent: z.string(),
  fileName: z.string().min(1),
});

export const loadFuel = createTool({
  id: "devs-fire-load-fuel",
  description: "Upload a custom fuel map to DEVS-FIRE.",
  inputSchema,
  execute: async ({ userToken, fileContent, fileName }) => {
    try {
      return await devsFirePost(
        "/loadFuel/",
        userToken,
        {},
        fileContent,
        {
          "Content-Type": "text/plain",
          fileName,
        },
      );
    } catch (error) {
      throw new Error(`loadFuel failed: ${toErrorMessage(error)}`);
    }
  },
});
