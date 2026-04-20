import "server-only";

import {
  fetchCurrentWeatherForCoords,
  fetchHourlyWeatherForCoords,
} from "@/lib/weather/openMeteoCurrent";
import {
  classifySimulationError,
  type SimulationErrorShape,
} from "@/lib/api/simulationErrors";
import { resolveSimulationWeather } from "@/lib/weather/simulationWeatherStrategy";
import { executeDevsFireSimulation } from "@/lib/runDevsFireFromPlan";
import type { IgnitionPlan } from "@/types/ignitionPlan";
import type { WeatherValues } from "@/components/weather/WeatherPreview";
import type { RunDevsFireResult } from "@/lib/runDevsFireFromPlan";

type RunSimulationDeps = {
  executeDevsFireSimulation: (input: Parameters<typeof executeDevsFireSimulation>[0]) => Promise<RunDevsFireResult>;
};

const defaultRunSimulationDeps: RunSimulationDeps = {
  executeDevsFireSimulation,
};
export { classifySimulationError };
export type { SimulationErrorShape };

export async function runSimulationWithDynamicWeather(params: {
  projectId?: string;
  plan: IgnitionPlan;
  simulationHours: number;
  weatherOverrides?: Partial<WeatherValues>;
}, deps: RunSimulationDeps = defaultRunSimulationDeps) {
  const weatherResolution = await resolveSimulationWeather(
    params,
    {
      fetchCurrentWeatherForCoords,
      fetchHourlyWeatherForCoords,
    },
  );

  const result = await deps.executeDevsFireSimulation({
    plan: params.plan,
    weather: weatherResolution.weatherUsed,
    weatherFetched: weatherResolution.weatherFetched,
    weatherOverrideApplied: weatherResolution.weatherOverrideApplied,
    hourlyWeather: weatherResolution.hourlyWeather,
    weatherSource: weatherResolution.weatherSource,
    simulationHours: params.simulationHours,
    projectId: params.projectId,
  });

  return {
    result,
    weatherFetched: weatherResolution.weatherFetched,
    hourlyWeather: weatherResolution.hourlyWeather,
    weatherUsed: weatherResolution.weatherUsed,
    weatherOverrideApplied: weatherResolution.weatherOverrideApplied,
  };
}
