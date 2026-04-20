import type { WeatherValues } from "@/components/weather/WeatherPreview";
import type { IgnitionPlan } from "@/types/ignitionPlan";

export type SimulationRunRequestBody = {
  projectId: string;
  plan: IgnitionPlan;
  simulationHours: number;
  weatherOverrides: Partial<WeatherValues>;
};

export function buildSimulationRunRequestBody(input: {
  projectId: string;
  plan: IgnitionPlan;
  weather: WeatherValues;
  weatherOverrides: Partial<WeatherValues>;
  simulationTimesteps: number;
}): SimulationRunRequestBody {
  const planPayload: IgnitionPlan = {
    ...input.plan,
    windSpeed: input.weather.windSpeed,
    windDegree: input.weather.windDirection,
    temperature: input.weather.temperature,
    humidity: input.weather.humidity,
    total_sim_time: input.simulationTimesteps,
  };

  return {
    projectId: input.projectId,
    plan: planPayload,
    // Legacy request key expected by the route schema; value is timesteps.
    simulationHours: input.simulationTimesteps,
    weatherOverrides: input.weatherOverrides,
  };
}
