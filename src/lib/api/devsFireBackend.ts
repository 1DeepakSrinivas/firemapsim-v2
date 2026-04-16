import "server-only";

import { fetchCurrentWeatherForCoords } from "@/lib/weather/openMeteoCurrent";
import { executeDevsFireSimulation } from "@/lib/runDevsFireFromPlan";
import type { IgnitionPlan } from "@/types/ignitionPlan";
import type { WeatherValues } from "@/components/weather/WeatherPreview";

export type SimulationErrorShape = {
  code: string;
  message: string;
  status: number;
};

export function classifySimulationError(error: unknown): SimulationErrorShape {
  const message = error instanceof Error ? error.message : "Unknown error";
  const lower = message.toLowerCase();

  if (
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("abort")
  ) {
    return {
      code: "upstream_timeout",
      message:
        "DEVS-FIRE upstream timed out. Please retry shortly; if it persists, verify server availability.",
      status: 504,
    };
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("couldn't connect") ||
    lower.includes("failed to fetch") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network")
  ) {
    return {
      code: "upstream_unreachable",
      message:
        "DEVS-FIRE upstream is unreachable from the server. Check network/firewall and DEVS_FIRE_BASE_URL.",
      status: 502,
    };
  }

  if (lower.includes("invalid") && lower.includes("response")) {
    return {
      code: "invalid_upstream_response",
      message: "DEVS-FIRE returned an invalid response payload.",
      status: 502,
    };
  }

  return { code: "simulation_failed", message, status: 500 };
}

export async function runSimulationWithDynamicWeather(params: {
  plan: IgnitionPlan;
  simulationHours: number;
  weatherOverrides?: Partial<WeatherValues>;
}) {
  const weatherFetchedResponse = await fetchCurrentWeatherForCoords(
    params.plan.proj_center_lat,
    params.plan.proj_center_lng,
  );
  const weatherFetched = weatherFetchedResponse.weather;

  const weatherOverrides = params.weatherOverrides ?? {};
  const weatherUsed: WeatherValues = {
    ...weatherFetched,
    ...weatherOverrides,
  };

  const overrideFields = Object.keys(weatherOverrides).filter(
    (k) =>
      weatherOverrides[k as keyof typeof weatherOverrides] !== undefined,
  );

  const result = await executeDevsFireSimulation({
    plan: params.plan,
    weather: weatherUsed,
    simulationHours: params.simulationHours,
  });

  return {
    result,
    weatherFetched,
    weatherUsed,
    weatherOverrideApplied: overrideFields,
  };
}
