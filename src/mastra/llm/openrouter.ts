import type { MastraModelConfig } from "@mastra/core/llm";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const FIRE_SIM_MODEL_ID = "openrouter/qwen/qwen3.5-397b-a17b";

export function getFireSimModel(): MastraModelConfig {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY for FireSim agent model.");
  }

  return {
    id: FIRE_SIM_MODEL_ID,
    url: OPENROUTER_BASE_URL,
    apiKey,
    headers: {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.BETTER_AUTH_URL ??
        "http://localhost:3000",
      "X-Title": "FireMapSim-v2",
    },
  };
}
