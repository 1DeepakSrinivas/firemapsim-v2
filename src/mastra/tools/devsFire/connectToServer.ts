import { createTool } from "@mastra/core/tools";
import z from "zod";

import { connectToDevsFire, toErrorMessage } from "./_client";

const inputSchema = z.object({});
const outputSchema = z.object({ token: z.string() });

export const connectToServer = createTool({
  id: "devs-fire-connect-to-server",
  description: "Connect to DEVS-FIRE and create a user session token.",
  inputSchema,
  outputSchema,
  execute: async () => {
    try {
      const data = await connectToDevsFire();

      const isHtmlLike = (value: string): boolean => {
        const trimmed = value.trimStart().toLowerCase();
        return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
      };

      if (typeof data === "string") {
        const token = data.trim();
        if (!token) {
          throw new Error("DEVS-FIRE connectToServer response did not include token");
        }
        if (isHtmlLike(token)) {
          throw new Error(
            "DEVS-FIRE connectToServer returned HTML instead of a token. Check DEVS_FIRE_BASE_URL (expected https://firesim.cs.gsu.edu/api).",
          );
        }
        return { token };
      }

      if (typeof data === "object" && data !== null) {
        const token =
          (data as { token?: unknown }).token ??
          (data as { userToken?: unknown }).userToken;

        if (typeof token === "string") {
          const trimmed = token.trim();
          if (!trimmed) {
            throw new Error("DEVS-FIRE connectToServer response did not include token");
          }
          if (isHtmlLike(trimmed)) {
            throw new Error(
              "DEVS-FIRE connectToServer returned HTML instead of a token. Check DEVS_FIRE_BASE_URL (expected https://firesim.cs.gsu.edu/api).",
            );
          }
          return { token: trimmed };
        }
      }

      throw new Error("DEVS-FIRE connectToServer response did not include token");
    } catch (error) {
      throw new Error(`connectToServer failed: ${toErrorMessage(error)}`);
    }
  },
});
