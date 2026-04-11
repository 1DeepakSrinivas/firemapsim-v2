import { Agent } from "@mastra/core/agent";

import { continueSimulation } from "@/mastra/tools/devsFire/continueSimulation";
import { connectToServer } from "@/mastra/tools/devsFire/connectToServer";
import { loadAspect } from "@/mastra/tools/devsFire/loadAspect";
import { loadFuel } from "@/mastra/tools/devsFire/loadFuel";
import { loadSlope } from "@/mastra/tools/devsFire/loadSlope";
import { loadWindFlow } from "@/mastra/tools/devsFire/loadWindFlow";
import { runSimulation } from "@/mastra/tools/devsFire/runSimulation";
import { setCellResolution } from "@/mastra/tools/devsFire/setCellResolution";
import { setDynamicIgnition } from "@/mastra/tools/devsFire/setDynamicIgnition";
import { setPointIgnition } from "@/mastra/tools/devsFire/setPointIgnition";
import { setSuppressedCell } from "@/mastra/tools/devsFire/setSuppressedCell";
import { setWindCondition } from "@/mastra/tools/devsFire/setWindCondition";
import { fetchParcelBoundary } from "@/mastra/tools/geo/fetchParcelBoundary";
import { fetchTerrainData } from "@/mastra/tools/geo/fetchTerrainData";
import { geocodeAddress } from "@/mastra/tools/geo/geocodeAddress";
import { buildWindflowFile } from "@/mastra/tools/weather/buildWindflowFile";
import { fetchWeather } from "@/mastra/tools/weather/fetchWeather";

import { getFireSimModel } from "../llm/openrouter";

export const fireSimAgent = new Agent({
  id: "firesim-agent",
  name: "Fire Simulation Planner",
  description:
    "Plans wildfire simulations and orchestrates terrain, weather, and DEVS-FIRE execution steps.",
  instructions: [
    "You are a wildfire simulation planning assistant for FireMapSim.",
    "Use tools to geocode locations, fetch parcel and terrain data, gather weather, and run DEVS-FIRE operations.",
    "Always explain assumptions, especially ignition points and simulation duration.",
    "When data is missing, pick safe defaults and state them clearly.",
    "Prefer deterministic, reproducible plans with explicit parameters.",
  ],
  model: getFireSimModel(),
  tools: {
    geocodeAddress,
    fetchParcelBoundary,
    fetchTerrainData,
    fetchWeather,
    buildWindflowFile,
    connectToServer,
    setCellResolution,
    loadFuel,
    loadSlope,
    loadAspect,
    loadWindFlow,
    setWindCondition,
    setPointIgnition,
    setDynamicIgnition,
    setSuppressedCell,
    runSimulation,
    continueSimulation,
  },
});
