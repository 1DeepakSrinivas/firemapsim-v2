import { createTool } from "@mastra/core/tools";
import z from "zod";

import { devsFireProxyPost, toErrorMessage } from "./_client";

const inputSchema = z.object({});
const outputSchema = z.object({ token: z.string() });

export const connectToServer = createTool({
  id: "devs-fire-connect-to-server",
  description: "Connect to DEVS-FIRE and create a user session token.",
  inputSchema,
  outputSchema,
  execute: async () => {
    try {
      const data = await devsFireProxyPost(
        "/connectToServer",
        undefined,
        {},
        "connect",
        {
          "Content-Type": "text/plain",
        },
      );

      if (typeof data === "string") {
        return { token: data };
      }

      if (typeof data === "object" && data !== null) {
        const token =
          (data as { token?: unknown }).token ??
          (data as { userToken?: unknown }).userToken;

        if (typeof token === "string") {
          return { token };
        }
      }

      throw new Error("DEVS-FIRE connectToServer response did not include token");
    } catch (error) {
      throw new Error(`connectToServer failed: ${toErrorMessage(error)}`);
    }
  },
});
