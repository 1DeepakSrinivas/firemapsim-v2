import type { WeatherValues } from "@/components/weather/WeatherPreview";
import type { HourlyWeatherPoint } from "@/mastra/tools/weather/base";
import type { IgnitionPlan } from "@/types/ignitionPlan";
import { isValidGeodeticCenter } from "@/lib/geoCoords";

const TIMESTEPS_PER_HOUR = 500;
const DEFAULT_PLAN_WEATHER: WeatherValues = {
  windSpeed: 10,
  windDirection: 225,
  temperature: 72,
  humidity: 38,
};

export type WeatherResolutionDeps = {
  fetchCurrentWeatherForCoords: (
    lat: number,
    lng: number,
  ) => Promise<{ weather: WeatherValues; source: "open-meteo" }>;
  fetchHourlyWeatherForCoords: (
    lat: number,
    lng: number,
    hours: number,
  ) => Promise<{ hourly: HourlyWeatherPoint[]; source: "open-meteo" }>;
};

export type ResolvedSimulationWeather = {
  weatherSource: "dynamic" | "plan";
  weatherFetched: WeatherValues;
  weatherUsed: WeatherValues;
  weatherOverrideApplied: string[];
  hourlyWeather: HourlyWeatherPoint[];
};

function derivePlanWeather(plan: IgnitionPlan): WeatherValues {
  return {
    windSpeed: Number.isFinite(plan.windSpeed)
      ? plan.windSpeed
      : DEFAULT_PLAN_WEATHER.windSpeed,
    windDirection: Number.isFinite(plan.windDegree)
      ? plan.windDegree
      : DEFAULT_PLAN_WEATHER.windDirection,
    temperature: Number.isFinite(plan.temperature ?? NaN)
      ? (plan.temperature as number)
      : DEFAULT_PLAN_WEATHER.temperature,
    humidity: Number.isFinite(plan.humidity ?? NaN)
      ? (plan.humidity as number)
      : DEFAULT_PLAN_WEATHER.humidity,
  };
}

export async function resolveSimulationWeather(
  params: {
    plan: IgnitionPlan;
    simulationHours: number;
    weatherOverrides?: Partial<WeatherValues>;
  },
  deps: WeatherResolutionDeps,
): Promise<ResolvedSimulationWeather> {
  const hasGeodeticCenter = isValidGeodeticCenter(
    params.plan.proj_center_lat,
    params.plan.proj_center_lng,
  );

  let weatherSource: "dynamic" | "plan" = "dynamic";
  let weatherFetched: WeatherValues;
  let hourlyWeather: HourlyWeatherPoint[] = [];

  if (!hasGeodeticCenter) {
    weatherSource = "plan";
    weatherFetched = derivePlanWeather(params.plan);
  } else {
    const weatherFetchedResponse = await deps.fetchCurrentWeatherForCoords(
      params.plan.proj_center_lat,
      params.plan.proj_center_lng,
    );
    weatherFetched = weatherFetchedResponse.weather;

    const forecastHours = Math.max(
      1,
      Math.min(168, Math.ceil(params.simulationHours / TIMESTEPS_PER_HOUR)),
    );
    try {
      const hourlyResponse = await deps.fetchHourlyWeatherForCoords(
        params.plan.proj_center_lat,
        params.plan.proj_center_lng,
        forecastHours,
      );
      hourlyWeather = hourlyResponse.hourly;
    } catch {
      // Graceful fallback to static wind when hourly weather is unavailable.
      hourlyWeather = [];
    }
  }

  const weatherOverrides = params.weatherOverrides ?? {};
  const weatherUsed: WeatherValues = {
    ...weatherFetched,
    ...weatherOverrides,
  };

  const weatherOverrideApplied = Object.keys(weatherOverrides).filter(
    (key) =>
      weatherOverrides[key as keyof typeof weatherOverrides] !== undefined,
  );

  return {
    weatherSource,
    weatherFetched,
    weatherUsed,
    weatherOverrideApplied,
    hourlyWeather,
  };
}
