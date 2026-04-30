# Weather data

Weather for simulations is fetched **server-side** and surfaced in the UI and Mastra tools. Primary current-condition sourcing uses **Open-Meteo**.

## Open-Meteo

- **`src/lib/weather/openMeteoCurrent.ts`** — `fetchCurrentWeatherForCoords(lat, lng)` calls `https://api.open-meteo.com/v1/forecast` with hourly fields for temperature, humidity, wind speed, and wind direction (see file for exact query parameters and unit choices).

## Next.js API routes

- **`src/app/api/weather/zip/route.ts`** — Resolves a US ZIP (via supporting geo lookup) to coordinates and returns weather suitable for the app.  
  Weather routes are **protected** by Clerk middleware (see [`src/proxy.ts`](../src/proxy.ts)).

## Mastra tool

- **`src/mastra/tools/weather/fetchWeather.ts`** — Agent tool to fetch weather by coordinates for guided setup (used together with geocode tools).

## Related docs

- [maps-and-geospatial.md](./maps-and-geospatial.md) — where weather values appear in the plan UI.
- [mastra.md](./mastra.md) — agent tool list.
- [nextjs.md](./nextjs.md) — API route protection.
