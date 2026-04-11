import { createTool } from "@mastra/core/tools";
import z from "zod";

import { weatherResponseSchema } from "./base";

const inputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  hours: z.number().int().positive().max(168).optional(),
});

const openMeteoSchema = z.object({
  hourly: z.object({
    temperature_2m: z.array(z.coerce.number()),
    relative_humidity_2m: z.array(z.coerce.number()),
    wind_speed_10m: z.array(z.coerce.number()),
    wind_direction_10m: z.array(z.coerce.number()),
  }),
});

type WeatherResponse = z.infer<typeof weatherResponseSchema>;

async function fetchOpenMeteo(
  lat: number,
  lng: number,
  hours: number,
): Promise<WeatherResponse> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "hourly",
    "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation",
  );
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("forecast_hours", String(hours));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("models", "best_match");

  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `Open-Meteo request failed (${response.status} ${response.statusText})`,
    );
  }

  const json = await response.json();
  const parsed = openMeteoSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Open-Meteo response invalid: ${parsed.error.message}`);
  }

  const h = parsed.data.hourly;
  const rowCount = Math.min(
    h.temperature_2m.length,
    h.relative_humidity_2m.length,
    h.wind_speed_10m.length,
    h.wind_direction_10m.length,
    hours,
  );

  if (rowCount === 0) {
    throw new Error("Open-Meteo returned no hourly weather points");
  }

  const hourly = Array.from({ length: rowCount }, (_, hour) => ({
    hour,
    windSpeed: h.wind_speed_10m[hour]!,
    windDirection: h.wind_direction_10m[hour]!,
    temperature: h.temperature_2m[hour]!,
    humidity: h.relative_humidity_2m[hour]!,
  }));

  return {
    current: {
      windSpeed: hourly[0]!.windSpeed,
      windDirection: hourly[0]!.windDirection,
      temperature: hourly[0]!.temperature,
      humidity: hourly[0]!.humidity,
    },
    hourly,
    source: "open-meteo",
  };
}

const nwsPointsSchema = z.object({
  properties: z.object({
    forecastHourly: z.string().url(),
  }),
});

const nwsForecastSchema = z.object({
  properties: z.object({
    periods: z.array(
      z.object({
        temperature: z.coerce.number(),
        windSpeed: z.string(),
        windDirection: z.string(),
        relativeHumidity: z
          .object({
            value: z.coerce.number().nullable(),
          })
          .optional(),
      }),
    ),
  }),
});

function parseNwsWindDirection(direction: string): number {
  const normalized = direction.trim().toUpperCase();
  const map: Record<string, number> = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSW: 202.5,
    SW: 225,
    WSW: 247.5,
    W: 270,
    WNW: 292.5,
    NW: 315,
    NNW: 337.5,
  };

  return map[normalized] ?? 0;
}

function parseNwsWindSpeedMph(speed: string): number {
  const match = speed.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return 0;
  }
  return Number(match[1]);
}

async function fetchNwsFallback(
  lat: number,
  lng: number,
  hours: number,
): Promise<WeatherResponse> {
  const pointsResponse = await fetch(
    `https://api.weather.gov/points/${lat},${lng}`,
    {
      method: "GET",
      headers: {
        "User-Agent": "FireSimApp/1.0",
      },
      cache: "no-store",
    },
  );

  if (!pointsResponse.ok) {
    throw new Error(
      `NWS points lookup failed (${pointsResponse.status} ${pointsResponse.statusText})`,
    );
  }

  const pointsJson = nwsPointsSchema.parse(await pointsResponse.json());

  const forecastResponse = await fetch(pointsJson.properties.forecastHourly, {
    method: "GET",
    headers: {
      "User-Agent": "FireSimApp/1.0",
    },
    cache: "no-store",
  });

  if (!forecastResponse.ok) {
    throw new Error(
      `NWS hourly forecast failed (${forecastResponse.status} ${forecastResponse.statusText})`,
    );
  }

  const forecastJson = nwsForecastSchema.parse(await forecastResponse.json());
  const periods = forecastJson.properties.periods.slice(0, hours);

  if (periods.length === 0) {
    throw new Error("NWS returned no hourly weather periods");
  }

  const hourly = periods.map((period, hour) => ({
    hour,
    windSpeed: parseNwsWindSpeedMph(period.windSpeed),
    windDirection: parseNwsWindDirection(period.windDirection),
    temperature: period.temperature,
    humidity: period.relativeHumidity?.value ?? 50,
  }));

  return {
    current: {
      windSpeed: hourly[0]!.windSpeed,
      windDirection: hourly[0]!.windDirection,
      temperature: hourly[0]!.temperature,
      humidity: hourly[0]!.humidity,
    },
    hourly,
    source: "nws",
  };
}

export const fetchWeather = createTool({
  id: "weather-fetch-weather",
  description:
    "Fetch weather from Open-Meteo with NOAA NWS fallback for fire simulation inputs.",
  inputSchema,
  outputSchema: weatherResponseSchema,
  execute: async ({ lat, lng, hours = 24 }) => {
    try {
      return await fetchOpenMeteo(lat, lng, hours);
    } catch {
      return fetchNwsFallback(lat, lng, hours);
    }
  },
});
