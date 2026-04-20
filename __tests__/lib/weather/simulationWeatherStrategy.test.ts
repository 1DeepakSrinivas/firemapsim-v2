import { describe, expect, test } from "bun:test";

import { normalizeIgnitionPlan } from "@/types/ignitionPlan";
import { resolveSimulationWeather } from "@/lib/weather/simulationWeatherStrategy";

describe("resolveSimulationWeather", () => {
  test("uses plan-weather fallback and skips Open-Meteo for non-geodetic centers", async () => {
    const plan = normalizeIgnitionPlan({
      info_type: "simulation",
      team_num: 1,
      total_sim_time: 12000,
      windSpeed: "40",
      windDegree: "190",
      temperature: "69",
      humidity: "25",
      team_infos: [
        {
          team_name: "team0",
          info_num: 1,
          details: [
            {
              type: "segment",
              start_x: 10,
              start_y: 10,
              end_x: 10,
              end_y: 10,
              speed: 1,
              mode: "spot",
              distance: null,
            },
          ],
        },
      ],
      sup_infos: [],
      proj_center_lng: -173859.01701560823,
      proj_center_lat: 1602981.8225626145,
      fuel_data_adjusted: [],
      customizedFuelGrid: "",
      slope_data_adjusted: [],
      aspect_data_adjusted: [],
      cellResolution: 30,
      cellSpaceDimension: 200,
      cellSpaceDimensionLat: 200,
      customized_cell_state: [],
      sup_num: 0,
    });

    let currentWeatherCalls = 0;
    let hourlyWeatherCalls = 0;

    const resolved = await resolveSimulationWeather(
      {
        plan,
        simulationHours: 12000,
        weatherOverrides: {
          windSpeed: 44,
        },
      },
      {
        fetchCurrentWeatherForCoords: async () => {
          currentWeatherCalls += 1;
          return {
            weather: {
              windSpeed: 9,
              windDirection: 100,
              temperature: 50,
              humidity: 55,
            },
            source: "open-meteo",
          };
        },
        fetchHourlyWeatherForCoords: async () => {
          hourlyWeatherCalls += 1;
          return { hourly: [], source: "open-meteo" };
        },
      },
    );

    expect(currentWeatherCalls).toBe(0);
    expect(hourlyWeatherCalls).toBe(0);
    expect(resolved.weatherSource).toBe("plan");
    expect(resolved.hourlyWeather).toEqual([]);
    expect(resolved.weatherFetched).toEqual({
      windSpeed: 40,
      windDirection: 190,
      temperature: 69,
      humidity: 25,
    });
    expect(resolved.weatherUsed).toEqual({
      windSpeed: 44,
      windDirection: 190,
      temperature: 69,
      humidity: 25,
    });
    expect(resolved.weatherOverrideApplied).toEqual(["windSpeed"]);
  });
});
