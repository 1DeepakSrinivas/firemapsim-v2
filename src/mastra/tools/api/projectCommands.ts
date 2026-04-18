import { createTool } from "@mastra/core/tools";
import z from "zod";

const runSimulationInputSchema = z.object({
  simulationTimesteps: z.number().int().positive().optional(),
});

const runSimulationOutputSchema = z.object({
  action: z.literal("run-simulation"),
  simulationTimesteps: z.number().int().positive().optional(),
});

export const runSimulationCommandTool = createTool({
  id: "run-simulation",
  description:
    "Request frontend execution of the current simulation plan. Optionally provide simulationTimesteps.",
  inputSchema: runSimulationInputSchema,
  outputSchema: runSimulationOutputSchema,
  execute: async (input) => ({
    action: "run-simulation" as const,
    ...(typeof input.simulationTimesteps === "number"
      ? { simulationTimesteps: input.simulationTimesteps }
      : {}),
  }),
});

const playbackControlInputSchema = z.object({
  action: z.enum(["play", "pause"]),
});

const playbackControlOutputSchema = z.object({
  action: z.literal("playback-control"),
  playbackAction: z.enum(["play", "pause"]),
});

export const playbackControlTool = createTool({
  id: "playback-control",
  description:
    "Control frontend replay visualization for the latest simulation output.",
  inputSchema: playbackControlInputSchema,
  outputSchema: playbackControlOutputSchema,
  execute: async (input) => ({
    action: "playback-control" as const,
    playbackAction: input.action,
  }),
});

const resetProjectOutputSchema = z.object({
  action: z.literal("reset-project"),
});

export const resetProjectTool = createTool({
  id: "reset-project",
  description:
    "Request a frontend project reset flow. This opens a confirmation modal before reset.",
  inputSchema: z.object({}),
  outputSchema: resetProjectOutputSchema,
  execute: async () => ({
    action: "reset-project" as const,
  }),
});
