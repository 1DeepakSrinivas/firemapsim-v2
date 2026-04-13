import { createTool } from "@mastra/core/tools";
import z from "zod";

import {
  devsFirePost,
  parseStringArrayResponse,
  toErrorMessage,
} from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
});

const outputSchema = z.array(z.string());

export const getPerimeterCells = createTool({
  id: "devs-fire-get-perimeter-cells",
  description: "Get DEVS-FIRE perimeter cells formatted as x,y strings.",
  inputSchema,
  outputSchema,
  execute: async ({ userToken }) => {
    try {
      const data = await devsFirePost("/getPerimeterCells/", userToken);
      return parseStringArrayResponse(data, "/getPerimeterCells/");
    } catch (error) {
      throw new Error(`getPerimeterCells failed: ${toErrorMessage(error)}`);
    }
  },
});
