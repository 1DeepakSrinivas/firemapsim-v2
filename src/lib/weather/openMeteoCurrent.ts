/**
 * Point forecast from Open-Meteo at the given lat/lng.
 * Call only with coordinates already scoped to your region (e.g. US ZIP → Zippopotam).
 */

import type { WeatherValues } from "@/components/weather/WeatherPreview";
import type { HourlyWeatherPoint } from "@/mastra/tools/weather/base";

/** First forecast hour as current conditions. */
export async function fetchCurrentWeatherForCoords(
  lat: number,
  lng: number,
): Promise<{ weather: WeatherValues; source: "open-meteo" }> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "hourly",
    "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m",
  );
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("forecast_hours", "24");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("models", "best_match");

  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Open-Meteo failed (${response.status})`);
  }

  const json = (await response.json()) as {
    hourly?: {
      temperature_2m?: number[];
      relative_humidity_2m?: number[];
      wind_speed_10m?: number[];
      wind_direction_10m?: number[];
    };
  };
  const h = json.hourly;
  if (!h?.temperature_2m?.length) {
    throw new Error("Open-Meteo returned no hourly data");
  }
  const i = 0;
  const weather: WeatherValues = {
    windSpeed: h.wind_speed_10m?.[i] ?? 0,
    windDirection: h.wind_direction_10m?.[i] ?? 0,
    temperature: h.temperature_2m[i] ?? 0,
    humidity: h.relative_humidity_2m?.[i] ?? 0,
  };

  return { weather, source: "open-meteo" };
}

export async function fetchHourlyWeatherForCoords(
  lat: number,
  lng: number,
  hours: number,
): Promise<{ hourly: HourlyWeatherPoint[]; source: "open-meteo" }> {
  const forecastHours = Math.max(1, Math.min(168, Math.floor(hours)));
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "hourly",
    "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m",
  );
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("forecast_hours", String(forecastHours));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("models", "best_match");

  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Open-Meteo hourly fetch failed (${response.status})`);
  }

  const json = (await response.json()) as {
    hourly?: {
      temperature_2m?: number[];
      relative_humidity_2m?: number[];
      wind_speed_10m?: number[];
      wind_direction_10m?: number[];
    };
  };

  const h = json.hourly;
  if (!h?.temperature_2m?.length) {
    throw new Error("Open-Meteo returned no hourly weather rows");
  }

  const rowCount = Math.min(
    h.temperature_2m.length,
    h.relative_humidity_2m?.length ?? 0,
    h.wind_speed_10m?.length ?? 0,
    h.wind_direction_10m?.length ?? 0,
    forecastHours,
  );

  const hourly: HourlyWeatherPoint[] = Array.from({ length: rowCount }, (_, hour) => ({
    hour,
    windSpeed: h.wind_speed_10m?.[hour] ?? 0,
    windDirection: h.wind_direction_10m?.[hour] ?? 0,
    temperature: h.temperature_2m?.[hour] ?? 0,
    humidity: h.relative_humidity_2m?.[hour] ?? 0,
  }));

  return { hourly, source: "open-meteo" };
}
