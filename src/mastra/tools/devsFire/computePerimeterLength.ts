import { createTool } from "@mastra/core/tools";
import z from "zod";

import {
  devsFireProxyPost,
  parseNumericResponse,
  toErrorMessage,
} from "./_client";

const inputSchema = z.object({
  userToken: z.string().min(1),
});

const outputSchema = z.number();

export const computePerimeterLength = createTool({
  id: "devs-fire-compute-perimeter-length",
  description: "Compute perimeter length of the burn area.",
  inputSchema,
  outputSchema,
  execute: async ({ userToken }) => {
    try {
      const data = await devsFireProxyPost(
        "/computePerimeterLength/",
        userToken,
      );
      return parseNumericResponse(data, "/computePerimeterLength/");
    } catch (error) {
      throw new Error(`computePerimeterLength failed: ${toErrorMessage(error)}`);
    }
  },
});
